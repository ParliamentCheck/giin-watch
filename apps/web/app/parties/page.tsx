"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface PartyStats {
  party: string;
  total: number;
  male: number;
  female: number;
  speeches: number;
  questions: number;
  committee_chairs: number;
  committee_execs: number;
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

export default function PartiesPage() {
  const router = useRouter();
  const [parties, setParties] = useState<PartyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      const [membersRes, speechRes, questionRes, committeeRes] = await Promise.all([
        supabase.from("members").select("id, party, gender, speech_count, question_count").eq("is_active", true),
        supabase.from("speeches").select("member_id"),
        supabase.from("questions").select("member_id"),
        supabase.from("committee_members").select("member_id, role"),
      ]);

      const members   = membersRes.data   || [];
      const questions = questionRes.data  || [];
      const committees = committeeRes.data || [];

      // member_idごとの質問数
      const questionCount: Record<string, number> = {};
      for (const q of questions) {
        if (q.member_id) questionCount[q.member_id] = (questionCount[q.member_id] || 0) + 1;
      }

      // member_idごとの委員長・理事数
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

      // 政党ごとに集計
      const partyMap: Record<string, PartyStats> = {};
      for (const m of members) {
        const p = m.party || "無所属";
        if (!partyMap[p]) {
          partyMap[p] = { party: p, total: 0, male: 0, female: 0,
            speeches: 0, questions: 0, committee_chairs: 0, committee_execs: 0 };
        }
        partyMap[p].total++;
        if (m.gender === "男") partyMap[p].male++;
        else if (m.gender === "女") partyMap[p].female++;
        partyMap[p].speeches  += m.speech_count   || 0;
        partyMap[p].questions += m.question_count || 0;
      }

      // 委員長・理事数を政党ごとに集計
      for (const m of members) {
        const p  = m.party || "無所属";
        const id = (m as any).id;
        if (id) {
          partyMap[p].committee_chairs += chairCount[id] || 0;
          partyMap[p].committee_execs  += execCount[id]  || 0;
        }
      }

      const sorted = Object.values(partyMap).sort((a, b) => b.total - a.total);
      setParties(sorted);
      setLoading(false);
    }
    fetchStats();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🗳 政党・会派別データ</h1>
        <p style={{ color: "#64748b", marginBottom: 32, fontSize: 14 }}>
          各政党・会派の議員数・活動データを比較できます
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>データ読み込み中...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {parties.map((p) => {
              const color       = PARTY_COLORS[p.party] || "#7f8c8d";
              const femaleRatio = p.total > 0 ? Math.round((p.female / p.total) * 100) : 0;
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

                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 16 }}>
                    <div style={{ width: 12, height: 12, borderRadius: "50%",
                      background: color, flexShrink: 0 }} />
                    <h2 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: "#f1f5f9", flex: 1 }}>
                      {p.party}
                    </h2>
                    <span style={{ fontSize: 24, fontWeight: 800, color }}>
                      {p.total}
                      <span style={{ fontSize: 13, color: "#64748b", marginLeft: 4 }}>名</span>
                    </span>
                  </div>

                  {/* 統計グリッド */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
                    {[
                      { label: "女性比率",     value: `${femaleRatio}%`,         sub: `${p.female}名` },
                      { label: "発言数(平均)", value: `${avgSpeeches}件`,        sub: `合計${p.speeches.toLocaleString()}件` },
                      { label: "質問主意書",   value: `${p.questions}件`,        sub: "提出合計" },
                      { label: "委員長・理事", value: `${p.committee_chairs + p.committee_execs}名`, sub: `委員長${p.committee_chairs}・理事${p.committee_execs}` },
                    ].map((item) => (
                      <div key={item.label} style={{ background: "#1e293b",
                        borderRadius: 10, padding: "12px" }}>
                        <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 2 }}>
                          {item.value}
                        </div>
                        <div style={{ fontSize: 11, color: "#64748b" }}>{item.label}</div>
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{item.sub}</div>
                      </div>
                    ))}
                  </div>

                  {/* 女性比率バー */}
                  <div style={{ marginTop: 12, background: "#1e293b", borderRadius: 4, height: 4 }}>
                    <div style={{ width: `${femaleRatio}%`, height: "100%",
                      background: "#e91e63", borderRadius: 4, transition: "width 0.8s ease" }} />
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