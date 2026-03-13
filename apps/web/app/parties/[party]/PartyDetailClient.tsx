"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import WordCloud from "../../components/WordCloud";
import ActivityRadar from "../../components/ActivityRadar";
import { PARTY_COLORS } from "../../../lib/partyColors";

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
  useEffect(() => { document.title = `${party} | はたらく議員`; }, [party]);

  const [members,    setMembers]    = useState<Member[]>([]);
  const [chairs,     setChairs]     = useState<CommitteeRole[]>([]);
  const [keywords,   setKeywords]   = useState<KeywordData[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [kwLoading,  setKwLoading]  = useState(false);
  const [radarGlobalMax, setRadarGlobalMax] = useState({ session: 1, question: 1, bill: 1, petition: 1, role: 1 });
  const searchParams = useSearchParams();
  const pathname     = usePathname();
  const tab          = searchParams.get("tab") ?? "members";
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    router.replace(`${pathname}?${p.toString()}`);
  };
  const sortBy = searchParams.get("sort") ?? "session_count";
  const setSortBy = (s: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("sort", s);
    router.replace(`${pathname}?${p.toString()}`);
  };

  useEffect(() => {
    async function fetchAll() {
      const [membersRes, allMembersRes, committeeRes] = await Promise.all([
        supabase
          .from("members")
          .select("id, name, house, district, terms, speech_count, session_count, question_count, bill_count, petition_count, gender")
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
      setChairs((committeeRes.data || [])
        .filter((c) => memberIdSet.has(c.member_id))
        .map((c) => ({
          name:      c.name,
          role:      c.role,
          committee: c.committee,
        })));
      setLoading(false);

      // キーワードはバッチフェッチ（遅延）
      if (memberIds.length > 0) {
        setKwLoading(true);
        const kw = await fetchKeywordsBatched(memberIds);
        setKeywords(kw);
        setKwLoading(false);
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
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.push("/parties")} className="btn-back" style={{ marginBottom: 16 }}>
        ← 政党一覧に戻る
      </button>

      {/* ヘッダー */}
      <div className="card-xl" style={{ border: `1px solid ${color}44` }}>
        <div className="party-header" style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: color }} />
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#111111", flex: 1 }}>{party}</h1>
          {PARTY_URLS[party] && (
            <a href={PARTY_URLS[party]} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="party-header-link party-official-link"
              style={{ "--party-color": color } as React.CSSProperties}>
              公式サイト →
            </a>
          )}
        </div>

      </div>

      {/* 活動バランス */}
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
              <div key={item.label} style={{ background: "#f8f8f8", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#333333", marginBottom: 2 }}>
                  {item.value}
                  <span style={{ fontSize: 11, color: "#555555", marginLeft: 3 }}>{item.unit}</span>
                </div>
                <div style={{ fontSize: 10, color: "#888888" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* タブ */}
      <div className="tab-bar tab-bar-container" style={{ flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-pill${tab === t.id ? " active" : ""}`}
            style={{ flex: 1, minWidth: 120, padding: "10px 0" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 議員一覧タブ */}
      {tab === "members" && (
        <div className="card" style={{ padding: 20 }}>
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

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sorted.map((m) => (
              <div key={m.id}
                onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                className="member-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#111111" }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#555555" }}>{m.house} · {m.district}{m.terms ? ` · ${m.terms}期` : ""}</div>
                </div>
                <div className="member-row-stats" style={{ display: "flex", gap: 12, fontSize: 12, color: "#555555" }}>
                  <span>発言 {m.session_count  || 0}</span>
                  <span>質問 {m.question_count || 0}</span>
                  <span>立法 {m.bill_count     || 0}</span>
                  <span>請願 {m.petition_count || 0}</span>
                </div>
              </div>
            ))}
          </div>
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

          {/* 衆参比率 */}
          <div className="card" style={{ padding: 24 }}>
            <h3 className="section-title">
              🏠 衆議院 / 参議院
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "衆議院", count: shugiin, bg: "#888888" },
                { label: "参議院", count: sangiin, bg: "#333333" },
              ].map((h) => (
                <div key={h.label} style={{ background: "#e0e0e0", borderRadius: 10, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: h.bg, marginBottom: 4 }}>
                    {h.count}
                    <span style={{ fontSize: 13, color: "#555555", marginLeft: 4 }}>名</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#555555" }}>{h.label}</div>
                  <div style={{ fontSize: 11, color: "#888888", marginTop: 4 }}>
                    {members.length > 0 ? Math.round(h.count / members.length * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
            {/* バー */}
            <div style={{ height: 10, borderRadius: 5, overflow: "hidden",
              display: "flex", background: "#e0e0e0" }}>
              <div style={{ width: `${members.length > 0 ? shugiin / members.length * 100 : 0}%`,
                background: "#888888", transition: "width 0.6s ease" }} />
              <div style={{ flex: 1, background: "#333333" }} />
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
                      <span style={{ color: color, fontWeight: 700 }}>{b.count}名（{Math.round(pct)}%）</span>
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
