"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface VoteRow {
  member_id: string;
  vote: string;
  bill_title: string;
  vote_date: string;
  session_number: number;
}

type PartyPositions = Record<string, Record<string, string>>;
type AlignmentMatrix = Record<string, Record<string, { agree: number; total: number }>>;

// スマホで読める短縮名（列ヘッダー用）
const PARTY_SHORT: Record<string, string> = {
  "自民党":       "自民",
  "立憲民主党":   "立憲",
  "中道改革連合": "中道改革",
  "公明党":       "公明",
  "日本維新の会": "維新",
  "国民民主党":   "国民",
  "共産党":       "共産",
  "れいわ新選組": "れいわ",
  "社民党":       "社民",
  "参政党":       "参政",
  "チームみらい": "みらい",
  "日本保守党":   "保守",
  "沖縄の風":     "沖縄風",
  "有志の会":     "有志",
  "無所属":       "無所属",
};

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
      const no  = pvotes.filter((v) => v === "反対").length;
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
  if (rate >= 0.9) return "#bbf7d0";
  if (rate >= 0.7) return "#d1fae5";
  if (rate >= 0.5) return "#fef9c3";
  return "#fee2e2";
}

function alignTextColor(rate: number): string {
  if (rate >= 0.9) return "#166534";
  if (rate >= 0.7) return "#166534";
  if (rate >= 0.5) return "#854d0e";
  return "#991b1b";
}

function VotesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => { document.title = "政党別採決一致率 | はたらく議員"; }, []);

  const [loading, setLoading]               = useState(true);
  const [rawVotes, setRawVotes]             = useState<VoteRow[]>([]);
  const [memberPartyMap, setMemberPartyMap] = useState<Record<string, string>>({});
  const [availableSessions, setAvailableSessions] = useState<number[]>([]);

  // URLの ?session= を読み取り
  const selectedSession = useMemo(() => {
    const v = searchParams.get("session");
    return v ? Number(v) : null;
  }, [searchParams]);

  const setSelectedSession = (s: number | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (s === null) {
      params.delete("session");
    } else {
      params.set("session", String(s));
    }
    router.replace(`/votes?${params.toString()}`);
  };

  useEffect(() => {
    async function fetchData() {
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

      const sessions = [...new Set(allVotes.map((v) => v.session_number))]
        .filter(Boolean).sort() as number[];
      setAvailableSessions(sessions);

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

  const fullResult = useMemo(
    () => calcAlignment(rawVotes, memberPartyMap),
    [rawVotes, memberPartyMap],
  );

  const fixedOrder = useMemo(() => {
    const ref = "自民党";
    return [...fullResult.parties].sort((a, b) => {
      if (!fullResult.matrix[ref]) return 0;
      const ra = fullResult.matrix[ref][a]?.total > 0
        ? fullResult.matrix[ref][a].agree / fullResult.matrix[ref][a].total : 0;
      const rb = fullResult.matrix[ref][b]?.total > 0
        ? fullResult.matrix[ref][b].agree / fullResult.matrix[ref][b].total : 0;
      return rb - ra;
    });
  }, [fullResult]);

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

        {/* 国会回次フィルター（プルダウン） */}
        {!loading && availableSessions.length > 1 && (
          <div style={{ marginBottom: 20 }}>
            <select
              value={selectedSession ?? ""}
              onChange={(e) => setSelectedSession(e.target.value === "" ? null : Number(e.target.value))}
              className="input-field"
              style={{ minWidth: 160 }}>
              <option value="">全期間</option>
              {availableSessions.map((s) => (
                <option key={s} value={s}>第{s}回国会</option>
              ))}
            </select>
          </div>
        )}

        {loading ? (
          <div className="loading-block">
            <div className="loading-spinner" />
            <span>採決データを読み込んでいます...</span>
          </div>
        ) : parties.length === 0 ? (
          <div className="empty-state">データがありません。</div>
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
                      <th key={p} style={{ padding: "6px 4px", color: "#888888",
                        borderBottom: "1px solid #e0e0e0",
                        writingMode: "vertical-rl", textOrientation: "mixed",
                        whiteSpace: "nowrap", minWidth: 28, fontSize: 11 }}>
                        {PARTY_SHORT[p] ?? p}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sortedParties.map((rowParty) => (
                    <tr key={rowParty}>
                      <td style={{ padding: "6px 12px", whiteSpace: "nowrap",
                        color: "#444444", fontWeight: 600, fontSize: 12,
                        borderBottom: "1px solid #e0e0e0",
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
                        const rate   = cell.agree / cell.total;
                        const isSelf = rowParty === colParty;
                        return (
                          <td key={colParty}
                            title={`${rowParty} × ${colParty}: ${cell.agree}/${cell.total}件一致`}
                            style={{
                              padding: "6px 4px", textAlign: "center",
                              background: isSelf ? "#e8e8e8" : alignColor(rate),
                              color: isSelf ? "#888888" : alignTextColor(rate),
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
                { color: "#bbf7d0", label: "90%以上" },
                { color: "#d1fae5", label: "70〜89%" },
                { color: "#fef9c3", label: "50〜69%" },
                { color: "#fee2e2", label: "50%未満" },
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

export default function VotesPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#f4f4f4", padding: "24px" }}>
        <div className="loading-block">
          <div className="loading-spinner" />
          <span>採決データを読み込んでいます...</span>
        </div>
      </div>
    }>
      <VotesContent />
    </Suspense>
  );
}
