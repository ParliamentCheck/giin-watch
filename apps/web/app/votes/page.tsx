"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

interface VoteRow {
  member_id: string;
  vote: string;
  bill_title: string;
  vote_date: string;
  session_number: number;
}

// 政党ごとの採決での多数派: { billKey → { party → "賛成" | "反対" } }
type PartyPositions = Record<string, Record<string, string>>;

// 一致率マトリックス: { party → { party → { agree: number, total: number } } }
type AlignmentMatrix = Record<string, Record<string, { agree: number; total: number }>>;

function calcAlignment(
  votes: VoteRow[],
  memberParty: Record<string, string>,
): { matrix: AlignmentMatrix; parties: string[]; billCount: number } {
  const billVotes: Record<string, Record<string, string[]>> = {};
  for (const v of votes) {
    if (!v.member_id || !memberParty[v.member_id]) continue;
    if (v.vote !== "賛成" && v.vote !== "反対") continue;
    const key = `${v.vote_date}__${v.bill_title}`;
    const party = memberParty[v.member_id];
    if (!billVotes[key]) billVotes[key] = {};
    if (!billVotes[key][party]) billVotes[key][party] = [];
    billVotes[key][party].push(v.vote);
  }

  const positions: PartyPositions = {};
  for (const [bill, partyMap] of Object.entries(billVotes)) {
    positions[bill] = {};
    for (const [party, pvotes] of Object.entries(partyMap)) {
      const yes = pvotes.filter((v) => v === "賛成").length;
      const no = pvotes.filter((v) => v === "反対").length;
      if (yes + no === 0) continue;
      positions[bill][party] = yes >= no ? "賛成" : "反対";
    }
  }

  const partySet = new Set<string>();
  for (const p of Object.values(positions)) Object.keys(p).forEach((k) => partySet.add(k));
  const parties = Array.from(partySet).sort();

  const matrix: AlignmentMatrix = {};
  for (const p1 of parties) {
    matrix[p1] = {};
    for (const p2 of parties) {
      let agree = 0, total = 0;
      for (const pos of Object.values(positions)) {
        if (pos[p1] && pos[p2]) {
          total++;
          if (pos[p1] === pos[p2]) agree++;
        }
      }
      matrix[p1][p2] = { agree, total };
    }
  }

  return { matrix, parties, billCount: Object.keys(positions).length };
}

function alignColor(rate: number): string {
  if (rate >= 0.9) return "#166534";
  if (rate >= 0.7) return "#15803d";
  if (rate >= 0.5) return "#854d0e";
  return "#7f1d1d";
}

export default function VotesPage() {
  const [loading, setLoading] = useState(true);
  const [rawVotes, setRawVotes] = useState<VoteRow[]>([]);
  const [memberPartyMap, setMemberPartyMap] = useState<Record<string, string>>({});
  const [availableSessions, setAvailableSessions] = useState<number[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  useEffect(() => { document.title = "政党別採決一致率 | はたらく議員"; }, []);

  useEffect(() => {
    async function fetchData() {
      // 全 votes を取得（ページネーション）
      let allVotes: VoteRow[] = [];
      let from = 0;
      const PAGE = 1000;
      while (true) {
        const res = await supabase
          .from("votes")
          .select("member_id,vote,bill_title,vote_date,session_number")
          .range(from, from + PAGE - 1);
        const batch = res.data || [];
        allVotes = allVotes.concat(batch);
        if (batch.length < PAGE) break;
        from += PAGE;
      }

      const sessions = [...new Set(allVotes.map((v) => v.session_number))].filter(Boolean).sort() as number[];
      setAvailableSessions(sessions);

      // members の party 情報を取得
      const membersRes = await supabase.from("members").select("id,party").limit(2000);
      const memberParty: Record<string, string> = {};
      for (const m of membersRes.data || []) {
        memberParty[m.id] = m.party || "無所属";
      }

      setRawVotes(allVotes);
      setMemberPartyMap(memberParty);
      setLoading(false);
    }
    fetchData();
  }, []);

  // 全期間の集計（並び順の基準として常に固定）
  const fullResult = useMemo(
    () => calcAlignment(rawVotes, memberPartyMap),
    [rawVotes, memberPartyMap],
  );

  // 全期間の自民党一致率で決めた固定順
  const fixedOrder = useMemo(() => {
    const ref = "自民党";
    return [...fullResult.parties].sort((a, b) => {
      if (!fullResult.matrix[ref]) return 0;
      const ra = fullResult.matrix[ref][a]?.total > 0 ? fullResult.matrix[ref][a].agree / fullResult.matrix[ref][a].total : 0;
      const rb = fullResult.matrix[ref][b]?.total > 0 ? fullResult.matrix[ref][b].agree / fullResult.matrix[ref][b].total : 0;
      return rb - ra;
    });
  }, [fullResult]);

  // 絞り込み後の集計（selectedSession が null のとき全期間）
  const { matrix, parties, billCount, sessionRange } = useMemo(() => {
    const filtered = selectedSession
      ? rawVotes.filter((v) => v.session_number === selectedSession)
      : rawVotes;
    const result = calcAlignment(filtered, memberPartyMap);
    const range = selectedSession
      ? `第${selectedSession}回国会`
      : availableSessions.length === 0 ? ""
      : availableSessions.length === 1
        ? `第${availableSessions[0]}回国会`
        : `第${availableSessions[0]}〜${availableSessions[availableSessions.length - 1]}回国会`;
    return { ...result, sessionRange: range };
  }, [rawVotes, memberPartyMap, selectedSession, availableSessions]);

  // 固定順を維持しつつ、当該回次にデータのない政党は末尾に
  const sortedParties = fixedOrder.filter((p) => parties.includes(p))
    .concat(parties.filter((p) => !fixedOrder.includes(p)));

  return (
    <div style={{
      minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🗳 政党別採決一致率</h1>
        <p style={{ color: "#555555", fontSize: 13, marginBottom: 4 }}>
          参議院本会議の採決記録をもとに、政党間の投票行動の一致率を集計しています。
        </p>
        {!loading && (
          <p style={{ color: "#888888", fontSize: 12, marginBottom: 16 }}>
            対象: {sessionRange}（採決 {billCount} 件）
          </p>
        )}

        {/* 国会回次フィルター */}
        {!loading && availableSessions.length > 1 && (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 20 }}>
            <button
              onClick={() => setSelectedSession(null)}
              style={{
                padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                border: "1px solid",
                borderColor: selectedSession === null ? "#333333" : "#e0e0e0",
                background: selectedSession === null ? "#111111" : "transparent",
                color: selectedSession === null ? "#f4f4f4" : "#555555",
                fontWeight: selectedSession === null ? 700 : 400,
              }}>
              全期間
            </button>
            {availableSessions.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSession(s === selectedSession ? null : s)}
                style={{
                  padding: "5px 12px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                  border: "1px solid",
                  borderColor: selectedSession === s ? "#333333" : "#e0e0e0",
                  background: selectedSession === s ? "#111111" : "transparent",
                  color: selectedSession === s ? "#f4f4f4" : "#555555",
                  fontWeight: selectedSession === s ? 700 : 400,
                }}>
                第{s}回
              </button>
            ))}
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#555555" }}>データ計算中...</div>
        ) : parties.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#555555" }}>データがありません。</div>
        ) : (
          <>
            {/* マトリックス */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#888888",
                      borderBottom: "1px solid #e0e0e0", whiteSpace: "nowrap",
                      position: "sticky", left: 0, background: "#f4f4f4", zIndex: 2 }}>
                      政党
                    </th>
                    {sortedParties.map((p) => (
                      <th key={p} style={{ padding: "8px 6px", color: "#888888",
                        borderBottom: "1px solid #e0e0e0", whiteSpace: "nowrap",
                        writingMode: "vertical-rl", maxWidth: 28 }}>
                        {p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParties.map((rowParty) => (
                    <tr key={rowParty}>
                      <td style={{ padding: "6px 12px", whiteSpace: "nowrap",
                        color: "#444444", fontWeight: 600, fontSize: 12,
                        borderBottom: "1px solid #111111",
                        position: "sticky", left: 0, background: "#f4f4f4", zIndex: 1 }}>
                        {rowParty}
                      </td>
                      {sortedParties.map((colParty) => {
                        const cell = matrix[rowParty]?.[colParty];
                        if (!cell || cell.total === 0) {
                          return (
                            <td key={colParty} style={{ padding: "6px 4px", textAlign: "center",
                              background: "#f0f0f0", borderBottom: "1px solid #f4f4f4",
                              color: "#aaaaaa" }}>
                              —
                            </td>
                          );
                        }
                        const rate = cell.agree / cell.total;
                        const isSelf = rowParty === colParty;
                        return (
                          <td key={colParty}
                            title={`${rowParty} × ${colParty}: ${cell.agree}/${cell.total}件一致`}
                            style={{
                              padding: "6px 4px", textAlign: "center",
                              background: isSelf ? "#e0e0e0" : alignColor(rate),
                              color: isSelf ? "#888888" : "#1a1a1a",
                              borderBottom: "1px solid #f4f4f4",
                              fontWeight: isSelf ? 400 : 700,
                              cursor: "default",
                            }}>
                            {isSelf ? "—" : `${Math.round(rate * 100)}%`}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 凡例 */}
            <div style={{ display: "flex", gap: 16, marginTop: 20, fontSize: 11, color: "#555555", flexWrap: "wrap" }}>
              {[
                { color: "#166534", label: "90%以上" },
                { color: "#15803d", label: "70〜89%" },
                { color: "#854d0e", label: "50〜69%" },
                { color: "#7f1d1d", label: "50%未満" },
              ].map((item) => (
                <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ width: 14, height: 14, background: item.color, borderRadius: 2 }} />
                  {item.label}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "#c8c8c8", marginTop: 12 }}>
              ※ 各党の多数派（賛成または反対）が一致した採決の割合。欠席は集計対象外。参議院のみ。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
