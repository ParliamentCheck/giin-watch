"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import WordCloud from "../../components/WordCloud";
import ActivityRadar from "../../components/ActivityRadar";
import { isFavorite, addFavorite, removeFavorite } from "../../../lib/favorites";
import Paginator, { PAGE_SIZE } from "../../../components/Paginator";
import { usePagination } from "../../../hooks/usePagination";
import AIAnalysis from "./AIAnalysis";
import { PARTY_COLORS } from "../../../lib/partyColors";
import { SESSION_RANGE_SPEECHES, SESSION_RANGE_QUESTIONS, SESSION_RANGE_BILLS } from "../../../lib/constants";
import type {
  Member, Speech, SpeechExcerpt,
  Question, SangiinQuestion,
  Vote, Bill, Petition, SangiinPetition,
  CommitteeMember, MemberKeyword,
} from "../../../lib/types";
import {
  getMemberById, getMembersByIds, getGlobalActivityMax,
  getSpeechesForMember, getSpeechExcerptsForMember,
  getQuestionsForMember, getSangiinQuestionsForMember,
  getVotesForMember, getVoteStatsForMember,
  getBillsForMember,
  getPetitionsForMember, getSangiinPetitionsForMember,
  getCommitteesForMember, getMemberKeywords,
} from "../../../lib/queries";

// ============================================================
// ページ固有の型（lib/types.ts にないもの）
// ============================================================

interface SessionGroup {
  committee: string | null;
  spoken_at: string | null;
  speeches: Speech[];
}

// ============================================================

const ROLE_COLORS: Record<string, string> = {
  "委員長": "#333333",
  "理事":   "#333333",
  "委員":   "#555555",
  "会長":   "#333333",
  "副会長": "#333333",
};

function MemberDetailContent({ initialMember, initialGlobalMax, initialCommitteeCount, initialVoteCount }: {
  initialMember?: Member | null;
  initialGlobalMax?: { session: number; question: number; bill: number; petition: number };
  initialCommitteeCount?: number | null;
  initialVoteCount?: number | null;
}) {
  const params   = useParams();
  const router   = useRouter();
  const memberId = decodeURIComponent(params.id as string);

  const [member,        setMember]        = useState<Member | null>(initialMember ?? null);
  const [speeches,      setSpeeches]      = useState<Speech[]>([]);
  const [questions,     setQuestions]     = useState<(Question | SangiinQuestion)[]>([]);
  const [committees,    setCommittees]    = useState<CommitteeMember[]>([]);
  const [votes,         setVotes]         = useState<Vote[]>([]);
  const [voteStats,     setVoteStats]     = useState<{ yea: number; nay: number; absent: number; total: number } | null>(null);
  const [bills,         setBills]         = useState<Bill[]>([]);
  const [coSponsors,    setCoSponsors]    = useState<{ id: string; name: string; party: string; count: number }[]>([]);
  const [billsSubTab,   setBillsSubTab]   = useState<"list" | "partners">("list");
  const [voteFilter,    setVoteFilter]    = useState<"all" | "賛成" | "反対" | "欠席">("all");
  const [petitions,     setPetitions]     = useState<(Petition | SangiinPetition)[]>([]);
  const [keywords,      setKeywords]      = useState<MemberKeyword[]>([]);
  const [speechExcerpts, setSpeechExcerpts] = useState<SpeechExcerpt[]>([]);
  const [globalMax,     setGlobalMax]     = useState(initialGlobalMax ?? { session: 1, question: 1, bill: 1, petition: 1 });
  const [loading,       setLoading]       = useState(!initialMember);
  const [clientLoaded,  setClientLoaded]  = useState(false);
  const searchParams = useSearchParams();
  const { page: listPage, setPage: setListPage } = usePagination();
  const tab = searchParams.get("tab") ?? "committees";
  const MEMBER_TAB_LABELS: Record<string, string> = {
    committees: "委員会", speeches: "発言", questions: "質問主意書",
    votes: "採決", bills: "議員立法", petitions: "請願",
    keywords: "キーワード", ai: "AI分析",
  };
  useEffect(() => {
    if (member?.name) {
      const tabLabel = MEMBER_TAB_LABELS[tab] ?? tab;
      document.title = `${member.alias_name ?? member.name} — ${tabLabel} | はたらく議員`;
    }
  }, [member, tab]);
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    p.delete("page");
    router.replace(`${window.location.pathname}?${p.toString()}`, { scroll: false });
  };
  const [expanded,      setExpanded]      = useState<Set<string>>(new Set());
  const [petitionFilter, setPetitionFilter] = useState<"採択" | "不採択" | "審査未了" | "all">("all");
  const [fav,     setFav]     = useState(false);
  const [favMsg,  setFavMsg]  = useState("");

  useEffect(() => {
    async function fetchAll() {
      const val = <T,>(r: PromiseSettledResult<T>, fallback: T): T =>
        r.status === "fulfilled" ? r.value : fallback;

      const [
        memberResult,
        speechResult,
        questionResult,
        sangiinQResult,
        committeeResult,
        voteResult,
        billResult,
        keywordResult,
        petitionResult,
        sangiinPResult,
        excerptResult,
        voteStatsResult,
      ] = await Promise.allSettled([
        initialMember
          ? Promise.resolve(initialMember as Member)
          : getMemberById(memberId),
        getSpeechesForMember(memberId),
        getQuestionsForMember(memberId),
        getSangiinQuestionsForMember(memberId),
        getCommitteesForMember(memberId),
        getVotesForMember(memberId),
        getBillsForMember(memberId),
        getMemberKeywords(memberId),
        getPetitionsForMember(memberId),
        getSangiinPetitionsForMember(memberId),
        getSpeechExcerptsForMember(memberId),
        getVoteStatsForMember(memberId),
      ]);

      const memberData = val(memberResult, null);
      if (memberData) {
        setMember(memberData);
        setFav(isFavorite(memberId));
      }

      setSpeeches(val(speechResult, []));

      const shugiinQ = val(questionResult, []);
      const sangiinQ = val(sangiinQResult, []);
      setQuestions(
        [...shugiinQ, ...sangiinQ].sort(
          (a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || "")
        )
      );

      const cmData = val(committeeResult, []);
      const seen = new Set<string>();
      setCommittees(
        cmData.filter((c) => {
          const key = `${c.committee}__${c.role ?? ""}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
      );

      setVotes(val(voteResult, []));
      setVoteStats(val(voteStatsResult, { total: 0, yea: 0, nay: 0, absent: 0 }));

      const billsData = val(billResult, []);
      setBills(billsData);

      // 共同提出パートナーを集計
      const countMap: Record<string, number> = {};
      for (const bill of billsData) {
        for (const id of (bill.submitter_ids || [])) {
          if (id !== memberId) countMap[id] = (countMap[id] || 0) + 1;
        }
      }
      const partnerIds = Object.keys(countMap);
      if (partnerIds.length > 0) {
        const partnerData = await getMembersByIds(partnerIds);
        const sorted = partnerData
          .map((m) => ({
            id: m.id,
            name: (m.alias_name ?? m.name).replace(/\u3000|\s/g, ""),
            party: m.party === "中道改革連合" && m.prev_party ? m.prev_party : m.party,
            count: countMap[m.id] || 0,
          }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);
        setCoSponsors(sorted);
      }

      setKeywords(val(keywordResult, []));

      const shugiinP = val(petitionResult, []);
      const sangiinP = val(sangiinPResult, []);
      setPetitions(
        [...shugiinP, ...sangiinP].sort((a, b) => {
          if (b.session !== a.session) return b.session - a.session;
          return b.number - a.number;
        })
      );

      setSpeechExcerpts(val(excerptResult, []));

      // グローバルMAX取得（SSRで渡されていない場合のみ）
      if (!initialGlobalMax) {
        const gm = await getGlobalActivityMax();
        setGlobalMax(gm);
      }

      setLoading(false);
      setClientLoaded(true);
    }
    fetchAll();
  }, [memberId]);

  // 発言をセッション単位でグルーピング
  const sessionGroups: SessionGroup[] = [];
  const sessionMap: Record<string, SessionGroup> = {};
  for (const s of speeches) {
    const key = `${s.spoken_at ?? ""}_${s.committee ?? ""}`;
    if (!sessionMap[key]) {
      sessionMap[key] = { committee: s.committee ?? null, spoken_at: s.spoken_at ?? null, speeches: [] };
      sessionGroups.push(sessionMap[key]);
    }
    sessionMap[key].speeches.push(s);
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) return (
    <div className="loading-block" style={{ minHeight: "100vh" }}>
      <div className="loading-spinner" />
      <span>データを読み込んでいます...</span>
    </div>
  );

  if (!member) return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
      議員データが見つかりませんでした
    </div>
  );

  const color       = PARTY_COLORS[member.party] || "#7f8c8d";
  const showFaction = member.faction && member.faction !== member.party;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 960, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <button onClick={() => router.back()} className="btn-back" style={{ marginBottom: 0 }}>
          ← 一覧に戻る
        </button>
        {member && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {favMsg && <span style={{ fontSize: 11, color: "#ef4444" }}>{favMsg}</span>}
            <button onClick={() => {
              if (fav) {
                removeFavorite(memberId);
                setFav(false);
                setFavMsg("");
              } else {
                const result = addFavorite(memberId);
                if (result.ok) { setFav(true); setFavMsg(""); }
                else { setFavMsg(result.reason || ""); }
              }
            }}
              className={`fav-btn${fav ? " active" : ""}`}
              style={fav
                ? { background: color, color: "#ffffff", borderColor: color, marginBottom: 0 }
                : { borderColor: color, color: color, marginBottom: 0 }}>
              {fav ? "⭐ 登録済み" : "☆ My議員登録"}
            </button>
          </div>
        )}
      </div>

      {/* ヘッダー */}
      <div className="card-xl" style={{ marginBottom: 20 }}>
        {/* 画像 + 名前・院・当選回数（常に横並び） */}
        <div style={{ display: "flex", gap: 16, alignItems: "flex-start", marginBottom: 12 }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
            background: "#e0e0e0", border: `3px solid ${color}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
            👤
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {(member.last_name_reading || member.first_name_reading) && (
              <div style={{ fontSize: 12, color: "#999999", letterSpacing: "0.08em", marginBottom: 2 }}>
                {member.last_name_reading}　{member.first_name_reading}
              </div>
            )}
            <h1 style={{ margin: "0 0 4px", fontSize: 26, fontWeight: 800, color: "#111111", lineHeight: 1.2 }}>
              {member.alias_name ?? member.name}
              {member.alias_name && (
                <>
                  <br className="sm:hidden" />
                  <span className="hidden sm:inline" />
                  <span style={{ fontSize: 14, fontWeight: 400, color: "#888888" }} className="sm:ml-2">
                    （{member.name}）
                  </span>
                </>
              )}
            </h1>
            <div style={{ fontSize: 13, color: "#555555" }}>
              {!member.is_active && (
                <span className="badge-inactive">
                  ⚠️ 前議員（現在は議員ではありません）
                </span>
              )}
              {member.house} · {member.district}
              {member.terms && (
                <><br />当選回数：{member.terms}期</>
              )}
            </div>
          </div>
        </div>
        {/* バッジ類（元のまま・全幅） */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="badge badge-party" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, "--party-color": member.is_active ? color : "#aaaaaa" } as React.CSSProperties}>
            🗳 {member.is_active ? member.party : `元${member.party}`}
          </span>
          {showFaction && (
            <span className="badge badge-house" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12 }}>
              🏛 会派: {member.faction}
            </span>
          )}
          {member.cabinet_post && (
            <span className="badge badge-cabinet" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, whiteSpace: "normal" }}>
              👑 {member.cabinet_post}
            </span>
          )}
          {member.source_url && (
            <a href={member.source_url} target="_blank" rel="noopener noreferrer"
              className="badge badge-house" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, textDecoration: "none" }}>
              📄 公式プロフィール
            </a>
          )}
        </div>
      </div>

      {/* 活動バランス + サマリー */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#333333", marginBottom: 2 }}>活動バランス</div>
        <div style={{ fontSize: 11, color: "#888888", marginBottom: 12, lineHeight: 1.6 }}>
          各活動の件数から活動の比重・傾向を図示しています。活動量の多さを示すものではありません。
          <a href="/faq#activity-radar" style={{ color: "#888888", marginLeft: 4 }}>算出方法はこちら ↗</a>
        </div>
        <div className="activity-balance-body" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div className="activity-balance-radar" style={{ width: 350, flexShrink: 0 }}>
            <ActivityRadar
              axes={[
                { key: "session",  label: "発言",       value: member.session_count  ?? 0, globalMax: globalMax.session  },
                { key: "petition", label: "請願",       value: member.petition_count ?? 0, globalMax: globalMax.petition },
                { key: "bill",     label: "議員立法",   value: member.bill_count     ?? 0, globalMax: globalMax.bill     },
                { key: "question", label: "質問主意書", value: member.question_count ?? 0, globalMax: globalMax.question },
              ]}
              color={PARTY_COLORS[member.party] || "#333333"}
            />
          </div>
          <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, flex: 1 }}>
            {[
              { label: "委員会所属",     value: clientLoaded ? committees.length : (initialCommitteeCount ?? null), unit: "件" },
              { label: "発言セッション", value: member.session_count, unit: "回" },
              { label: "質問主意書",     value: member.question_count, unit: "件" },
              { label: member.house === "衆議院" ? "採決（衆院は非対応）" : "採決", value: member.house === "衆議院" ? undefined : (clientLoaded ? voteStats?.total : (initialVoteCount ?? null)), unit: "件" },
              { label: "議員立法",       value: member.bill_count, unit: "件" },
              { label: "請願",           value: member.petition_count, unit: "件" },
            ].map((item) => (
              <div key={item.label} style={{ background: `${color}15`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#333333", marginBottom: 2 }}>
                  {item.value ?? "—"}
                  {item.value != null && <span style={{ fontSize: 11, color: "#555555", marginLeft: 3 }}>{item.unit}</span>}
                </div>
                <div style={{ fontSize: 10, color: "#888888" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* カード注釈 */}
      <div style={{ fontSize: 11, color: "#888888", marginBottom: 16, padding: "0 4px", lineHeight: 1.7 }}>
        ※ 当選回数は現在の所属院におけるものです。<br />
        ※ 与党議員は内閣を通じて政策を実現するため、質問主意書・議員立法の件数は構造的に少なくなる傾向があります。数字の大小が活動の優劣を示すものではありません。<br />
        ※ 集計期間：発言・議員立法・採決 第210回〜（2022年〜） / 質問主意書・請願 第196回〜（2018年〜）
      </div>

      {/* タブ */}
      <div className="tab-bar tab-bar-container" style={{ background: `${color}15`, borderColor: `${color}30`, "--tab-hover-bg": `${color}35` } as React.CSSProperties}>
        {[
          { id: "committees", label: "🏛 委員会" },
          { id: "speeches",   label: "💬 発言" },
          { id: "questions",  label: "📝 質問主意書" },
          { id: "votes",      label: "🗳 採決" },
          { id: "bills",      label: "📋 議員立法" },
          { id: "petitions",  label: "📜 請願" },
          { id: "keywords",   label: "☁️ キーワード" },
          { id: "ai",         label: "🤖 AI分析" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-pill${tab === t.id ? " active" : ""}`}
            style={{
              flex: 1, padding: "10px 0",
              ...(tab === t.id ? { background: color, color: "#ffffff" } : {}),
            }}
            onMouseEnter={(e) => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = `${color}35`; }}
            onMouseLeave={(e) => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 委員会所属タブ */}
      {tab === "committees" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            委員会所属（現在）
          </h3>
          {committees.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              委員会所属データがありません。
            </div>
          ) : (
            committees.map((c, i) => {
              const roleColor = ROLE_COLORS[c.role ?? ""] || "#555555";
              return (
                <div key={c.id} style={{ padding: "14px 0",
                  borderBottom: i < committees.length - 1 ? "1px solid #e0e0e0" : "none",
                  display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="badge badge-role">
                    {c.role ?? "委員"}
                  </span>
                  <span style={{ fontSize: 14, color: "#1a1a1a" }}>{c.committee}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 発言履歴タブ */}
      {tab === "speeches" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            発言履歴（セッション単位・最新順）
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            {`※ 同日・同委員会の発言を1回として集計（${SESSION_RANGE_SPEECHES}の記録に基づく）。`}
          </p>
          {sessionGroups.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              発言データがまだありません。
            </div>
          ) : (
            <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: "#888888", fontSize: 13 }}>{sessionGroups.length}件</span>
              <Paginator total={sessionGroups.length} page={listPage} onPage={setListPage} variant="top" />
            </div>
            {sessionGroups.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE).map((sg) => {
              const key    = `${sg.spoken_at ?? ""}_${sg.committee ?? ""}`;
              const isOpen = expanded.has(key);
              return (
                <div key={key} style={{ borderBottom: "1px solid #e0e0e0", paddingBottom: 12, marginBottom: 12 }}>
                  <div
                    onClick={() => toggleExpand(key)}
                    style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", cursor: "pointer", padding: "6px 0" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                        {sg.committee ?? ""}
                      </span>
                      <span style={{ fontSize: 12, color: "#888888", marginLeft: 12 }}>
                        {sg.spoken_at ?? ""}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="badge-count">
                        {sg.speeches.length}件の発言
                      </span>
                      <span style={{ color: "#555555", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingLeft: 12,
                      borderLeft: "2px solid #e0e0e0" }}>
                      {sg.speeches.map((s, i) => (
                        <div key={s.id} style={{ padding: "8px 0",
                          borderBottom: i < sg.speeches.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                          {s.source_url ? (
                            <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                              style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                              📄 発言 #{i + 1} を見る ↗
                            </a>
                          ) : (
                            <span style={{ fontSize: 12, color: "#888888" }}>📄 発言 #{i + 1}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
            <Paginator total={sessionGroups.length} page={listPage} onPage={setListPage} variant="bottom" />
            </>
          )}
        </div>
      )}

      {/* 請願タブ */}
      {tab === "petitions" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            紹介議員を務めた請願
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            {`※ ${SESSION_RANGE_QUESTIONS}の記録に基づく。`}
          </p>
          {petitions.length > 0 && (() => {
            const adopted    = petitions.filter(p => p.result?.split("\n")[0].trim().startsWith("採択")).length;
            const rejected   = petitions.filter(p => p.result?.split("\n")[0].trim() === "不採択").length;
            const pending    = petitions.filter(p => !p.result || p.result.trim() === "" || p.result.includes("審査未了")).length;
            return (
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                {([
                  { label: "採択"    as const, count: adopted,  color: "#22c55e" },
                  { label: "不採択"  as const, count: rejected, color: "#ef4444" },
                  { label: "審査未了" as const, count: pending,  color: "#888888" },
                ] as { label: "採択" | "不採択" | "審査未了"; count: number; color: string }[]).map(({ label, count, color }) => {
                  const isActive = petitionFilter === label;
                  return (
                    <div key={label} onClick={() => setPetitionFilter(isActive ? "all" : label)}
                      style={{
                        flex: 1, background: isActive ? color : "#f4f4f4",
                        borderRadius: 8, padding: "8px 16px", textAlign: "center", cursor: "pointer",
                      }}>
                      <div style={{ fontSize: 15, fontWeight: 800, color: isActive ? "#ffffff" : color }}>{count}</div>
                      <div style={{ fontSize: 11, color: isActive ? "#ffffff" : "#888888", whiteSpace: "nowrap" }}>{label}</div>
                    </div>
                  );
                })}
              </div>
            );
          })()}
          {petitions.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              請願の紹介議員記録がありません。
            </div>
          ) : (
            petitions.filter((p) => {
              if (petitionFilter === "all") return true;
              const r = p.result?.split("\n")[0].trim() ?? "";
              if (petitionFilter === "採択") return r.startsWith("採択");
              if (petitionFilter === "不採択") return r === "不採択";
              return !p.result || p.result.trim() === "" || p.result.includes("審査未了");
            }).map((p, i, arr) => {
              const resultClean = p.result?.split("\n")[0].trim() ?? null;
              const resultColor = resultClean?.startsWith("採択") ? "#22c55e"
                : resultClean === "不採択" ? "#ef4444" : "#555555";
              return (
                <div key={p.id} style={{ padding: "14px 0",
                  borderBottom: i < arr.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>
                      {p.title}
                    </span>
                    <span style={{ fontSize: 11, color: "#888888", flexShrink: 0 }}>
                      第{p.session}回 #{p.number}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {p.committee_name && (
                      <span style={{ fontSize: 12, color: "#555555" }}>🏛 {p.committee_name}</span>
                    )}
                    {resultClean && (
                      <span className="badge badge-result" style={{ "--result-color": resultColor } as React.CSSProperties}>
                        {resultClean}
                      </span>
                    )}
                    {p.source_url && (
                      <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                        📄 詳細を見る ↗
                      </a>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* キーワードタブ */}
      {tab === "keywords" && (
        <div style={{ padding: "16px 0" }}>
          <WordCloud keywords={keywords} width={600} height={320} />
          <p style={{ textAlign: "center", fontSize: 11, color: "#888888", marginTop: 8 }}>
            <a href="/faq#keywords" style={{ color: "#888888" }}>集計方法はこちら ↗</a>
          </p>
        </div>
      )}

      {/* 質問主意書タブ */}
      {tab === "questions" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            質問主意書
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            {`※ ${SESSION_RANGE_QUESTIONS}の記録に基づく。`}
          </p>
          {questions.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              質問主意書の提出記録がありません。
            </div>
          ) : (
            <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <span style={{ color: "#888888", fontSize: 13 }}>{questions.length}件</span>
              <Paginator total={questions.length} page={listPage} onPage={setListPage} variant="top" />
            </div>
            {questions.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE).map((q, i, arr) => (
              <div key={q.id} style={{ padding: "14px 0",
                borderBottom: i < arr.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>
                    {q.title}
                  </span>
                  <span style={{ fontSize: 11, color: "#888888", flexShrink: 0 }}>
                    第{q.session}回 #{q.number ?? "?"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#555555" }}>
                    提出: {q.submitted_at || "不明"}
                  </span>
                  {q.answered_at && (
                    <span style={{ fontSize: 12, color: "#555555" }}>
                      答弁: {q.answered_at}
                    </span>
                  )}
                  {q.source_url && (
                    <a href={q.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                      📄 詳細を見る ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
            <Paginator total={questions.length} page={listPage} onPage={setListPage} variant="bottom" />
            </>
          )}
        </div>
      )}

      {/* 採決記録タブ（参議院のみ） */}
      {tab === "votes" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            本会議採決記録（参議院）
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            {`※ ${SESSION_RANGE_BILLS}の記録に基づく（参議院のみ）。`}
          </p>
          {member.house !== "参議院" ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              衆議院は個人別の投票記録が公開されていないため、採決データは参議院議員のみ表示されます。
            </div>
          ) : votes.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              採決記録がありません。
            </div>
          ) : (() => {
            const yea        = voteStats?.yea    ?? 0;
            const nay        = voteStats?.nay    ?? 0;
            const absent     = voteStats?.absent ?? 0;
            const total      = voteStats?.total  ?? 0;
            const absentRate = total > 0 ? (absent / total * 100).toFixed(1) : "0.0";
            const filteredVotes = voteFilter === "all" ? votes : votes.filter(v => v.vote === voteFilter);
            return (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {([
                    { label: "賛成" as const,  count: `${yea}`,         color: "#22c55e" },
                    { label: "反対" as const,  count: `${nay}`,         color: "#ef4444" },
                    { label: "欠席" as const,  count: `${absent}`,      color: "#888888" },
                    { label: "欠席率",          count: `${absentRate}%`, color: absent > 0 ? "#f59e0b" : "#888888" },
                  ] as { label: string; count: string; color: string }[]).map(({ label, count, color }) => {
                    const isFilterable = label === "賛成" || label === "反対" || label === "欠席";
                    const isActive = voteFilter === label;
                    return (
                      <div key={label}
                        onClick={isFilterable ? () => setVoteFilter(isActive ? "all" : label as "賛成" | "反対" | "欠席") : undefined}
                        style={{
                          background: isActive ? color : "#f4f4f4",
                          borderRadius: 8, padding: "8px 0", textAlign: "center", flex: 1,
                          cursor: isFilterable ? "pointer" : "default",
                          border: isActive ? `2px solid ${color}` : "2px solid transparent",
                          transition: "background 0.15s",
                        }}>
                        <div style={{ fontSize: 15, fontWeight: 800, color: isActive ? "#ffffff" : color }}>{count}</div>
                        <div style={{ fontSize: 11, color: isActive ? "#ffffffcc" : "#888888", whiteSpace: "nowrap" }}>{label}</div>
                      </div>
                    );
                  })}
                </div>
                {voteFilter !== "all" && (
                  <div style={{ fontSize: 12, color: "#555555", marginBottom: 12 }}>
                    「{voteFilter}」で絞り込み中 — {filteredVotes.length}件
                    <button onClick={() => setVoteFilter("all")}
                      style={{ marginLeft: 8, fontSize: 11, color: "#888888", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      解除
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#888888", fontSize: 13 }}>{filteredVotes.length}件</span>
                  <Paginator total={filteredVotes.length} page={listPage} onPage={setListPage} variant="top" />
                </div>
                {filteredVotes.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE).map((v, i, arr) => {
                  const voteColor = v.vote === "賛成" ? "#22c55e" : v.vote === "反対" ? "#ef4444" : "#888888";
                  return (
                    <div key={v.id} style={{ padding: "12px 0",
                      borderBottom: i < arr.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ fontSize: 13, color: "#1a1a1a", flex: 1 }}>
                          {v.bill_title}
                        </span>
                        <span className="badge badge-result" style={{ flexShrink: 0, "--result-color": voteColor } as React.CSSProperties}>
                          {v.vote}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#555555", marginTop: 4 }}>
                        {v.vote_date || "日付不明"} · 第{v.session_number}回国会
                      </div>
                    </div>
                  );
                })}
                <Paginator total={filteredVotes.length} page={listPage} onPage={setListPage} variant="bottom" />
              </>
            );
          })()}
        </div>
      )}

      {/* 議員立法タブ */}
      {tab === "bills" && (
        <div className="card" style={{ padding: 20 }}>
          {/* サブタブ */}
          <div className="tab-bar-container" style={{ marginBottom: 16,
            background: `${color}15`, borderColor: `${color}30`, "--tab-hover-bg": `${color}35` } as React.CSSProperties}>
            {(["list", "partners"] as const).map((st) => (
              <button key={st} onClick={() => setBillsSubTab(st)}
                style={{ flex: 1, padding: "8px 0",
                  ...(billsSubTab === st ? { background: color, color: "#ffffff" } : {}) }}
                className={`tab-pill${billsSubTab === st ? " active" : ""}`}
                onMouseEnter={(e) => { if (billsSubTab !== st) (e.currentTarget as HTMLButtonElement).style.background = `${color}35`; }}
                onMouseLeave={(e) => { if (billsSubTab !== st) (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
                {st === "list" ? "議員提出法案" : "共同提出パートナー"}
              </button>
            ))}
          </div>

          {/* 議員提出法案 */}
          {billsSubTab === "list" && (
            <>
              <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
                {`※ ${SESSION_RANGE_BILLS}の記録に基づく。`}
              </p>
              {bills.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 0" }}>
                  議員提出法案の記録がありません。
                </div>
              ) : (
                <>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                  <span style={{ color: "#888888", fontSize: 13 }}>{bills.length}件</span>
                  <Paginator total={bills.length} page={listPage} onPage={setListPage} variant="top" />
                </div>
                {bills.slice((listPage - 1) * PAGE_SIZE, listPage * PAGE_SIZE).map((b, i, arr) => (
                  <div key={b.id} style={{ padding: "12px 0",
                    borderBottom: i < arr.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
                      {b.title}
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#555555", alignItems: "center" }}>
                      <span>{b.submitted_at || "日付不明"}</span>
                      <span>第{b.session_number ?? "?"}回国会</span>
                      {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                      {b.honbun_url && (
                        <a href={b.honbun_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: "#333333", textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}>
                          本文↗
                        </a>
                      )}
                      {b.keika_url && (
                        <a href={b.keika_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: "#333333", textDecoration: "none" }}
                          onClick={(e) => e.stopPropagation()}>
                          経過↗
                        </a>
                      )}
                    </div>
                  </div>
                ))}
                <Paginator total={bills.length} page={listPage} onPage={setListPage} variant="bottom" />
                </>
              )}
            </>
          )}

          {/* 共同提出パートナー */}
          {billsSubTab === "partners" && (
            <>
              <p style={{ fontSize: 11, color: "#888888", marginBottom: 14 }}>
                共同提出した法案の件数が多い順（上位10名）。
              </p>
              {coSponsors.length === 0 ? (
                <div className="empty-state" style={{ padding: "20px 0" }}>
                  共同提出パートナーのデータがありません。
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {coSponsors.map((p, i) => {
                    const partyColor = PARTY_COLORS[p.party] || "#7f8c8d";
                    const isCross = p.party !== member?.party &&
                      !(member?.party === "中道改革連合" && (p.party === "公明党" || p.party === "立憲民主党"));
                    return (
                      <div key={p.id}
                        onClick={() => router.push(`/members/${encodeURIComponent(p.id)}`)}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px",
                          background: "#f9f9f9", borderRadius: 8, border: "1px solid #eeeeee",
                          cursor: "pointer" }}>
                        <span style={{ fontSize: 12, color: "#aaaaaa", width: 20, textAlign: "right", flexShrink: 0 }}>
                          {i + 1}
                        </span>
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: partyColor, flexShrink: 0 }} />
                        <span style={{ fontSize: 14, fontWeight: 600, flex: 1, color: "#1a1a1a" }}>{p.name}</span>
                        <span style={{ fontSize: 11, color: partyColor, fontWeight: 600, flexShrink: 0 }}>{p.party}</span>
                        {isCross && (
                          <span style={{ fontSize: 10, color: "#ffffff", background: "#888888",
                            borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>超党派</span>
                        )}
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#1a1a1a", flexShrink: 0 }}>
                          {p.count}<span style={{ fontSize: 11, fontWeight: 400, color: "#888888", marginLeft: 2 }}>件</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* AI分析タブ */}
      {tab === "ai" && (
        <AIAnalysis
          member={member}
          questions={questions.map(q => ({ ...q, submitted_at: q.submitted_at ?? "" }))}
          votes={votes}
          bills={bills}
          petitions={petitions}
          committees={committees.map(c => ({ ...c, role: c.role ?? "" }))}
          coSponsors={coSponsors}
          speeches={speeches.map(s => ({ ...s, committee: s.committee ?? "", spoken_at: s.spoken_at ?? "" }))}
          keywords={keywords}
          voteStats={voteStats}
          speechExcerpts={speechExcerpts.map(e => ({ ...e, committee: e.committee ?? "" }))}
        />
      )}
    </div>
  );
}

export default function MemberDetailClient({ initialMember, initialGlobalMax, initialCommitteeCount, initialVoteCount }: {
  initialMember?: Member | null;
  initialGlobalMax?: { session: number; question: number; bill: number; petition: number };
  initialCommitteeCount?: number | null;
  initialVoteCount?: number | null;
}) {
  return (
    <Suspense fallback={<div className="loading-block" style={{ minHeight: "100vh" }}><div className="loading-spinner" /></div>}>
      <MemberDetailContent initialMember={initialMember} initialGlobalMax={initialGlobalMax} initialCommitteeCount={initialCommitteeCount} initialVoteCount={initialVoteCount} />
    </Suspense>
  );
}
