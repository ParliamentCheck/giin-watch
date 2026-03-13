export const revalidate = 3600;
export const metadata = { title: { absolute: "はたらく議員 — 国会議員の活動を、データで見える化" } };
import { supabase } from "../lib/supabase";
import Link from "next/link";
import ActivityTabs from "./components/ActivityTabs";
import changelog from "../lib/changelog";
import { partyColor } from "../lib/partyColors";

/* ─── データ取得（サーバーサイド） ─────────────────────────────── */
async function getStats() {
  const [membersRes, questionRes, billsRes, petitionRes, sangiinPetitionRes] =
    await Promise.all([
      supabase
        .from("members")
        .select("id, house, party, speech_count, question_count")
        .eq("is_active", true).limit(2000),
      supabase.from("questions").select("id", { count: "exact", head: true }),
      supabase.from("bills").select("id", { count: "exact", head: true }),
      supabase.from("petitions").select("id", { count: "exact", head: true }),
      supabase.from("sangiin_petitions").select("id", { count: "exact", head: true }),
    ]);

  const members = membersRes.data || [];
  const parties = new Set(members.map((m: any) => m.party)).size;
  const shugiin = members.filter((m: any) => m.house === "衆議院").length;
  const sangiin = members.filter((m: any) => m.house === "参議院").length;
  const speeches = members.reduce((sum: number, m: any) => sum + (m.speech_count || 0), 0);
  const petitions = (petitionRes.count || 0) + (sangiinPetitionRes.count || 0);

  return { total: members.length, shugiin, sangiin, parties, speeches, questions: questionRes.count || 0, bills: billsRes.count || 0, petitions };
}

async function getRecentQuestions() {
  const [shuRes, sanRes] = await Promise.all([
    supabase.from("questions")
      .select("id, title, submitted_at, member_id, source_url, members(name, party)")
      .order("session", { ascending: false }).order("number", { ascending: false }).limit(10),
    supabase.from("sangiin_questions")
      .select("id, title, submitted_at, member_id, url, members(name, party)")
      .order("submitted_at", { ascending: false }).limit(10),
  ]);

  const shu = (shuRes.data || []).map((q: any) => ({ ...q, source_url: q.source_url, house: "衆" }));
  const san = (sanRes.data || []).map((q: any) => ({ ...q, source_url: q.url,        house: "参" }));

  return [...shu, ...san]
    .sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""))
    .slice(0, 10);
}

async function getRecentPetitions() {
  const [shuRes, sanRes] = await Promise.all([
    supabase.from("petitions")
      .select("id, session, number, title, committee_name, result, result_date, source_url, introducer_names")
      .order("session", { ascending: false }).order("number", { ascending: false }).limit(10),
    supabase.from("sangiin_petitions")
      .select("id, session, number, title, committee_name, result, result_date, source_url, introducer_names")
      .order("session", { ascending: false }).order("number", { ascending: false }).limit(10),
  ]);

  const shu = (shuRes.data || []).map((p: any) => ({ ...p, house: "衆" as const }));
  const san = (sanRes.data || []).map((p: any) => ({ ...p, house: "参" as const }));

  return [...shu, ...san]
    .sort((a, b) => {
      if (b.session !== a.session) return b.session - a.session;
      return b.number - a.number;
    })
    .slice(0, 10);
}

async function getLatestCommitteeActivity() {
  const { data } = await supabase
    .from("speeches")
    .select("spoken_at, committee, member_id, source_url, members(name)")
    .eq("is_procedural", false)
    .order("spoken_at", { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return [];

  // 「日付＋委員会」でグルーピング（Map は挿入順を保持するので日付降順になる）
  const groupMap = new Map<string, {
    date: string;
    committee: string;
    sourceUrl: string;
    memberIds: Set<string>;
    memberNames: Map<string, string>;
  }>();

  for (const s of data) {
    const committee = s.committee?.trim();
    if (!s.spoken_at || !committee) continue;
    const key = `${s.spoken_at}__${committee}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { date: s.spoken_at, committee, sourceUrl: s.source_url || "", memberIds: new Set(), memberNames: new Map() });
    }
    const group = groupMap.get(key)!;
    if (s.member_id) {
      group.memberIds.add(s.member_id);
      if ((s.members as any)?.name) group.memberNames.set(s.member_id, (s.members as any).name);
    }
  }

  return [...groupMap.values()]
    .slice(0, 8)
    .map((g) => ({
      date: g.date,
      committee: g.committee,
      members: [...g.memberIds].map((id) => ({ id, name: g.memberNames.get(id) || "" })),
      ndlUrl: g.sourceUrl ? g.sourceUrl.replace(/\/\d+$/, "/0") : "",
    }));
}

async function getRecentBills() {
  const billsRes = await supabase
    .from("bills")
    .select("id, title, submitted_at, status, house, source_url, submitter_ids")
    .order("submitted_at", { ascending: false })
    .limit(10);

  const bills = billsRes.data || [];
  const allIds = [...new Set(bills.flatMap((b: any) => b.submitter_ids || []))];

  if (allIds.length === 0) return bills.map((b: any) => ({ ...b, submitterNames: [] }));

  const membersRes = await supabase
    .from("members")
    .select("id, name")
    .in("id", allIds.slice(0, 100));

  const memberMap: Record<string, string> = {};
  for (const m of membersRes.data || []) memberMap[m.id] = m.name;

  return bills.map((b: any) => ({
    ...b,
    submitters: (b.submitter_ids || [])
      .map((id: string) => memberMap[id] ? { id, name: memberMap[id] } : null)
      .filter(Boolean),
  }));
}

async function getPartyBreakdown() {
  const { data } = await supabase
    .from("members")
    .select("party, house")
    .eq("is_active", true).limit(2000);
  if (!data) return [];

  const map = new Map<string, { total: number; shugiin: number; sangiin: number }>();
  for (const m of data) {
    const cur = map.get(m.party) || { total: 0, shugiin: 0, sangiin: 0 };
    cur.total++;
    if (m.house === "衆議院") cur.shugiin++;
    else cur.sangiin++;
    map.set(m.party, cur);
  }

  return [...map.entries()]
    .map(([party, counts]) => ({ party, ...counts }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

/* ─── ページ本体 ───────────────────────────────────────────── */
export default async function TopPage() {
  const [stats, recentQuestions, committeeActivities, partyBreakdown, recentPetitions, recentBills] = await Promise.all([
    getStats(),
    getRecentQuestions(),
    getLatestCommitteeActivity(),
    getPartyBreakdown(),
    getRecentPetitions(),
    getRecentBills(),
  ]);

  const maxPartyCount = partyBreakdown[0]?.total || 1;

  return (
    <div className="min-h-screen text-neutral-900">
      {/* ── ヒーロー ─────────────────────────────────────────── */}
      <section>
        <div className="max-w-4xl mx-auto px-5 pt-20 pb-12 text-center">
          <h1 className="mb-4">
            <img src="/logo-main.svg" alt="はたらく議員" className="h-32 sm:h-40 mx-auto" />
          </h1>

          <p className="text-lg text-neutral-700 mb-2">
            国会議員の活動を、データで見える化
          </p>
          <p className="text-sm text-neutral-500 mb-4">
            衆議院・参議院の全議員の発言・質問主意書・委員会活動を収集・公開
          </p>
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neutral-300/60 bg-neutral-100/40 text-xs text-neutral-700">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
            収集期間: 2018年〜現在（毎日自動更新）
          </div>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-5 pb-20">
        {/* ── 統計カード ──────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-16">
          {[
            { label: "現職議員",   value: stats.total,     unit: "名" },
            { label: "衆議院",     value: stats.shugiin,   unit: "名" },
            { label: "参議院",     value: stats.sangiin,   unit: "名" },
            { label: "政党・会派", value: stats.parties,   unit: "党" },
            { label: "発言記録",   value: stats.speeches,  unit: "件" },
            { label: "質問主意書", value: stats.questions, unit: "件" },
            { label: "議員立法",   value: stats.bills,     unit: "件" },
            { label: "請願",       value: stats.petitions, unit: "件" },
          ].map((item) => (
            <div key={item.label}
              className="bg-neutral-200/60 border border-neutral-200 rounded-xl px-4 py-5 text-center hover:border-neutral-300 transition-colors">
              <div className="text-2xl font-extrabold tabular-nums text-neutral-900">
                {item.value.toLocaleString()}
              </div>
              <div className="text-[11px] text-neutral-500 mt-1">{item.label}</div>
            </div>
          ))}
        </section>

        {/* ── メインナビゲーション ────────────────────────────── */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {[
            { icon: "👤", title: "議員一覧",   desc: "政党・院・選挙区で絞り込み。全議員のプロフィールと活動実績を検索",               path: "/members"    },
            { icon: "🏛️", title: "委員会別",   desc: "委員会ごとの所属議員と活動状況。委員長・理事も確認できます",                     path: "/committees" },
            { icon: "🏢", title: "政党・会派", desc: "会派ごとの所属議員数・活動バランス。国会での勢力図と政党の特色が見える",           path: "/parties"    },
            { icon: "📋", title: "議員立法",   desc: "議員が提出した法案の一覧。超党派共同立法のフィルターも可能",                     path: "/bills"      },
            { icon: "🗳️", title: "採決記録",   desc: "政党別の採決一致率マトリクス。参議院本会議の賛否パターンを会期ごとに確認",         path: "/votes"      },
            { icon: "👑", title: "現内閣",     desc: "現在の大臣・副大臣・政務官の一覧。各閣僚の議員ページにもリンク",                   path: "/cabinet"    },
          ].map((item) => (
            <Link key={item.path} href={item.path}
              className="group block bg-neutral-200/60 border border-neutral-200 rounded-2xl p-6 transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-400">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-2xl">{item.icon}</span>
                <span className="text-lg font-bold text-neutral-900 group-hover:text-neutral-600 transition-colors">{item.title}</span>
              </div>
              <div className="text-sm text-neutral-500 leading-relaxed">{item.desc}</div>
            </Link>
          ))}
        </section>

        {/* ── 活動タブ：質問主意書 / 委員会活動 / 請願 ───────── */}
        <ActivityTabs
          recentQuestions={recentQuestions as any}
          committeeActivities={committeeActivities}
          recentPetitions={recentPetitions as any}
          recentBills={recentBills as any}
        />

        {/* ── 政党別 議員数 ──────────────────────────────────── */}
        {partyBreakdown.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-neutral-900">政党・会派別 議員数</h2>
              <Link href="/parties" className="text-xs text-neutral-500 hover:text-neutral-500 transition-colors">
                詳しく見る →
              </Link>
            </div>

            <div className="bg-neutral-200/40 border border-neutral-300/60 rounded-2xl p-6 space-y-4">
              {partyBreakdown.map((p) => (
                <div key={p.party}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-neutral-800 truncate mr-4">{p.party}</span>
                    <span className="text-xs text-neutral-500 tabular-nums shrink-0">
                      {p.total}名
                      <span className="text-neutral-400 ml-1">（衆{p.shugiin} / 参{p.sangiin}）</span>
                    </span>
                  </div>
                  <div className="h-2 bg-neutral-200 rounded-full overflow-hidden">
                    <div className="h-full rounded-full"
                      style={{ width: `${(p.total / maxPartyCount) * 100}%`, background: partyColor(p.party) }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 更新履歴 ─────────────────────────────────────────── */}
        <section className="mb-16">
          <h2 className="text-base font-bold text-neutral-900 mb-4">🕐 更新履歴</h2>
          <div className="bg-neutral-200/40 border border-neutral-300/60 rounded-2xl divide-y divide-neutral-200">
            {changelog.map((entry, i) => (
              <div key={i} className="px-5 py-3 flex items-baseline gap-4">
                <span className="tabular-nums text-xs text-neutral-500 shrink-0">{entry.date}</span>
                {entry.description ? (
                  <details className="flex-1">
                    <summary className="text-sm font-medium text-neutral-900 cursor-pointer list-none flex items-center gap-1">
                      <span className="text-neutral-400 text-[10px]">▶</span>
                      {entry.title}
                    </summary>
                    <div className="text-xs text-neutral-500 mt-1.5 leading-relaxed">{entry.description}</div>
                  </details>
                ) : (
                  <div className="text-sm font-medium text-neutral-900">{entry.title}</div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* ── 注記 ── */}
        <p style={{ textAlign: "center", fontSize: 12, color: "#888888", marginBottom: 8 }}>
          データは公的機関の公開情報を自動収集しています。
          詳しくは<a href="/disclaimer" style={{ color: "#333333" }}>免責事項</a>をご確認ください。
        </p>
      </div>
    </div>
  );
}
