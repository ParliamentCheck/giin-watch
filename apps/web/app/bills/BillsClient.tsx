"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { getBillsByType, getAllMembers, getFactionHistory } from "../../lib/queries";
import type { Bill, Member } from "../../lib/types";
import Paginator, { PAGE_SIZE } from "../../components/Paginator";
import { usePagination } from "../../hooks/usePagination";
import MemberChip from "../../components/MemberChip";
import { buildFactionAt, factionColor } from "../../lib/factions";
import { ListNotices } from "../components/Notices";

// 会派の数に含めない（会派に属さない議員）
const NON_FACTIONS = new Set(["無所属", "各派に属しない議員"]);

interface NetworkData {
  factions: string[];
  matrix: Record<string, Record<string, number>>;
  bills: number;          // 衆議院の議員立法の件数
  datedBills: number;     // うち提出日の記録がある件数
  submitters: number;     // 提出日の記録がある法案の提出者（延べ）
  determined: number;     // うち提出時の会派を確定できた提出者（延べ）
}

type StatusCategory = "成立" | "廃案" | "閉会中審査" | "審議中";

function classifyStatus(status: string | null): StatusCategory {
  if (status === "成立") return "成立";
  if (status === "廃案" || status === "撤回" || status === "未了") return "廃案";
  if (status?.includes("閉会中")) return "閉会中審査";
  return "審議中"; // null・空・審議中 など
}



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

  const activeTab    = (searchParams.get("tab") ?? "member") as "member" | "cabinet" | "committee";
  const memberSubTab = (searchParams.get("sub") ?? "list") as "list" | "network";
  useEffect(() => {
    const tabLabel = activeTab === "cabinet" ? "閣法" : activeTab === "committee" ? "委員会提出" : "議員立法";
    document.title = `${tabLabel} | はたらく議員`;
  }, [activeTab]);
  const { page: billsPage, setPage: setBillsPage } = usePagination();

  const setActiveTab = (tab: "member" | "cabinet" | "committee") => {
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
  const [memberMap, setMemberMap] = useState<Record<string, Member>>({});
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
  const [network, setNetwork] = useState<NetworkData | null>(null);
  const [historyError, setHistoryError] = useState(false);
  // 法案ID → 提出時の会派を確定できた会派（会派に属さない議員を除く）
  const [billFactions, setBillFactions] = useState<Record<string, Set<string>>>({});
  const [networkLoading, setNetworkLoading] = useState(true);
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      const [memberBillsData, cabinetBillsData, committeeBillsData, membersData, historyData] = await Promise.all([
        getBillsByType("議員立法"),
        getBillsByType("閣法"),
        getBillsByType("委員会提出"),
        getAllMembers(),
        getFactionHistory().catch(() => null),
      ]);

      const bills = [...memberBillsData, ...cabinetBillsData, ...committeeBillsData];
      setBills(bills);

      const map: Record<string, Member> = {};
      for (const m of membersData) map[m.id] = m;
      setMemberMap(map);
      setLoading(false);

      // 会派ネットワーク（衆議院の議員立法のみ）
      // 提出者の会派は「提出日の時点の会派」を会派の記録から求め、確定できない提出者は数えない（推測しない）。
      // 会派は院ごとの組織のため院をまたいで集計しない。参議院の議員立法は当サイトでは筆頭の発議者のみ記録しているため対象外。
      if (historyData === null) {
        setHistoryError(true);
        setNetworkLoading(false);
        return;
      }
      const factionAt = buildFactionAt(historyData);
      const perBill: Record<string, Set<string>> = {};
      const pairCount: Record<string, number> = {};
      const net: NetworkData = { factions: [], matrix: {}, bills: 0, datedBills: 0, submitters: 0, determined: 0 };
      for (const bill of memberBillsData) {
        if (bill.house !== "衆議院") continue;
        net.bills++;
        if (!bill.submitted_at) continue;
        net.datedBills++;
        const fs = new Set<string>();
        for (const id of (bill.submitter_ids || []) as string[]) {
          net.submitters++;
          const f = factionAt(id, bill.submitted_at);
          if (!f) continue;
          net.determined++;
          if (!NON_FACTIONS.has(f)) fs.add(f);
        }
        perBill[bill.id] = fs;
        const list = [...fs].sort((a, b) => a.localeCompare(b, "ja"));
        for (let x = 0; x < list.length; x++) {
          for (let y = x + 1; y < list.length; y++) {
            const key = `${list[x]}|${list[y]}`;
            pairCount[key] = (pairCount[key] || 0) + 1;
          }
        }
      }
      const names = new Set<string>();
      for (const key of Object.keys(pairCount)) key.split("|").forEach((n) => names.add(n));
      net.factions = [...names].sort((a, b) => a.localeCompare(b, "ja"));
      for (const a of net.factions) { net.matrix[a] = {}; for (const b of net.factions) net.matrix[a][b] = 0; }
      for (const [key, count] of Object.entries(pairCount)) {
        const [a, b] = key.split("|");
        net.matrix[a][b] = count; net.matrix[b][a] = count;
      }
      setBillFactions(perBill);
      setNetwork(net);
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

  const committeeBills = bills
    .filter((b) => b.bill_type === "委員会提出")
    .sort((a, b) => {
      const sd = (b.session_number ?? 0) - (a.session_number ?? 0);
      if (sd !== 0) return sd;
      if (a.submitted_at && b.submitted_at) return b.submitted_at.localeCompare(a.submitted_at);
      if (a.submitted_at) return -1;
      if (b.submitted_at) return 1;
      return 0;
    });

  const currentListBills = activeTab === "cabinet" ? cabinetBills : activeTab === "committee" ? committeeBills : memberBills;
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

  const matrix = network?.matrix ?? {};
  const matrixFactions = network?.factions ?? [];
  const maxCount = Math.max(
    1,
    ...Object.values(matrix).flatMap((row) => Object.values(row))
  );

  return (
    <div style={{
      minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      padding: "24px",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        {/* タイトルカード */}
        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 0 }}>📋 法案</h1>
        </div>

        {/* トップタブ：議員立法 / 閣法 / 委員会提出 */}
        <div className="tab-bar-container" style={{ marginBottom: 16 }}>
          {([
            { id: "member",    label: "📋 議員立法" },
            { id: "cabinet",   label: "🏛 閣法" },
            { id: "committee", label: "🗂 委員会提出" },
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
                    { id: "network", label: "🤝 会派ネットワーク" },
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
                              if (m) return <MemberChip key={id} id={id} name={m.name} alias_name={m.alias_name} faction={m.faction} is_active={m.is_active} />;
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

            {/* 会派ネットワーク */}
            {memberSubTab === "network" && (
              <>
                <div className="card-xl">
                  {/* サブタブ */}
                  <div className="tab-bar-container" style={{ marginBottom: 16 }}>
                    {([
                      { id: "list",    label: "法案一覧" },
                      { id: "network", label: "🤝 会派ネットワーク" },
                    ] as const).map((tab) => (
                      <button key={tab.id} onClick={() => setMemberSubTab(tab.id)}
                        style={{ flex: 1, padding: "8px 0", fontSize: 13 }}
                        className={`tab-pill${memberSubTab === tab.id ? " active" : ""}`}>
                        {tab.label}
                      </button>
                    ))}
                  </div>
                  <p style={{ fontSize: 13, color: "#555555", marginBottom: 12, lineHeight: 1.7 }}>
                    衆議院の議員立法（議員提出法案）を、提出者の会派の組み合わせ別に数えています。
                    提出者の会派は<strong>法案を提出した日の時点の会派</strong>です（現在の会派ではありません）。
                  </p>
                  <ul style={{ fontSize: 12, color: "#555555", margin: "0 0 12px", paddingLeft: 18, lineHeight: 1.8 }}>
                    <li>提出日の会派は、国会会議録の発言時点の会派と議員名簿の記録から求めています。前後の記録が同じ会派の場合のみ会派を確定し、確定できない提出者は数えていません。</li>
                    <li>提出日の記録がない法案は対象外です。無所属・各派に属しない議員は会派の組み合わせに含めていません。</li>
                    <li>参議院の議員立法は、当サイトでは筆頭の発議者のみを記録しているため対象外です。</li>
                    <li>閣法（内閣提出法案）は含みません。国会活動の全体量を比べるものではありません。</li>
                  </ul>
                  <ListNotices sort={false} style={{ marginBottom: 16 }} />

                  {networkLoading ? (
                    <div className="loading-block">
                      <div className="loading-spinner" />
                      <span>データを集計しています...</span>
                    </div>
                  ) : historyError || !network ? (
                    <p style={{ fontSize: 13, color: "#555555", margin: 0 }}>会派の記録を取得できませんでした。時間をおいて再度お試しください。</p>
                  ) : (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {[
                        { label: "衆議院の議員立法", value: `${network.bills.toLocaleString()}件` },
                        { label: "うち提出日の記録あり", value: `${network.datedBills.toLocaleString()}件` },
                        { label: "提出時の会派を確定できた提出者", value: `${network.determined.toLocaleString()} / ${network.submitters.toLocaleString()}人（延べ）` },
                      ].map((c) => (
                        <div key={c.label} style={{ flex: "1 1 180px", background: "#f4f4f4", borderRadius: 8, padding: "8px 12px" }}>
                          <div style={{ fontSize: 15, fontWeight: 800, color: "#333333" }}>{c.value}</div>
                          <div style={{ fontSize: 11, color: "#555555" }}>{c.label}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* マトリックス */}
                {!networkLoading && network && (
                  <div className="card-xl" style={{ marginTop: 16 }}>
                    <h2 style={{ fontSize: 15, fontWeight: 700, color: "#333333", marginBottom: 6 }}>
                      会派の組み合わせ（衆議院）
                    </h2>
                    <p style={{ fontSize: 11, color: "#555555", marginBottom: 12 }}>
                      数字は、その2つの会派の議員がともに提出者に入っている議員立法の件数。色が濃いほど件数が多い。セルを選ぶと法案の一覧を表示します。並び順は会派名の順です。
                    </p>
                    {matrixFactions.length === 0 ? (
                      <p style={{ fontSize: 13, color: "#555555", margin: 0 }}>該当する法案はありません（0件）。</p>
                    ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ borderCollapse: "collapse", fontSize: 12, minWidth: 420 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: "6px 4px", position: "sticky", left: 0, background: "#ffffff", zIndex: 2 }} />
                            {matrixFactions.map((f) => (
                              <th key={f} scope="col" style={{ padding: "6px 4px", fontWeight: 700, color: "#333333", fontSize: 11,
                                minWidth: 36, background: "#ffffff", borderBottom: `3px solid ${factionColor(f)}`,
                                writingMode: "vertical-rl", whiteSpace: "nowrap", textAlign: "end", letterSpacing: 1 }}>
                                {f}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {matrixFactions.map((row) => (
                            <tr key={row}>
                              <th scope="row" style={{ padding: "6px 8px", fontWeight: 700,
                                color: "#333333", fontSize: 12, textAlign: "right", whiteSpace: "nowrap",
                                borderLeft: `3px solid ${factionColor(row)}`,
                                position: "sticky", left: 0, background: "#ffffff", zIndex: 1 }}>
                                {row}
                              </th>
                              {matrixFactions.map((col) => {
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
                                    title={same ? undefined : `${row} × ${col}: ${count}件`}
                                    style={{
                                      padding: "8px 4px", textAlign: "center", minWidth: 36,
                                      background: isSelected ? "#1a1a1a" : same ? "#eeeeee" : heatmapBg(count, maxCount),
                                      color: isSelected ? "#ffffff" : same ? "#cccccc" : heatmapText(count, maxCount),
                                      fontWeight: count > 0 ? 700 : 400,
                                      border: isSelected ? "2px solid #1a1a1a" : "1px solid #eeeeee",
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
                    )}
                  </div>
                )}

                {/* ドリルダウン */}
                {selectedPair && (() => {
                  const { a, b } = selectedPair;
                  const pairBills = memberBills.filter((bill) => {
                    const fs = billFactions[bill.id];
                    return !!fs && fs.has(a) && fs.has(b);
                  });
                  return (
                    <div className="card-xl" style={{ marginTop: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6, flexWrap: "wrap" }}>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", borderLeft: `3px solid ${factionColor(a)}`, paddingLeft: 6 }}>{a}</span>
                        <span style={{ color: "#888888" }}>×</span>
                        <span style={{ fontSize: 15, fontWeight: 700, color: "#1a1a1a", borderLeft: `3px solid ${factionColor(b)}`, paddingLeft: 6 }}>{b}</span>
                        <span style={{ fontSize: 13, color: "#555555" }}>（{pairBills.length}件）</span>
                        <button onClick={() => setSelectedPair(null)}
                          style={{ marginLeft: "auto", fontSize: 12, color: "#555555", background: "none",
                            border: "1px solid #dddddd", borderRadius: 6, padding: "4px 10px", cursor: "pointer" }}>
                          閉じる
                        </button>
                      </div>
                      <p style={{ fontSize: 11, color: "#555555", margin: "0 0 12px" }}>
                        会派は提出日の時点のものです。下の議員名の色は現在の会派を表します。
                      </p>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {pairBills.map((b) => (
                          <div key={b.id} className="card" style={{ padding: "14px 18px" }}>
                            <div style={{ marginBottom: 6 }}>
                              <span style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a" }}>{b.title}</span>
                            </div>
                            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 6 }}>
                              {b.submitted_at && <span>{b.submitted_at} 提出</span>}
                              {b.session_number && <span>第{b.session_number}回国会</span>}
                              {b.house && <span className="badge badge-house">{b.house}</span>}
                              {b.status && <span style={{ color: "#555555" }}>{b.status}</span>}
                              {b.honbun_url && <a href={b.honbun_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>本文↗</a>}
                              {b.keika_url && <a href={b.keika_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>経過↗</a>}
                            </div>
                            {b.submitter_ids && b.submitter_ids.length > 0 && (
                              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                                {b.submitter_ids.map((id) => {
                                  const m = memberMap[id];
                                  if (m) return <MemberChip key={id} id={id} name={m.name} alias_name={m.alias_name} faction={m.faction} is_active={m.is_active} />;
                                  const name = id.split("-").slice(1).join("-");
                                  return <span key={id} style={{ fontSize: 12, color: "#888888", background: "#f9f9f9", border: "1px solid #cccccc", borderRadius: 4, padding: "2px 8px", display: "inline-block", whiteSpace: "nowrap" }}>{name}</span>;
                                })}
                                {(b.submitter_extra_count ?? 0) > 0 && (
                                  <span style={{ fontSize: 12, color: "#888888", background: "#f9f9f9", border: "1px solid #cccccc", borderRadius: 4, padding: "2px 8px", display: "inline-block", whiteSpace: "nowrap" }}>他{b.submitter_extra_count}名</span>
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
                                          return m ? <MemberChip key={id} id={id} name={m.name} alias_name={m.alias_name} faction={m.faction} is_active={m.is_active} /> : null;
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

        {/* 委員会提出タブ */}
        {activeTab === "committee" && (
          <div className="card-xl">
            <p style={{ fontSize: 13, color: "#555555", marginBottom: 12 }}>
              委員長名義で提出された法案（超党派・全会一致が多い）。
            </p>
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
                {filtered.slice((billsPage - 1) * PAGE_SIZE, billsPage * PAGE_SIZE).map((b) => (
                  <div key={b.id} className="card" style={{ padding: "16px 20px" }}>
                    <div style={{ marginBottom: 8 }}>
                      <span style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a" }}>{b.title}</span>
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#555555" }}>
                      {b.submitted_at && <span>{b.submitted_at}</span>}
                      {b.session_number && <span>第{b.session_number}回国会</span>}
                      {b.house && <span className="badge badge-house">{b.house}</span>}
                      {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                      {b.honbun_url && <a href={b.honbun_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>本文↗</a>}
                      {b.keika_url && <a href={b.keika_url} target="_blank" rel="noopener noreferrer" style={{ color: "#555555", textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>経過↗</a>}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Paginator total={filtered.length} page={billsPage} onPage={setBillsPage} variant="bottom" />
          </div>
        )}

      </div>
    </div>
  );
}
