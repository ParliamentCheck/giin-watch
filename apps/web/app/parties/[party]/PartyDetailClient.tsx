"use client";

import { Suspense, useEffect, useState } from "react";
import Paginator, { PAGE_SIZE } from "../../../components/Paginator";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import WordCloud from "../../components/WordCloud";
import ActivityRadar from "../../components/ActivityRadar";
import AIAnalysisBase from "../../components/AIAnalysisBase";
import { PARTY_COLORS } from "../../../lib/partyColors";
import { getPartyStatus } from "../../../lib/partyStatus";
import { usePagination } from "../../../hooks/usePagination";

interface Member {
  id: string;
  name: string;
  house: string;
  district: string;
  terms: number | null;
  speech_count: number | null;
  session_count: number | null;
  question_count: number | null;
  bill_count: number | null;
  petition_count: number | null;
  gender: string | null;
  election_type: string | null;
}

interface CommitteeRole {
  name: string;
  role: string;
  committee: string;
}

interface KeywordData {
  word: string;
  count: number;
}

const PARTY_URLS: Record<string, string> = {
  "自民党":         "https://www.jimin.jp/",
  "立憲民主党":     "https://cdp-japan.jp/",
  "中道改革連合":   "https://craj.jp/",
  "公明党":         "https://www.komei.or.jp/",
  "日本維新の会":   "https://o-ishin.jp/",
  "国民民主党":     "https://new-kokumin.jp/",
  "共産党":         "https://www.jcp.or.jp/",
  "れいわ新選組":   "https://reiwa-shinsengumi.com/",
  "社民党":         "https://sdp.or.jp/",
  "参政党":         "https://www.sanseito.jp/",
  "チームみらい":   "https://team-mir.ai/",
  "日本保守党":     "https://hoshuto.jp/",
  "有志の会":       "https://yushigroup.jp/",
};


async function fetchKeywordsBatched(memberIds: string[]): Promise<KeywordData[]> {
  const BATCH = 50;
  const wordMap: Record<string, number> = {};
  for (let i = 0; i < memberIds.length; i += BATCH) {
    const batch = memberIds.slice(i, i + BATCH);
    const res = await supabase
      .from("member_keywords")
      .select("word, count")
      .in("member_id", batch)
      .order("count", { ascending: false })
      .limit(1000);
    for (const k of res.data || []) {
      wordMap[k.word] = (wordMap[k.word] || 0) + k.count;
    }
  }
  return Object.entries(wordMap)
    .map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 50);
}

function PartyDetailContent() {
  const params  = useParams();
  const router  = useRouter();
  const party   = decodeURIComponent(params.party as string);
  const color   = PARTY_COLORS[party] || "#7f8c8d";
  const PARTY_TAB_LABELS: Record<string, string> = {
    members: "議員一覧", committees: "委員長・理事",
    wordcloud: "キーワード", breakdown: "内訳", distance: "政党距離感", ai: "AI分析",
  };

  const [members,        setMembers]        = useState<Member[]>([]);
  const [chairs,         setChairs]         = useState<CommitteeRole[]>([]);
  const [keywords,       setKeywords]       = useState<KeywordData[]>([]);
  const [partyQuestions,  setPartyQuestions]  = useState<{ title: string; submitted_at: string }[]>([]);
  const [partyBills,      setPartyBills]      = useState<{ title: string; submitted_at: string | null }[]>([]);
  const [alignments,          setAlignments]          = useState<{ party_a: string; party_b: string; alignment_rate: number; sample_size: number }[]>([]);
  const [coSubmissionRanking, setCoSubmissionRanking] = useState<{ party: string; count: number }[]>([]);
  const [partyBenchmarks, setPartyBenchmarks] = useState<Record<string, { count: number; billPer: number; questionPer: number; sessionPer: number }>>({});
  const [partyUniqueBills, setPartyUniqueBills] = useState<{ title: string; submitted_at: string | null }[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [kwLoading,       setKwLoading]       = useState(false);
  const [aiDataLoading,   setAiDataLoading]   = useState(false);
  const [radarGlobalMax, setRadarGlobalMax] = useState({ session: 1, question: 1, bill: 1, petition: 1, role: 1 });
  const [voteStats, setVoteStats] = useState<{ total: number; yes: number; no: number; absent: number } | null>(null);
  const searchParams = useSearchParams();
  const tab          = searchParams.get("tab") ?? "breakdown";
  useEffect(() => {
    const tabLabel = PARTY_TAB_LABELS[tab] ?? tab;
    document.title = `${party} — ${tabLabel} | はたらく議員`;
  }, [party, tab]);
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    router.replace(`${window.location.pathname}?${p.toString()}`);
  };
  const sortBy = searchParams.get("sort") ?? "session_count";
  const { page: membersPage, setPage: setMembersPage, clearPage } = usePagination();
  const setSortBy = (s: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("sort", s);
    router.replace(`${window.location.pathname}?${p.toString()}`);
    clearPage();
  };

  useEffect(() => {
    async function fetchAll() {
      const [membersRes, allMembersRes, committeeRes, alignmentsRes] = await Promise.all([
        supabase
          .from("members")
          .select("id, name, house, district, terms, speech_count, session_count, question_count, bill_count, petition_count, gender, election_type")
          .eq("party", party)
          .eq("is_active", true)
          .limit(2000),
        supabase
          .from("members")
          .select("id, party, session_count, question_count, bill_count, petition_count")
          .eq("is_active", true)
          .limit(2000),
        supabase
          .from("committee_members")
          .select("member_id, name, role, committee")
          .in("role", ["委員長", "理事", "会長", "副会長"]),
        supabase
          .from("party_vote_alignments")
          .select("party_a, party_b, alignment_rate, sample_size")
          .order("alignment_rate", { ascending: false }),
      ]);

      const memberIds   = (membersRes.data || []).map((m) => m.id);
      const memberIdSet = new Set(memberIds);

      // 全政党のレーダー用globalMax計算
      const allMembers  = allMembersRes.data || [];
      const allCommitteeRows = committeeRes.data || [];

      // 全メンバーのid→party マップ
      const idToParty: Record<string, string> = {};
      for (const m of allMembers) {
        if (m.party) idToParty[m.id] = m.party;
      }

      // 政党別に集計
      const partySums: Record<string, { session: number; question: number; bill: number; petition: number; role: number }> = {};
      for (const m of allMembers) {
        if (!m.party) continue;
        if (!partySums[m.party]) partySums[m.party] = { session: 0, question: 0, bill: 0, petition: 0, role: 0 };
        partySums[m.party].session  += m.session_count  ?? 0;
        partySums[m.party].question += m.question_count ?? 0;
        partySums[m.party].bill     += m.bill_count     ?? 0;
        partySums[m.party].petition += m.petition_count ?? 0;
      }
      for (const row of allCommitteeRows) {
        const p = idToParty[row.member_id];
        if (!p) continue;
        if (!partySums[p]) partySums[p] = { session: 0, question: 0, bill: 0, petition: 0, role: 0 };
        partySums[p].role += 1;
      }

      // 主要政党ベンチマーク（議員1人あたり）
      const BENCHMARK_PARTIES = ["自由民主党", "立憲民主党", "日本維新の会", "国民民主党", "公明党", "中道改革連合"];
      const partyMemberCounts: Record<string, number> = {};
      for (const m of allMembers) {
        if (!m.party) continue;
        partyMemberCounts[m.party] = (partyMemberCounts[m.party] || 0) + 1;
      }
      const benchmarks: Record<string, { count: number; billPer: number; questionPer: number; sessionPer: number }> = {};
      for (const p of BENCHMARK_PARTIES) {
        const s = partySums[p];
        const c = partyMemberCounts[p] || 0;
        if (s && c > 0) {
          benchmarks[p] = {
            count: c,
            billPer: Math.round((s.bill / c) * 10) / 10,
            questionPer: Math.round((s.question / c) * 10) / 10,
            sessionPer: Math.round((s.session / c) * 10) / 10,
          };
        }
      }
      setPartyBenchmarks(benchmarks);

      const gm = { session: 1, question: 1, bill: 1, petition: 1, role: 1 };
      for (const s of Object.values(partySums)) {
        if (s.session  > gm.session)  gm.session  = s.session;
        if (s.question > gm.question) gm.question = s.question;
        if (s.bill     > gm.bill)     gm.bill     = s.bill;
        if (s.petition > gm.petition) gm.petition = s.petition;
        if (s.role     > gm.role)     gm.role     = s.role;
      }
      setRadarGlobalMax(gm);

      setMembers(membersRes.data || []);
      setAlignments(alignmentsRes.data || []);  // 全ペア
      setChairs((committeeRes.data || [])
        .filter((c) => memberIdSet.has(c.member_id))
        .map((c) => ({
          name:      c.name,
          role:      c.role,
          committee: c.committee,
        })));
      // 採決集計（setLoading前に完了させてFVで遅延させない）
      const sangiinIds = (membersRes.data || [])
        .filter((m) => m.house === "参議院")
        .map((m) => m.id);
      if (sangiinIds.length > 0) {
        const BATCH = 50;
        let total = 0, yes = 0, no = 0, absent = 0;
        for (let i = 0; i < sangiinIds.length; i += BATCH) {
          const batch = sangiinIds.slice(i, i + BATCH);
          const [t, y, n, a] = await Promise.all([
            supabase.from("votes").select("id", { count: "exact", head: true }).in("member_id", batch),
            supabase.from("votes").select("id", { count: "exact", head: true }).in("member_id", batch).eq("vote", "賛成"),
            supabase.from("votes").select("id", { count: "exact", head: true }).in("member_id", batch).eq("vote", "反対"),
            supabase.from("votes").select("id", { count: "exact", head: true }).in("member_id", batch).eq("vote", "欠席"),
          ]);
          total  += t.count ?? 0;
          yes    += y.count ?? 0;
          no     += n.count ?? 0;
          absent += a.count ?? 0;
        }
        setVoteStats({ total, yes, no, absent });
      }

      setLoading(false);

      // キーワード・AI用データはタブ内なので遅延フェッチでOK
      if (memberIds.length > 0) {
        const shugiinIds = (membersRes.data || []).filter((m) => m.house === "衆議院").map((m) => m.id);

        setKwLoading(true);
        setAiDataLoading(true);
        const [kw, questionsRes, sangiinQuestionsRes, billsRes, allMembersForMap] = await Promise.all([
          fetchKeywordsBatched(memberIds),
          shugiinIds.length > 0
            ? supabase.from("questions").select("title, submitted_at")
                .in("member_id", shugiinIds)
                .order("submitted_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [] as { title: string; submitted_at: string }[] }),
          sangiinIds.length > 0
            ? supabase.from("sangiin_questions").select("title, submitted_at")
                .in("member_id", sangiinIds)
                .order("submitted_at", { ascending: false })
                .limit(100)
            : Promise.resolve({ data: [] as { title: string; submitted_at: string }[] }),
          supabase.from("bills").select("title, submitted_at, submitter_ids")
            .eq("bill_type", "議員立法")
            .order("submitted_at", { ascending: false, nullsFirst: false })
            .limit(2000),
          supabase.from("members").select("id, party").limit(5000),
        ]);
        setKeywords(kw);
        setKwLoading(false);

        const mergedQuestions = [
          ...(questionsRes.data || []),
          ...(sangiinQuestionsRes.data || []),
        ].sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || "")).slice(0, 50);
        setPartyQuestions(mergedQuestions);

        // 全議員（元議員含む）の id→party マップ
        const memberPartyMap: Record<string, string> = {};
        for (const m of allMembersForMap.data || []) {
          if (m.party) memberPartyMap[m.id] = m.party;
        }
        // 当該政党の全議員IDセット（元議員含む）
        const partyAllMemberIdSet = new Set(
          (allMembersForMap.data || []).filter((m) => m.party === party).map((m) => m.id)
        );

        const filteredBills = (billsRes.data || []).filter((b) =>
          (b.submitter_ids || []).some((id: string) => partyAllMemberIdSet.has(id))
        );
        setPartyBills(filteredBills);

        const coCount: Record<string, number> = {};
        for (const b of filteredBills) {
          for (const sid of (b.submitter_ids || []) as string[]) {
            if (partyAllMemberIdSet.has(sid)) continue;
            const p = memberPartyMap[sid];
            if (p) coCount[p] = (coCount[p] || 0) + 1;
          }
        }
        setCoSubmissionRanking(
          Object.entries(coCount)
            .map(([p, count]) => ({ party: p, count }))
            .sort((a, b) => b.count - a.count)
        );

        // 独自提出法案（全提出者が自党メンバーのみ）
        const uniqueBills = filteredBills.filter((b) =>
          (b.submitter_ids || []).every((sid: string) =>
            partyAllMemberIdSet.has(sid) || !memberPartyMap[sid]
          )
        );
        setPartyUniqueBills(uniqueBills);

        setAiDataLoading(false);
      }
    }
    fetchAll();
  }, [party]);

  const totalSpeeches  = members.reduce((s, m) => s + (m.speech_count   || 0), 0);
  const totalQuestions = members.reduce((s, m) => s + (m.question_count || 0), 0);
  const totalSessions  = members.reduce((s, m) => s + (m.session_count  || 0), 0);
  const totalBills     = members.reduce((s, m) => s + (m.bill_count     || 0), 0);
  const totalPetitions = members.reduce((s, m) => s + (m.petition_count || 0), 0);
  const totalRoles     = chairs.length;

  const sorted = [...members].sort((a, b) => {
    if (sortBy === "session_count")  return (b.session_count  || 0) - (a.session_count  || 0);
    if (sortBy === "question_count") return (b.question_count || 0) - (a.question_count || 0);
    if (sortBy === "bill_count")     return (b.bill_count     || 0) - (a.bill_count     || 0);
    if (sortBy === "petition_count") return (b.petition_count || 0) - (a.petition_count || 0);
    if (sortBy === "terms")          return (b.terms          || 0) - (a.terms          || 0);
    return a.name.localeCompare(b.name);
  });

  const chairList  = chairs.filter((c) => c.role === "委員長" || c.role === "会長");
  const execList   = chairs.filter((c) => c.role === "理事"   || c.role === "副会長");

  // 内訳集計
  const shugiin  = members.filter((m) => m.house === "衆議院").length;
  const sangiin  = members.filter((m) => m.house === "参議院").length;
  const shugiinMembers  = members.filter((m) => m.house === "衆議院");
  const sangiinMembers  = members.filter((m) => m.house === "参議院");
  const shugiinSenkyoku = shugiinMembers.filter((m) => m.election_type === "小選挙区").length;
  const shugiinHirei    = shugiinMembers.filter((m) => m.election_type === "比例").length;
  const sangiinSenkyoku = sangiinMembers.filter((m) => m.election_type === "選挙区").length;
  const sangiinHirei    = sangiinMembers.filter((m) => m.election_type === "比例").length;

  const termsBuckets = [
    { label: "初当選（1期）",  count: members.filter((m) => (m.terms || 0) === 1).length },
    { label: "2〜3期",         count: members.filter((m) => (m.terms || 0) >= 2 && (m.terms || 0) <= 3).length },
    { label: "4〜6期",         count: members.filter((m) => (m.terms || 0) >= 4 && (m.terms || 0) <= 6).length },
    { label: "7期以上",        count: members.filter((m) => (m.terms || 0) >= 7).length },
    { label: "不明",           count: members.filter((m) => !m.terms).length },
  ].filter((b) => b.count > 0);

  if (loading) return (
    <div className="loading-block" style={{ minHeight: "100vh" }}>
      <div className="loading-spinner" />
      <span>データを読み込んでいます...</span>
    </div>
  );

  const tabs = [
    { id: "members",    label: `👤 議員一覧 (${members.length})` },
    { id: "committees", label: `🏛 委員長・理事 (${chairList.length + execList.length})` },
    { id: "wordcloud",  label: "☁️ キーワード" },
    { id: "breakdown",  label: "📊 内訳" },
    { id: "distance",   label: "🔗 政党距離感" },
    { id: "ai",         label: "🤖 AI分析" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 960, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.push("/parties")} className="btn-back" style={{ marginBottom: 16 }}>
        ← 政党一覧に戻る
      </button>

      {/* ヘッダー */}
      <div className="card-xl" style={{ background: color, border: "none", padding: "20px 24px" }}>
        <div className="party-header" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#ffffff", flex: 1 }}>{party}</h1>
          {PARTY_URLS[party] && (
            <a href={PARTY_URLS[party]} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              style={{
                display: "inline-block",
                padding: "8px 16px",
                background: "rgba(255,255,255,0.2)",
                border: "1px solid rgba(255,255,255,0.6)",
                borderRadius: 8,
                color: "#ffffff",
                fontSize: 13,
                fontWeight: 600,
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}>
              公式サイト →
            </a>
          )}
        </div>
      </div>

      {/* 注記 */}
      <p style={{ fontSize: 12, color: "#555555", margin: "12px 4px", lineHeight: 1.7 }}>
        ※ 集計は現在の所属議員を基準としているため、議員の移籍・会派の合流があった場合、過去の活動実績も含めて数値が変動します。
        <a href="/faq#party-stats-note" style={{ color: "#555555", marginLeft: 4 }}>詳細 ↗</a>
      </p>

      {/* 活動バランス */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#333333", marginBottom: 2 }}>活動バランス</div>
        <div style={{ fontSize: 11, color: "#888888", marginBottom: 12, lineHeight: 1.6 }}>
          各活動の件数から活動の比重・傾向を図示しています。与党は内閣を通じて政策を実現するため、質問主意書・議員立法の件数は構造的に少なくなる傾向があります。数字の大小が活動の優劣を示すものではありません。
          <a href="/faq#activity-radar" style={{ color: "#888888", marginLeft: 4 }}>チャートの算出方法はこちら ↗</a>
        </div>
        <div className="activity-balance-body" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div className="activity-balance-radar" style={{ width: 350, flexShrink: 0 }}>
            <ActivityRadar
              axes={[
                { key: "session",  label: "発言",       value: totalSessions,  globalMax: radarGlobalMax.session  },
                { key: "role",     label: "委員会役職", value: totalRoles,     globalMax: radarGlobalMax.role     },
                { key: "bill",     label: "議員立法",   value: totalBills,     globalMax: radarGlobalMax.bill     },
                { key: "question", label: "質問主意書", value: totalQuestions, globalMax: radarGlobalMax.question },
                { key: "petition", label: "請願",       value: totalPetitions, globalMax: radarGlobalMax.petition },
              ]}
              color={color}
            />
          </div>
          <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, flex: 1 }}>
            {[
              { label: "発言セッション", value: totalSessions,  unit: "回" },
              { label: "質問主意書",     value: totalQuestions, unit: "件" },
              { label: "議員立法",       value: totalBills,     unit: "件" },
              { label: "請願",           value: totalPetitions, unit: "件" },
              { label: "委員会役職",     value: totalRoles,     unit: "件" },
              { label: "議員数",         value: members.length, unit: "名" },
            ].map((item) => (
              <div key={item.label} style={{ background: `${color}15`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#333333", marginBottom: 2 }}>
                  {item.value}
                  <span style={{ fontSize: 11, color: "#555555", marginLeft: 3 }}>{item.unit}</span>
                </div>
                <div style={{ fontSize: 10, color: "#888888" }}>{item.label}</div>
              </div>
            ))}
            {/* 集計期間注釈 */}
            <div style={{ gridColumn: "1 / -1", fontSize: 10, color: "#aaaaaa", lineHeight: 1.7 }}>
              ※ 集計期間：発言・議員立法 第210回〜（2022年〜） / 質問主意書・請願 第196回〜（2018年〜） / 委員会役職 現在のスナップショット
            </div>
            {/* 採決記録 — 3列フル */}
            <div style={{ gridColumn: "1 / -1", background: `${color}15`, borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#555555", marginBottom: 8, textAlign: "center" }}>本会議採決記録</div>
              <div style={{ display: "flex", justifyContent: "space-around", textAlign: "center" }}>
                {[
                  { label: "賛成率", value: voteStats && voteStats.total > 0 ? (voteStats.yes    / voteStats.total * 100).toFixed(1) : null, unit: "%" },
                  { label: "反対率", value: voteStats && voteStats.total > 0 ? (voteStats.no     / voteStats.total * 100).toFixed(1) : null, unit: "%" },
                  { label: "欠席率", value: voteStats && voteStats.total > 0 ? (voteStats.absent / voteStats.total * 100).toFixed(1) : null, unit: "%" },
                ].map((s) => (
                  <div key={s.label}>
                    <div style={{ fontSize: 20, fontWeight: 800, color: "#333333", marginBottom: 2 }}>
                      {s.value != null ? s.value : "–"}
                      {s.value != null && <span style={{ fontSize: 11, color: "#555555", marginLeft: 3 }}>{s.unit}</span>}
                    </div>
                    <div style={{ fontSize: 10, color: "#888888", whiteSpace: "nowrap" }}>{s.label}</div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 10, color: "#aaaaaa", marginTop: 8 }}>
                ※ 第208回〜第221回国会の記録に基づく（参議院のみ・集計は全件）。
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="tab-bar tab-bar-container" style={{ flexWrap: "wrap", background: `${color}15`, borderColor: `${color}30`, "--tab-hover-bg": `${color}35` } as React.CSSProperties}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-pill${tab === t.id ? " active" : ""}`}
            style={{
              flex: 1, minWidth: 120, padding: "10px 0",
              ...(tab === t.id ? { background: color, color: "#ffffff" } : {}),
            }}
            onMouseEnter={(e) => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = `${color}35`; }}
            onMouseLeave={(e) => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 議員一覧タブ */}
      {tab === "members" && (
        <div className="card" style={{ padding: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#888888" }}>{sorted.length}名</span>
            <Paginator total={sorted.length} page={membersPage} onPage={setMembersPage} variant="top" />
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { value: "session_count",  label: "発言順" },
              { value: "question_count", label: "質問主意書順" },
              { value: "bill_count",     label: "議員立法順" },
              { value: "petition_count", label: "請願順" },
              { value: "terms",          label: "当選回数順" },
              { value: "name",           label: "名前順" },
            ].map((s) => (
              <button key={s.value} onClick={() => setSortBy(s.value)}
                style={{ background: sortBy === s.value ? color + "33" : "#e0e0e0",
                  border: `1px solid ${sortBy === s.value ? color : "#c8c8c8"}`,
                  color: sortBy === s.value ? color : "#555555",
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sorted.slice((membersPage - 1) * PAGE_SIZE, membersPage * PAGE_SIZE).map((m) => (
              <div key={m.id}
                onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                className="card card-hover"
                style={{ padding: "12px 16px", "--hover-color": color } as React.CSSProperties}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                  <span style={{ fontWeight: 700, fontSize: 14, color: "#111111", minWidth: 80 }}>{m.name}</span>
                  <span style={{ fontSize: 12, color: "#555555" }}>{m.house} · {m.district}{m.terms ? ` · ${m.terms}期` : ""}</span>
                  <div className="member-row-stats" style={{ display: "flex", gap: 12, fontSize: 12, color: "#888888", marginLeft: "auto" }}>
                    <span>発言 {m.session_count  || 0}</span>
                    <span>質問 {m.question_count || 0}</span>
                    <span>立法 {m.bill_count     || 0}</span>
                    <span>請願 {m.petition_count || 0}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Paginator total={sorted.length} page={membersPage} onPage={setMembersPage} variant="bottom" />
        </div>
      )}

      {/* 委員長・理事タブ */}
      {tab === "committees" && (
        <div className="card" style={{ padding: 20 }}>
          {chairList.length > 0 && (
            <>
              <h3 className="section-title">
                🏆 委員長・会長 ({chairList.length}名)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
                {chairList.map((c, i) => (
                  <div key={i} className="member-row">
                    <span className="badge badge-role">
                      {c.role}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#111111" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#555555" }}>{c.committee}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {execList.length > 0 && (
            <>
              <h3 className="section-title">
                📋 理事・副会長 ({execList.length}名)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {execList.map((c, i) => (
                  <div key={i} className="member-row">
                    <span className="badge badge-role">
                      {c.role}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#111111" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#555555" }}>{c.committee}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {chairList.length === 0 && execList.length === 0 && (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              委員長・理事のデータがありません。
            </div>
          )}
        </div>
      )}

      {/* ワードクラウドタブ */}
      {tab === "wordcloud" && (
        <div className="card" style={{ padding: 24 }}>
          <h3 className="section-title">
            ☁️ {party} の発言キーワード
          </h3>
          {kwLoading ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>
              キーワードを集計中...
            </div>
          ) : (
            <>
              <WordCloud keywords={keywords} width={800} height={400} />
              <p style={{ textAlign: "center", fontSize: 11, color: "#888888", marginTop: 8 }}>
                <a href="/faq#wordcloud" style={{ color: "#888888" }}>集計方法はこちら ↗</a>
              </p>
            </>
          )}
        </div>
      )}

      {/* 内訳タブ */}
      {tab === "breakdown" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 衆参比率・当選方式 */}
          <div className="card" style={{ padding: 24 }}>
            <h3 className="section-title">🏠 衆議院 / 参議院</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>

              {/* 衆議院列 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: `${color}35`, borderRadius: 10, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#333333", marginBottom: 4 }}>
                    {shugiin}<span style={{ fontSize: 13, color: "#555555", marginLeft: 4 }}>名</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#555555" }}>衆議院</div>
                  <div style={{ fontSize: 11, color: "#888888", marginTop: 4 }}>
                    {members.length > 0 ? (shugiin / members.length * 100).toFixed(1) : "0.0"}%
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "小選挙区", count: shugiinSenkyoku },
                    { label: "比例",     count: shugiinHirei    },
                  ].map((b) => (
                    <div key={b.label} style={{ background: `${color}20`, borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#333333", marginBottom: 2 }}>
                        {b.count}<span style={{ fontSize: 12, color: "#555555", marginLeft: 3 }}>名</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#555555" }}>{b.label}</div>
                      <div style={{ fontSize: 11, color: "#888888", marginTop: 2 }}>
                        {shugiinMembers.length > 0 ? (b.count / shugiinMembers.length * 100).toFixed(1) : "0.0"}%
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: `${color}15` }}>
                  <div style={{ width: `${shugiinMembers.length > 0 ? shugiinSenkyoku / shugiinMembers.length * 100 : 0}%`, background: color, transition: "width 0.6s ease" }} />
                  <div style={{ flex: 1, background: `${color}55` }} />
                </div>
              </div>

              {/* 参議院列 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ background: `${color}35`, borderRadius: 10, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: "#333333", marginBottom: 4 }}>
                    {sangiin}<span style={{ fontSize: 13, color: "#555555", marginLeft: 4 }}>名</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#555555" }}>参議院</div>
                  <div style={{ fontSize: 11, color: "#888888", marginTop: 4 }}>
                    {members.length > 0 ? (sangiin / members.length * 100).toFixed(1) : "0.0"}%
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { label: "選挙区", count: sangiinSenkyoku },
                    { label: "比例",   count: sangiinHirei    },
                  ].map((b) => (
                    <div key={b.label} style={{ background: `${color}20`, borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color: "#333333", marginBottom: 2 }}>
                        {b.count}<span style={{ fontSize: 12, color: "#555555", marginLeft: 3 }}>名</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#555555" }}>{b.label}</div>
                      <div style={{ fontSize: 11, color: "#888888", marginTop: 2 }}>
                        {sangiinMembers.length > 0 ? (b.count / sangiinMembers.length * 100).toFixed(1) : "0.0"}%
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ height: 8, borderRadius: 4, overflow: "hidden", display: "flex", background: `${color}15` }}>
                  <div style={{ width: `${sangiinMembers.length > 0 ? sangiinSenkyoku / sangiinMembers.length * 100 : 0}%`, background: color, transition: "width 0.6s ease" }} />
                  <div style={{ flex: 1, background: `${color}55` }} />
                </div>
              </div>

            </div>
          </div>

          {/* 当選回数分布 */}
          <div className="card" style={{ padding: 24 }}>
            <h3 className="section-title">
              🗳 当選回数分布
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {termsBuckets.map((b) => {
                const pct = members.length > 0 ? b.count / members.length * 100 : 0;
                return (
                  <div key={b.label}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      fontSize: 12, color: "#888888", marginBottom: 4 }}>
                      <span>{b.label}</span>
                      <span style={{ color: color, fontWeight: 700 }}>{b.count}名（{pct.toFixed(1)}%）</span>
                    </div>
                    <div className="progress-bar" style={{ height: 8 }}>
                      <div className="progress-fill" style={{ width: `${pct}%`, background: color }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 政党距離感タブ */}
      {tab === "distance" && (() => {
        const PARTY_SHORT: Record<string, string> = {
          "自民党":       "自民", "立憲民主党":   "立憲", "中道改革連合": "中道",
          "公明党":       "公明", "日本維新の会": "維新", "国民民主党":   "国民",
          "共産党":       "共産", "れいわ新選組": "れいわ", "社民党":     "社民",
          "参政党":       "参政", "チームみらい": "みらい", "日本保守党": "保守",
          "有志の会":     "有志", "沖縄の風":     "沖縄",
        };

        const myAlignments = alignments
          .filter((a) => a.party_a === party || a.party_b === party)
          .sort((a, b) => b.alignment_rate - a.alignment_rate);

        const maxCoCount = coSubmissionRanking[0]?.count || 1;

        return (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

            {/* 採決一致率ランキング */}
            <div className="card" style={{ padding: 24 }}>
              <h3 className="section-title" style={{ marginBottom: 4 }}>採決一致率</h3>
              <p style={{ fontSize: 12, color: "#888888", marginBottom: 16, lineHeight: 1.7 }}>
                参議院本会議採決（第208回〜）で{party}と各政党が同じ多数決を取った割合。高いほど投票行動が近い。
              </p>
              {myAlignments.length === 0 ? (
                <div className="empty-state">データがありません。</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {myAlignments.map((a) => {
                    const other = a.party_a === party ? a.party_b : a.party_a;
                    const otherColor = PARTY_COLORS[other] || "#7f8c8d";
                    const pct = a.alignment_rate * 100;
                    return (
                      <div key={other}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: otherColor, flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{other}</span>
                          </span>
                          <span style={{ color: otherColor, fontWeight: 700 }}>
                            {pct.toFixed(1)}%
                            <span style={{ fontSize: 10, color: "#aaaaaa", fontWeight: 400, marginLeft: 4 }}>({a.sample_size}法案)</span>
                          </span>
                        </div>
                        <div className="progress-bar" style={{ height: 8 }}>
                          <div className="progress-fill" style={{ width: `${pct}%`, background: otherColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p style={{ fontSize: 11, color: "#aaaaaa", marginTop: 12 }}>
                ※ 採決データは党議拘束の影響を受けるため、政策的立場と完全には一致しません。
              </p>
            </div>

            {/* 共同提出ランキング */}
            <div className="card" style={{ padding: 24 }}>
              <h3 className="section-title" style={{ marginBottom: 4 }}>議員立法 共同提出パートナー</h3>
              <p style={{ fontSize: 12, color: "#888888", marginBottom: 16, lineHeight: 1.7 }}>
                {party}の議員が関わった議員立法に、他のどの政党の議員が共同提出者として名を連ねているか。
              </p>
              {coSubmissionRanking.length === 0 ? (
                <div className="empty-state">共同提出データがありません。</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {coSubmissionRanking.map((r) => {
                    const rColor = PARTY_COLORS[r.party] || "#7f8c8d";
                    return (
                      <div key={r.party}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
                          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                            <span style={{ width: 8, height: 8, borderRadius: "50%", background: rColor, flexShrink: 0 }} />
                            <span style={{ fontWeight: 600, color: "#1a1a1a" }}>{r.party}</span>
                          </span>
                          <span style={{ color: rColor, fontWeight: 700 }}>
                            {r.count}<span style={{ fontSize: 10, color: "#aaaaaa", fontWeight: 400, marginLeft: 2 }}>法案</span>
                          </span>
                        </div>
                        <div className="progress-bar" style={{ height: 8 }}>
                          <div className="progress-fill" style={{ width: `${r.count / maxCoCount * 100}%`, background: rColor }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <p style={{ fontSize: 11, color: "#aaaaaa", marginTop: 12 }}>
                ※ 第210回国会以降の議員立法が対象。
              </p>
            </div>
          </div>
        );
      })()}

      {/* AI分析タブ */}
      {tab === "ai" && (() => {
        const lines: string[] = [];
        lines.push(`政党名: ${party}`);
        lines.push(`所属議員数: ${members.length}名（衆議院${shugiin}名 / 参議院${sangiin}名）`);
        const statusEntry = getPartyStatus(party);
        if (statusEntry) {
          const fromYear = statusEntry.from.slice(0, 7);
          const period = statusEntry.to
            ? `${fromYear}〜${statusEntry.to.slice(0, 7)}`
            : `${fromYear}〜`;
          lines.push(`現在の立場: ${statusEntry.status}（${period}）`);
          if (statusEntry.note) {
            lines.push(`補足: ${statusEntry.note}`);
          }
        }
        lines.push("※ 集計は現在の所属議員を基準とし、第210回国会（2022年）以降の活動を対象とします。");
        lines.push("");
        {
          const termsWithData = members.filter((m) => m.terms != null);
          if (termsWithData.length > 0) {
            const dist: Record<string, number> = { "1回": 0, "2〜3回": 0, "4〜5回": 0, "6回以上": 0 };
            let sum = 0;
            for (const m of termsWithData) {
              const t = m.terms as number;
              sum += t;
              if (t <= 1) dist["1回"]++;
              else if (t <= 3) dist["2〜3回"]++;
              else if (t <= 5) dist["4〜5回"]++;
              else dist["6回以上"]++;
            }
            const avg = (sum / termsWithData.length).toFixed(1);
            const distStr = Object.entries(dist)
              .filter(([, c]) => c > 0)
              .map(([k, c]) => `${k}: ${c}名`)
              .join(" / ");
            lines.push("■ 当選回数分布（現役議員）");
            lines.push(`${distStr} / 平均: ${avg}回`);
            lines.push("");
          }
        }
        lines.push("■ 活動件数（累計）");
        lines.push(`発言セッション数: ${totalSessions}回`);
        lines.push(`質問主意書: ${totalQuestions}件`);
        lines.push(`議員立法: ${totalBills}件`);
        lines.push(`請願: ${totalPetitions}件`);
        lines.push(`委員会役職（委員長・理事）: ${totalRoles}件`);
        lines.push("");
        if (Object.keys(partyBenchmarks).length > 0) {
          const curCount = members.length || 1;
          lines.push("■ 主要政党との議員1人あたり活動比較（第210回国会以降・現役議員基準）");
          lines.push("政党 | 議員数 | 立法/人 | 質問/人 | 発言/人");
          const selfBill = totalBills / curCount;
          const selfQ    = totalQuestions / curCount;
          const selfSess = totalSessions / curCount;
          lines.push(`${party} | ${curCount}名 | ${(selfBill).toFixed(1)} | ${(selfQ).toFixed(1)} | ${(selfSess).toFixed(1)}`);
          for (const [p, b] of Object.entries(partyBenchmarks)) {
            if (p === party) continue;
            lines.push(`${p} | ${b.count}名 | ${b.billPer} | ${b.questionPer} | ${b.sessionPer}`);
          }
          lines.push("");
        }
        if (voteStats && voteStats.total > 0) {
          const yesRate   = (voteStats.yes    / voteStats.total * 100).toFixed(1);
          const noRate    = (voteStats.no     / voteStats.total * 100).toFixed(1);
          const absentRate = (voteStats.absent / voteStats.total * 100).toFixed(1);
          lines.push("■ 本会議採決記録（参議院・第208回〜第221回国会）");
          lines.push(`賛成率: ${yesRate}% / 反対率: ${noRate}% / 欠席率: ${absentRate}%`);
          lines.push("※ 採決データは党議拘束の影響を受けるため、個別議員の意思を完全には反映しません。");
          lines.push("");
        }
        const myAlignments = alignments
          .filter((a) => a.party_a === party || a.party_b === party)
          .sort((a, b) => b.alignment_rate - a.alignment_rate);
        if (myAlignments.length > 0) {
          lines.push("■ 主要政党との採決一致率（参議院・第208回〜）");
          for (const a of myAlignments) {
            const other = a.party_a === party ? a.party_b : a.party_a;
            lines.push(`${other}: ${(a.alignment_rate * 100).toFixed(1)}%（${a.sample_size}法案）`);
          }
          lines.push("");
        }
        if (partyQuestions.length > 0) {
          const year = (d: string) => d.slice(0, 4);
          lines.push(`■ 質問主意書タイトル（直近${partyQuestions.length}件 / 第196回国会以降）`);
          for (const q of partyQuestions) lines.push(`- ${q.title}（${year(q.submitted_at)}）`);
          lines.push("");
        }
        if (partyBills.length > 0) {
          const year = (d: string | null) => d ? d.slice(0, 4) : "年不明";
          lines.push(`■ 議員立法タイトル（${partyBills.length}件 / 第210回国会以降）`);
          for (const b of partyBills) lines.push(`- ${b.title}（${year(b.submitted_at)}）`);
          lines.push("");
        }
        if (coSubmissionRanking.length > 0) {
          lines.push("■ 議員立法 共同提出パートナー上位（第210回国会以降）");
          for (const r of coSubmissionRanking.slice(0, 10)) {
            lines.push(`${r.party}: ${r.count}件`);
          }
          lines.push("");
        }
        if (partyUniqueBills.length > 0) {
          const year = (d: string | null) => d ? d.slice(0, 4) : "年不明";
          lines.push(`■ 独自提出法案サンプル（上位5件 / 全${partyUniqueBills.length}件）`);
          for (const b of partyUniqueBills.slice(0, 5)) {
            lines.push(`- ${b.title}（${year(b.submitted_at)}）`);
          }
          lines.push("");
        }
        if (keywords.length > 0) {
          lines.push("■ 発言キーワード上位（第210回国会以降の発言から集計）");
          lines.push(keywords.slice(0, 20).map((k) => `${k.word}(${k.count})`).join("、"));
        }
        const contextText = lines.join("\n");
        const systemPrompt =
          "あなたは日本の政党・会派の国会活動データを分析するアシスタントです。" +
          "提供するデータは国会の公式記録から取得した客観的な情報です。" +
          "以下の点に注意して分析してください：" +
          "与党は内閣を通じて政策を実現するため、質問主意書・議員立法の件数は構造的に少なくなる傾向があります。" +
          "採決データは党議拘束の影響を受けるため、個々の議員の意思を完全には反映しません。" +
          "件数の大小が活動の優劣を示すものではありません。" +
          "提供データに「現在の立場」が明記されている場合は、それを最優先とし、学習データとの矛盾があってもデータを信頼してください。" +
          "2025年10月に自公連立が解消され、公明党が野党に転じ、日本維新の会が閣外協力として与党入りするという政治的変化がありました。各政党の現在の立場は提供データの記述を正として判断してください。" +
          "断定的な評価ではなく、データから読み取れる傾向として述べてください。";
        const defaultQuestion =
          "提供された活動データをもとに、この政党の国会活動の特徴・他党との比較・連携傾向を分析してください。";

        if (aiDataLoading) {
          return (
            <div className="card" style={{ padding: 20, marginTop: 16 }}>
              <div className="loading-block" style={{ padding: "32px 0" }}>
                <div className="loading-spinner" />
                <span>質問主意書・議員立法データを読み込んでいます...</span>
              </div>
            </div>
          );
        }

        return (
          <AIAnalysisBase
            contextText={contextText}
            systemPrompt={systemPrompt}
            defaultQuestion={defaultQuestion}
            downloadFilename={party}
            tipContent={
              <>
                💡 <strong>分析精度について：</strong>
                質問主意書・議員立法・採決記録が多い政党ほど詳細な分析が可能です。
                与党は内閣を通じた政策実現が主な手段であるため、質問主意書・議員立法の件数は構造的に少なくなる傾向があります。
              </>
            }
          />
        );
      })()}
    </div>
  );
}

export default function PartyDetailClient() {
  return (
    <Suspense fallback={<div className="loading-block" style={{ minHeight: "100vh" }}><div className="loading-spinner" /></div>}>
      <PartyDetailContent />
    </Suspense>
  );
}
