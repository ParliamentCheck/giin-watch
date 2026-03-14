"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
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

function CommitteeDetailContent() {
  const params = useParams();
  const router = useRouter();
  const committeeName = decodeURIComponent(params.name as string);
  useEffect(() => { document.title = `${committeeName} | はたらく議員`; }, [committeeName]);

  const searchParams = useSearchParams();
  const pathname     = usePathname();
  const [members,   setMembers]   = useState<CommitteeMember[]>([]);
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [loading,   setLoading]   = useState(true);
  const tab = (searchParams.get("tab") as "chairs" | "members" | "petitions") ?? "chairs";
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    router.replace(`${pathname}?${p.toString()}`);
  };
  const sortBy = searchParams.get("sort") ?? "role";
  const setSortBy = (s: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("sort", s);
    router.replace(`${pathname}?${p.toString()}`);
  };

  useEffect(() => {
    // 10秒でスピナーを強制終了するフォールバック
    const fallbackTimer = setTimeout(() => setLoading(false), 10000);

    async function fetchAll() {
      try {
      // 1. 委員会所属情報を取得
      const cmRes = await supabase
        .from("committee_members")
        .select("member_id, name, role")
        .eq("committee", committeeName)
        .limit(300);

      const cmData = cmRes.data || [];
      // 重複を除いたmemberIds（URL長を抑えるため）
      const memberIds = [...new Set(cmData.map((c) => c.member_id).filter(Boolean))];

      // 2. 議員情報をバッチで取得（50件ずつ、URL長制限を回避）
      const memberMap = new Map<string, { party: string; house: string; district: string }>();
      for (let i = 0; i < memberIds.length; i += 50) {
        const batch = memberIds.slice(i, i + 50);
        const mRes = await supabase
          .from("members")
          .select("id, party, house, district")
          .in("id", batch);
        for (const m of mRes.data || []) memberMap.set(m.id, m);
      }

      if (cmData.length === 0) { setLoading(false); return; }

      // member_id と (name, role) の両方で重複排除（最上位役職を残す）
      const seenById   = new Map<string, CommitteeMember>();
      const seenByName = new Map<string, CommitteeMember>();
      for (const c of cmData) {
        const m = c.member_id ? memberMap.get(c.member_id) : undefined;
        const entry: CommitteeMember = {
          member_id: c.member_id,
          name:      c.name,
          role:      c.role || "",
          party:     m?.party || "",
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
      } catch (e) {
        console.error("委員会データ取得エラー:", e);
        setLoading(false);
      } finally {
        clearTimeout(fallbackTimer);
      }
    }
    fetchAll();
    return () => clearTimeout(fallbackTimer);
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
    <div className="loading-block" style={{ minHeight: "100vh" }}>
      <div className="loading-spinner" />
      <span>データを読み込んでいます...</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
    <div style={{ maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <button onClick={() => router.push("/committees")} className="btn-back">
        ← 委員会一覧に戻る
      </button>

      {/* ヘッダー */}
      <div className="card-xl" style={{ border: `1px solid ${houseColor}44` }}>
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
      <div className="card" style={{ padding: 24, marginBottom: 16 }}>
        <h3 className="section-title">
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
                <div className="progress-bar" style={{ height: 6 }}>
                  <div className="progress-fill" style={{ width: `${count / maxPartyCount * 100}%`, background: color }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* タブバー */}
      <div className="tab-bar tab-bar-container">
        {([
          { id: "chairs"   as const, label: `🏛 委員長・理事 (${chairList.length + execList.length})` },
          { id: "members"  as const, label: `👤 議員一覧 (${members.length})` },
          { id: "petitions" as const, label: `📜 請願 (${petitions.length})` },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-pill${tab === t.id ? " active" : ""}`}
            style={{ flex: 1, padding: "10px 0" }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 委員長・理事タブ */}
      {tab === "chairs" && (
        <div className="card" style={{ padding: 24 }}>
          {chairList.length === 0 && execList.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>データがありません。</div>
          ) : (
            <>
              {chairList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: execList.length > 0 ? 12 : 0 }}>
                  {chairList.map((c, i) => {
                    const color = PARTY_COLORS[c.party] || "#7f8c8d";
                    return (
                      <div key={i}
                        onClick={() => c.member_id && router.push(`/members/${encodeURIComponent(c.member_id)}`)}
                        className="card card-hover"
                        style={{ padding: "12px 16px", "--hover-color": color } as React.CSSProperties}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                          <span className="badge badge-role">{c.role}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#111111" }}>{c.name}</span>
                          <span style={{ fontSize: 12, color: "#555555" }}>{c.house} · {c.district}</span>
                          <span className="badge badge-party" style={{ marginLeft: "auto", "--party-color": color } as React.CSSProperties}>{c.party}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {execList.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {execList.map((c, i) => {
                    const color = PARTY_COLORS[c.party] || "#7f8c8d";
                    return (
                      <div key={i}
                        onClick={() => c.member_id && router.push(`/members/${encodeURIComponent(c.member_id)}`)}
                        className="card card-hover"
                        style={{ padding: "12px 16px", "--hover-color": color } as React.CSSProperties}>
                        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                          <span className="badge badge-role">{c.role}</span>
                          <span style={{ fontWeight: 700, fontSize: 14, color: "#111111" }}>{c.name}</span>
                          <span style={{ fontSize: 12, color: "#555555" }}>{c.house} · {c.district}</span>
                          <span className="badge badge-party" style={{ marginLeft: "auto", "--party-color": color } as React.CSSProperties}>{c.party}</span>
                        </div>
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
        <div className="card" style={{ padding: 24 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            {[
              { value: "role", label: "役職順" },
              { value: "name", label: "名前順" },
            ].map((s) => (
              <button key={s.value} onClick={() => setSortBy(s.value)}
                className={`filter-btn${sortBy === s.value ? " active" : ""}`}>
                {s.label}
              </button>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {sorted.map((m) => {
              const color = PARTY_COLORS[m.party] || "#7f8c8d";
              return (
                <div key={m.member_id}
                  onClick={() => m.member_id && router.push(`/members/${encodeURIComponent(m.member_id)}`)}
                  className="card card-hover"
                  style={{ padding: "12px 16px", "--hover-color": color } as React.CSSProperties}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                    {m.role && <span className="badge badge-role">{m.role}</span>}
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111111" }}>{m.name}</span>
                    <span style={{ fontSize: 12, color: "#555555" }}>{m.house} · {m.district}</span>
                    <span className="badge badge-party" style={{ marginLeft: "auto", "--party-color": color } as React.CSSProperties}>{m.party}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 請願タブ */}
      {tab === "petitions" && (
        <div className="card" style={{ padding: 24 }}>
          {petitions.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              付託された請願データがありません。
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {petitions.map((p, i) => {
                const resultClean = p.result?.split("\n")[0].trim() ?? null;
                const resultColor = resultClean?.startsWith("採択") ? "#22c55e"
                  : resultClean === "不採択" ? "#ef4444" : "#555555";
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
                      {resultClean && (
                        <span className="badge badge-result" style={{ "--result-color": resultColor } as React.CSSProperties}>
                          {resultClean}
                        </span>
                      )}
                      {p.source_url && (
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                          📄 詳細 ↗
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
    </div>
  );
}

export default function CommitteeDetailClient() {
  return (
    <Suspense fallback={<div className="loading-block" style={{ minHeight: "100vh" }}><div className="loading-spinner" /></div>}>
      <CommitteeDetailContent />
    </Suspense>
  );
}
