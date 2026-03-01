export const revalidate = 3600;
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import WordCloud from "../../components/WordCloud";

interface Member {
  id: string;
  name: string;
  party: string;
  faction: string | null;
  house: string;
  district: string;
  terms: number | null;
  speech_count: number | null;
  session_count: number | null;
  question_count: number | null;
  source_url: string | null;
  is_active: boolean;
  keywords: { word: string; count: number }[] | null;
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

interface Vote {
  id: string;
  bill_title: string;
  vote_date: string | null;
  vote: string;
  session_number: number;
}

interface Bill {
  id: string;
  title: string;
  submitted_at: string | null;
  status: string | null;
  session_number: number;
  house: string;
}

interface CommitteeMember {
  id: string;
  committee: string;
  role: string;
}

interface SessionGroup {
  committee: string;
  spoken_at: string;
  speeches: Speech[];
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

const ROLE_COLORS: Record<string, string> = {
  "委員長": "#f59e0b",
  "理事":   "#3b82f6",
  "委員":   "#64748b",
  "会長":   "#f59e0b",
  "副会長": "#3b82f6",
};

export default function MemberDetailPage() {
  const params   = useParams();
  const router   = useRouter();
  const memberId = decodeURIComponent(params.id as string);

  const [member,     setMember]     = useState<Member | null>(null);
  const [speeches,   setSpeeches]   = useState<Speech[]>([]);
  const [questions,  setQuestions]  = useState<Question[]>([]);
  const [committees, setCommittees] = useState<CommitteeMember[]>([]);
  const [votes,      setVotes]      = useState<Vote[]>([]);
  const [bills,      setBills]      = useState<Bill[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [tab,        setTab]        = useState("committees");
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  useEffect(() => {
    async function fetchAll() {
      const [memberRes, speechRes, questionRes, committeeRes, voteRes, billRes] = await Promise.all([
        supabase.from("members").select("*").eq("id", memberId).single(),
        supabase.from("speeches").select("*").eq("member_id", memberId)
          .order("spoken_at", { ascending: false }).limit(200),
        supabase.from("questions").select("*").eq("member_id", memberId)
          .order("submitted_at", { ascending: false }).limit(20),
        supabase.from("committee_members").select("*").eq("member_id", memberId),
        supabase.from("votes").select("id,bill_title,vote_date,vote,session_number")
          .eq("member_id", memberId).order("vote_date", { ascending: false }).limit(100),
        supabase.from("bills").select("id,title,submitted_at,status,session_number,house,submitter_ids")
          .contains("submitter_ids", [memberId]).limit(50),
      ]);

      if (memberRes.data)    setMember(memberRes.data);
      if (speechRes.data)    setSpeeches(speechRes.data);
      if (questionRes.data)  setQuestions(questionRes.data);
      if (committeeRes.data) setCommittees(committeeRes.data);
      if (voteRes.data)      setVotes(voteRes.data);
      if (billRes.data)      setBills(billRes.data);
      setLoading(false);
    }
    fetchAll();
  }, [memberId]);

  // 発言をセッション単位でグルーピング
  const sessionGroups: SessionGroup[] = [];
  const sessionMap: Record<string, SessionGroup> = {};
  for (const s of speeches) {
    const key = `${s.spoken_at}_${s.committee}`;
    if (!sessionMap[key]) {
      sessionMap[key] = { committee: s.committee, spoken_at: s.spoken_at, speeches: [] };
      sessionGroups.push(sessionMap[key]);
    }
    sessionMap[key].speeches.push(s);
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  const color       = PARTY_COLORS[member.party] || "#7f8c8d";
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
        <div className="resp-stack" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
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
{!member.is_active && (
                <span style={{
                  display: "inline-block", background: "#f59e0b22",
                  color: "#f59e0b", border: "1px solid #f59e0b",
                  borderRadius: 6, fontSize: 11, fontWeight: 700,
                  padding: "2px 8px", marginBottom: 6,
                }}>
                  ⚠️ 前議員（現在は議員ではありません）
                </span>
              )}
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
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
        {[
          { label: "委員会所属",     value: committees.length,        unit: "件" },
          { label: "発言セッション", value: member.session_count,     unit: "回" },
          { label: "質問主意書",     value: member.question_count,    unit: "件" },
          { label: "当選回数",       value: member.terms,             unit: "期" },
        ].map((item) => (
          <div key={item.label} style={{ background: "#0f172a", border: "1px solid #1e293b",
            borderRadius: 12, padding: "16px", textAlign: "center" }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>
              {item.value ?? "—"}
              <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>{item.unit}</span>
            </div>
            <div style={{ fontSize: 11, color: "#64748b" }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* タブ */}
      <div className="resp-scroll" style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0f172a",
        border: "1px solid #1e293b", borderRadius: 12, padding: 4 }}>
        {[
          { id: "committees", label: "🏛 委員会" },
          { id: "speeches",   label: `💬 発言 (${sessionGroups.length})` },
          { id: "questions",  label: "📝 質問主意書" },
          { id: "votes",      label: `🗳 採決 (${votes.length})` },
          { id: "bills",      label: `📋 議員立法 (${bills.length})` },
          { id: "keywords",   label: "☁️ キーワード" },
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

      {/* 委員会所属タブ */}
      {tab === "committees" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: 1 }}>
            委員会所属（現在）
          </h3>
          {committees.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              委員会所属データがありません。
            </div>
          ) : (
            committees.map((c, i) => {
              const roleColor = ROLE_COLORS[c.role] || "#64748b";
              return (
                <div key={c.id} style={{ padding: "14px 0",
                  borderBottom: i < committees.length - 1 ? "1px solid #1e293b" : "none",
                  display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ background: roleColor + "22", color: roleColor,
                    border: `1px solid ${roleColor}44`, padding: "2px 8px",
                    borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                    {c.role}
                  </span>
                  <span style={{ fontSize: 14, color: "#e2e8f0" }}>{c.committee}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 発言履歴タブ */}
      {tab === "speeches" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: 1 }}>
            発言履歴（セッション単位・最新順）
          </h3>
          {sessionGroups.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              発言データがまだありません。
            </div>
          ) : (
            sessionGroups.map((sg) => {
              const key      = `${sg.spoken_at}_${sg.committee}`;
              const isOpen   = expanded.has(key);
              return (
                <div key={key} style={{ borderBottom: "1px solid #1e293b", paddingBottom: 12, marginBottom: 12 }}>
                  <div
                    onClick={() => toggleExpand(key)}
                    style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", cursor: "pointer", padding: "6px 0" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>
                        {sg.committee}
                      </span>
                      <span style={{ fontSize: 12, color: "#475569", marginLeft: 12 }}>
                        {sg.spoken_at}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span style={{ fontSize: 11, color: "#64748b",
                        background: "#1e293b", padding: "2px 8px", borderRadius: 4 }}>
                        {sg.speeches.length}件の発言
                      </span>
                      <span style={{ color: "#64748b", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingLeft: 12,
                      borderLeft: "2px solid #1e293b" }}>
                      {sg.speeches.map((s, i) => (
                        <div key={s.id} style={{ padding: "8px 0",
                          borderBottom: i < sg.speeches.length - 1 ? "1px solid #1e293b" : "none" }}>
                          <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, color: "#3b82f6", textDecoration: "none" }}>
                            📄 発言 #{i + 1} を見る →
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* キーワードタブ */}
      {tab === "keywords" && (
        <div style={{ padding: "16px 0" }}>
          <WordCloud keywords={member.keywords || []} width={600} height={320} />
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

      {/* 採決記録タブ（参議院のみ） */}
      {tab === "votes" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: 1 }}>
            本会議採決記録（参議院・最新100件）
          </h3>
          {member.house !== "参議院" ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              衆議院は個人別の投票記録が公開されていないため、採決データは参議院議員のみ表示されます。
            </div>
          ) : votes.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              採決記録がありません。
            </div>
          ) : (
            votes.map((v, i) => {
              const voteColor = v.vote === "賛成" ? "#22c55e" : v.vote === "反対" ? "#ef4444" : "#64748b";
              return (
                <div key={v.id} style={{ padding: "12px 0",
                  borderBottom: i < votes.length - 1 ? "1px solid #1e293b" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <span style={{ fontSize: 13, color: "#e2e8f0", flex: 1 }}>
                      {v.bill_title}
                    </span>
                    <span style={{ fontSize: 11, color: voteColor, fontWeight: 700, flexShrink: 0,
                      background: voteColor + "22", border: `1px solid ${voteColor}44`,
                      padding: "2px 8px", borderRadius: 4 }}>
                      {v.vote}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>
                    {v.vote_date || "日付不明"} · 第{v.session_number}回国会
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 議員立法タブ */}
      {tab === "bills" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#94a3b8",
            textTransform: "uppercase", letterSpacing: 1 }}>
            議員提出法案
          </h3>
          {bills.length === 0 ? (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              議員提出法案の記録がありません。
            </div>
          ) : (
            bills.map((b, i) => (
              <div key={b.id} style={{ padding: "12px 0",
                borderBottom: i < bills.length - 1 ? "1px solid #1e293b" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0", marginBottom: 4 }}>
                  {b.title}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b" }}>
                  <span>{b.submitted_at || "日付不明"}</span>
                  <span>第{b.session_number}回国会</span>
                  {b.status && <span style={{ color: "#94a3b8" }}>{b.status}</span>}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
