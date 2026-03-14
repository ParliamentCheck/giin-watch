"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Bill {
  id: string;
  title: string;
  submitted_at: string | null;
  status: string | null;
  session_number: number | null;
  house: string | null;
  submitter_ids: string[] | null;
  source_url: string | null;
}

interface MemberInfo {
  id: string;
  name: string;
  party: string;
  prev_party: string | null;
}

interface PairStat {
  a: string;
  b: string;
  count: number;
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
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<"list" | "network">("list");

  // 一覧タブ用
  const [bills, setBills] = useState<Bill[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [filterHouse, setFilterHouse] = useState<string>("全て");

  // ネットワークタブ用
  const [topPairs, setTopPairs] = useState<PairStat[]>([]);
  const [matrixParties, setMatrixParties] = useState<string[]>([]);
  const [matrix, setMatrix] = useState<Record<string, Record<string, number>>>({});
  const [networkLoading, setNetworkLoading] = useState(true);
  const [effectivePartyMap, setEffectivePartyMap] = useState<Record<string, string>>({});
  const [selectedPair, setSelectedPair] = useState<{ a: string; b: string } | null>(null);

  useEffect(() => {
    async function fetchData() {
      const [billsRes, membersRes] = await Promise.all([
        supabase
          .from("bills")
          .select("id,title,submitted_at,status,session_number,house,submitter_ids,source_url")
          .order("submitted_at", { ascending: false })
          .limit(1000),
        supabase
          .from("members")
          .select("id,name,party,prev_party")
          .limit(2000),
      ]);

      const bills = billsRes.data || [];
      setBills(bills);

      const map: Record<string, MemberInfo> = {};
      for (const m of membersRes.data || []) map[m.id] = m;
      setMemberMap(map);
      setLoading(false);

      // ネットワーク計算（同じfetchデータを流用）
      const effectiveParty: Record<string, string> = {};
      for (const m of membersRes.data || []) {
        effectiveParty[m.id] =
          m.party === "中道改革連合" && m.prev_party ? m.prev_party : m.party;
      }
      setEffectivePartyMap(effectiveParty);

      const pairCount: Record<string, number> = {};
      for (const bill of bills) {
        const ids = ((bill.submitter_ids || []) as string[]).filter(
          (id) => effectiveParty[id]
        );
        const billParties = [...new Set(ids.map((id) => effectiveParty[id]))];
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

  const filtered = bills.filter((b) => {
    if (filterHouse !== "全て" && b.house !== filterHouse) return false;
    if (search && !isComposing) {
      if (!b.title?.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const maxCount = Math.max(
    1,
    ...Object.values(matrix).flatMap((row) => Object.values(row))
  );

  return (
    <div style={{
      minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* タイトルカード */}
        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 0 }}>📋 議員立法</h1>
        </div>

        {/* タブ（独立した枠） */}
        <div className="tab-bar-container" style={{ marginBottom: 16 }}>
          {(["list", "network"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)}
              style={{ flex: 1, padding: "10px 0" }}
              className={`tab-pill${activeTab === tab ? " active" : ""}`}>
              {tab === "list" ? "一覧" : "🤝 政党ネットワーク"}
            </button>
          ))}
        </div>

        {/* 一覧タブ */}
        {activeTab === "list" && (
          <div className="card-xl">
            {/* 検索・フィルター（一覧カード最上部） */}
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
            <p style={{ color: "#555555", fontSize: 13, marginBottom: 12 }}>
              {loading ? "読み込み中..." : `${filtered.length} 件`}
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
                {filtered.map((b) => (
                  <div key={b.id} className="card" style={{ padding: "16px 20px" }}>
                    <div style={{ marginBottom: 8 }}>
                      {b.source_url ? (
                        <a href={b.source_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a",
                            textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>
                          {b.title}
                          <span style={{ marginLeft: 4, color: "#aaaaaa", fontSize: 11 }}>↗</span>
                        </a>
                      ) : (
                        <span style={{ color: "#888888", fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 8 }}>
                      {b.submitted_at && <span>{b.submitted_at}</span>}
                      {b.session_number && <span>第{b.session_number}回国会</span>}
                      {b.house && <span className="badge badge-house">{b.house}</span>}
                      {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                    </div>
                    {b.submitter_ids && b.submitter_ids.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                        <span style={{ color: "#888888" }}>提出者:</span>
                        {b.submitter_ids.map((id) => {
                          const m = memberMap[id];
                          return m ? (
                            <span key={id}
                              onClick={() => router.push(`/members/${encodeURIComponent(id)}`)}
                              className="link-underline-hover">
                              {m.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 政党ネットワークタブ：説明 + TOP10 */}
        {activeTab === "network" && (
          <div className="card-xl">
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
        )}

        {/* 政党ネットワークタブ：マトリックス */}
        {activeTab === "network" && !networkLoading && (
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

        {/* ドリルダウン：選択ペアの法案一覧 */}
        {activeTab === "network" && selectedPair && (() => {
          const { a, b } = selectedPair;
          const pairBills = bills.filter((bill) => {
            const ids = (bill.submitter_ids || []).filter((id) => memberMap[id]);
            const parties = new Set(ids.map((id) => {
              const m = memberMap[id];
              return m.party === "中道改革連合" && m.prev_party ? m.prev_party : m.party;
            }));
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
                      {b.source_url ? (
                        <a href={b.source_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontWeight: 600, fontSize: 13, color: "#1a1a1a",
                            textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>
                          {b.title}
                          <span style={{ marginLeft: 4, color: "#aaaaaa", fontSize: 11 }}>↗</span>
                        </a>
                      ) : (
                        <span style={{ fontWeight: 600, fontSize: 13, color: "#555555" }}>{b.title}</span>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 6 }}>
                      {b.submitted_at && <span>{b.submitted_at}</span>}
                      {b.session_number && <span>第{b.session_number}回国会</span>}
                      {b.house && <span className="badge badge-house">{b.house}</span>}
                      {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                    </div>
                    {b.submitter_ids && b.submitter_ids.length > 0 && (
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                        <span style={{ color: "#888888" }}>提出者:</span>
                        {b.submitter_ids.map((id) => {
                          const m = memberMap[id];
                          return m ? (
                            <span key={id}
                              onClick={() => router.push(`/members/${encodeURIComponent(id)}`)}
                              className="link-underline-hover">
                              {m.name}
                            </span>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

      </div>
    </div>
  );
}
