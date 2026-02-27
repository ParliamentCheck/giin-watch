"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Member {
  id: string;
  name: string;
  party: string;
  house: string;
  district: string;
  terms: number | null;
    is_active: boolean;
  speech_count: number | null;
  session_count: number | null;
  question_count: number | null;
}

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

const RULING_PARTIES = ["自民党", "日本維新の会"];

type CareerFilter = "" | "1" | "2-3" | "4-5" | "6+";
type StatusFilter = "active" | "shu" | "san" | "former";
type SideFilter = "" | "ruling" | "opposition";

export default function RankingPage() {
  const router = useRouter();
  const [members,        setMembers]        = useState<Member[]>([]);
  const [committeeMap,   setCommitteeMap]   = useState<Record<string, string[]>>({});
  const [loading,        setLoading]        = useState(true);
  const [rankType,       setRankType]       = useState("session");
  const [selectedParty,  setSelectedParty]  = useState("");
  const [selectedSide,   setSelectedSide]   = useState<SideFilter>("");
  const [selectedCareer, setSelectedCareer] = useState<CareerFilter>("");
  const [selectedStatus, setSelectedStatus] = useState<StatusFilter>("active");
  const [sortOrder, setSortOrder] = useState<"name"|"desc"|"asc">("name");
  const [sessionRange, setSessionRange] = useState("");

  useEffect(() => {
    async function fetchAll() {
      const [membersRes, committeeRes] = await Promise.all([
        supabase.from("members")
          .select("id, name, party, house, district, terms, is_active, speech_count, session_count, question_count"),
        supabase.from("committee_members")
          .select("member_id, role")
          .in("role", ["委員長", "理事", "会長", "副会長"]),
      ]);

      const cMap: Record<string, string[]> = {};
      for (const c of (committeeRes.data || [])) {
        if (!c.member_id) continue;
        if (!cMap[c.member_id]) cMap[c.member_id] = [];
        cMap[c.member_id].push(c.role);
      }

      // 国会回次の範囲を取得
      const sessionRes = await supabase
        .from("speeches")
        .select("session_number")
        .not("session_number", "is", null);
      const sessions = (sessionRes.data || []).map((s: any) => s.session_number).filter(Boolean);
      const uniqueSessions = [...new Set(sessions)] as number[];
      if (uniqueSessions.length > 0) {
        const min = Math.min(...uniqueSessions);
        const max = Math.max(...uniqueSessions);
        setSessionRange(min === max ? `第${min}回国会` : `第${min}〜${max}回国会`);
      }

      setMembers(membersRes.data || []);
      setCommitteeMap(cMap);
      setLoading(false);
    }
    fetchAll();
  }, []);

  const parties = Array.from(new Set(members.map((m) => m.party))).sort();

  const filtered = members.filter((m) => {
    if (selectedStatus === "active" && !m.is_active) return false;
    if (selectedStatus === "shu" && (m.house !== "衆議院" || !m.is_active)) return false;
    if (selectedStatus === "san" && (m.house !== "参議院" || !m.is_active)) return false;
    if (selectedStatus === "former" && m.is_active) return false;
    if (selectedParty && m.party !== selectedParty) return false;
    if (selectedSide === "ruling" && !RULING_PARTIES.includes(m.party)) return false;
    if (selectedSide === "opposition" && RULING_PARTIES.includes(m.party)) return false;
    if (selectedCareer) {
      const t = m.terms ?? 0;
      if (selectedCareer === "1" && t !== 1) return false;
      if (selectedCareer === "2-3" && (t < 2 || t > 3)) return false;
      if (selectedCareer === "4-5" && (t < 4 || t > 5)) return false;
      if (selectedCareer === "6+" && t < 6) return false;
    }
    return true;
  });

  function getValue(m: Member): number {
    const roles = committeeMap[m.id] || [];
    if (rankType === "session")        return m.session_count  ?? 0;
    if (rankType === "question")       return m.question_count ?? 0;
    if (rankType === "committee_role") return roles.length;
    return 0;
  }

  const sorted = [...filtered]
    .filter((m) => sortOrder === "name" ? true : getValue(m) > 0)
    .sort((a, b) => {
      if (sortOrder === "name") return (a.name || "").localeCompare(b.name || "", "ja");
      if (sortOrder === "asc") return getValue(a) - getValue(b);
      return getValue(b) - getValue(a);
    });
  const maxValue = sorted.length > 0 ? getValue(sorted[0]) : 1;

  const RANK_CONFIGS: Record<string, { label: string; unit: string; desc: string }> = {
    session:        { label: "💬 発言セッション数",   unit: "回",     desc: "同日・同委員会の発言を1セッションとして集計" },
    question:       { label: "📝 質問主意書提出数",   unit: "件",     desc: "内閣への質問主意書提出件数（衆議院のみ）" },
    committee_role: { label: "🏛 委員長・理事ポスト", unit: "ポスト", desc: "現在保有している委員長・理事・会長・副会長の数" },
  };

  const hasFilter = selectedParty || selectedSide || selectedCareer || selectedStatus !== "active";

  const selectStyle = {
    background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0",
    padding: "10px 14px", borderRadius: 10, fontSize: 13, outline: "none",
  };

  const toggleStyle = (active: boolean) => ({
    background: active ? "#1e293b" : "transparent",
    border: "1px solid " + (active ? "#3b82f6" : "#334155"),
    color: active ? "#e2e8f0" : "#64748b",
    padding: "8px 14px", borderRadius: 8, cursor: "pointer" as const,
    fontSize: 13, fontWeight: active ? 700 : 400,
    transition: "all 0.15s",
  });

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <button onClick={() => router.push("/")}
          style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8",
            padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24, fontSize: 14 }}>
          ← トップに戻る
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>📊 議員活動データ</h1>
        <p style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>
          {sessionRange || "国会"}のデータに基づく
        </p>

        {/* ランク種別タブ */}
        <div className="resp-scroll" style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0f172a",
          border: "1px solid #1e293b", borderRadius: 12, padding: 4 }}>
          {Object.entries(RANK_CONFIGS).map(([key, cfg]) => (
            <button key={key} onClick={() => setRankType(key)}
              style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none",
                background: rankType === key ? "#3b82f6" : "transparent",
                color: rankType === key ? "white" : "#64748b", cursor: "pointer",
                fontWeight: rankType === key ? 700 : 400, fontSize: 13, transition: "all 0.2s" }}>
              {cfg.label}
            </button>
          ))}
        </div>

        <p style={{ color: "#475569", marginBottom: 16, fontSize: 12 }}>
          {RANK_CONFIGS[rankType].desc}
        </p>

        {/* フィルター */}
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12,
          padding: 16, marginBottom: 20 }}>
          <div className="resp-stack" style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
            <select value={selectedStatus} onChange={(e) => setSelectedStatus(e.target.value as StatusFilter)} style={selectStyle}>
              <option value="active">🏛 現職すべて</option>
              <option value="shu">衆議院</option>
              <option value="san">参議院</option>
              <option value="former">前議員</option>
            </select>
            <select value={selectedCareer} onChange={(e) => setSelectedCareer(e.target.value as CareerFilter)} style={selectStyle}>
              <option value="">👤 当選回数</option>
              <option value="1">1回（新人）</option>
              <option value="2-3">2〜3回（若手）</option>
              <option value="4-5">4〜5回（中堅）</option>
              <option value="6+">6回以上（ベテラン）</option>
            </select>
            <select value={selectedParty} onChange={(e) => setSelectedParty(e.target.value)} style={selectStyle}>
              <option value="">🗳 政党を選択</option>
              {parties.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
            <div className="resp-scroll" style={{ display: "flex", gap: 4 }}>
              {([["", "すべて"], ["ruling", "与党"], ["opposition", "野党"]] as [SideFilter, string][]).map(([val, label]) => (
                <button key={val} onClick={() => setSelectedSide(val)} style={toggleStyle(selectedSide === val)}>
                  {label}
                </button>
              ))}
            </div>
            {hasFilter && (
              <button onClick={() => {
                setSelectedParty(""); setSelectedSide("");
                setSelectedCareer(""); setSelectedStatus("active");
              }}
                style={{ background: "#334155", border: "none", color: "#94a3b8",
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 13 }}>
                🔄 リセット
              </button>
            )}
          </div>
        </div>

        <p style={{ color: "#475569", marginBottom: 16, fontSize: 13 }}>
          {sorted.length}名表示中
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>データ読み込み中...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sorted.map((m, i) => {
              const color      = PARTY_COLORS[m.party] || "#7f8c8d";
              const value      = getValue(m);
              const barWidth   = (value / maxValue) * 100;
              const rank       = i + 1;
              const roles      = committeeMap[m.id] || [];
              const chairCount = roles.filter((r) => r === "委員長" || r === "会長").length;
              const execCount  = roles.filter((r) => r === "理事"   || r === "副会長").length;

              return (
                <div key={m.id}
                  onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                  style={{ background: "#0f172a", border: "1px solid #1e293b",
                    borderRadius: 12, padding: "16px 20px", cursor: "pointer", transition: "all 0.2s",
                    opacity: m.is_active ? 1 : 0.7 }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; }}>

                  <div className="resp-stack resp-gap-sm" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
                    <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: rank <= 3 ? color + "33" : "#1e293b",
                      border: `2px solid ${rank <= 3 ? color : "#334155"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: rank <= 3 ? 16 : 13, fontWeight: 800,
                      color: rank <= 3 ? color : "#64748b" }}>
                      {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>
                          {m.name}
                        </span>
                        {!m.is_active && (
                          <span style={{ background: "#475569", color: "#94a3b8",
                            padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>
                            前職
                          </span>
                        )}

                        {(m.terms ?? 0) > 0 && (
                          <span style={{ color: "#475569", fontSize: 11 }}>{m.terms ?? 0}期</span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {m.house} · {m.district}
                      </div>
                    </div>

                    <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {m.party}
                    </span>

                    {rankType === "session" && (
                      <div style={{ fontSize: 11, color: "#64748b", flexShrink: 0, textAlign: "right" }}>
                        質問主意書 {m.question_count ?? 0}件
                      </div>
                    )}
                    {rankType === "committee_role" && roles.length > 0 && (
                      <div style={{ fontSize: 11, color: "#64748b", flexShrink: 0, textAlign: "right" }}>
                        委員長{chairCount} 理事{execCount}
                      </div>
                    )}

                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 70 }}>
                      <span style={{ fontSize: 22, fontWeight: 800, color: "#f1f5f9" }}>{value}</span>
                      <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>
                        {RANK_CONFIGS[rankType].unit}
                      </span>
                    </div>
                  </div>

                  <div style={{ background: "#1e293b", borderRadius: 4, height: 4, overflow: "hidden" }}>
                    <div style={{ width: `${barWidth}%`, height: "100%",
                      background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 32, padding: 16, background: "#0f172a",
          border: "1px solid #1e293b", borderRadius: 12, fontSize: 12, color: "#475569" }}>
          ※ 発言セッション数は同日・同委員会での発言をまとめて1セッションとして集計しています。
          国立国会図書館の会議録登録には1〜2週間のタイムラグがあります。
          質問主意書は衆議院のみ収集済みです。
        </div>
      </div>
    </div>
  );
}
