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
  prefecture: string;
  terms: number | null;
  age: number | null;
  source_url: string | null;
  is_active: boolean;
}

interface Speech {
  id: string;
  committee: string;
  spoken_at: string;
  source_url: string;
}

interface VoteRecord {
  id: number;
  bill_name: string;
  voted_at: string;
  choice: string;
}

interface ActivityScore {
  score: number;
  score_attendance: number | null;
  score_speeches: number | null;
  score_questions: number | null;
  score_bills: number | null;
  score_committee: number | null;
  calculated_at: string;
}

const PARTY_COLORS: Record<string, string> = {
  "自民党": "#c0392b", "立憲民主党": "#2980b9", "中道改革連合": "#3498db",
  "公明党": "#8e44ad", "日本維新の会": "#e67e22", "国民民主党": "#27ae60",
  "共産党": "#e74c3c", "れいわ新選組": "#e91e63", "社民党": "#795548",
  "参政党": "#ff6d00", "チームみらい": "#00bcd4", "日本保守党": "#607d8b",
  "沖縄の風": "#009688", "有志の会": "#9c27b0", "無所属": "#7f8c8d",
};

const VOTE_STYLES: Record<string, { bg: string; color: string }> = {
  "賛成": { bg: "#dcfce7", color: "#166534" },
  "反対": { bg: "#fee2e2", color: "#991b1b" },
  "欠席": { bg: "#f3f4f6", color: "#6b7280" },
  "棄権": { bg: "#fef9c3", color: "#854d0e" },
};

const ScoreRing = ({ score, size = 80 }: { score: number; size?: number }) => {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;
  const color = score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : score >= 40 ? "#f97316" : "#ef4444";
  return (
    <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#1e293b" strokeWidth={8} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" />
      <text x={size/2} y={size/2} textAnchor="middle" dominantBaseline="central"
        style={{ fill: color, fontSize: size * 0.22, fontWeight: 700, fontFamily: "monospace",
          transform: "rotate(90deg)", transformOrigin: `${size/2}px ${size/2}px` }}>
        {score}
      </text>
    </svg>
  );
};

export default function MemberDetailPage() {
  const params = useParams();
  const router = useRouter();
  const memberId = decodeURIComponent(params.id as string);

  const [member, setMember] = useState<Member | null>(null);
  const [speeches, setSpeeches] = useState<Speech[]>([]);
  const [votes, setVotes] = useState<VoteRecord[]>([]);
  const [score, setScore] = useState<ActivityScore | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    async function fetchAll() {
      const [memberRes, speechRes, voteRes, scoreRes] = await Promise.all([
        supabase.from("members").select("*").eq("id", memberId).single(),
        supabase.from("speeches").select("*").eq("member_id", memberId).order("spoken_at", { ascending: false }).limit(20),
        supabase.from("vote_records").select("*").eq("member_id", memberId).order("voted_at", { ascending: false }).limit(20),
        supabase.from("activity_scores").select("*").eq("member_id", memberId).single(),
      ]);

      if (memberRes.data) setMember(memberRes.data);
      if (speechRes.data) setSpeeches(speechRes.data);
      if (voteRes.data) setVotes(voteRes.data);
      if (scoreRes.data) setScore(scoreRes.data);
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

  const color = PARTY_COLORS[member.party] || "#7f8c8d";
  const showFaction = member.faction && member.faction !== member.party;

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.back()}
        style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8",
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24,
          fontSize: 14, display: "flex", alignItems: "center", gap: 8 }}>
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
          {score && <ScoreRing score={score.score} size={88} />}
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0f172a",
        border: "1px solid #1e293b", borderRadius: 12, padding: 4 }}>
        {[
          { id: "overview", label: "📊 活動概要" },
          { id: "speeches", label: "💬 発言履歴" },
          { id: "votes", label: "🗳 投票履歴" },
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

      {/* 活動概要タブ */}
      {tab === "overview" && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
              活動スコア内訳
            </h3>
            {score ? (
              <>
                {[
                  { label: "出席率", val: score.score_attendance, max: 30 },
                  { label: "発言回数", val: score.score_speeches, max: 30 },
                  { label: "質問主意書", val: score.score_questions, max: 15 },
                  { label: "議員立法", val: score.score_bills, max: 15 },
                  { label: "委員会参加", val: score.score_committee, max: 10 },
                ].map((item) => (
                  <div key={item.label} style={{ marginBottom: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: "#94a3b8" }}>{item.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#e2e8f0" }}>
                        {item.val ?? "—"} / {item.max}
                      </span>
                    </div>
                    <div style={{ background: "#1e293b", borderRadius: 4, height: 6, overflow: "hidden" }}>
                      <div style={{ width: `${((item.val ?? 0) / item.max) * 100}%`,
                        height: "100%", background: "#3b82f6", borderRadius: 4,
                        transition: "width 0.8s ease" }} />
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <div style={{ color: "#475569", fontSize: 13 }}>
                スコアデータがまだありません。<br/>発言データが蓄積されると表示されます。
              </div>
            )}
          </div>

          <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
              活動サマリー
            </h3>
            {[
              { label: "発言回数（記録済）", val: `${speeches.length}件以上` },
              { label: "投票記録（記録済）", val: `${votes.length}件以上` },
              { label: "所属院", val: member.house },
              { label: "選挙区", val: member.district },
              { label: "当選回数", val: member.terms ? `${member.terms}期` : "不明" },
            ].map((item) => (
              <div key={item.label} style={{ display: "flex", justifyContent: "space-between",
                padding: "10px 0", borderBottom: "1px solid #1e293b" }}>
                <span style={{ fontSize: 13, color: "#64748b" }}>{item.label}</span>
                <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>{item.val}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 発言履歴タブ */}
      {tab === "speeches" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
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

      {/* 投票履歴タブ */}
      {tab === "votes" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8", textTransform: "uppercase", letterSpacing: 1 }}>
            投票履歴（最新20件）
          </h3>
          {votes.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              投票データがまだありません。収集スクリプト実装後に表示されます。
            </div>
          ) : (
            votes.map((v, i) => {
              const vs = VOTE_STYLES[v.choice] || VOTE_STYLES["棄権"];
              return (
                <div key={v.id} style={{ display: "flex", alignItems: "center",
                  justifyContent: "space-between", padding: "14px 0",
                  borderBottom: i < votes.length - 1 ? "1px solid #1e293b" : "none" }}>
                  <div>
                    <div style={{ fontSize: 14, color: "#e2e8f0", fontWeight: 600, marginBottom: 4 }}>
                      {v.bill_name}
                    </div>
                    <div style={{ fontSize: 12, color: "#475569" }}>{v.voted_at}</div>
                  </div>
                  <span style={{ background: vs.bg, color: vs.color,
                    padding: "3px 10px", borderRadius: 4, fontSize: 12, fontWeight: 700,
                    flexShrink: 0, marginLeft: 12 }}>
                    {v.choice}
                  </span>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}