import { supabase } from "../lib/supabase";
import Link from "next/link";

/* ─── データ取得（サーバーサイド） ─────────────────────────────── */
async function getStats() {
  const [totalRes, shugiinRes, sangiinRes, speechRes, questionRes] =
    await Promise.all([
      supabase
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true),
      supabase
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("house", "衆議院")
        .eq("is_active", true),
      supabase
        .from("members")
        .select("id", { count: "exact", head: true })
        .eq("house", "参議院")
        .eq("is_active", true),
      supabase.from("speeches").select("id", { count: "exact", head: true }),
      supabase.from("questions").select("id", { count: "exact", head: true }),
    ]);

  const partiesRes = await supabase
    .from("members")
    .select("party")
    .eq("is_active", true);
  const parties = new Set((partiesRes.data || []).map((m) => m.party)).size;

  return {
    total: totalRes.count || 0,
    shugiin: shugiinRes.count || 0,
    sangiin: sangiinRes.count || 0,
    parties,
    speeches: speechRes.count || 0,
    questions: questionRes.count || 0,
  };
}

async function getRecentSpeeches() {
  const { data } = await supabase
    .from("speeches")
    .select("id, committee, spoken_at, member_id, members(name, party, house)")
    .order("spoken_at", { ascending: false })
    .limit(8);
  return data || [];
}

async function getPartyBreakdown() {
  const { data } = await supabase
    .from("members")
    .select("party, house")
    .eq("is_active", true);
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
  const [stats, recentSpeeches, partyBreakdown] = await Promise.all([
    getStats(),
    getRecentSpeeches(),
    getPartyBreakdown(),
  ]);

  const maxPartyCount = partyBreakdown[0]?.total || 1;

  return (
    <div className="min-h-screen text-slate-200">
      {/* ── ヒーロー ─────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        {/* 背景グラデーション */}
        <div className="absolute inset-0 bg-gradient-to-b from-blue-950/40 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-500/5 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-4xl mx-auto px-5 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 mb-8 rounded-full border border-slate-700/60 bg-slate-800/40 text-xs text-slate-400">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            毎日自動更新中
          </div>

          <h1 className="mb-4">
            <img src="/logo-main.svg" alt="はたらく議員" className="h-32 sm:h-40 mx-auto" />
          </h1>

          <p className="text-lg text-slate-400 mb-2">
            国会議員の活動を、データで見える化
          </p>
          <p className="text-sm text-slate-500">
            衆議院・参議院の全議員の発言・質問主意書・委員会活動を収集・公開
          </p>
        </div>
      </section>

      <div className="max-w-4xl mx-auto px-5 pb-20">
        {/* ── 統計カード ──────────────────────────────────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-16">
          {[
            { label: "現職議員",   value: stats.total,     unit: "名", accent: "text-blue-400" },
            { label: "衆議院",     value: stats.shugiin,   unit: "名", accent: "text-sky-400" },
            { label: "参議院",     value: stats.sangiin,   unit: "名", accent: "text-cyan-400" },
            { label: "政党・会派", value: stats.parties,   unit: "党", accent: "text-violet-400" },
            { label: "発言記録",   value: stats.speeches,  unit: "件", accent: "text-amber-400" },
            { label: "質問主意書", value: stats.questions,  unit: "件", accent: "text-emerald-400" },
          ].map((item) => (
            <div
              key={item.label}
              className="bg-slate-900/60 border border-slate-800 rounded-xl px-4 py-5 text-center
                         hover:border-slate-700 transition-colors"
            >
              <div className={`text-2xl font-extrabold tabular-nums ${item.accent}`}>
                {item.value.toLocaleString()}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {item.label}
              </div>
            </div>
          ))}
        </section>

        {/* ── メインナビゲーション ────────────────────────────── */}
        <section className="grid sm:grid-cols-2 gap-4 mb-16">
          {[
            {
              icon: "👤",
              title: "議員一覧",
              desc: "政党・院・選挙区で絞り込み。全議員のプロフィールと活動実績を検索",
              path: "/members",
              border: "hover:border-blue-500/50",
            },
            {
              icon: "📊",
              title: "発言ランキング",
              desc: "発言セッション数・質問主意書数で見る、国会で活発な議員",
              path: "/ranking",
              border: "hover:border-violet-500/50",
            },
            {
              icon: "🏛️",
              title: "委員会別",
              desc: "委員会ごとの所属議員と活動状況。委員長・理事も確認できます",
              path: "/committees",
              border: "hover:border-cyan-500/50",
            },
            {
              icon: "🏢",
              title: "政党・会派",
              desc: "会派ごとの所属議員数と構成。国会での勢力図が一目でわかる",
              path: "/parties",
              border: "hover:border-amber-500/50",
            },
          ].map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={`group block bg-slate-900/60 border border-slate-800 rounded-2xl p-6
                         transition-all duration-200 hover:-translate-y-0.5 ${item.border}`}
            >
              <div className="text-3xl mb-3">{item.icon}</div>
              <div className="text-lg font-bold text-slate-100 mb-2 group-hover:text-white transition-colors">
                {item.title}
              </div>
              <div className="text-sm text-slate-500 leading-relaxed">
                {item.desc}
              </div>
            </Link>
          ))}
        </section>

        {/* ── 最近の国会活動 ──────────────────────────────────── */}
        {recentSpeeches.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-100">最近の発言記録</h2>
              <Link
                href="/ranking"
                className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
              >
                ランキングを見る →
              </Link>
            </div>

            <div className="space-y-2">
              {recentSpeeches.map((speech: any) => {
                const member = speech.members;
                return (
                  <Link
                    key={speech.id}
                    href={`/members/${speech.member_id}`}
                    className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4 bg-slate-900/40 border border-slate-800/60
                               rounded-xl px-5 py-3.5 hover:border-slate-700 hover:bg-slate-900/70
                               transition-all group"
                  >
                    <div className="shrink-0 text-xs text-slate-500 tabular-nums w-20">
                      {speech.spoken_at}
                    </div>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-200 group-hover:text-white transition-colors">
                        {member?.name || "—"}
                      </span>
                      <span className="text-slate-600 mx-2">|</span>
                      <span className="text-sm text-slate-500">
                        {member?.party}
                      </span>
                    </div>
                    <div className="shrink-0 text-xs text-slate-600 bg-slate-800/60 px-2.5 py-1 rounded-md">
                      {speech.committee}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* ── 政党別 議員数 ──────────────────────────────────── */}
        {partyBreakdown.length > 0 && (
          <section className="mb-16">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-slate-100">政党・会派別 議員数</h2>
              <Link
                href="/parties"
                className="text-xs text-slate-500 hover:text-blue-400 transition-colors"
              >
                詳しく見る →
              </Link>
            </div>

            <div className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-6 space-y-4">
              {partyBreakdown.map((p) => (
                <div key={p.party}>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-sm text-slate-300 truncate mr-4">{p.party}</span>
                    <span className="text-xs text-slate-500 tabular-nums shrink-0">
                      {p.total}名
                      <span className="text-slate-600 ml-1">
                        （衆{p.shugiin} / 参{p.sangiin}）
                      </span>
                    </span>
                  </div>
                  <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-blue-500 to-blue-400"
                      style={{ width: `${(p.total / maxPartyCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* ── データの正確性について ──────────────────────────── */}
        <section className="bg-slate-900/40 border border-slate-800/60 rounded-2xl p-7 mb-8">
          <h3 className="text-xs font-bold text-slate-400 tracking-widest uppercase mb-4">
            ⚠️ データの正確性について
          </h3>
          <div className="text-[13px] text-slate-500 leading-7 space-y-3">
            <p>
              本サイトのデータは公的機関の公開情報を自動収集・整理したものです。
              情報の正確性には最大限配慮していますが、以下の点にご注意ください。
            </p>
            <dl className="space-y-2">
              <div>
                <dt className="text-slate-400 font-semibold inline">会派と政党の違い：</dt>
                <dd className="inline">
                  議員の所属表記は国会内の「会派」を元にしており、実際の政党と異なる場合があります。
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 font-semibold inline">発言データのタイムラグ：</dt>
                <dd className="inline">
                  国会図書館の会議録データは審議から登録まで1〜2週間程度のタイムラグがあります。
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 font-semibold inline">議員情報の更新：</dt>
                <dd className="inline">
                  離党・入党・議員辞職等の変更は毎日自動更新していますが、即時反映されない場合があります。
                </dd>
              </div>
              <div>
                <dt className="text-slate-400 font-semibold inline">データの欠損：</dt>
                <dd className="inline">
                  発言記録がない議員は、実際に発言していない場合とデータ未取得の両方があり得ます。
                </dd>
              </div>
            </dl>
            <div className="pt-2 border-t border-slate-800/60">
              <p className="text-slate-400 font-semibold mb-1">データソース</p>
              <p>
                <a href="https://kokkai.ndl.go.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  国立国会図書館 会議録検索システムAPI
                </a>
                {" / "}
                <a href="https://www.shugiin.go.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  衆議院
                </a>
                {" / "}
                <a href="https://www.sangiin.go.jp/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline">
                  参議院
                </a>
              </p>
            </div>
            <p className="text-slate-600">
              誤りや改善点を発見された場合は、
              <a
                href="https://github.com/ParliamentCheck/giin-watch/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-400 hover:underline"
              >
                GitHub Issue
              </a>
              でご報告いただけると幸いです。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
