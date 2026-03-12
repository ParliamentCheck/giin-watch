"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import WordCloud from "../../components/WordCloud";

interface Member {
  id: string;
  name: string;
  house: string;
  district: string;
  terms: number | null;
  speech_count: number | null;
  question_count: number | null;
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

const PARTY_COLORS: Record<string, string> = {
  "自民党":         "#c0392b",
  "立憲民主党":     "#2980b9",
  "中道改革連合":   "#3498db",
  "公明党":         "#8e44ad",
  "日本維新の会":   "#318e2c",
  "国民民主党":     "#fabe00",
  "共産党":         "#e74c3c",
  "れいわ新選組":   "#e4007f",
  "社民党":         "#795548",
  "参政党":         "#ff6d00",
  "チームみらい":   "#00bcd4",
  "日本保守党":     "#607d8b",
  "沖縄の風":       "#009688",
  "有志の会":       "#9c27b0",
  "無所属":         "#7f8c8d",
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

export default function PartyDetailPage() {
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
  const [tab,        setTab]        = useState("members");
  const [sortBy,     setSortBy]     = useState("speech_count");

  useEffect(() => {
    async function fetchAll() {
      const membersRes = await supabase
        .from("members")
        .select("id, name, house, district, terms, speech_count, question_count, gender")
        .eq("party", party)
        .eq("is_active", true).limit(2000);

      const memberIds = (membersRes.data || []).map((m) => m.id);

      const committeeRes = memberIds.length > 0
        ? await supabase
            .from("committee_members")
            .select("member_id, name, role, committee")
            .in("role", ["委員長", "理事", "会長", "副会長"])
        : { data: [] };

      const memberIdSet = new Set(memberIds);
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

  const sorted = [...members].sort((a, b) => {
    if (sortBy === "speech_count")   return (b.speech_count   || 0) - (a.speech_count   || 0);
    if (sortBy === "question_count") return (b.question_count || 0) - (a.question_count || 0);
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
    <div style={{ minHeight: "100vh", background: "#030d0d", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#4d7878" }}>
      データ読み込み中...
    </div>
  );

  const tabs = [
    { id: "members",    label: `👤 議員一覧 (${members.length})` },
    { id: "committees", label: `🏛 委員長・理事 (${chairList.length + execList.length})` },
    { id: "wordcloud",  label: "☁️ ワードクラウド" },
    { id: "breakdown",  label: "📊 内訳" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#030d0d", color: "#dff0f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.push("/parties")}
        style={{ background: "transparent", border: "1px solid #163838", color: "#7ab8b8",
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24, fontSize: 14 }}>
        ← 政党一覧に戻る
      </button>

      {/* ヘッダー */}
      <div style={{ background: "#071a1a", border: `1px solid ${color}44`,
        borderRadius: 16, padding: 28, marginBottom: 20 }}>
        <div className="party-header" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: color }} />
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#edfafa", flex: 1 }}>{party}</h1>
          {PARTY_URLS[party] && (
            <a href={PARTY_URLS[party]} target="_blank" rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="party-header-link"
              style={{ fontSize: 12, color: "#4d7878", border: "1px solid #163838",
                padding: "4px 10px", borderRadius: 6, textDecoration: "none",
                flexShrink: 0, transition: "color 0.2s, border-color 0.2s" }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = color;
                (e.currentTarget as HTMLAnchorElement).style.borderColor = color;
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLAnchorElement).style.color = "#4d7878";
                (e.currentTarget as HTMLAnchorElement).style.borderColor = "#163838";
              }}>
              公式サイト →
            </a>
          )}
        </div>

        <div className="party-stats-grid">
          {[
            { label: "発言数合計",     value: totalSpeeches.toLocaleString(), unit: "件" },
            { label: "質問主意書合計", value: totalQuestions,                 unit: "件" },
            { label: "議員数",         value: members.length,                 unit: "名" },
          ].map((item) => (
            <div key={item.label} style={{ background: "#0d2828", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>
                {item.value}
                <span style={{ fontSize: 12, color: "#4d7878", marginLeft: 4 }}>{item.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: "#4d7878" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#071a1a",
        border: "1px solid #0d2828", borderRadius: 12, padding: 4, flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, minWidth: 120, padding: "10px 0", borderRadius: 9, border: "none",
              background: tab === t.id ? color : "transparent",
              color: tab === t.id ? "white" : "#4d7878", cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 400, fontSize: 12, transition: "all 0.2s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 議員一覧タブ */}
      {tab === "members" && (
        <div style={{ background: "#071a1a", border: "1px solid #0d2828", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              { value: "speech_count",   label: "発言数順" },
              { value: "question_count", label: "質問主意書順" },
              { value: "name",           label: "名前順" },
            ].map((s) => (
              <button key={s.value} onClick={() => setSortBy(s.value)}
                style={{ background: sortBy === s.value ? color + "33" : "#0d2828",
                  border: `1px solid ${sortBy === s.value ? color : "#163838"}`,
                  color: sortBy === s.value ? color : "#4d7878",
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                {s.label}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sorted.map((m) => (
              <div key={m.id}
                onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                style={{ display: "flex", alignItems: "center", gap: 12,
                  padding: "12px 16px", borderRadius: 10, cursor: "pointer",
                  background: "#0d2828", transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#263548"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#0d2828"; }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#edfafa" }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#4d7878" }}>{m.house} · {m.district}</div>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#4d7878" }}>
                  <span>💬 {m.speech_count   || 0}件</span>
                  <span>📝 {m.question_count || 0}件</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 委員長・理事タブ */}
      {tab === "committees" && (
        <div style={{ background: "#071a1a", border: "1px solid #0d2828", borderRadius: 12, padding: 20 }}>
          {chairList.length > 0 && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, color: "#f59e0b",
                textTransform: "uppercase", letterSpacing: 1 }}>
                🏆 委員長・会長 ({chairList.length}名)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
                {chairList.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 10, background: "#0d2828" }}>
                    <span style={{ background: "#f59e0b22", color: "#f59e0b",
                      border: "1px solid #f59e0b44", padding: "2px 8px",
                      borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {c.role}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#edfafa" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#4d7878" }}>{c.committee}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {execList.length > 0 && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, color: "#0d9488",
                textTransform: "uppercase", letterSpacing: 1 }}>
                📋 理事・副会長 ({execList.length}名)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {execList.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 10, background: "#0d2828" }}>
                    <span style={{ background: "#0d948822", color: "#0d9488",
                      border: "1px solid #0d948844", padding: "2px 8px",
                      borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {c.role}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#edfafa" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#4d7878" }}>{c.committee}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {chairList.length === 0 && execList.length === 0 && (
            <div style={{ color: "#264848", fontSize: 13, padding: "20px 0" }}>
              委員長・理事のデータがありません。
            </div>
          )}
        </div>
      )}

      {/* ワードクラウドタブ */}
      {tab === "wordcloud" && (
        <div style={{ background: "#071a1a", border: "1px solid #0d2828", borderRadius: 12, padding: 24 }}>
          <h3 style={{ margin: "0 0 20px", fontSize: 13, color: "#7ab8b8",
            textTransform: "uppercase", letterSpacing: 1 }}>
            ☁️ {party} の発言キーワード
          </h3>
          {kwLoading ? (
            <div style={{ textAlign: "center", padding: "60px 0", color: "#4d7878" }}>
              キーワードを集計中...
            </div>
          ) : (
            <WordCloud keywords={keywords} width={800} height={400} />
          )}
        </div>
      )}

      {/* 内訳タブ */}
      {tab === "breakdown" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>

          {/* 衆参比率 */}
          <div style={{ background: "#071a1a", border: "1px solid #0d2828", borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 13, color: "#7ab8b8",
              textTransform: "uppercase", letterSpacing: 1 }}>
              🏠 衆議院 / 参議院
            </h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
              {[
                { label: "衆議院", count: shugiin, bg: "#0891b2" },
                { label: "参議院", count: sangiin, bg: "#0d9488" },
              ].map((h) => (
                <div key={h.label} style={{ background: "#0d2828", borderRadius: 10, padding: 16, textAlign: "center" }}>
                  <div style={{ fontSize: 28, fontWeight: 800, color: h.bg, marginBottom: 4 }}>
                    {h.count}
                    <span style={{ fontSize: 13, color: "#4d7878", marginLeft: 4 }}>名</span>
                  </div>
                  <div style={{ fontSize: 12, color: "#4d7878" }}>{h.label}</div>
                  <div style={{ fontSize: 11, color: "#264848", marginTop: 4 }}>
                    {members.length > 0 ? Math.round(h.count / members.length * 100) : 0}%
                  </div>
                </div>
              ))}
            </div>
            {/* バー */}
            <div style={{ height: 10, borderRadius: 5, overflow: "hidden",
              display: "flex", background: "#0d2828" }}>
              <div style={{ width: `${members.length > 0 ? shugiin / members.length * 100 : 0}%`,
                background: "#0891b2", transition: "width 0.6s ease" }} />
              <div style={{ flex: 1, background: "#0d9488" }} />
            </div>
          </div>

          {/* 当選回数分布 */}
          <div style={{ background: "#071a1a", border: "1px solid #0d2828", borderRadius: 12, padding: 24 }}>
            <h3 style={{ margin: "0 0 20px", fontSize: 13, color: "#7ab8b8",
              textTransform: "uppercase", letterSpacing: 1 }}>
              🗳 当選回数分布
            </h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {termsBuckets.map((b) => {
                const pct = members.length > 0 ? b.count / members.length * 100 : 0;
                return (
                  <div key={b.label}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      fontSize: 12, color: "#7ab8b8", marginBottom: 4 }}>
                      <span>{b.label}</span>
                      <span style={{ color: color, fontWeight: 700 }}>{b.count}名（{Math.round(pct)}%）</span>
                    </div>
                    <div style={{ height: 8, background: "#0d2828", borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ width: `${pct}%`, height: "100%",
                        background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
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
