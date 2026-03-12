"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

interface CommitteeMember {
  member_id: string;
  name: string;
  role: string;
  party: string;
  house: string;
  district: string;
}

interface Petition {
  id: string;
  session: number;
  number: number;
  title: string;
  result: string | null;
  introducer_names: string[] | null;
  source_url: string | null;
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

const ROLE_ORDER = ["委員長", "会長", "理事", "副会長", "委員", "幹事", ""];

function roleRank(role: string) {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

export default function CommitteeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const committeeName = decodeURIComponent(params.name as string);
  useEffect(() => { document.title = `${committeeName} | はたらく議員`; }, [committeeName]);

  const [members,   setMembers]   = useState<CommitteeMember[]>([]);
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [sortBy,    setSortBy]    = useState("role");
  const [tab,       setTab]       = useState<"chairs" | "members" | "petitions">("chairs");

  useEffect(() => {
    async function fetchAll() {
      // 1. 委員会所属情報を取得
      const cmRes = await supabase
        .from("committee_members")
        .select("member_id, name, role")
        .eq("committee", committeeName)
        .limit(500);

      const cmData = cmRes.data || [];
      const memberIds = cmData.map((c) => c.member_id).filter(Boolean);

      if (memberIds.length === 0) {
        setLoading(false);
        return;
      }

      // 2. 議員情報を取得（1委員会の所属数は多くないのでIN句で問題なし）
      const mRes = await supabase
        .from("members")
        .select("id, party, house, district")
        .in("id", memberIds)
        .limit(500);

      const memberMap = new Map((mRes.data || []).map((m) => [m.id, m]));

      // member_id と (name, role) の両方で重複排除（最上位役職を残す）
      const seenById   = new Map<string, CommitteeMember>();
      const seenByName = new Map<string, CommitteeMember>();
      for (const c of cmData) {
        const m = memberMap.get(c.member_id);
        const entry: CommitteeMember = {
          member_id: c.member_id,
          name:      c.name,
          role:      c.role || "",
          party:     m?.party || "不明",
          house:     m?.house || "",
          district:  m?.district || "",
        };
        const nameRoleKey = `${c.name}__${c.role || ""}`;
        const byId   = seenById.get(c.member_id);
        const byName = seenByName.get(nameRoleKey);
        if ((!byId   || roleRank(entry.role) < roleRank(byId.role)) &&
            (!byName || roleRank(entry.role) < roleRank(byName.role))) {
          seenById.set(c.member_id, entry);
          seenByName.set(nameRoleKey, entry);
        }
      }
      const combined = Array.from(seenById.values());

      setMembers(combined);

      // 請願データを取得（両院、最新30件）
      const [pRes, spRes] = await Promise.all([
        supabase
          .from("petitions")
          .select("id,session,number,title,result,introducer_names,source_url")
          .eq("committee_name", committeeName)
          .order("session", { ascending: false })
          .limit(30),
        supabase
          .from("sangiin_petitions")
          .select("id,session,number,title,result,introducer_names,source_url")
          .eq("committee_name", committeeName)
          .order("session", { ascending: false })
          .limit(30),
      ]);
      const allPetitions = [...(pRes.data || []), ...(spRes.data || [])]
        .sort((a, b) => b.session - a.session);
      setPetitions(allPetitions);

      setLoading(false);
    }
    fetchAll();
  }, [committeeName]);

  // 役職別
  const chairList = members.filter((m) => m.role === "委員長" || m.role === "会長");
  const execList  = members.filter((m) => m.role === "理事"   || m.role === "副会長");

  // 党別構成
  const partyCount: Record<string, number> = {};
  for (const m of members) {
    partyCount[m.party] = (partyCount[m.party] || 0) + 1;
  }
  const partyBreakdown = Object.entries(partyCount)
    .sort((a, b) => b[1] - a[1]);
  const maxPartyCount = partyBreakdown[0]?.[1] || 1;

  // ソート
  const sorted = [...members].sort((a, b) => {
    if (sortBy === "role") return roleRank(a.role) - roleRank(b.role);
    return a.name.localeCompare(b.name, "ja");
  });

  // 院の色
  const houseColor = committeeName.includes("参議院") || committeeName.includes("参院")
    ? "#333333" : "#888888";

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#555555" }}>
      データ読み込み中...
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.push("/committees")}
        style={{ background: "transparent", border: "1px solid #c8c8c8", color: "#888888",
          padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24, fontSize: 14 }}>
        ← 委員会一覧に戻る
      </button>

      {/* ヘッダー */}
      <div style={{ background: "#ffffff", border: `1px solid ${houseColor}44`,
        borderRadius: 16, padding: 28, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          <div style={{ width: 14, height: 14, borderRadius: "50%", background: houseColor }} />
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: "#111111" }}>
            {committeeName}
          </h1>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "所属議員数",   value: members.length,      unit: "名" },
            { label: "委員長・会長", value: chairList.length,     unit: "名" },
            { label: "理事・副会長", value: execList.length,      unit: "名" },
          ].map((item) => (
            <div key={item.label} style={{ background: "#e0e0e0", borderRadius: 12,
              padding: 16, textAlign: "center" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color: houseColor, marginBottom: 4 }}>
                {item.value}
                <span style={{ fontSize: 12, color: "#555555", marginLeft: 4 }}>{item.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: "#555555" }}>{item.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* 党別構成 */}
      <div style={{ background: "#ffffff", border: "1px solid #e0e0e0",
        borderRadius: 12, padding: 24, marginBottom: 16 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 13, color: "#888888",
          textTransform: "uppercase", letterSpacing: 1 }}>
          🗳 党別構成
        </h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {partyBreakdown.map(([party, count]) => {
            const color = PARTY_COLORS[party] || "#7f8c8d";
            const pct   = Math.round(count / members.length * 100);
            return (
              <div key={party}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  fontSize: 12, color: "#888888", marginBottom: 4 }}>
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%",
                      background: color, display: "inline-block" }} />
                    {party}
                  </span>
                  <span style={{ color, fontWeight: 700 }}>{count}名（{pct}%）</span>
                </div>
                <div style={{ height: 6, background: "#e0e0e0", borderRadius: 3, overflow: "hidden" }}>
                  <div style={{ width: `${count / maxPartyCount * 100}%`, height: "100%",
                    background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* タブバー */}
      <div style={{ display: "flex", gap: 4, marginBottom: 16,
        background: "#ffffff", border: "1px solid #e0e0e0", borderRadius: 12, padding: 4 }}>
        {([
          { id: "chairs"   as const, label: `🏛 委員長・理事 (${chairList.length + execList.length})` },
          { id: "members"  as const, label: `👤 議員一覧 (${members.length})` },
          { id: "petitions" as const, label: `📜 請願 (${petitions.length})` },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "none",
              background: tab === t.id ? houseColor : "transparent",
              color: tab === t.id ? "white" : "#555555",
              cursor: "pointer", fontWeight: tab === t.id ? 700 : 400,
              fontSize: 13, transition: "all 0.2s" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 委員長・理事タブ */}
      {tab === "chairs" && (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0",
          borderRadius: 12, padding: 24 }}>
          {chairList.length === 0 && execList.length === 0 ? (
            <div style={{ color: "#888888", fontSize: 13, padding: "20px 0" }}>データがありません。</div>
          ) : (
            <>
              {chairList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: execList.length > 0 ? 12 : 0 }}>
                  {chairList.map((c, i) => {
                    const color = PARTY_COLORS[c.party] || "#7f8c8d";
                    return (
                      <div key={i}
                        onClick={() => router.push(`/members/${encodeURIComponent(c.member_id)}`)}
                        className="member-row">
                        <span style={{ background: "#88888822", color: "#333333",
                          border: "1px solid #88888844", padding: "2px 8px",
                          borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {c.role}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "#111111" }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: "#555555" }}>{c.house} · {c.district}</div>
                        </div>
                        <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                          padding: "2px 8px", borderRadius: 4, fontSize: 11, flexShrink: 0 }}>
                          {c.party}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              {execList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {execList.map((c, i) => {
                    const color = PARTY_COLORS[c.party] || "#7f8c8d";
                    return (
                      <div key={i}
                        onClick={() => router.push(`/members/${encodeURIComponent(c.member_id)}`)}
                        className="member-row">
                        <span style={{ background: "#88888822", color: "#333333",
                          border: "1px solid #88888844", padding: "2px 8px",
                          borderRadius: 4, fontSize: 11, fontWeight: 700, flexShrink: 0 }}>
                          {c.role}
                        </span>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: 600, fontSize: 14, color: "#111111" }}>{c.name}</div>
                          <div style={{ fontSize: 11, color: "#555555" }}>{c.house} · {c.district}</div>
                        </div>
                        <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                          padding: "2px 8px", borderRadius: 4, fontSize: 11, flexShrink: 0 }}>
                          {c.party}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* 議員一覧タブ */}
      {tab === "members" && (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0",
          borderRadius: 12, padding: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { value: "role", label: "役職順" },
              { value: "name", label: "名前順" },
            ].map((s) => (
              <button key={s.value} onClick={() => setSortBy(s.value)}
                style={{ background: sortBy === s.value ? houseColor + "33" : "#e0e0e0",
                  border: `1px solid ${sortBy === s.value ? houseColor : "#c8c8c8"}`,
                  color: sortBy === s.value ? houseColor : "#555555",
                  padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {sorted.map((m) => {
              const color = PARTY_COLORS[m.party] || "#7f8c8d";
              return (
                <div key={m.member_id}
                  onClick={() => router.push(`/members/${encodeURIComponent(m.member_id)}`)}
                  className="member-row">
                  {m.role && (
                    <span style={{ fontSize: 10, color: "#555555", border: "1px solid #c8c8c8",
                      padding: "1px 6px", borderRadius: 3, flexShrink: 0 }}>
                      {m.role}
                    </span>
                  )}
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "#111111" }}>{m.name}</div>
                    <div style={{ fontSize: 11, color: "#555555" }}>{m.house} · {m.district}</div>
                  </div>
                  <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, flexShrink: 0 }}>
                    {m.party}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 請願タブ */}
      {tab === "petitions" && (
        <div style={{ background: "#ffffff", border: "1px solid #e0e0e0",
          borderRadius: 12, padding: 24 }}>
          {petitions.length === 0 ? (
            <div style={{ color: "#888888", fontSize: 13, padding: "20px 0" }}>
              付託された請願データがありません。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {petitions.map((p, i) => {
                const resultColor = p.result === "採択" ? "#22c55e"
                  : p.result === "不採択" ? "#ef4444" : "#555555";
                return (
                  <div key={p.id} style={{ padding: "14px 0",
                    borderBottom: i < petitions.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                    <div style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>
                        {p.title}
                      </span>
                      <span style={{ fontSize: 11, color: "#888888", flexShrink: 0 }}>
                        第{p.session}回 #{p.number}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 6 }}>
                      {p.result && (
                        <span style={{ fontSize: 11, color: resultColor, fontWeight: 700,
                          background: resultColor + "22", border: `1px solid ${resultColor}44`,
                          padding: "2px 8px", borderRadius: 4 }}>
                          {p.result}
                        </span>
                      )}
                      {p.source_url && (
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                          📄 詳細 →
                        </a>
                      )}
                    </div>
                    {p.introducer_names && p.introducer_names.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {p.introducer_names.map((name) => (
                          <span key={name} style={{ fontSize: 11, color: "#888888",
                            background: "#e0e0e0", border: "1px solid #c8c8c8",
                            padding: "1px 6px", borderRadius: 3 }}>
                            {name}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
