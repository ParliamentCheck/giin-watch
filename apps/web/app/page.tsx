export const revalidate = 3600;
export const metadata = {
  title: { absolute: "はたらく議員 — 国会議員の活動を、データで見える化" },
  description: "国会会議録等の公開記録から、国会議員の発言・質問主意書・議員立法・採決・請願の件数を機械的に集計して表示します。活動の良否を判定するものではありません。",
  openGraph: {
    title: "はたらく議員 — 国会議員の活動を、データで見える化",
    description: "国会会議録等の公開記録から、国会議員の発言・質問主意書・議員立法・採決・請願の件数を機械的に集計して表示します。活動の良否を判定するものではありません。",
  },
};
import { supabase } from "../lib/supabase";
import { supabaseServer } from "../lib/supabase-server";
import {
  getTopPageStats,
  getFactionBreakdown,
  getTopRecentQuestions,
  getTopRecentPetitions,
  getLatestCommitteeActivity,
  getMonthlyQuestionsTrend,
  getFactionHistory,
  getFactionVoteAlignments,
} from "../lib/queries";
import Link from "next/link";
import ActivityTabs from "./components/ActivityTabs";
import changelog from "../lib/changelog";
import { buildFactionAt, factionColor, factionPath, type House } from "../lib/factions";
import { CURRENT_SESSION } from "../lib/constants";

/* ─── データ取得（サーバーサイド） ─────────────────────────────── */

/**
 * 複数の会派の議員が提出者に含まれる議員立法。
 * 提出者の会派は「提出日の時点の会派」を会派の履歴から求め、確定できない提出者は数えない（推測しない）。
 */
async function getCrossFactionBills() {
  try {
    const { data: bills } = await supabaseServer
      .from("bills")
      .select("id, title, session_number, submitted_at, house, honbun_url, keika_url, submitter_ids")
      .eq("bill_type", "議員立法")
      .limit(1000);
    if (!bills || bills.length === 0) return [];
    const history = await getFactionHistory(supabaseServer);
    const factionAt = buildFactionAt(history);
    const EXCLUDE = new Set(["無所属", "各派に属しない議員"]);

    return bills
      .map((b: any) => {
        const ids = ((b.submitter_ids as string[]) || []);
        const resolved = ids.map((id) => factionAt(id, b.submitted_at));
        const determined = resolved.filter((f): f is string => !!f);
        const factions = [...new Set(determined.filter((f) => !EXCLUDE.has(f)))].sort((a, c) => a.localeCompare(c, "ja"));
        return {
          id: b.id as string, title: b.title as string, session: b.session_number as number,
          house: b.house as House,
          honbun_url: b.honbun_url as string | null, keika_url: b.keika_url as string | null,
          factions, determinedCount: determined.length, submitterCount: ids.length,
        };
      })
      .filter((b) => b.factions.length >= 3)
      .sort((a, b) => b.factions.length - a.factions.length || b.session - a.session)
      .slice(0, 5);
  } catch (e) {
    console.error("[crossFaction] error:", e);
    return [];
  }
}

async function getRecentBills() {
  // 衆法・参法を別々に取得してマージ（id降順ソートだと衆法が参法より辞書順で大きく参法が埋もれるため）
  const SELECT = "id, title, submitted_at, session_number, status, house, honbun_url, keika_url, submitter_ids, submitter_extra_count";
  const [shuRes, sanRes] = await Promise.all([
    supabase.from("bills").select(SELECT)
      .eq("bill_type", "議員立法").eq("house", "衆議院")
      .order("session_number", { ascending: false })
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(6),
    supabase.from("bills").select(SELECT)
      .eq("bill_type", "議員立法").eq("house", "参議院")
      .order("session_number", { ascending: false })
      .order("submitted_at", { ascending: false, nullsFirst: false })
      .limit(6),
  ]);

  const bills = [...(shuRes.data || []), ...(sanRes.data || [])].sort((a: any, b: any) => {
    if ((b.session_number ?? 0) !== (a.session_number ?? 0)) return (b.session_number ?? 0) - (a.session_number ?? 0);
    if (a.submitted_at && b.submitted_at) return b.submitted_at.localeCompare(a.submitted_at);
    if (a.submitted_at) return -1;
    if (b.submitted_at) return 1;
    return b.id.localeCompare(a.id);
  }).slice(0, 10);
  const allIds = [...new Set(bills.flatMap((b: any) => b.submitter_ids || []))];

  if (allIds.length === 0) return bills.map((b: any) => ({ ...b, submitters: [] }));

  const membersRes = await supabase
    .from("members")
    .select("id, name, alias_name, faction, is_active")
    .in("id", allIds.slice(0, 100));

  const memberMap: Record<string, { name: string; alias_name: string | null; faction: string | null; is_active: boolean }> = {};
  for (const m of (membersRes.data || []) as Array<{ id: string; name: string; alias_name: string | null; faction: string | null; is_active: boolean }>) {
    memberMap[m.id] = { name: m.name, alias_name: m.alias_name ?? null, faction: m.faction ?? null, is_active: m.is_active };
  }

  return bills.map((b: any) => ({
    ...b,
    submitters: (b.submitter_ids || [])
      .map((id: string) => memberMap[id] ? { id, name: memberMap[id].name, alias_name: memberMap[id].alias_name, faction: memberMap[id].faction, is_active: memberMap[id].is_active } : null)
      .filter(Boolean),
  }));
}


/* ─── 今国会・独自コンテンツ ────────────────────────────────── */

async function getCurrentSessionStats() {
  const [qShuRes, qSanRes, petitionsShuRes, petitionsSanRes] = await Promise.all([
    supabaseServer.from("questions").select("id", { count: "exact", head: true }).eq("session", CURRENT_SESSION),
    supabaseServer.from("sangiin_questions").select("id", { count: "exact", head: true }).eq("session", CURRENT_SESSION),
    supabaseServer.from("petitions").select("id", { count: "exact", head: true }).eq("session", CURRENT_SESSION),
    supabaseServer.from("sangiin_petitions").select("id", { count: "exact", head: true }).eq("session", CURRENT_SESSION),
  ]);
  // 取得に失敗した場合は件数を 0 と表示しない（null = 取得できなかった）
  const n = (r: { count: number | null; error: unknown }) => (r.error ? null : r.count ?? 0);
  return {
    questionsShu: n(qShuRes), questionsSan: n(qSanRes),
    petitionsShu: n(petitionsShuRes), petitionsSan: n(petitionsSanRes),
  };
}

// 会派ペアの採決一致（参院・直近の会期）。コレクターが公式の会派別票数から集計した値を読むだけ
async function getLatestFactionAlignments() {
  const rows = await getFactionVoteAlignments(supabaseServer);
  if (rows.length === 0) return null;
  const session = Math.max(...rows.map((r) => r.session_number));
  const pairs = rows
    .filter((r) => r.session_number === session && r.total_count >= 10)
    .filter((r) => r.faction_a !== "各派に属しない議員" && r.faction_b !== "各派に属しない議員")
    .map((r) => ({ a: r.faction_a, b: r.faction_b, rate: r.agree_count / r.total_count, total: r.total_count }));
  if (pairs.length < 2) return null;
  return { session, pairs };
}

/* ─── ページ本体 ───────────────────────────────────────────── */
export default async function TopPage() {
  const [stats, recentQuestions, committeeActivities, factionBreakdown, petitionsResult, recentBills, currentStats, alignment, monthlyQuestions, crossFactionBills] = await Promise.all([
    getTopPageStats(supabaseServer),
    getTopRecentQuestions(supabaseServer),
    getLatestCommitteeActivity(supabaseServer),
    getFactionBreakdown(supabaseServer),
    getTopRecentPetitions(supabaseServer),
    getRecentBills(),
    getCurrentSessionStats(),
    getLatestFactionAlignments(),
    getMonthlyQuestionsTrend(CURRENT_SESSION - 4, supabaseServer),
    getCrossFactionBills(),
  ]);

  const { petitions: recentPetitions, memberMap: petitionMemberMap } = petitionsResult;

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
            有権者が議員の活動実績を手軽に確認できることを目的としており、特定の政治的立場に偏らず、主観的な評価・スコアリング・順位付けは一切行いません。
            数値はすべて公的機関の公開情報に基づいており、運営者の判断や意図は介在しない設計です。
          </p>
          <a href="/faq#data-period" className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-neutral-300/60 bg-neutral-100/40 text-xs text-neutral-700 no-underline hover:border-neutral-400 transition-colors">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-neutral-400 animate-pulse" />
            収集期間: 2018年〜現在（詳細はこちら）
          </a>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-5 pb-20">
        {/* ── メインナビゲーション ────────────────────────────── */}
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-16">
          {[
            { icon: "👤", title: "議員一覧",   desc: "院・会派・選挙区で絞り込み。各議員の活動の記録・会派の遍歴・頻出キーワードを確認できます",       path: "/members",    img: "/card-members.jpg"    },
            { icon: "👑", title: "内閣",       desc: "現在の大臣・副大臣・政務官の一覧。各閣僚の議員ページにもリンク",                           path: "/cabinet",    img: "/card-cabinet.jpg"    },
            { icon: "🏢", title: "会派",       desc: "衆参それぞれの会派と所属議員。参議院本会議の採決での会派間の賛否の一致も確認できます",             path: "/factions",   img: "/card-parties.jpg"    },
            { icon: "🏛️", title: "委員会別",   desc: "委員会ごとの所属議員と活動状況。委員長・理事も確認できます",                               path: "/committees", img: "/card-committees.jpg" },
            { icon: "📋", title: "法案",         desc: "議員立法・閣法（参議院）の一覧と、会派をまたいだ共同提出の集計を確認できます", path: "/bills",     img: "/card-bills.jpg"      },
            { icon: "📝", title: "質問主意書", desc: "議員が内閣に文書で提出する質問主意書の一覧。衆院・参院合わせて検索・絞り込みできます",           path: "/questions",  img: "/card-questions.jpg"  },
            { icon: "🗳️", title: "採決記録",   desc: "参議院本会議の採決での会派間の賛否の一致を、会期ごとに確認できます",                     path: "/votes",      img: "/card-votes.jpg"      },
          ].map((item) => (
            <Link key={item.path} href={item.path}
              className="group relative block bg-white border border-neutral-200 rounded-2xl overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:border-neutral-400">
              <div className="w-full border-b border-neutral-200" style={{ height: 120, backgroundImage: `url('${item.img}')`, backgroundSize: "cover", backgroundPosition: "center" }} />
              <div className="p-6">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-2xl">{item.icon}</span>
                  <span className="text-lg font-bold text-neutral-900 group-hover:text-neutral-600 transition-colors">{item.title}</span>
                </div>
                <div className="text-sm text-neutral-500 leading-relaxed">{item.desc}</div>
                <span className="absolute bottom-4 right-4 text-sm text-neutral-500 group-hover:text-neutral-800 transition-colors">→</span>
              </div>
            </Link>
          ))}
        </section>

        {/* ── AI分析バナー ────────────────────────────────── */}
        <section className="mb-16 border border-neutral-200 rounded-2xl overflow-hidden">
          <div className="flex flex-col sm:flex-row items-stretch">
            {/* 画像枠: スマホは上部・横幅100%、PC は左側固定幅 */}
            <div className="w-full h-36 sm:w-52 sm:h-auto shrink-0 bg-neutral-200 sm:border-r sm:border-b-0 border-b border-neutral-200"
              style={{ backgroundImage: "url('/card-ai.jpg')", backgroundSize: "cover", backgroundPosition: "center" }} />
            {/* テキスト */}
            <div className="px-6 py-5 bg-white">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🤖</span>
                <h2 className="text-base font-bold text-neutral-900">AI分析機能（BYOK）</h2>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed">
                各議員ページでは、質問主意書・議員立法・採決・委員会・発言キーワードなどの活動データをもとに、AIによる傾向分析を利用できます。
                分析にはご自身のAPIキー（Gemini / ChatGPT / Grok など）を使用します。データはサーバーを経由せず、お使いのブラウザから直接AIサービスへ送信されます。
              </p>
              <p className="text-xs text-neutral-400 mt-2">
                ※ AI分析は公開データに基づく推測であり、当サイトの公式見解ではありません。政治的立場の評価・優劣の判定は行いません。
              </p>
            </div>
          </div>
        </section>

        {/* ── A: 参議院本会議の採決での会派間の賛否の一致 ─────── */}
        {alignment && (() => {
          type Pair = { a: string; b: string; rate: number; total: number };
          const sorted = [...alignment.pairs].sort((x, y) => y.rate - x.rate || x.a.localeCompare(y.a, "ja"));
          // 上位・下位それぞれ3組（同率は含める）。順位の番号は付けない
          const take = (list: Pair[]) => {
            let n = Math.min(3, list.length);
            while (n < list.length && list[n].rate === list[n - 1].rate) n++;
            return list.slice(0, n);
          };
          const high = take(sorted);
          const low  = take([...sorted].reverse());
          const PairRow = ({ pair }: { pair: Pair }) => (
            <div className="px-5 py-3.5 border-b border-neutral-200/70 last:border-0">
              <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                <span style={{ color: factionColor(pair.a), fontSize: 9 }}>●</span>
                <span className="text-xs font-semibold text-neutral-800">{pair.a}</span>
                <span className="text-[10px] text-neutral-500">×</span>
                <span style={{ color: factionColor(pair.b), fontSize: 9 }}>●</span>
                <span className="text-xs font-semibold text-neutral-800">{pair.b}</span>
                <span className="text-xs font-bold tabular-nums text-neutral-900 ml-auto shrink-0">
                  {(pair.rate * 100).toFixed(1)}%
                  <span className="text-[10px] font-normal text-neutral-500 ml-1">（{pair.total}件中）</span>
                </span>
              </div>
              <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-neutral-500" style={{ width: `${(pair.rate * 100).toFixed(1)}%` }} />
              </div>
            </div>
          );
          return (
            <section className="mb-16">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h2 className="text-lg font-bold text-neutral-900">参議院本会議の採決での会派間の賛否の一致</h2>
                  <p className="text-xs text-neutral-600 mt-0.5">第{alignment.session}回国会・参議院本会議（押しボタン式投票の記録）</p>
                </div>
                <Link href="/votes" className="text-xs text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-300 hover:border-neutral-500 rounded-full px-3 py-1 transition-colors shrink-0 ml-4 mt-1">
                  全会派の一覧 →
                </Link>
              </div>
              <p className="text-sm text-neutral-600 leading-relaxed mb-5">
                参議院の投票結果ページに記載された会派別の賛成票・反対票から、各会派の賛否（賛成票と反対票の多い方）を求め、
                2つの会派の賛否が同じだった採決の割合を機械的に集計しています。賛成票と反対票が同数の場合は対象外です。
              </p>
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-200">
                    <p className="text-xs font-bold text-neutral-700">一致の割合が高い組み合わせ</p>
                  </div>
                  {high.map((pair) => <PairRow key={`${pair.a}|${pair.b}`} pair={pair} />)}
                </div>
                <div className="bg-white border border-neutral-200 rounded-2xl overflow-hidden">
                  <div className="px-5 py-2.5 bg-neutral-50 border-b border-neutral-200">
                    <p className="text-xs font-bold text-neutral-700">一致の割合が低い組み合わせ</p>
                  </div>
                  {low.map((pair) => <PairRow key={`${pair.a}|${pair.b}`} pair={pair} />)}
                </div>
              </div>
            </section>
          );
        })()}

        {/* ── B: 質問主意書の月別推移（院別） ───────────────── */}
        {monthlyQuestions.length > 0 && (
          <section className="mb-16">
            <div className="mb-3">
              <h2 className="text-lg font-bold text-neutral-900">質問主意書の月別推移</h2>
              <p className="text-xs text-neutral-600 mt-0.5">直近12ヶ月・提出月別（衆議院・参議院）</p>
            </div>
            <p className="text-sm text-neutral-600 leading-relaxed mb-5">
              質問主意書は、議員が内閣に対して文書で説明を求める制度で、内閣の答弁書とともに公式記録として残ります。
              月ごとの提出件数を院別に示しています。
            </p>
            <div className="bg-white border border-neutral-200 rounded-2xl px-6 py-5 space-y-2.5">
              <div className="flex gap-4 text-[11px] text-neutral-600 mb-1">
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-neutral-700" />衆議院</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm bg-neutral-400" />参議院</span>
              </div>
              {(() => {
                const max = Math.max(...monthlyQuestions.map((m) => m.total), 1);
                return monthlyQuestions.map((m) => (
                  <div key={m.month} className="flex items-center gap-3">
                    <span className="whitespace-nowrap shrink-0 w-16 text-[11px] tabular-nums text-neutral-600">{m.month}</span>
                    <div className="flex-1 h-4 bg-neutral-100 rounded-full overflow-hidden">
                      <div className="h-full flex" style={{ width: `${(m.total / max) * 100}%` }}>
                        <div className="h-full bg-neutral-700" style={{ width: `${m.total ? (m.shugiin / m.total) * 100 : 0}%` }} />
                        <div className="h-full bg-neutral-400" style={{ width: `${m.total ? (m.sangiin / m.total) * 100 : 0}%` }} />
                      </div>
                    </div>
                    <span className="text-[11px] text-neutral-600 tabular-nums w-20 text-right shrink-0">
                      {m.total}<span className="text-neutral-500">（衆{m.shugiin}/参{m.sangiin}）</span>
                    </span>
                  </div>
                ));
              })()}
            </div>
          </section>
        )}

        {/* ── 複数の会派の議員が提出した議員立法 ─────────────── */}
        {crossFactionBills.length > 0 && (
          <section className="mb-16">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="text-lg font-bold text-neutral-900">複数の会派の議員が提出した議員立法</h2>
                <p className="text-xs text-neutral-600 mt-0.5">提出時の会派が確定できた提出者で、会派の数が多い法案</p>
              </div>
              <Link href="/bills" className="text-xs text-neutral-600 hover:text-neutral-900 bg-white border border-neutral-300 hover:border-neutral-500 rounded-full px-3 py-1 transition-colors shrink-0 ml-4 mt-1">
                法案一覧 →
              </Link>
            </div>
            <p className="text-sm text-neutral-600 leading-relaxed mb-5">
              提出者の会派は、提出日の時点の会派を当サイトの会派の記録（国会会議録の発言時点の会派と、議員名簿）から求めています。
              提出日の前後の記録がともに同じ会派である場合にだけその会派として数え、確定できない提出者は数えていません。無所属は会派の数に含めていません。
            </p>
            <div className="bg-white border border-neutral-200 rounded-2xl divide-y divide-neutral-200">
              {crossFactionBills.map((bill) => (
                <div key={bill.id} className="px-5 py-4">
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-neutral-800 text-white text-[10px] font-bold shrink-0">
                      {bill.factions.length}会派
                    </span>
                    <span className="text-[11px] text-neutral-600">{bill.house} 第{bill.session}回国会</span>
                    <span className="text-[11px] text-neutral-500">提出者の会派を確定: {bill.determinedCount}/{bill.submitterCount}名</span>
                  </div>
                  <span className="text-sm text-neutral-800 leading-snug line-clamp-2">{bill.title}</span>
                  <div className="flex gap-3 mt-1">
                    {bill.honbun_url && <a href={bill.honbun_url} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-600 underline underline-offset-2 decoration-neutral-400 hover:text-neutral-800">本文↗</a>}
                    {bill.keika_url && <a href={bill.keika_url} target="_blank" rel="noopener noreferrer" className="text-xs text-neutral-600 underline underline-offset-2 decoration-neutral-400 hover:text-neutral-800">経過↗</a>}
                  </div>
                  <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2">
                    {bill.factions.map((f: string) => (
                      <span key={f} className="inline-flex items-center gap-1 text-[11px] text-neutral-700">
                        <span style={{ color: factionColor(f), fontSize: 8 }}>●</span>
                        {f}
                      </span>
                    ))}
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
            <p className="text-xs text-neutral-600 mt-0.5">第{CURRENT_SESSION}回国会の集計（当サイトの収集分）</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "質問主意書", shu: currentStats.questionsShu, san: currentStats.questionsSan },
              { label: "請願",       shu: currentStats.petitionsShu, san: currentStats.petitionsSan },
            ].map((item) => (
              <div key={item.label} className="bg-white border border-neutral-200 rounded-xl px-4 py-5 text-center">
                <div className="text-2xl font-extrabold tabular-nums text-neutral-900">
                  {item.shu === null || item.san === null ? "—" : (item.shu + item.san).toLocaleString()}
                </div>
                <div className="text-[11px] text-neutral-600 mt-1">{item.label}</div>
                <div className="text-[11px] text-neutral-600">
                  衆 {item.shu ?? "取得できませんでした"} / 参 {item.san ?? "取得できませんでした"}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* ── 活動タブ：質問主意書 / 委員会活動 / 請願 ───────── */}
        <ActivityTabs
          recentQuestions={recentQuestions}
          committeeActivities={committeeActivities}
          recentPetitions={recentPetitions}
          petitionMemberMap={petitionMemberMap}
          recentBills={recentBills}
        />

        {/* ── 会派別 議員数（院別） ───────────────────────────── */}
        {factionBreakdown.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-neutral-900">会派別 議員数</h2>
              <Link href="/factions" className="text-xs text-neutral-600 hover:text-neutral-800 transition-colors">
                会派の一覧 →
              </Link>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              {(["衆議院", "参議院"] as const).map((house) => {
                const rows = factionBreakdown.filter((f) => f.house === house).sort((a, b) => b.count - a.count || a.faction.localeCompare(b.faction, "ja"));
                const max = Math.max(1, ...rows.map((r) => r.count));
                return (
                  <div key={house} className="bg-white border border-neutral-200 rounded-2xl p-5 space-y-3">
                    <p className="text-sm font-bold text-neutral-800">{house}</p>
                    {rows.map((f) => (
                      <div key={f.faction}>
                        <div className="flex items-center justify-between mb-1">
                          <Link href={factionPath(house, f.faction)} className="text-xs text-neutral-800 truncate mr-3 hover:underline">{f.faction}</Link>
                          <span className="text-xs text-neutral-600 tabular-nums shrink-0">{f.count}名</span>
                        </div>
                        <div className="h-1.5 bg-neutral-200 rounded-full overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${(f.count / max) * 100}%`, background: factionColor(f.faction) }} />
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-neutral-600 mt-3">
              会派は、衆議院・参議院それぞれの中で活動を共にする議員のグループです。会派名は各院の公式の会派一覧の表記です。
            </p>
          </section>
        )}

        {/* ── 更新履歴 ─────────────────────────────────────────── */}
        <section className="mb-16">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-neutral-900">🕐 更新履歴</h2>
            <Link href="/changelog" className="text-xs text-neutral-500 hover:text-neutral-700 transition-colors">すべて見る →</Link>
          </div>
          <div className="bg-white border border-neutral-200 rounded-2xl divide-y divide-neutral-200">
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
            { label: "会派（衆参）", value: stats.factions, unit: "" },
            { label: "発言記録",   value: stats.speeches,  unit: "件" },
            { label: "質問主意書", value: stats.questions, unit: "件" },
            { label: "議員立法",   value: stats.bills,     unit: "件" },
            { label: "請願",       value: stats.petitions, unit: "件" },
          ].map((item) => (
            <div key={item.label}
              className="bg-white border border-neutral-200 rounded-xl px-4 py-5 text-center hover:border-neutral-300 transition-colors">
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
