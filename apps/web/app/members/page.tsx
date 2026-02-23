"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Member {
  id: string;
  name: string;
  party: string;
  faction: string | null;
  house: string;
  district: string;
  prefecture: string;
  terms: number | null;
  is_active: boolean;
}

const PARTY_COLORS: Record<string, string> = {
  "自民党":         "#c0392b",
  "立憲民主党":     "#2980b9",
  "中道改革連合":   "#3498db",
  "公明党":         "#8e44ad",
  "日本維新の会":   "#e67e22",
  "国民民主党":     "#27ae60",
  "共産党":         "#e74c3c",
  "れいわ新選組":   "#e91e63",
  "社民党":         "#795548",
  "参政党":         "#ff6d00",
  "チームみらい":   "#00bcd4",
  "日本保守党":     "#607d8b",
  "沖縄の風":       "#009688",
  "有志の会":       "#9c27b0",
  "無所属":         "#7f8c8d",
};

export default function MembersPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedHouse, setSelectedHouse] = useState("");
  const [selectedParty, setSelectedParty] = useState("");

  useEffect(() => {
    async function fetchMembers() {
      const { data, error } = await supabase
        .from("members")
        .select("*")
        .eq("is_active", true)
        .order("name");

      if (error) {
        console.error(error);
      } else {
        setMembers(data || []);
      }
      setLoading(false);
    }
    fetchMembers();
  }, []);

  const parties = Array.from(new Set(members.map((m) => m.party))).sort();

  const filtered = members.filter((m) => {
    if (search && !m.name.includes(search) && !m.district.includes(search)) return false;
    if (selectedHouse && m.house !== selectedHouse) return false;
    if (selectedParty && m.party !== selectedParty) return false;
    return true;
  });

  const showFaction = (m: Member) => {
    if (!m.faction) return false;
    if (m.faction === m.party) return false;
    if (m.faction === "無所属" && m.party === "無所属") return false;
    return true;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>
        🔍 議員ウォッチ
      </h1>
      <p style={{ color: "#64748b", marginBottom: 24 }}>
        現在 {members.length}名の議員データを収録
      </p>

      {/* 検索・フィルター */}
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="議員名・選挙区で検索"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, background: "#1e293b", border: "1px solid #334155",
            color: "#e2e8f0", padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}
        />
        <select value={selectedHouse} onChange={(e) => setSelectedHouse(e.target.value)}
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0",
            padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}>
          <option value="">🏛 衆院・参院</option>
          <option value="衆議院">衆議院</option>
          <option value="参議院">参議院</option>
        </select>
        <select value={selectedParty} onChange={(e) => setSelectedParty(e.target.value)}
          style={{ background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0",
            padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}>
          <option value="">🗳 政党を選択</option>
          {parties.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        {(search || selectedHouse || selectedParty) && (
          <button onClick={() => { setSearch(""); setSelectedHouse(""); setSelectedParty(""); }}
            style={{ background: "#334155", border: "none", color: "#94a3b8",
              padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
            クリア
          </button>
        )}
      </div>

      <p style={{ color: "#475569", marginBottom: 16, fontSize: 14 }}>
        {filtered.length}名表示中
      </p>

      {/* 議員一覧 */}
      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
          データ読み込み中...
        </div>
      ) : (
        <div style={{ display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
          {filtered.map((m) => {
            const color = PARTY_COLORS[m.party] || "#7f8c8d";
            return (
              <div key={m.id}
                onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                style={{ background: "#0f172a", border: "1px solid #1e293b",
                  borderRadius: 12, padding: 18, transition: "all 0.2s", cursor: "pointer" }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; }}>

                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                  <div style={{ width: 40, height: 40, borderRadius: "50%", flexShrink: 0,
                    background: "#1e293b", border: `2px solid ${color}`,
                    display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                    👤
                  </div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9" }}>{m.name}</div>
                    <div style={{ fontSize: 12, color: "#64748b" }}>{m.district} · {m.house}</div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                  <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700 }}>
                    🗳 {m.party}
                  </span>
                  {m.terms && (
                    <span style={{ background: "#1e293b", color: "#64748b",
                      padding: "2px 8px", borderRadius: 4, fontSize: 11 }}>
                      {m.terms}期
                    </span>
                  )}
                </div>

                {showFaction(m) && (
                  <div style={{ marginTop: 6 }}>
                    <span style={{ background: "#1e293b", color: "#94a3b8",
                      border: "1px solid #334155", padding: "2px 8px",
                      borderRadius: 4, fontSize: 11 }}>
                      🏛 会派: {m.faction}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}