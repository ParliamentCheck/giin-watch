"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import Paginator, { PAGE_SIZE } from "../../components/Paginator";
import { usePagination } from "../../hooks/usePagination";
import MemberChip from "../../components/MemberChip";

interface Bill {
  id: string;
  title: string;
  submitted_at: string | null;
  status: string | null;
  session_number: number | null;
  house: string | null;
  submitter_ids: string[] | null;
  submitter_extra_count: number | null;
  honbun_url: string | null;
  keika_url: string | null;
  bill_type: string | null;
  committee_san: string | null;
  vote_date_san: string | null;
  committee_shu: string | null;
  vote_date_shu: string | null;
}

interface MemberInfo {
  id: string;
  name: string;
  party: string;
  prev_party: string | null;
  is_active: boolean;
}

interface PairStat {
  a: string;
  b: string;
  count: number;
}

// 中道改革連合の正式結成日。これ以前の法案は前所属政党として集計する
const CHUDO_FORMATION_DATE = "2026-01-16";

type StatusCategory = "成立" | "廃案" | "閉会中審査" | "審議中";

function classifyStatus(status: string | null): StatusCategory {
  if (status === "成立") return "成立";
  if (status === "廃案" || status === "撤回" || status === "未了") return "廃案";
  if (status?.includes("閉会中")) return "閉会中審査";
  return "審議中"; // null・空・審議中 など
}

function getEffectiveParty(m: MemberInfo, billDate: string | null): string {
  if (m.party === "中道改革連合" && m.prev_party && (!billDate || billDate < CHUDO_FORMATION_DATE)) {
    return m.prev_party;
  }
  return m.party;
}

const PARTY_COLORS: Record<string, string> = {
  "自民党":         "#c0392b",
  "立憲民主党":     "#2980b9",
  "公明党":         "#8e44ad",
  "日本維新の会":   "#318e2c",
  "国民民主党":     "#fabe00",
  "共産党":         "#e74c3c",
  "れいわ新選組":   "#e4007f",
  "社民党":         "#795548",
  "参政党":         "#ff6d00",
  "チームみらい":   "#00bcd4",
  "日本保守党":     "#607d8b",
  "無所属":         "#7f8c8d",
};

const PARTY_SHORT: Record<string, string> = {
  "自民党":       "自民",
  "立憲民主党":   "立憲",
  "公明党":       "公明",
  "国民民主党":   "国民",
  "日本維新の会": "維新",
  "共産党":       "共産",
  "れいわ新選組": "れいわ",
  "参政党":       "参政",
  "チームみらい": "みらい",
  "日本保守党":   "保守",
};

function heatmapBg(count: number, max: number): string {
  if (count === 0) return "transparent";
  const t = Math.pow(count / max, 0.6);
  const r = Math.round(240 - t * 180);
  const g = Math.round(240 - t * 120);
  const b = 255;
  return `rgb(${r},${g},${b})`;
}

function heatmapText(count: number, max: number): string {
  return count / max > 0.5 ? "#ffffff" : "#1a1a1a";
}

export default function BillsClient() {
  const router      = useRouter();
  const pathname    = usePathname();
  const searchParams = useSearchParams();

  const activeTab    = (searchParams.get("tab") ?? "member") as "member" | "cabinet";
  const memberSubTab = (searchParams.get("sub") ?? "list") as "list" | "network";
  useEffect(() => {
    const tabLabel = activeTab === "cabinet" ? "閣法" : "議員立法";
    document.title = `${tabLabel} | はたらく議員`;
  }, [activeTab]);
  const { page: billsPage, setPage: setBillsPage } = usePagination();

  const setActiveTab = (tab: "member" | "cabinet") => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", tab);
    p.delete("sub");
    p.delete("page");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const setMemberSubTab = (sub: "list" | "network") => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("sub", sub);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  // 一覧タブ用
  const [bills, setBills] = useState<Bill[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [filterHouse, setFilterHouse] = useState<string>("全て");
  const [statusFilter, setStatusFilter] = useState<StatusCategory | "all">("all");

  interface HouseDeliberation {
    committee: string;
    voteDate: string;
    members: string[];
    unmatched: string[];
    meetingUrl: string | null;
  }

  // 閣法 × 発言：展開中の法案ID → { shu, san }
  const [expandedBillId, setExpandedBillId] = useState<string | null>(null);
  const [deliberatorCache, setDeliberatorCache] = useState<Record<string, { shu: HouseDeliberation | null; san: HouseDeliberation | null }>>({});
  const [deliberatorLoading, setDeliberatorLoading] = useState(false);

  async function fetchHouse(sessionNumber: number, committee: string, voteDate: string | null): Promise<HouseDeliberation | null> {
    if (!committee) return null;
    let query = supabase
      .from("speeches")
      .select("member_id,speaker_name,source_url")
      .eq("session_number", sessionNumber)
      .eq("committee", committee)
      .limit(500);
    if (voteDate) query = query.eq("spoken_at", voteDate);
    const { data } = await query;
    const rows = data || [];
    const members = [...new Set(rows.map((d: { member_id: string | null }) => d.member_id).filter(Boolean) as string[])];
    const unmatched = [...new Set(
      rows
        .filter((d: { member_id: string | null; speaker_name: string | null }) => !d.member_id && d.speaker_name)
        .map((d: { speaker_name: string | null }) => d.speaker_name as string)
    )];
    const firstUrl = rows.find((d: { source_url: string | null }) => d.source_url)?.source_url ?? null;
    const meetingUrl = firstUrl ? firstUrl.replace(/\/\d+$/, "/0") : null;
    return { committee, voteDate: voteDate ?? "", members, unmatched, meetingUrl };
  }

  async function fetchDeliberators(bill: Bill) {
    const billId = bill.id;
    if (deliberatorCache[billId]) {
      setExpandedBillId(expandedBillId === billId ? null : billId);
      return;
    }
    if (expandedBillId === billId) { setExpandedBillId(null); return; }
    setExpandedBillId(billId);
    setDeliberatorLoading(true);
    const sessionNumber = bill.session_number!;
    const [shu, san] = await Promise.all([
      bill.committee_shu ? fetchHouse(sessionNumber, bill.committee_shu, bill.vote_date_shu ?? null) : null,
      bill.committee_san ? fetchHouse(sessionNumber, bill.committee_san, bill.vote_date_san ?? null) : null,
    ]);
    setDeliberatorCache((prev) => ({ ...prev, [billId]: { shu, san } }));
    setDeliberatorLoading(false);
  }

  // ネットワークタブ用
  const [topPairs, setTopPairs] = useState<PairStat[]>([]);
  const [matrixParties, setMatrixParties] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, number>>>({});
  const [networkLoading, setNetworkLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      const [memberBillsRes, cabinetBillsRes, membersRes] = await Promise.all([
        supabase
          .from("bills")
          .select("id,title,submitted_at,status,session_number,house,submitter_ids,submitter_extra_count,honbun_url,keika_url,bill_type,committee_san,vote_date_san,committee_shu,vote_date_shu")
          .eq("bill_type", "議員立法")
          .order("submitted_at", { ascending: false })
          .limit(1000),
        supabase
          .from("bills")
          .select("id,title,submitted_at,status,session_number,house,submitter_ids,submitter_extra_count,honbun_url,keika_url,bill_type,committee_san,vote_date_san,committee_shu,vote_date_shu")
          .eq("bill_type", "閣法")
          .order("submitted_at", { ascending: false })
          .limit(1000),
        supabase
          .from("members")
          .select("id,name,party,prev_party,is_active")
          .limit(2000),
      ]);

      const bills = [...(memberBillsRes.data || []), ...(cabinetBillsRes.data || [])];
      setBills(bills);

      const map: Record<string, MemberInfo> = {};
      for (const m of membersRes.data || []) map[m.id] = m;
      setMemberMap(map);
      setLoading(false);

      // ネットワーク計算（法案ごとに提出日ベースで政党を判定）
      const pairCount: Record<string, number> = {};
      for (const bill of bills) {
        const ids = ((bill.submitter_ids || []) as string[]).filter((id) => map[id]);
        const billParties = [...new Set(ids.map((id) => getEffectiveParty(map[id], bill.submitted_at)))];
        if (billParties.length < 2) continue;
        for (let i = 0; i < billParties.length; i++) {
          for (let j = i + 1; j < billParties.length; j++) {
            const key = [billParties[i], billParties[j]].sort().join("|");
            pairCount[key] = (pairCount[key] || 0) + 1;
          }
        }
      }

      const pairs = Object.entries(pairCount)
        .map(([key, count]) => { const [a, b] = key.split("|"); return { a, b, count }; })
        .sort((x, y) => y.count - x.count);
      setTopPairs(pairs.slice(0, 10));

      const partyVolume: Record<string, number> = {};
      for (const { a, b, count } of pairs) {
        partyVolume[a] = (partyVolume[a] || 0) + count;
        partyVolume[b] = (partyVolume[b] || 0) + count;
      }
      const dynParties = Object.entries(partyVolume)
        .sort((x, y) => y[1] - x[1])
        .slice(0, 8)
        .map(([p]) => p);
      setMatrixParties(dynParties);

      const mat: Record<string, Record<string, number>> = {};
      for (const p of dynParties) { mat[p] = {}; for (const q of dynParties) mat[p][q] = 0; }
      for (const { a, b, count } of pairs) {
        if (mat[a]?.[b] !== undefined) mat[a][b] = count;
        if (mat[b]?.[a] !== undefined) mat[b][a] = count;
      }
      setMatrix(mat);
      setNetworkLoading(false);
    }
    fetchData();
  }, []);

  const memberBills = bills
    .filter((b) => (b.bill_type ?? "議員立法") === "議員立法")
    .sort((a, b) => {
      const sd = (b.session_number ?? 0) - (a.session_number ?? 0);
      if (sd !== 0) return sd;
      if (a.submitted_at && b.submitted_at) return b.submitted_at.localeCompare(a.submitted_at);
      if (a.submitted_at) return -1;
      if (b.submitted_at) return 1;
      const na = parseInt(a.id.split("-").pop() ?? "0");
      const nb = parseInt(b.id.split("-").pop() ?? "0");
      return nb - na;
    });
  const cabinetBills = bills
    .filter((b) => b.bill_type === "閣法")
    .sort((a, b) => {
      const sd = (b.session_number ?? 0) - (a.session_number ?? 0);
      if (sd !== 0) return sd;
      if (a.submitted_at && b.submitted_at) return b.submitted_at.localeCompare(a.submitted_at);
      if (a.submitted_at) return -1;
      if (b.submitted_at) return 1;
      const na = parseInt(a.id.split("-").pop() ?? "0");
      const nb = parseInt(b.id.split("-").pop() ?? "0");
      return nb - na;
    });

  const currentListBills = activeTab === "cabinet" ? cabinetBills : memberBills;
  const filtered = currentListBills.filter((b) => {
    // 院フィルターは議員立法タブのみ適用（閣法は参院のみのため不要）
    if (activeTab === "member" && filterHouse !== "全て" && b.house !== filterHouse) return false;
    if (statusFilter !== "all" && classifyStatus(b.status) !== statusFilter) return false;
    if (search && !isComposing) {
      if (!b.title?.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  // ステータス別件数（院フィルター・検索は無視して全件から集計）
  const statusCounts = {
    成立:     currentListBills.filter(b => classifyStatus(b.status) === "成立").length,
    廃案:     currentListBills.filter(b => classifyStatus(b.status) === "廃案").length,
    閉会中審査: currentListBills.filter(b => classifyStatus(b.status) === "閉会中審査").length,
    審議中:   currentListBills.filter(b => classifyStatus(b.status) === "審議中").length,
  };
  const rateBase = statusCounts.成立 + statusCounts.廃案;
  const passRate = rateBase > 0 ? (statusCounts.成立 / rateBase * 100).toFixed(1) : null;

  const maxCount = Math.max(
    1,
    ...Object.values(matrix).flatMap((row) => Object.values(row))
  );

  return (
    <div style={{
      minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* タイトルカード */}
        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 0 }}>📋 法案</h1>
        </div>

        {/* トップタブ：議員立法 / 閣法 */}
        <div className="tab-bar-container" style={{ marginBottom: 16 }}>
          {([
            { id: "member",  label: "📋 議員立法" },
            { id: "cabinet", label: "🏛 閣法" },
          ] as const).map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              style={{ flex: 1, padding: "10px 0" }}
              className={`tab-pill${activeTab === tab.id ? " active" : ""}`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 議員立法タブ */}
        {activeTab === "member" && (
          <>
            {/* 法案一覧 */}
            {memberSubTab === "list" && (
              <div className="card-xl">
                {/* サブタブ */}
                <div className="tab-bar-container" style={{ marginBottom: 16 }}>
                  {([
                    { id: "list",    label: "法案一覧" },
                    { id: "network", label: "🤝 政党ネットワーク" },
                  ] as const).map((tab) => (
                    <button key={tab.id} onClick={() => setMemberSubTab(tab.id)}
                      style={{ flex: 1, padding: "8px 0", fontSize: 13 }}
                      className={`tab-pill${memberSubTab === tab.id ? " active" : ""}`}>
                      {tab.label}
                    </button>
                  ))}
                </div>
                {/* ステータスカード */}
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {([
                    { label: "成立"       as const, count: statusCounts.成立,       color: "#22c55e" },
                    { label: "廃案"       as const, count: statusCounts.廃案,       color: "#ef4444" },
                    { label: "閉会中審査" as const, count: statusCounts.閉会中審査, color: "#f59e0b" },
                    { label: "審議中"     as const, count: statusCounts.審議中,     color: "#888888" },
                  ] as { label: StatusCategory; count: number; color: string }[]).map(({ label, count, color }) => {
                    const isActive = statusFilter === label;
                    return (
                      <div key={label} onClick={() => { setStatusFilter(isActive ? "all" : label); setBillsPage(1); }}
                        style={{
                          flex: 1, background: isActive ? color : "#f4f4f4",
                          borderRadius: 8, padding: "8px 16px", textAlign: "center",
                          cursor: "pointer", outline: isActive ? `2px solid ${color}` : "none",
                        }} className="stat-card">
                        <div style={{ fontSize: 15, fontWeight: 800, color: isActive ? "#ffffff" : color }}>{count}</div>
                        <div style={{ fontSize: 11, color: isActive ? "#ffffff" : "#888888", whiteSpace: "nowrap" }}>{label}</div>
                      </div>
                    );
                  })}
                  {passRate !== null && (
                    <div style={{
                      flex: 1, background: "#f4f4f4",
                      borderRadius: 8, padding: "8px 16px", textAlign: "center",
                    }} className="stat-card">
                      <div style={{ fontSize: 15, fontWeight: 800, color: "#f59e0b" }}>{passRate}%</div>
                      <div style={{ fontSize: 11, color: "#888888", whiteSpace: "nowrap" }}>成立率</div>
                    </div>
                  )}
                </div>
                <div style={{ fontSize: 10, color: "#aaaaaa", marginBottom: 4 }}>※ 第208回〜（2022年〜）の記録に基づく</div>
                <div style={{ fontSize: 10, color: "#cc4444", marginBottom: 4 }}>※ 本文・経過リンクはすべて衆議院サイト（shugiin.go.jp）に遷移します（参院提出法案も同様）</div>
                <div style={{ fontSize: 10, marginBottom: 12, background: "#f0f4ff", border: "1px solid #c0d0f0", borderRadius: 6, padding: "6px 10px", lineHeight: 1.7, color: "#334499" }}>
                  📌 <strong>成立率の計算方法について</strong><br />
                  当サイトでは会期をまたいで継続した法案を同一法案として集計し、最終的に成立したかどうかで判定しています。メディア等でよく引用される「議員立法の成立率は数%」という数字は会期単位の集計で、持ち越された法案をその都度「不成立」としてカウントするため低く出ます。
                </div>
                {statusFilter !== "all" && (
                  <div style={{ fontSize: 12, color: "#555555", marginBottom: 12 }}>
                    「{statusFilter}」で絞り込み中 — {filtered.length}件
                    <button onClick={() => setStatusFilter("all")}
                      style={{ marginLeft: 8, fontSize: 11, color: "#888888", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                      解除
                    </button>
                  </div>
                )}
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                  {["全て", "衆議院", "参議院"].map((h) => (
                    <button key={h} onClick={() => setFilterHouse(h)}
                      className={`filter-btn${filterHouse === h ? " active" : ""}`}>
                      {h}
                    </button>
                  ))}
                  <input
                    type="text"
                    placeholder="法案名を検索..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    onCompositionStart={() => setIsComposing(true)}
                    onCompositionEnd={(e) => { setIsComposing(false); setSearch((e.target as HTMLInputElement).value); }}
                    className="input-field"
                    style={{ flex: 1, minWidth: 200, borderRadius: 8, padding: "8px 14px" }}
                  />
                </div>
                <p style={{ color: "#555555", fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                  <span>{loading ? "読み込み中..." : `${filtered.length} 件`}</span>
                  {!loading && <Paginator total={filtered.length} page={billsPage} onPage={setBillsPage} variant="top" />}
                </p>
                {loading ? (
                  <div className="loading-block">
                    <div className="loading-spinner" />
                    <span>データを読み込んでいます...</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <div className="empty-state">該当する法案がありません。</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {filtered.slice((billsPage - 1) * PAGE_SIZE, billsPage * PAGE_SIZE).map((b) => (
                      <div key={b.id} className="card" style={{ padding: "16px 20px" }}>
                        <div style={{ marginBottom: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{b.title}</span>
                        </div>
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 8 }}>
                          {b.submitted_at && <span>{b.submitted_at}</span>}
                          {b.session_number && <span>第{b.session_number}回国会</span>}
                          {b.house && <span className="badge badge-house">{b.house}</span>}
                          {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                          {b.honbun_url && <a href={b.honbun_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>本文↗</a>}
                          {b.keika_url && <a href={b.keika_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>経過↗</a>}
                        </div>
                        {b.submitter_ids && b.submitter_ids.length > 0 && (
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {b.submitter_ids.map((id) => {
                              const m = memberMap[id];
                              if (m) return <MemberChip key={id} id={id} name={m.name} party={m.party} isFormer={!m.is_active} />;
                              const name = id.split("-").slice(1).join("-");
                              return <span key={id} style={{ fontSize: 12, color: "#aaaaaa", background: "#f9f9f9", border: "1px solid #cccccc", borderRadius: 4, padding: "2px 8px", display: "inline-block", whiteSpace: "nowrap" }}>{name}</span>;
                            })}
                            {(b.submitter_extra_count ?? 0) > 0 && (
                              <span style={{ fontSize: 12, color: "#aaaaaa", background: "#f9f9f9", border: "1px solid #cccccc", borderRadius: 4, padding: "2px 8px", display: "inline-block", whiteSpace: "nowrap" }}>他{b.submitter_extra_count}名</span>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!loading && filtered.length > PAGE_SIZE && (
                  <Paginator total={filtered.length} page={billsPage} onPage={setBillsPage} variant="bottom" />
                )}
              </div>
            )}

            {/* 政党ネットワーク */}
            {memberSubTab === "network" && (
              <>
                <div className="card-xl">
                  {/* サブタブ */}
                  <div className="tab-bar-container" style={{ marginBottom: 16 }}>
                    {([
                      { id: "list",    label: "法案一覧" },
                      { id: "network", label: "🤝 政党ネットワーク" },
                    ] as const).map((tab) => (
                      <button key={tab.id} onClick={() => setMemberSubTab(tab.id)}
                        style={{ flex: 1, padding: "8px 0", fontSize: 13 }}
                        className={`tab-pill${memberSubTab === tab.id ? " active" : ""}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: "#555555", marginBottom: 12, lineHeight: 1.7 }}>
                    議員立法（議員提出法案）を共同提出した回数を、政党ペア別に集計しています。
                  </p>
                  <p style={{ fontSize: 11, color: "#aaaaaa", marginBottom: 8 }}>
                    ※中道改革連合は前所属政党（公明党・立憲民主党）に分類して集計。
                  </p>
                  <p style={{ fontSize: 11, color: "#aaaaaa", marginBottom: 20 }}>
                    ※与党は主に内閣を通じて法案（閣法）を提出するため、議員立法の件数が構造的に少なくなります。このマトリックスは国会活動の全体量を比較するものではありません。
                  </p>

                  {networkLoading ? (
                    <div className="loading-block">
                      <div className="loading-spinner" />
                      <span>データを集計しています...</span>
                    </div>
                  ) : (
                    <>
                      <h2 style={{ fontSize: 15, fontWeight: 700, color: "#333333", marginBottom: 10 }}>
                        共同提出の多い政党ペア TOP10
                      </h2>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {topPairs.map(({ a, b, count }, i) => {
                          const colorA = PARTY_COLORS[a] || "#7f8c8d";
                          const colorB = PARTY_COLORS[b] || "#7f8c8d";
                          return (
                            <div key={`${a}-${b}`}
                              style={{ display: "flex", alignItems: "center", gap: 10,
                                padding: "10px 14px", background: "#f9f9f9", borderRadius: 8,
                                border: "1px solid #eeeeee" }}>
                              <span style={{ fontSize: 13, color: "#aaaaaa", width: 22, textAlign: "right", flexShrink: 0 }}>
                                {i + 1}
                              </span>
                              <div style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, flexWrap: "wrap" }}>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorA, flexShrink: 0 }} />
                                  <span style={{ fontSize: 14, fontWeight: 600, color: colorA }}>{a}</span>
                                </span>
                                <span style={{ fontSize: 13, color: "#aaaaaa" }}>×</span>
                                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: colorB, flexShrink: 0 }} />
                                  <span style={{ fontSize: 14, fontWeight: 600, color: colorB }}>{b}</span>
                                </span>
                              </div>
                              <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", flexShrink: 0 }}>
                                {count}<span style={{ fontSize: 11, fontWeight: 400, color: "#888888", marginLeft: 2 }}>法案</span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>

                {/* マトリックス */}
                {!networkLoading && (
                  <div className="card-xl" style={{ marginTop: 16 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: "#333333", marginBottom: 6 }}>
                      政党間マトリックス
                    </h2>
                    <p style={{ fontSize: 11, color: "#aaaaaa", marginBottom: 12 }}>
                      数字は共同提出した議員立法の件数。色が濃いほど件数が多い。セルをクリックで法案一覧を表示。
                    </p>
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 420, width: "100%" }}>
                        <thead>
                          <tr>
                            <th style={{ width: 44, padding: "6px 4px", position: "sticky", left: 0, background: "#ffffff", zIndex: 2 }} />
                            {matrixParties.map((p) => (
                              <th key={p} style={{ padding: "6px 4px", textAlign: "center",
                                fontWeight: 700, color: PARTY_COLORS[p] || "#555",
                                fontSize: 12, whiteSpace: "nowrap", minWidth: 48,
                                position: "sticky", top: 0, background: "#ffffff", zIndex: 1 }}>
                                {PARTY_SHORT[p] ?? p}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixParties.map((row) => (
                            <tr key={row}>
                              <td style={{ padding: "6px 6px", fontWeight: 700,
                                color: PARTY_COLORS[row] || "#555", fontSize: 12,
                                whiteSpace: "nowrap", textAlign: "right",
                                position: "sticky", left: 0, background: "#ffffff", zIndex: 1 }}>
                                {PARTY_SHORT[row] ?? row}
                              </td>
                              {matrixParties.map((col) => {
                                const same = row === col;
                                const count = same ? 0 : (matrix[row]?.[col] || 0);
                                const isSelected = selectedPair &&
                                  ((selectedPair.a === row && selectedPair.b === col) ||
                                   (selectedPair.a === col && selectedPair.b === row));
                                return (
                                  <td key={col}
                                    onClick={() => {
                                      if (same || count === 0) return;
                                      if (isSelected) { setSelectedPair(null); return; }
                                      setSelectedPair({ a: row, b: col });
                                    }}
                                    style={{
                                      padding: "8px 4px", textAlign: "center",
                                      background: isSelected ? "#1a1a1a" : same ? "#eeeeee" : heatmapBg(count, maxCount),
                                      color: isSelected ? "#ffffff" : same ? "#cccccc" : heatmapText(count, maxCount),
                                      fontWeight: count > 0 ? 700 : 400,
                                      border: isSelected ? "2px solid #1a1a1a" : "1px solid #eeeeee",
                                      borderRadius: 4,
                                      cursor: count > 0 && !same ? "pointer" : "default",
                                    }}>
                                    {same ? "—" : count > 0 ? count : ""}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* ドリルダウン */}
                {selectedPair && (() => {
                  const { a, b } = selectedPair;
                  const pairBills = bills.filter((bill) => {
                    const ids = (bill.submitter_ids || []).filter((id) => memberMap[id]);
                    const parties = new Set(ids.map((id) => getEffectiveParty(memberMap[id], bill.submitted_at)));
                    return parties.has(a) && parties.has(b);
                  });
                  const colorA = PARTY_COLORS[a] || "#7f8c8d";
                  const colorB = PARTY_COLORS[b] || "#7f8c8d";
                  return (
                    <div className="card-xl" style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: colorA }}>{a}</span>
                        <span style={{ color: "#aaaaaa" }}>×</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: colorB }}>{b}</span>
                        <span style={{ fontSize: 13, color: "#888888" }}>の共同提出法案（{pairBills.length}件）</span>
                        <button onClick={() => setSelectedPair(null)}
                          style={{ marginLeft: "auto", fontSize: 12, color: "#888888", background: "none",
                            border: "1px solid #dddddd", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                          閉じる
                        </button>
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pairBills.map((b) => (
                          <div key={b.id} className="card" style={{ padding: "14px 18px" }}>
                            <div style={{ marginBottom: 6 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{b.title}</span>
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 6 }}>
                              {b.submitted_at && <span>{b.submitted_at}</span>}
                              {b.session_number && <span>第{b.session_number}回国会</span>}
                              {b.house && <span className="badge badge-house">{b.house}</span>}
                              {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                              {b.honbun_url && <a href={b.honbun_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>本文↗</a>}
                              {b.keika_url && <a href={b.keika_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>経過↗</a>}
                            </div>
                            {b.submitter_ids && b.submitter_ids.length > 0 && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {b.submitter_ids.map((id) => {
                                  const m = memberMap[id];
                                  if (m) return <MemberChip key={id} id={id} name={m.name} party={m.party} isFormer={!m.is_active} />;
                                  const name = id.split("-").slice(1).join("-");
                                  return <span key={id} style={{ fontSize: 12, color: "#aaaaaa", background: "#f9f9f9", border: "1px solid #cccccc", borderRadius: 4, padding: "2px 8px", display: "inline-block", whiteSpace: "nowrap" }}>{name}</span>;
                                })}
                                {(b.submitter_extra_count ?? 0) > 0 && (
                                  <span style={{ fontSize: 12, color: "#aaaaaa", background: "#f9f9f9", border: "1px solid #cccccc", borderRadius: 4, padding: "2px 8px", display: "inline-block", whiteSpace: "nowrap" }}>他{b.submitter_extra_count}名</span>
                                )}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </>
        )}

        {/* 閣法タブ */}
        {activeTab === "cabinet" && (
          <div className="card-xl">
            {/* ステータスカード */}
            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              {([
                { label: "成立"       as const, count: statusCounts.成立,       color: "#22c55e" },
                { label: "廃案"       as const, count: statusCounts.廃案,       color: "#ef4444" },
                { label: "閉会中審査" as const, count: statusCounts.閉会中審査, color: "#f59e0b" },
                { label: "審議中"     as const, count: statusCounts.審議中,     color: "#888888" },
              ] as { label: StatusCategory; count: number; color: string }[]).map(({ label, count, color }) => {
                const isActive = statusFilter === label;
                return (
                  <div key={label} onClick={() => { setStatusFilter(isActive ? "all" : label); setBillsPage(1); }}
                    style={{
                      flex: 1, background: isActive ? color : "#f4f4f4",
                      borderRadius: 8, padding: "8px 16px", textAlign: "center",
                      cursor: "pointer", outline: isActive ? `2px solid ${color}` : "none",
                    }}>
                    <div style={{ fontSize: 15, fontWeight: 800, color: isActive ? "#ffffff" : color }}>{count}</div>
                    <div style={{ fontSize: 11, color: isActive ? "#ffffff" : "#888888", whiteSpace: "nowrap" }}>{label}</div>
                  </div>
                );
              })}
              {passRate !== null && (
                <div style={{
                  flex: 1, background: "#f4f4f4",
                  borderRadius: 8, padding: "8px 16px", textAlign: "center",
                }}>
                  <div style={{ fontSize: 15, fontWeight: 800, color: "#f59e0b" }}>{passRate}%</div>
                  <div style={{ fontSize: 11, color: "#888888", whiteSpace: "nowrap" }}>成立率</div>
                </div>
              )}
            </div>
            <div style={{ fontSize: 10, color: "#aaaaaa", marginBottom: 4 }}>※ 第208回〜（2022年〜）の記録に基づく</div>
            <div style={{ fontSize: 10, marginBottom: 12, background: "#f0f4ff", border: "1px solid #c0d0f0", borderRadius: 6, padding: "6px 10px", lineHeight: 1.7, color: "#334499" }}>
              📌 <strong>成立率の計算方法について</strong><br />
              当サイトでは会期をまたいで継続した法案を同一法案として集計し、最終的に成立したかどうかで判定しています。メディア等でよく引用される「議員立法の成立率は数%」という数字は会期単位の集計で、持ち越された法案をその都度「不成立」としてカウントするため低く出ます。
            </div>
            {statusFilter !== "all" && (
              <div style={{ fontSize: 12, color: "#555555", marginBottom: 12 }}>
                「{statusFilter}」で絞り込み中 — {filtered.length}件
                <button onClick={() => setStatusFilter("all")}
                  style={{ marginLeft: 8, fontSize: 11, color: "#888888", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>
                  解除
                </button>
              </div>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
              <input
                type="text"
                placeholder="法案名を検索..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={(e) => { setIsComposing(false); setSearch((e.target as HTMLInputElement).value); }}
                className="input-field"
                style={{ flex: 1, minWidth: 200, borderRadius: 8, padding: "8px 14px" }}
              />
            </div>
            <p style={{ color: "#555555", fontSize: 13, marginBottom: 12, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span>{loading ? "読み込み中..." : `${filtered.length} 件`}</span>
              {!loading && <Paginator total={filtered.length} page={billsPage} onPage={setBillsPage} variant="top" />}
            </p>
            {loading ? (
              <div className="loading-block">
                <div className="loading-spinner" />
                <span>データを読み込んでいます...</span>
              </div>
            ) : filtered.length === 0 ? (
              <div className="empty-state">該当する法案がありません。</div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filtered.slice((billsPage - 1) * PAGE_SIZE, billsPage * PAGE_SIZE).map((b) => {
                  const canExpand = !!((b.committee_shu || b.committee_san) && b.session_number);
                  const isExpanded = expandedBillId === b.id;
                  const cached = deliberatorCache[b.id];
                  return (
                    <div key={b.id} className="card" style={{ padding: "16px 20px" }}>
                      <div style={{ marginBottom: 8 }}>
                        <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{b.title}</span>
                      </div>
                      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 8 }}>
                        {b.submitted_at && <span>{b.submitted_at}</span>}
                        {b.session_number && <span>第{b.session_number}回国会</span>}
                        {b.house && <span className="badge badge-house">{b.house}</span>}
                        {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                        {b.honbun_url && <a href={b.honbun_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>本文↗</a>}
                        {b.keika_url && <a href={b.keika_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>経過↗</a>}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 12, color: "#888888" }}>内閣提出</span>
                        {b.committee_san && (
                          <span style={{ fontSize: 12, color: "#888888" }}>· {b.committee_san}</span>
                        )}
                        {canExpand && (
                          <button
                            onClick={() => fetchDeliberators(b)}
                            style={{
                              marginLeft: "auto", fontSize: 11, color: "#555555",
                              background: "none", border: "1px solid #dddddd",
                              borderRadius: 6, padding: "3px 10px", cursor: "pointer",
                            }}>
                            {isExpanded ? "▲ 閉じる" : "👤 発言議員"}
                          </button>
                        )}
                      </div>
                      {isExpanded && (
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid #eeeeee" }}>
                          {deliberatorLoading && !cached ? (
                            <span style={{ fontSize: 12, color: "#888888" }}>読み込み中...</span>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                              {([
                                { key: "shu", label: "衆議院" },
                                { key: "san", label: "参議院" },
                              ] as const).map(({ key, label }) => {
                                const h = cached?.[key];
                                if (!h) return null;
                                return (
                                  <div key={key}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                                      <span style={{ fontSize: 11, fontWeight: 700, color: "#555555" }}>{label}</span>
                                      <span style={{ fontSize: 11, color: "#aaaaaa" }}>
                                        {h.committee}{h.voteDate ? `（${h.voteDate}）` : ""} · 発言{h.members.length}人
                                      </span>
                                      {h.meetingUrl && (
                                        <a href={h.meetingUrl} target="_blank" rel="noopener noreferrer"
                                          style={{
                                            fontSize: 11, color: "#555555",
                                            border: "1px solid #dddddd", borderRadius: 6,
                                            padding: "2px 8px", textDecoration: "none",
                                            whiteSpace: "nowrap",
                                          }}>
                                          会議録テキスト ↗
                                        </a>
                                      )}
                                    </div>
                                    {h.members.length === 0 ? (
                                      <span style={{ fontSize: 12, color: "#aaaaaa" }}>発言データなし</span>
                                    ) : (
                                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                        {h.members.map((id) => {
                                          const m = memberMap[id];
                                          return m ? <MemberChip key={id} id={id} name={m.name} party={m.party} isFormer={!m.is_active} /> : null;
                                        })}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                          <p style={{ fontSize: 11, color: "#b45309", background: "#fffbeb", border: "1px solid #fcd34d", borderRadius: 6, padding: "6px 10px", marginTop: 10 }}>
                            ※ 付託委員会で同会期中に発言した議員を表示しています。この法案のみを審議した議員ではありません。
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            <Paginator total={filtered.length} page={billsPage} onPage={setBillsPage} variant="bottom" />
          </div>
        )}

      </div>
    </div>
  );
}
