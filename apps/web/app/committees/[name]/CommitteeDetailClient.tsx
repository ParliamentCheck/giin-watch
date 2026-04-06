"use client";

import { Suspense, useEffect, useState } from "react";
import Paginator, { PAGE_SIZE } from "../../../components/Paginator";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import { usePagination } from "../../../hooks/usePagination";
import MemberChip from "../../../components/MemberChip";
import { PARTY_COLORS } from "../../../lib/partyColors";

interface CommitteeMember {
  member_id: string;
  name: string;
  alias_name: string | null;
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
  house: "衆" | "参";
}


const ROLE_ORDER = ["委員長", "会長", "理事", "副会長", "委員", "幹事", ""];

function roleRank(role: string) {
  const i = ROLE_ORDER.indexOf(role);
  return i === -1 ? ROLE_ORDER.length : i;
}

function CommitteeDetailContent() {
  const params = useParams();
  const router = useRouter();
  const committeeName = decodeURIComponent(params.name as string);
  const searchParams = useSearchParams();
  const [members,            setMembers]            = useState<CommitteeMember[]>([]);
  const [petitions,          setPetitions]          = useState<Petition[]>([]);
  const [petitionMemberMap,  setPetitionMemberMap]  = useState<Record<string, { name: string; party: string; is_active: boolean }>>({});
  const [loading,            setLoading]            = useState(true);
  const selectedHouse = searchParams.get("house") ?? "";
  const tab = (searchParams.get("tab") as "chairs" | "members" | "petitions") ?? "chairs";
  const COMMITTEE_TAB_LABELS: Record<string, string> = {
    chairs: "委員長・理事", members: "議員一覧", petitions: "請願",
  };
  useEffect(() => {
    const tabLabel = COMMITTEE_TAB_LABELS[tab] ?? tab;
    document.title = `${committeeName} — ${tabLabel} | はたらく議員`;
  }, [committeeName, tab]);
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    router.replace(`${window.location.pathname}?${p.toString()}`);
  };
  const sortBy = searchParams.get("sort") ?? "role";
  const { page: membersPage, setPage: setMembersPage, clearPage } = usePagination();
  const setSortBy = (s: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("sort", s);
    router.replace(`${window.location.pathname}?${p.toString()}`);
    clearPage();
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
      const memberMap = new Map<string, { alias_name: string | null; party: string; house: string; district: string }>();
      for (let i = 0; i < memberIds.length; i += 50) {
        const batch = memberIds.slice(i, i + 50);
        const mRes = await supabase
          .from("members")
          .select("id, alias_name, party, house, district")
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
          member_id:  c.member_id,
          name:       c.name,
          alias_name: m?.alias_name ?? null,
          role:       c.role || "",
          party:      m?.party || "",
          house:      m?.house || "",
          district:   m?.district || "",
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
          .select("id,session,number,title,result,result_date,introducer_names,source_url")
          .eq("committee_name", committeeName)
          .order("session", { ascending: false })
          .order("number", { ascending: false })
          .limit(30),
        supabase
          .from("sangiin_petitions")
          .select("id,session,number,title,result,result_date,introducer_names,source_url")
          .eq("committee_name", committeeName)
          .order("session", { ascending: false })
          .order("number", { ascending: false })
          .limit(30),
      ]);
      const allPetitions: Petition[] = [
        ...(pRes.data || []).map((p: any) => ({ ...p, house: "衆" as const })),
        ...(spRes.data || []).map((p: any) => ({ ...p, house: "参" as const })),
      ].sort((a, b) => {
        if (b.session !== a.session) return b.session - a.session;
        return b.number - a.number;
      });
      setPetitions(allPetitions);

      // introducer_names + house からメンバーIDを構築して一括取得
      const nameBasedIds = [...new Set(
        allPetitions.flatMap((p) =>
          (p.introducer_names ?? []).map((name) => {
            const hl = p.house === "衆" ? "衆議院" : "参議院";
            return `${hl}-${name.replace(/[\s\u3000]/g, "")}`;
          })
        )
      )];
      if (nameBasedIds.length > 0) {
        const map: Record<string, { name: string; party: string; is_active: boolean }> = {};
        for (let i = 0; i < nameBasedIds.length; i += 50) {
          const batch = nameBasedIds.slice(i, i + 50);
          const mRes = await supabase
            .from("members")
            .select("id, name, party, is_active, alias_name")
            .in("id", batch);
          type MemberRow = { id: string; name: string; alias_name: string | null; party: string; is_active: boolean };
          for (const m of (mRes.data as MemberRow[] ?? [])) {
            const info = { name: m.name, party: m.party, is_active: m.is_active };
            map[m.id] = info;
            if (m.alias_name) {
              const hl = m.id.startsWith("衆議院") ? "衆議院" : "参議院";
              map[`${hl}-${m.alias_name.replace(/[\s\u3000]/g, "")}`] = info;
            }
          }
        }
        setPetitionMemberMap(map);
      }

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

  // 衆参両方存在するか
  const houses = [...new Set(members.map((m) => m.house).filter(Boolean))];
  const hasBothHouses = houses.length >= 2;

  // 院フィルター適用
  const displayMembers = selectedHouse ? members.filter((m) => m.house === selectedHouse) : members;

  // 役職別
  const chairList = displayMembers.filter((m) => m.role === "委員長" || m.role === "会長");
  const execList  = displayMembers.filter((m) => m.role === "理事"   || m.role === "副会長");

  // 党別構成
  const partyCount: Record<string, number> = {};
  for (const m of displayMembers) {
    partyCount[m.party] = (partyCount[m.party] || 0) + 1;
  }
  const partyBreakdown = Object.entries(partyCount)
    .sort((a, b) => b[1] - a[1]);
  const maxPartyCount = partyBreakdown[0]?.[1] || 1;

  // ソート
  const sorted = [...displayMembers].sort((a, b) => {
    if (sortBy === "role") return roleRank(a.role) - roleRank(b.role);
    return a.name.localeCompare(b.name, "ja");
  });

  const houseColor = "#333333";

  if (loading) return (
    <div className="loading-block" style={{ minHeight: "100vh" }}>
      <div className="loading-spinner" />
      <span>データを読み込んでいます...</span>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
    <div style={{ maxWidth: 960, margin: "0 auto" }}>

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
        {hasBothHouses && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {["", "衆議院", "参議院"].map((h) => (
              <button key={h} onClick={() => {
                const p = new URLSearchParams(searchParams.toString());
                if (h) p.set("house", h); else p.delete("house");
                router.replace(`${window.location.pathname}?${p.toString()}`);
              }}
                className={`filter-btn${selectedHouse === h ? " active" : ""}`}>
                {h || "両院"}
              </button>
            ))}
          </div>
        )}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[
            { label: "所属議員数",   value: displayMembers.length, unit: "名" },
            { label: "委員長・会長", value: chairList.length,       unit: "名" },
            { label: "理事・副会長", value: execList.length,        unit: "名" },
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
          { id: "chairs"    as const, label: "🏛 委員長・理事" },
          { id: "members"   as const, label: "👤 議員一覧" },
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
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 13, color: "#888888" }}>{sorted.length}名</span>
            <Paginator total={sorted.length} page={membersPage} onPage={setMembersPage} variant="top" />
          </div>
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
            {sorted.slice((membersPage - 1) * PAGE_SIZE, membersPage * PAGE_SIZE).map((m) => {
              const color = PARTY_COLORS[m.party] || "#7f8c8d";
              return (
                <div key={m.member_id}
                  onClick={() => m.member_id && router.push(`/members/${encodeURIComponent(m.member_id)}`)}
                  className="card card-hover"
                  style={{ padding: "12px 16px", "--hover-color": color } as React.CSSProperties}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                    {m.role && <span className="badge badge-role">{m.role}</span>}
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111111" }}>{m.alias_name ?? m.name}</span>
                    <span style={{ fontSize: 12, color: "#555555" }}>{m.house} · {m.district}</span>
                    <span className="badge badge-party" style={{ marginLeft: "auto", "--party-color": color } as React.CSSProperties}>{m.party}</span>
                  </div>
                </div>
              );
            })}
          </div>
          <Paginator total={sorted.length} page={membersPage} onPage={setMembersPage} variant="bottom" />
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
                        {p.introducer_names.map((name) => {
                          const houseLabel = p.house === "衆" ? "衆議院" : "参議院";
                          const memberId = `${houseLabel}-${name.replace(/[\s\u3000]/g, "")}`;
                          const member = petitionMemberMap[memberId];
                          if (member) {
                            return (
                              <MemberChip key={memberId} id={memberId} name={name}
                                alias_name={null} party={member.party} is_active={member.is_active} />
                            );
                          }
                          return (
                            <span key={name} style={{ fontSize: 11, color: "#888888",
                              background: "#e0e0e0", border: "1px solid #c8c8c8",
                              padding: "1px 6px", borderRadius: 3 }}>
                              {name}
                            </span>
                          );
                        })}
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
