"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface PartyStats {
  party: string;
  total: number;
  speeches: number;
  questions: number;
  committee_chairs: number;
  committee_execs: number;
  activity_score: number;
  score_per_member: number;
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

function calcScore(speeches: number, questions: number, chairs: number, execs: number): number {
  return speeches * 1 + questions * 3 + chairs * 10 + execs * 5;
}



export default function PartiesPage() {
  const router = useRouter();
  const [parties, setParties] = useState<PartyStats[]>([]);
  const [sortBy,  setSortBy]  = useState("score");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [membersRes, committeeRes] = await Promise.all([
        supabase.from("members").select("id, party, speech_count, question_count").eq("is_active", true),
        supabase.from("committee_members").select("member_id, role"),
      ]);

      const members    = membersRes.data   || [];
      const committees = committeeRes.data || [];

      const chairCount: Record<string, number> = {};
      const execCount:  Record<string, number> = {};
      for (const c of committees) {
        if (!c.member_id) continue;
        if (c.role === "委員長" || c.role === "会長") {
          chairCount[c.member_id] = (chairCount[c.member_id] || 0) + 1;
        } else if (c.role === "理事" || c.role === "副会長") {
          execCount[c.member_id] = (execCount[c.member_id] || 0) + 1;
        }
      }

      const partyMap: Record<string, PartyStats> = {};
      for (const m of members) {
        const p = m.party || "無所属";
        if (!partyMap[p]) {
          partyMap[p] = { party: p, total: 0, speeches: 0, questions: 0,
            committee_chairs: 0, committee_execs: 0, activity_score: 0, score_per_member: 0 };
        }
        partyMap[p].total++;
        partyMap[p].speeches  += m.speech_count   || 0;
        partyMap[p].questions += m.question_count || 0;
        partyMap[p].committee_chairs += chairCount[m.id] || 0;
        partyMap[p].committee_execs  += execCount[m.id]  || 0;
      }

      for (const p of Object.values(partyMap)) {
        p.activity_score    = calcScore(p.speeches, p.questions, p.committee_chairs, p.committee_execs);
        p.score_per_member  = p.total > 0 ? Math.round(p.activity_score / p.total) : 0;
      }

      setParties(Object.values(partyMap));
      setLoading(false);
    }
    fetchStats();
  }, []);

  const sorted = [...parties].sort((a: any, b: any) => b[sortBy] - a[sortBy]);
  const maxVal  = Math.max(...sorted.map((p: any) => p[sortBy]), 1);

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🗳 政党・会派別データ</h1>
        <p style={{ color: "#475569", marginBottom: 24, fontSize: 11, lineHeight: 1.6 }}>
          活動スコア = 発言数×1 + 質問主意書×3 + 委員長×10 + 理事×5
        </p>

        {/* ソートボタン */}
        <div className="resp-stack" style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {[
            { value: "score",            label: "🏆 合計スコア" },
            { value: "score_per_member", label: "👤 1人あたりスコア" },
            { value: "total",            label: "人数" },
            { value: "speeches",         label: "💬 発言数" },
            { value: "questions",        label: "📝 質問主意書" },
          ].map((s) => (
            <button key={s.value} onClick={() => setSortBy(s.value)}
              style={{ background: sortBy === s.value ? "#3b82f6" : "#0f172a",
                border: `1px solid ${sortBy === s.value ? "#3b82f6" : "#1e293b"}`,
                color: sortBy === s.value ? "white" : "#64748b",
                padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12,
                fontWeight: sortBy === s.value ? 700 : 400 }}>
              {s.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>データ読み込み中...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {sorted.map((p, rank) => {
              const color      = PARTY_COLORS[p.party] || "#7f8c8d";
              const barRatio   = Math.round(((p as any)[sortBy] / maxVal) * 100);
              const avgSpeeches = p.total > 0 ? Math.round(p.speeches / p.total) : 0;

              return (
                <div key={p.party}
                  onClick={() => router.push(`/parties/${encodeURIComponent(p.party)}`)}
                  style={{ background: "#0f172a", border: "1px solid #1e293b",
                    borderRadius: 16, padding: 24, cursor: "pointer", transition: "all 0.2s" }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = color;
                    e.currentTarget.style.transform = "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "#1e293b";
                    e.currentTarget.style.transform = "translateY(0)";
                  }}>

                  {/* ヘッダー */}
                  <div className="resp-stack resp-gap-sm" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                    <span style={{ fontSize: 13, color: "#475569", fontWeight: 700, width: 20 }}>
                      {rank + 1}
                    </span>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                    <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: "#f1f5f9", flex: 1 }}>
                      {p.party}
                    </h2>
                    <span style={{ fontSize: 12, color: "#64748b" }}>{p.total}名</span>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontSize: 20, fontWeight: 800, color }}>
                        {p.activity_score.toLocaleString()}
                        <span style={{ fontSize: 10, color: "#64748b", marginLeft: 3 }}>pt</span>
                      </div>
                      <div style={{ fontSize: 11, color: "#64748b" }}>
                        1人あたり {p.score_per_member}pt
                      </div>
                    </div>
                  </div>

                  {/* バー */}
                  <div style={{ marginBottom: 14, background: "#1e293b", borderRadius: 4, height: 5 }}>
                    <div style={{ width: `${barRatio}%`, height: "100%",
                      background: color, borderRadius: 4, transition: "width 0.6s ease" }} />
                  </div>

                  {/* 統計グリッド */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {[
                      { label: "発言数合計",    value: p.speeches.toLocaleString(),   unit: "件" },
                      { label: "1人あたり発言", value: avgSpeeches,                   unit: "件" },
                      { label: "質問主意書",    value: p.questions,                   unit: "件" },
                      { label: "委員長・理事",  value: `${p.committee_chairs + p.committee_execs}`, unit: `名 (委${p.committee_chairs}理${p.committee_execs})` },
                    ].map((item) => (
                      <div key={item.label} style={{ background: "#1e293b", borderRadius: 10, padding: 12 }}>
                        <div style={{ fontSize: 15, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>
                          {item.value}
                          <span style={{ fontSize: 10, color: "#64748b", marginLeft: 3 }}>{item.unit}</span>
                        </div>
                        <div style={{ fontSize: 10, color: "#64748b" }}>{item.label}</div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
