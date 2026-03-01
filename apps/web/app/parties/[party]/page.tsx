export const revalidate = 3600;
"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

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

export default function PartyDetailPage() {
  const params  = useParams();
  const router  = useRouter();
  const party   = decodeURIComponent(params.party as string);
  const color   = PARTY_COLORS[party] || "#7f8c8d";

  const [members,    setMembers]    = useState<Member[]>([]);
  const [chairs,     setChairs]     = useState<CommitteeRole[]>([]);
  const [loading,    setLoading]    = useState(true);
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
            .in("member_id", memberIds)
            .in("role", ["委員長", "理事", "会長", "副会長"])
        : { data: [] };

      setMembers(membersRes.data || []);
      setChairs((committeeRes.data || []).map((c) => ({
        name:      c.name,
        role:      c.role,
        committee: c.committee,
      })));
      setLoading(false);
    }
    fetchAll();
  }, [party]);

  const totalSpeeches  = members.reduce((s, m) => s + (m.speech_count   || 0), 0);
  const totalQuestions = members.reduce((s, m) => s + (m.question_count || 0), 0);
  const avgSpeeches    = members.length > 0 ? Math.round(totalSpeeches / members.length) : 0;

  const sorted = [...members].sort((a, b) => {
    if (sortBy === "speech_count")   return (b.speech_count   || 0) - (a.speech_count   || 0);
    if (sortBy === "question_count") return (b.question_count || 0) - (a.question_count || 0);
    return a.name.localeCompare(b.name);
  });

  const chairList  = chairs.filter((c) => c.role === "委員長" || c.role === "会長");
  const execList   = chairs.filter((c) => c.role === "理事"   || c.role === "副会長");

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#020817", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#64748b" }}>
      データ読み込み中...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.push("/parties")}
        style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8",
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24, fontSize: 14 }}>
        ← 政党一覧に戻る
      </button>

      {/* ヘッダー */}
      <div style={{ background: "#0f172a", border: `1px solid ${color}44`,
        borderRadius: 16, padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 20 }}>
          <div style={{ width: 16, height: 16, borderRadius: "50%", background: color }} />
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: "#f1f5f9" }}>{party}</h1>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {[
            { label: "議員数",          value: members.length,  unit: "名" },
            { label: "発言数合計",      value: totalSpeeches.toLocaleString(),  unit: "件" },
            { label: "質問主意書合計",  value: totalQuestions,  unit: "件" },
          ].map((item) => (
            <div key={item.label} style={{ background: "#1e293b", borderRadius: 12, padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color, marginBottom: 4 }}>
                {item.value}
                <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>{item.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: "#64748b" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* タブ */}
      <div style={{ display: "flex", gap: 4, marginBottom: 20, background: "#0f172a",
        border: "1px solid #1e293b", borderRadius: 12, padding: 4 }}>
        {[
          { id: "members",    label: `👤 議員一覧 (${members.length})` },
          { id: "committees", label: `🏛 委員長・理事 (${chairList.length + execList.length})` },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none",
              background: tab === t.id ? color : "transparent",
              color: tab === t.id ? "white" : "#64748b", cursor: "pointer",
              fontWeight: tab === t.id ? 700 : 400, fontSize: 13, transition: "all 0.2s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 議員一覧タブ */}
      {tab === "members" && (
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[
              { value: "speech_count",   label: "発言数順" },
              { value: "question_count", label: "質問主意書順" },
              { value: "name",           label: "名前順" },
            ].map((s) => (
              <button key={s.value} onClick={() => setSortBy(s.value)}
                style={{ background: sortBy === s.value ? color + "33" : "#1e293b",
                  border: `1px solid ${sortBy === s.value ? color : "#334155"}`,
                  color: sortBy === s.value ? color : "#64748b",
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
                  background: "#1e293b", transition: "all 0.15s" }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "#263548"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "#1e293b"; }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#f1f5f9" }}>{m.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{m.house} · {m.district}</div>
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#64748b" }}>
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
        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 12, padding: 20 }}>
          {chairList.length > 0 && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, color: "#f59e0b",
                textTransform: "uppercase", letterSpacing: 1 }}>
                🏆 委員長・会長 ({chairList.length}名)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
                {chairList.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 10, background: "#1e293b" }}>
                    <span style={{ background: "#f59e0b22", color: "#f59e0b",
                      border: "1px solid #f59e0b44", padding: "2px 8px",
                      borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {c.role}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#f1f5f9" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{c.committee}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {execList.length > 0 && (
            <>
              <h3 style={{ margin: "0 0 12px", fontSize: 13, color: "#3b82f6",
                textTransform: "uppercase", letterSpacing: 1 }}>
                📋 理事・副会長 ({execList.length}名)
              </h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {execList.map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 12,
                    padding: "12px 16px", borderRadius: 10, background: "#1e293b" }}>
                    <span style={{ background: "#3b82f622", color: "#3b82f6",
                      border: "1px solid #3b82f644", padding: "2px 8px",
                      borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                      {c.role}
                    </span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#f1f5f9" }}>{c.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{c.committee}</div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {chairList.length === 0 && execList.length === 0 && (
            <div style={{ color: "#475569", fontSize: 13, padding: "20px 0" }}>
              委員長・理事のデータがありません。
            </div>
          )}
        </div>
      )}
    </div>
  );
}