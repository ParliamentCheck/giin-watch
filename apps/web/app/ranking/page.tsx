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
  speech_count: number | null;
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

export default function RankingPage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [selectedParty, setSelectedParty] = useState("");

  useEffect(() => {
    async function fetchMembers() {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, party, house, district, speech_count")
        .eq("is_active", true)
        .order("speech_count", { ascending: false });

      if (error) console.error(error);
      else setMembers(data || []);
      setLoading(false);
    }
    fetchMembers();
  }, []);

  const parties = Array.from(new Set(members.map((m) => m.party))).sort();

  const filtered = members.filter((m) => {
    if (selectedHouse && m.house !== selectedHouse) return false;
    if (selectedParty && m.party !== selectedParty) return false;
    return true;
  });

  const maxCount = filtered[0]?.speech_count || 1;

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ヘッダー */}
        <button onClick={() => router.push("/")}
          style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8",
            padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24,
            fontSize: 14 }}>
          ← トップに戻る
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>📊 発言ランキング</h1>
        <p style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>
          第219〜221回国会の発言回数（収録済みデータに基づく）
        </p>

        {/* フィルター */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
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
          {(selectedHouse || selectedParty) && (
            <button onClick={() => { setSelectedHouse(""); setSelectedParty(""); }}
              style={{ background: "#334155", border: "none", color: "#94a3b8",
                padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
              クリア
            </button>
          )}
        </div>

        <p style={{ color: "#475569", marginBottom: 16, fontSize: 14 }}>
          {filtered.length}名表示中
        </p>

        {/* ランキングリスト */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
            データ読み込み中...
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((m, i) => {
              const color = PARTY_COLORS[m.party] || "#7f8c8d";
              const count = m.speech_count || 0;
              const barWidth = maxCount > 0 ? (count / maxCount) * 100 : 0;
              const rank = i + 1;

              return (
                <div key={m.id}
                  onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                  style={{ background: "#0f172a", border: "1px solid #1e293b",
                    borderRadius: 12, padding: "16px 20px", cursor: "pointer",
                    transition: "all 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e293b"; }}>

                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 10 }}>
                    {/* 順位 */}
                    <div style={{ width: 36, height: 36, borderRadius: "50%", flexShrink: 0,
                      background: rank <= 3 ? color + "33" : "#1e293b",
                      border: `2px solid ${rank <= 3 ? color : "#334155"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: rank <= 3 ? 16 : 13,
                      fontWeight: 800, color: rank <= 3 ? color : "#64748b" }}>
                      {rank <= 3 ? ["🥇", "🥈", "🥉"][rank - 1] : rank}
                    </div>

                    {/* 議員名 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: "#f1f5f9", marginBottom: 2 }}>
                        {m.name}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>
                        {m.house} · {m.district}
                      </div>
                    </div>

                    {/* 政党バッジ */}
                    <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                      padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700,
                      flexShrink: 0 }}>
                      {m.party}
                    </span>

                    {/* 発言回数 */}
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 60 }}>
                      <span style={{ fontSize: 20, fontWeight: 800, color: "#f1f5f9" }}>
                        {count.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>件</span>
                    </div>
                  </div>

                  {/* バー */}
                  <div style={{ background: "#1e293b", borderRadius: 4, height: 4, overflow: "hidden" }}>
                    <div style={{ width: `${barWidth}%`, height: "100%",
                      background: color, borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 注意書き */}
        <div style={{ marginTop: 32, padding: 16, background: "#0f172a",
          border: "1px solid #1e293b", borderRadius: 12, fontSize: 12, color: "#475569" }}>
          ※ 発言回数は国立国会図書館「国会会議録検索システム」に登録された発言数です。
          会議録登録には1〜2週間のタイムラグがあるため、直近の発言は反映されていない場合があります。
          また、議長・委員長としての発言は除外しています。
        </div>
      </div>
    </div>
  );
}