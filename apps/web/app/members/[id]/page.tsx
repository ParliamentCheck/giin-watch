"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

interface Member {
  id: string;
  name: string;
  party: string;
  faction: string | null;
  house: string;
  district: string;
  terms: number | null;
  speech_count: number | null;
  question_count: number | null;
  source_url: string | null;
}

interface Speech {
  id: string;
  committee: string;
  spoken_at: string;
  source_url: string;
}

interface Question {
  id: string;
  title: string;
  submitted_at: string;
  answered_at: string | null;
  source_url: string;
  session: number;
  number: number;
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

export default function MemberDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const memberId = decodeURIComponent(params.id as string);

  const [member,    setMember]    = useState<Member | null>(null);
  const [speeches,  setSpeeches]  = useState<Speech[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [tab,       setTab]       = useState("overview");

  useEffect(() => {
    async function fetchAll() {
      const [memberRes, speechRes, questionRes] = await Promise.all([
        supabase.from("members").select("*").eq("id", memberId).single(),
        supabase.from("speeches").select("*").eq("member_id", memberId)
          .order("spoken_at", { ascending: false }).limit(20),
        supabase.from("questions").select("*").eq("member_id", memberId)
          .order("submitted_at", { ascending: false }).limit(20),
      ]);

      if (memberRes.data)   setMember(memberRes.data);
      if (speechRes.data)   setSpeeches(speechRes.data);
      if (questionRes.data) setQuestions(questionRes.data);
      setLoading(false);
    }
    fetchAll();
  }, [memberId]);

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#64748b" }}>
      データ読み込み中...
    </div>
  );

  if (!member) return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
      議員データが見つかりませんでした
    </div>
  );

  const color      = PARTY_COLORS[member.party] || "#7f8c8d";
  const showFaction = member.faction && member.faction !== member.party;

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.back()}
        style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8",
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24, fontSize: 14 }}>
        ← 一覧に戻る
      </button>

      {/* ヘッダー */}
      <div style={{ background: "#0f172a", border: "1px solid #1e293b",
        borderRadius: 16, padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
            background: "#1e293b", border: `3px solid ${color}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
            👤
          </div>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: "0 0 6px", fontSize: 26, fontWeight: 800, color: "#f1f5f9" }}>
              {member.name}
            </h1>
            <div style={{ fontSize: 13, color: "#64748b", marginBottom: 10 }}>
              {member.house} · {member.district}
              {member.terms && ` · ${member.terms}期`}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 700 }}>
                🗳 {member.party}
              </span>
              {showFaction && (
                <span style={{ background: "#1e293b", color: "#94a3b8",
                  border: "1px solid #334155", padding: "3px 10px", borderRadius: 6, fontSize: 12 }}>
                  🏛 会派: {member.faction}
                </span>
              )}
              {member.source_url && (
                <a href={member.source_url} target="_blank" rel="noopener noreferrer"
                  style={{ background: "#1e293b", color: "#64748b",
                    border: "1px solid #334155", padding: "3px 10px", borderRadius: 6,
                    fontSize: 12, textDecoration: "none" }}>
                  📄 公式プロフィール
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 活動サマリーカード */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "発言回数",      value: member.speech_count,   unit: "件" },
          { label: "質問主意書",    value: member.question_count, unit: "件" },
          { label: "当選回数",      value: member.terms,          unit: "期" },
        ].map((item) => (
          <div key={item.label} style={{ background: "#0f172a", border: "1px solid #1e293b",
            borderRadius: 12, padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>
              {item.value ?? "—"}
              <span style={{ fontSize: 13, color: "#64748b", marginLeft: 4 }}>{item.unit}</span>
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0f172a",
        border: "1px solid #1e293b", borderRadius: 12, padding: 4 }}>
        {[
          { id: "speeches",  label: "💬 発言履歴" },
          { id: "questions", label: "📝 質問主意書" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none",
              background: tab === t.id ? "#3b82f6" : "transparent",
              color: tab === t.id ? "white" : "#64748b", cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 400, fontSize: 13, transition: "all 0.2s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 発言履歴タブ */}
      {tab === "speeches" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: 1 }}>
            発言履歴（最新20件）
          </h3>
          {speeches.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              発言データがまだありません。毎日自動収集中です。
            </div>
          ) : (
            speeches.map((s, i) => (
              <div key={s.id} style={{ padding: "14px 0",
                borderBottom: i < speeches.length - 1 ? "1px solid #1e293b" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{s.committee}</span>
                  <span style={{ fontSize: 12, color: "#475569" }}>{s.spoken_at}</span>
                </div>
                <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                  style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none" }}>
                  📄 会議録を見る →
                </a>
              </div>
            ))
          )}
        </div>
      )}

      {/* 質問主意書タブ */}
      {tab === "questions" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: 1 }}>
            質問主意書（最新20件）
          </h3>
          {questions.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              質問主意書の提出記録がありません。
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} style={{ padding: "14px 0",
                borderBottom: i < questions.length - 1 ? "1px solid #1e293b" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", flex: 1 }}>
                    {q.title}
                  </span>
                  <span style={{ fontSize: 11, color: "#475569", flexShrink: 0 }}>
                    第{q.session}回 #{q.number}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#64748b" }}>
                    提出: {q.submitted_at || "不明"}
                  </span>
                  {q.answered_at && (
                    <span style={{ fontSize: 12, color: "#64748b" }}>
                      答弁: {q.answered_at}
                    </span>
                  )}
                  <a href={q.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none" }}>
                    📄 詳細を見る →
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}