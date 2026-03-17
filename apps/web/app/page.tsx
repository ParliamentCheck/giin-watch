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
    .select("spoken_at, committee, member_id, source_url")
    .eq("is_procedural", false)
    .order("spoken_at", { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return [];

  // 「日付＋委員会」でグルーピング
  const groupMap = new Map<string, {
    date: string;
    committee: string;
    sourceUrl: string;
    memberIds: Set<string>;
  }>();

  for (const s of data) {
    const committee = s.committee?.trim();
    if (!s.spoken_at || !committee) continue;
    const key = `${s.spoken_at}__${committee}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { date: s.spoken_at, committee, sourceUrl: s.source_url || "", memberIds: new Set() });
    }
    if (s.member_id) groupMap.get(key)!.memberIds.add(s.member_id);
  }

  const groups = [...groupMap.values()].slice(0, 8);

  // member_id → name, party をまとめて取得
  const allIds = [...new Set(groups.flatMap((g) => [...g.memberIds]))];
  const memberMap = new Map<string, { name: string; party: string }>();
  if (allIds.length > 0) {
    const { data: members } = await supabase
      .from("members")
      .select("id, name, party")
      .in("id", allIds)
      .limit(500);
    for (const m of members || []) memberMap.set(m.id, { name: m.name, party: m.party });
  }

  return groups.map((g) => ({
    date: g.date,
    committee: g.committee,
    members: [...g.memberIds].map((id) => ({ id, name: memberMap.get(id)?.name || "", party: memberMap.get(id)?.party || "" })),
    ndlUrl: g.sourceUrl ? g.sourceUrl.replace(/\/\d+$/, "/0") : "",
  }));
}

async function getCrossPartyBills() {
  try {
    const { data: bills } = await supabase
      .from("bills")
      .select("id, title, session_number, source_url, submitter_ids")
      .eq("bill_type", "議員立法")
      .limit(1000);
    if (!bills || bills.length === 0) return [];

    const allIds = [...new Set(bills.flatMap((b: any) => (b.submitter_ids as string[]) || []))];
    if (allIds.length === 0) return [];

    const memberParty: Record<string, string> = {};
    for (let i = 0; i < allIds.length; i += 50) {
      const { data: members } = await supabase
        .from("members")
        .select("id, party")
        .in("id", allIds.slice(i, i + 50));
      for (const m of members || []) memberParty[(m as any).id] = (m as any).party;
    }


    const EXCLUDE = new Set(["無所属", "不明（前議員）"]);

    return bills
      .map((b: any) => {
        const parties = [...new Set<string>(
          ((b.submitter_ids as string[]) || [])
            .map((id) => memberParty[id])
            .filter((p): p is string => !!p && !EXCLUDE.has(p))
        )];
        return { id: b.id as string, title: b.title as string, session: b.session_number as number, source_url: b.source_url as string | null, parties };
      })
      .filter((b) => b.parties.length >= 3)
      .sort((a, b) => b.parties.length - a.parties.length)
      .slice(0, 5);
    return result;
  } catch (e) {
    console.error("[crossParty] error:", e);
    return [];
  }
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
    .select("id, name, party")
    .in("id", allIds.slice(0, 100));

  const memberMap: Record<string, { name: string; party: string }> = {};
  for (const m of membersRes.data || []) memberMap[m.id] = { name: m.name, party: m.party };

  return bills.map((b: any) => ({
    ...b,
    submitters: (b.submitter_ids || [])
      .map((id: string) => memberMap[id] ? { id, name: memberMap[id].name, party: memberMap[id].party } : null)
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

/* ─── 今国会・独自コンテンツ ────────────────────────────────── */
const CURRENT_SESSION = 221;

const PARTY_SHORT: Record<string, string> = {
  "自民党":       "自民",
  "立憲民主党":   "立憲",
  "中道改革連合": "中道改革",
  "公明党":       "公明",
  "日本維新の会": "維新",
  "国民民主党":   "国民",
  "共産党":       "共産",
  "れいわ新選組": "れいわ",
  "社民党":       "社民",
  "参政党":       "参政",
  "チームみらい": "みらい",
  "日本保守党":   "保守",
};

async function getCurrentSessionStats() {
  const [qShuRes, votedBillsRes] = await Promise.all([
    supabase.from("questions")
      .select("id", { count: "exact", head: true })
      .eq("session", CURRENT_SESSION),
    supabase.from("votes")
      .select("bill_title")
      .eq("session_number", CURRENT_SESSION)
      .limit(2000),
  ]);
  const billsRes = await supabase.from("bills")
    .select("id", { count: "exact", head: true })
    .gte("submitted_at", "2026-01-01");

  const adoptedBills = new Set((votedBillsRes.data || []).map((v: any) => v.bill_title)).size;
  return { questions: qShuRes.count || 0, bills: billsRes.count || 0, adoptedBills };
}

// 採決一致率（全会期・ページネーションで全件取得）
async function getPartyAlignmentMatrix() {
  let allVotes: any[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from("votes")
      .select("member_id, vote, bill_title, vote_date, session_number")
      .in("vote", ["賛成", "反対"])
      .range(from, from + PAGE - 1);
    if (!data || data.length === 0) break;
    allVotes = allVotes.concat(data);
    if (data.length < PAGE) break;
    from += PAGE;
  }
  const votes = allVotes;
  if (votes.length === 0) return null;

  const { data: members } = await supabase
    .from("members").select("id, party").limit(2000);

  const memberParty: Record<string, string> = {};
  for (const m of members || []) memberParty[m.id] = m.party;

  const billVotes: Record<string, Record<string, string[]>> = {};
  for (const v of votes as any[]) {
    const party = memberParty[v.member_id];
    if (!party || party === "無所属") continue;
    const key = `${v.vote_date}__${v.bill_title}`;
    if (!billVotes[key]) billVotes[key] = {};
    if (!billVotes[key][party]) billVotes[key][party] = [];
    billVotes[key][party].push(v.vote);
  }

  const positions: Record<string, Record<string, string>> = {};
  for (const [bill, partyMap] of Object.entries(billVotes)) {
    positions[bill] = {};
    for (const [party, pvotes] of Object.entries(partyMap)) {
      const yes = pvotes.filter((v) => v === "賛成").length;
      const no  = pvotes.filter((v) => v === "反対").length;
      if (yes + no === 0) continue;
      positions[bill][party] = yes >= no ? "賛成" : "反対";
    }
  }

  const billCount = Object.keys(positions).length;
  if (billCount < 1) return null;

  const partyCount: Record<string, number> = {};
  for (const pos of Object.values(positions))
    for (const p of Object.keys(pos)) partyCount[p] = (partyCount[p] || 0) + 1;

  const parties = Object.entries(partyCount)
    .filter(([, c]) => c >= 1)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p)
    .slice(0, 9);

  const matrix: Record<string, Record<string, { rate: number; total: number }>> = {};
  for (const p1 of parties) {
    matrix[p1] = {};
    for (const p2 of parties) {
      let agree = 0, total = 0;
      for (const pos of Object.values(positions))
        if (pos[p1] && pos[p2]) { total++; if (pos[p1] === pos[p2]) agree++; }
      matrix[p1][p2] = { rate: total > 0 ? agree / total : 0, total };
    }
  }

  const sessionNums = [...new Set(votes.map((v: any) => v.session_number as number))].sort((a, b) => a - b);
  const sessionLabel = sessionNums.length <= 1
    ? `第${sessionNums[0]}回国会`
    : `第${sessionNums[0]}〜${sessionNums[sessionNums.length - 1]}回国会`;

  return { matrix, parties, billCount, sessionLabel };
}

// 質問主意書の月別推移（政党別）
async function getMonthlyQuestions() {
  const { data } = await supabase
    .from("questions")
    .select("submitted_at, members(party)")
    .like("submitted_at", "令和%")
    .limit(5000);

  // "令和 7年10月21日" / "令和元年11月 1日" → "2025-10"
  function toYearMonth(s: string): string | null {
    const m = s.match(/^令和\s*(\d+|元)年\s*(\d+)月/);
    if (!m) return null;
    const y = m[1] === "元" ? 2019 : 2018 + parseInt(m[1]);
    const mo = parseInt(m[2]).toString().padStart(2, "0");
    return `${y}-${mo}`;
  }

  const monthMap: Record<string, Record<string, number>> = {};
  const partyTotal: Record<string, number> = {};
  for (const q of data || []) {
    const ym = toYearMonth(q.submitted_at as string);
    if (!ym) continue;
    const party = (q.members as any)?.party || "その他";
    if (!monthMap[ym]) monthMap[ym] = {};
    monthMap[ym][party] = (monthMap[ym][party] || 0) + 1;
    partyTotal[party] = (partyTotal[party] || 0) + 1;
  }

  // 全期間の合計順でソートして各月バーの並び順を統一
  const sortedParties = Object.entries(partyTotal)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  return Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([month, partyMap]) => {
      const total = Object.values(partyMap).reduce((s, c) => s + c, 0);
      const parties = sortedParties
        .filter((p) => partyMap[p])
        .map((p) => ({ party: p, count: partyMap[p] }));
      return { month, total, parties };
    });
}

/* ─── ページ本体 ───────────────────────────────────────────── */
export default async function TopPage() {
  const [stats, recentQuestions, committeeActivities, partyBreakdown, recentPetitions, recentBills, currentStats, alignmentMatrix, monthlyQuestions, crossPartyBills] = await Promise.all([
    getStats(),
    getRecentQuestions(),
    getLatestCommitteeActivity(),
    getPartyBreakdown(),
    getRecentPetitions(),
    getRecentBills(),
    getCurrentSessionStats(),
    getPartyAlignmentMatrix(),
    getMonthlyQuestions(),
    getCrossPartyBills(),
  ]);

  const maxPartyCount = partyBreakdown[0]?.total || 1;

  return (
    <div className="min-h-screen text-neutral-900">
      {/* ── ヒーロー ─────────────────────────────────────────── */}
      <div className="w-full border-b border-neutral-200 h-[360px] sm:h-auto sm:aspect-[10/4]" style={{ backgroundImage: "url('/hero.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} />
      <section className="-mt-24">
        <div className="max-w-4xl mx-auto px-5 pt-0 pb-12 text-center">
          <h1 className="mb-4">
            <img src="/logo-main.svg" alt="はたらく議員" className="h-44 sm:h-48 mx-auto" />
          </h1>

          <p className="text-lg sm:text-2xl text-neutral-700 mb-5">
            国会議員の活動を、データで見える化
          </p>
          <p className="text-sm text-neutral-500 mb-4 leading-relaxed max-w-xl mx-auto text-left">
            国立国会図書館・衆議院・参議院の公開記録をもとに、発言・質問主意書・採決・議員立法・請願など、議員の国会活動に関するデータを自動収集・整理しています。
            有権者が議員の活動実績を手軽に確認できることを目的としており、特定の政治的立場に偏らず、主観的な評価・スコアリング・ランキングは一切行いません。
            数値はすべて公的機関の公開情報に基づいており、運営者の判断や意図は介在しない設計です。
          </p>
          <a href="/faq#data-period" className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neutral-300/60 bg-neutral-100/40 text-xs text-neutral-700 no-underline hover:border-neutral-400 transition-colors">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
            収集期間: 2018年〜現在（詳細はこちら）
          </a>
          <p className="text-xs mt-3 leading-relaxed max-w-xl mx-auto bg-amber-50 border border-amber-200 text-amber-700 rounded-lg px-4 py-2.5">
            当サイトは、国会会議録等の公開記録および公開情報から機械的に集計した一部指標を表示します。<br className="hidden sm:block" />
            党務・地元活動・非公開会議等、参照できない活動は含みません。<br className="hidden sm:block" />
            当サイトの表示は、活動の良否・有無を判定するものではありません。
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-5 pb-20">
        {/* ── メインナビゲーション ────────────────────────────── */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {[
            { icon: "👤", title: "議員一覧",   desc: "政党・院・選挙区で絞り込み。各議員の活動実績・頻出キーワード・AI分析を確認できます",       path: "/members",    img: "/card-members.jpg"    },
            { icon: "👑", title: "内閣",       desc: "現在の大臣・副大臣・政務官の一覧。各閣僚の議員ページにもリンク",                           path: "/cabinet",    img: "/card-cabinet.jpg"    },
            { icon: "🏢", title: "政党・会派", desc: "会派ごとの所属議員数・活動バランス。採決での政党間距離感やAI分析も確認できます",             path: "/parties",    img: "/card-parties.jpg"    },
            { icon: "🏛️", title: "委員会別",   desc: "委員会ごとの所属議員と活動状況。委員長・理事も確認できます",                               path: "/committees", img: "/card-committees.jpg" },
            { icon: "📋", title: "法案",       desc: "議員立法・閣法（参議院）の一覧。超党派共同提出フィルターと政党間共同提出ネットワーク図も確認できます", path: "/bills",     img: "/card-bills.jpg"      },
            { icon: "🗳️", title: "採決記録",   desc: "政党別の採決一致率マトリクス。参議院本会議の賛否パターンを会期ごとに確認",                 path: "/votes",      img: "/card-votes.jpg"      },
          ].map((item) => (
            <Link key={item.path} href={item.path}
              className="group block bg-neutral-200/60 border border-neutral-200 rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-400">
              <div className="w-full border-b border-neutral-200" style={{ height: 120, backgroundImage: `url('${item.img}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-lg font-bold text-neutral-900 group-hover:text-neutral-600 transition-colors">{item.title}</span>
                </div>
                <div className="text-sm text-neutral-500 leading-relaxed">{item.desc}</div>
              </div>
            </Link>
          ))}
        </section>

        {/* ── A: 採決で見る政党の距離感 ───────────────────── */}
        {alignmentMatrix && (() => {
          const m = alignmentMatrix.matrix;
          const allPairs: { p1: string; p2: string; rate: number; total: number }[] = [];
          for (let i = 0; i < alignmentMatrix.parties.length; i++) {
            for (let j = i + 1; j < alignmentMatrix.parties.length; j++) {
              const p1 = alignmentMatrix.parties[i], p2 = alignmentMatrix.parties[j];
              const { rate, total } = m[p1]?.[p2] ?? { rate: 0, total: 0 };
              if (total < 10) continue;
              allPairs.push({ p1, p2, rate, total });
            }
          }
          if (allPairs.length < 2) return null;
          allPairs.sort((a, b) => b.rate - a.rate);

          type Pair = { p1: string; p2: string; rate: number; total: number };
          const getWithRanks = (sorted: Pair[]) => {
            let n = Math.min(3, sorted.length);
            while (n < sorted.length && sorted[n].rate === sorted[n - 1].rate) n++;
            const items = sorted.slice(0, n);
            return items.map((pair) => {
              const rank = items.findIndex((p) => p.rate === pair.rate) + 1;
              const isTie = items.filter((p) => p.rate === pair.rate).length > 1;
              return { ...pair, rank, isTie };
            });
          };

          const topWithRanks    = getWithRanks(allPairs);
          const bottomWithRanks = getWithRanks([...allPairs].reverse());

          type RankedPair = ReturnType<typeof getWithRanks>[0];
          const PairRow = ({ pair }: { pair: RankedPair }) => (
            <div className="px-5 py-3.5 border-b border-neutral-200/70 last:border-0">
              <div className="flex items-center gap-1.5 mb-1.5">
                <span className="text-[10px] font-bold text-neutral-400 w-8 shrink-0 whitespace-nowrap leading-none">
                  {pair.rank}{pair.isTie && <span className="text-[8px] ml-px">タイ</span>}
                </span>
                <span style={{ color: partyColor(pair.p1), fontSize: 9 }}>●</span>
                <span className="text-xs font-semibold text-neutral-800">{PARTY_SHORT[pair.p1] ?? pair.p1}</span>
                <span className="text-[10px] text-neutral-400">×</span>
                <span style={{ color: partyColor(pair.p2), fontSize: 9 }}>●</span>
                <span className="text-xs font-semibold text-neutral-800">{PARTY_SHORT[pair.p2] ?? pair.p2}</span>
                <span className="text-xs font-bold tabular-nums text-neutral-900 ml-auto shrink-0">
                  {(pair.rate * 100).toFixed(1)}%
                </span>
              </div>
              <div className="flex items-center gap-2 pl-5">
                <div className="flex-1 h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                  <div className="h-full rounded-full"
                    style={{ width: `${(pair.rate * 100).toFixed(1)}%`, background: `linear-gradient(to right, ${partyColor(pair.p1)}, ${partyColor(pair.p2)})` }} />
                </div>
              </div>
            </div>
          );

          return (
            <section className="mb-16">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">採決で見る政党の距離感</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {alignmentMatrix.sessionLabel}・採決{alignmentMatrix.billCount}件（参議院本会議）— 賛否の一致率
                  </p>
                </div>
                <Link href="/votes" className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors shrink-0 ml-4 mt-1">
                  全政党マトリクス →
                </Link>
              </div>
              <p className="text-sm text-neutral-500 leading-relaxed mb-5">
                参議院本会議の採決記録をもとに、各政党ペアの賛否が何割の議案で一致したかを集計しています。
                数値が高いほど同じ方向に投票する傾向があり、低いほど与野党など立場の違いが賛否に表れやすいことを示します。
                議案ごとの詳細な賛否パターンや全政党のマトリクスは「全政党マトリクス」から確認できます。
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-neutral-200/40 border border-neutral-300/60 rounded-2xl overflow-hidden">
                  <div className="px-5 py-2.5 bg-neutral-200/60 border-b border-neutral-200">
                    <p className="text-xs font-bold text-neutral-600">賛否が一致しやすいペア</p>
                  </div>
                  {topWithRanks.map((pair, i) => <PairRow key={i} pair={pair} />)}
                </div>
                <div className="bg-neutral-200/40 border border-neutral-300/60 rounded-2xl overflow-hidden">
                  <div className="px-5 py-2.5 bg-neutral-200/60 border-b border-neutral-200">
                    <p className="text-xs font-bold text-neutral-600">賛否が乖離しやすいペア</p>
                  </div>
                  {bottomWithRanks.map((pair, i) => <PairRow key={i} pair={pair} />)}
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── B: 質問主意書の月別推移 ──────────────────────── */}
        {monthlyQuestions.length > 0 && (
          <section className="mb-16">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-neutral-900">質問主意書の月別推移</h2>
              <p className="text-xs text-neutral-500 mt-0.5">衆議院・直近12ヶ月 — 政党別</p>
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed mb-5">
              質問主意書は、議員が内閣に対して文書で説明を求める制度です。委員会での発言機会が少ない少数会派の議員も利用しやすく、政府の見解を公式記録として引き出す手段として活用されています。
              月ごとの提出件数と政党別の内訳を示しています。国会の開会・閉会や政治的な争点の動向によって件数が変化します。各月をクリックすると政党別の内訳を確認できます。
            </p>
            <div className="bg-neutral-200/40 border border-neutral-300/60 rounded-2xl px-6 py-5 space-y-2.5">
              {(() => {
                const max = Math.max(...monthlyQuestions.map((m) => m.total), 1);
                return monthlyQuestions.map((m) => (
                  <details key={m.month} className="group">
                    <summary className="flex items-center gap-3 cursor-pointer list-none">
                      <span className="inline-flex items-center gap-1 whitespace-nowrap shrink-0 px-2 py-0.5 rounded-md border border-neutral-300 bg-white text-[11px] tabular-nums text-neutral-600 group-open:bg-neutral-800 group-open:text-white group-open:border-neutral-800 transition-colors">
                        {m.month}
                        <span className="text-red-400 text-[10px] not-italic group-open:rotate-90 inline-block transition-transform">›</span>
                      </span>
                      <div className="flex-1 h-4 bg-neutral-200 rounded-full overflow-hidden">
                        <div className="h-full flex" style={{ width: `${(m.total / max) * 100}%` }}>
                          {m.parties.map((p) => (
                            <div
                              key={p.party}
                              className="h-full"
                              style={{ width: `${(p.count / m.total) * 100}%`, background: partyColor(p.party) }}
                            />
                          ))}
                        </div>
                      </div>
                      <span className="text-[11px] text-neutral-500 tabular-nums w-8 text-right shrink-0">{m.total}</span>
                    </summary>
                    <div className="mt-2 mb-1 ml-[4.5rem] flex flex-wrap gap-x-4 gap-y-1">
                      {m.parties.map((p) => (
                        <span key={p.party} className="flex items-center gap-1 text-[11px] text-neutral-600">
                          <span style={{ color: partyColor(p.party) }}>●</span>
                          {PARTY_SHORT[p.party] ?? p.party}
                          <span className="tabular-nums text-neutral-400">{p.count}</span>
                        </span>
                      ))}
                    </div>
                  </details>
                ));
              })()}
            </div>
          </section>
        )}

        {/* ── 超党派議員立法 ──────────────────────────────── */}
        {crossPartyBills.length > 0 && (
          <section className="mb-16">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">超党派で提出された議員立法</h2>
                <p className="text-xs text-neutral-500 mt-0.5">最も多くの政党の議員が連名した法案 — 2022年〜現在</p>
              </div>
              <Link href="/bills" className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors shrink-0 ml-4 mt-1">
                法案一覧 →
              </Link>
            </div>
            <p className="text-sm text-neutral-500 leading-relaxed mb-5">
              議員立法のうち、与野党を問わず複数政党の議員が連名で提出した法案を、参加政党数が多い順に表示しています。
              政党を超えて共通の課題認識があったことを示す記録です。
            </p>
            <div className="bg-neutral-200/40 border border-neutral-300/60 rounded-2xl divide-y divide-neutral-200/70">
              {crossPartyBills.map((bill, i) => (
                <div key={bill.id} className="px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="shrink-0 mt-0.5 text-[11px] font-bold text-neutral-400 w-4 text-right">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-800 text-white text-[10px] font-bold shrink-0">
                          {bill.parties.length}党
                        </span>
                        <span className="text-[11px] text-neutral-400">第{bill.session}回国会</span>
                      </div>
                      <a href={bill.source_url || "#"} target="_blank" rel="noopener noreferrer"
                        className="text-sm text-neutral-800 hover:text-neutral-600 leading-snug line-clamp-2 transition-colors">
                        {bill.title}
                      </a>
                      <div className="flex flex-wrap gap-1 mt-2">
                        {bill.parties.map((party: string) => (
                          <span key={party} className="inline-flex items-center gap-1 text-[10px] text-neutral-600">
                            <span style={{ color: partyColor(party), fontSize: 8 }}>●</span>
                            {PARTY_SHORT[party] ?? party}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── 今国会のうごき ───────────────────────────────── */}
        <section className="mb-8">
          <div className="mb-5">
            <h2 className="text-lg font-bold text-neutral-900">今国会のうごき</h2>
            <p className="text-xs text-neutral-500 mt-0.5">第{CURRENT_SESSION}回国会（2026年〜）の集計</p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "質問主意書", value: currentStats.questions,    note: "衆議院" },
              { label: "議員立法",   value: currentStats.bills,        note: "提出" },
              { label: "採決",       value: currentStats.adoptedBills, note: "参議院本会議" },
            ].map((item) => (
              <div key={item.label} className="bg-neutral-200/60 border border-neutral-200 rounded-xl px-4 py-5 text-center">
                <div className="text-2xl font-extrabold tabular-nums text-neutral-900">{item.value.toLocaleString()}</div>
                <div className="text-[11px] text-neutral-500 mt-1">{item.label}</div>
                <div className="text-[10px] text-neutral-400">{item.note}</div>
              </div>
            ))}
          </div>
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
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-neutral-900">🕐 更新履歴</h2>
            <Link href="/changelog" className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">すべて見る →</Link>
          </div>
          <div className="bg-neutral-200/40 border border-neutral-300/60 rounded-2xl divide-y divide-neutral-200">
            {changelog.slice(0, 5).map((entry, i) => (
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
          <p className="col-span-2 sm:col-span-4 text-[10px] text-neutral-400 text-center -mt-2">
            ※ 発言・議員立法 2022年〜 / 質問主意書・請願 2018年〜
          </p>
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
