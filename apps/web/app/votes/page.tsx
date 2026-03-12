"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

interface VoteRow {
  member_id: string;
  vote: string;
  bill_title: string;
  vote_date: string;
  session_number: number;
}

interface Member {
  id: string;
  party: string;
}

// 政党ごとの採決での多数派: { billKey → { party → "賛成" | "反対" } }
type PartyPositions = Record<string, Record<string, string>>;

// 一致率マトリックス: { party → { party → { agree: number, total: number } } }
type AlignmentMatrix = Record<string, Record<string, { agree: number; total: number }>>;

function calcAlignment(
  votes: VoteRow[],
  memberParty: Record<string, string>,
): { matrix: AlignmentMatrix; parties: string[]; billCount: number } {
  // bill ごとに party の投票をまとめる
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

  // 各 bill の党ごと多数派ポジションを決定
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

  // 全政党一覧
  const partySet = new Set<string>();
  for (const p of Object.values(positions)) Object.keys(p).forEach((k) => partySet.add(k));
  const parties = Array.from(partySet).sort();

  // ペアごとの一致率を計算
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

function alignTextColor(rate: number): string {
  return "#e2e8f0";
}

export default function VotesPage() {
  const [loading, setLoading] = useState(true);
  const [matrix, setMatrix] = useState<AlignmentMatrix>({});
  const [parties, setParties] = useState<string[]>([]);
  const [billCount, setBillCount] = useState(0);
  const [sessionRange, setSessionRange] = useState("");

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

      // 参加セッション範囲
      const sessions = [...new Set(allVotes.map((v) => v.session_number))].filter(Boolean).sort();
      if (sessions.length > 0) {
        setSessionRange(
          sessions.length === 1
            ? `第${sessions[0]}回国会`
            : `第${sessions[0]}〜${sessions[sessions.length - 1]}回国会`,
        );
      }

      // members の party 情報を取得
      const membersRes = await supabase
        .from("members")
        .select("id,party")
        .limit(2000);
      const memberParty: Record<string, string> = {};
      for (const m of membersRes.data || []) {
        memberParty[m.id] = m.party || "無所属";
      }

      const result = calcAlignment(allVotes, memberParty);
      setMatrix(result.matrix);
      setParties(result.parties);
      setBillCount(result.billCount);
      setLoading(false);
    }
    fetchData();
  }, []);

  // 自民党との一致率でソート（自民がなければアルファベット順）
  const sortedParties = [...parties].sort((a, b) => {
    const ref = "自民党";
    if (!matrix[ref]) return 0;
    const ra = matrix[ref][a]?.total > 0 ? matrix[ref][a].agree / matrix[ref][a].total : 0;
    const rb = matrix[ref][b]?.total > 0 ? matrix[ref][b].agree / matrix[ref][b].total : 0;
    return rb - ra;
  });

  return (
    <div style={{
      minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🗳 政党別採決一致率</h1>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 4 }}>
          参議院本会議の採決記録をもとに、政党間の投票行動の一致率を集計しています。
        </p>
        {!loading && (
          <p style={{ color: "#475569", fontSize: 12, marginBottom: 24 }}>
            対象: {sessionRange}（採決 {billCount} 件）
          </p>
        )}

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>データ計算中...</div>
        ) : parties.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>データがありません。</div>
        ) : (
          <>
            {/* マトリックス */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", fontSize: 11, width: "100%" }}>
                <thead>
                  <tr>
                    <th style={{ padding: "8px 12px", textAlign: "left", color: "#475569",
                      borderBottom: "1px solid #1e293b", whiteSpace: "nowrap",
                      position: "sticky", left: 0, background: "#020817", zIndex: 2 }}>
                      政党
                    </th>
                    {sortedParties.map((p) => (
                      <th key={p} style={{ padding: "8px 6px", color: "#475569",
                        borderBottom: "1px solid #1e293b", whiteSpace: "nowrap",
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
                        color: "#cbd5e1", fontWeight: 600, fontSize: 12,
                        borderBottom: "1px solid #0f172a",
                        position: "sticky", left: 0, background: "#020817", zIndex: 1 }}>
                        {rowParty}
                      </td>
                      {sortedParties.map((colParty) => {
                        const cell = matrix[rowParty]?.[colParty];
                        if (!cell || cell.total === 0) {
                          return (
                            <td key={colParty} style={{ padding: "6px 4px", textAlign: "center",
                              background: "#0f172a", borderBottom: "1px solid #020817",
                              color: "#1e293b" }}>
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
                              background: isSelf ? "#1e293b" : alignColor(rate),
                              color: isSelf ? "#475569" : alignTextColor(rate),
                              borderBottom: "1px solid #020817",
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
            <div style={{ display: "flex", gap: 16, marginTop: 20, fontSize: 11, color: "#64748b", flexWrap: "wrap" }}>
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
            <p style={{ fontSize: 11, color: "#334155", marginTop: 12 }}>
              ※ 各党の多数派（賛成または反対）が一致した採決の割合。欠席は集計対象外。参議院のみ。
            </p>
          </>
        )}
      </div>
    </div>
  );
}
