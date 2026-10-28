"use client";

import { Suspense, useMemo } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { FactionVoteAlignment } from "../../lib/types";
import { factionColor } from "../../lib/factions";
import { ListNotices } from "../components/Notices";

function alignColor(rate: number): string {
  if (rate >= 0.9) return "#cfd8e3";
  if (rate >= 0.7) return "#dfe5ec";
  if (rate >= 0.5) return "#edf0f4";
  return "#f8f9fb";
}

// 文字色は一致の割合によらず一定（良し悪しを連想させる色分けをしない）
const ALIGN_TEXT_COLOR = "#1f2937";

function VotesContent({ alignments, voteCounts }: {
  alignments: FactionVoteAlignment[] | null;
  voteCounts: Record<number, number>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const sessions = useMemo(
    () => [...new Set((alignments ?? []).map((a) => a.session_number))].sort((a, b) => b - a),
    [alignments],
  );
  const requested = Number(searchParams.get("session"));
  const session = sessions.includes(requested) ? requested : sessions[0];

  const setSession = (s: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("session", String(s));
    router.replace(`/votes?${params.toString()}`, { scroll: false });
  };

  const { factions, cell } = useMemo(() => {
    const rows = (alignments ?? []).filter((a) => a.session_number === session);
    const names = new Set<string>();
    const map = new Map<string, FactionVoteAlignment>();
    for (const r of rows) {
      names.add(r.faction_a); names.add(r.faction_b);
      map.set(`${r.faction_a}|${r.faction_b}`, r);
      map.set(`${r.faction_b}|${r.faction_a}`, r);
    }
    return {
      // 並び順は会派名の順（一致の割合で並べない）
      factions: [...names].sort((a, b) => a.localeCompare(b, "ja")),
      cell: (a: string, b: string) => map.get(`${a}|${b}`),
    };
  }, [alignments, session]);

  return (
    <div style={{
      minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      padding: "24px",
    }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🗳 会派別の採決一致</h1>
          <p style={{ color: "#555555", fontSize: 13, marginBottom: 8, lineHeight: 1.7 }}>
            参議院本会議の投票結果ページに記載された<strong>会派別の票数</strong>をもとに、2つの会派の賛否が一致した採決の割合を、国会の回次ごとに集計しています。
            会派は採決の時点のものです。
          </p>
          {session !== undefined && (
            <p style={{ color: "#555555", fontSize: 12, marginBottom: 12 }}>
              対象: 第{session}回国会（会派別の票数が記録されている採決 {(voteCounts[session] ?? 0).toLocaleString()} 件）
            </p>
          )}
          {sessions.length > 1 && (
            <select
              value={session}
              onChange={(e) => setSession(Number(e.target.value))}
              className="input-field"
              aria-label="国会の回次"
              style={{ minWidth: 160 }}>
              {sessions.map((s) => (
                <option key={s} value={s}>第{s}回国会</option>
              ))}
            </select>
          )}
        </div>

        <div className="card-xl">
          {alignments === null ? (
            <div className="empty-state">採決のデータを取得できませんでした。時間をおいて再度お試しください。</div>
          ) : factions.length === 0 ? (
            <div className="empty-state">該当する採決はありません（0件）。</div>
          ) : (
            <>
              <div style={{ overflowX: "auto" }}>
                <table style={{ borderCollapse: "collapse", fontSize: 11 }}>
                  <thead>
                    <tr>
                      <th scope="col" style={{ padding: "8px 12px", textAlign: "left", color: "#555555",
                        borderBottom: "1px solid #e0e0e0", whiteSpace: "nowrap", verticalAlign: "bottom",
                        position: "sticky", left: 0, background: "#ffffff", zIndex: 2 }}>
                        会派
                      </th>
                      {factions.map((f) => (
                        <th key={f} scope="col" style={{ padding: "6px 4px", color: "#333333", fontWeight: 600,
                          borderBottom: `3px solid ${factionColor(f)}`, writingMode: "vertical-rl", whiteSpace: "nowrap",
                          textAlign: "end", minWidth: 44, fontSize: 11, letterSpacing: 1 }}>
                          {f}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {factions.map((row) => (
                      <tr key={row}>
                        <th scope="row" style={{ padding: "6px 12px", whiteSpace: "nowrap", textAlign: "left",
                          color: "#333333", fontWeight: 600, fontSize: 12,
                          borderBottom: "1px solid #e0e0e0", borderLeft: `3px solid ${factionColor(row)}`,
                          position: "sticky", left: 0, background: "#ffffff", zIndex: 1 }}>
                          {row}
                        </th>
                        {factions.map((col) => {
                          if (row === col) {
                            return <td key={col} style={{ padding: "6px 4px", textAlign: "center", background: "#e8e8e8", color: "#888888", borderBottom: "1px solid #f4f4f4" }}>—</td>;
                          }
                          const c = cell(row, col);
                          if (!c || c.total_count === 0) {
                            return <td key={col} style={{ padding: "6px 4px", textAlign: "center", background: "#f0f0f0", color: "#888888", borderBottom: "1px solid #f4f4f4" }}>—</td>;
                          }
                          const rate = c.agree_count / c.total_count;
                          return (
                            <td key={col}
                              title={`${row} × ${col}: ${c.total_count}件中 ${c.agree_count}件で賛否が一致`}
                              style={{
                                padding: "4px 4px", textAlign: "center", lineHeight: 1.2,
                                background: alignColor(rate), color: ALIGN_TEXT_COLOR,
                                borderBottom: "1px solid #f4f4f4",
                              }}>
                              <div style={{ fontWeight: 700 }}>{Math.round(rate * 100)}%</div>
                              <div style={{ fontSize: 10, color: "#555555" }}>{c.agree_count}/{c.total_count}</div>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: "flex", gap: 16, marginTop: 20, fontSize: 11, color: "#555555", flexWrap: "wrap" }}>
                {[
                  { color: "#cfd8e3", label: "90%以上" },
                  { color: "#dfe5ec", label: "70〜89%" },
                  { color: "#edf0f4", label: "50〜69%" },
                  { color: "#f8f9fb", label: "50%未満" },
                ].map((item) => (
                  <div key={item.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <div style={{ width: 14, height: 14, background: item.color, borderRadius: 2 }} />
                    {item.label}
                  </div>
                ))}
              </div>
              <ul style={{ fontSize: 12, color: "#555555", margin: "12px 0 0", paddingLeft: 18, lineHeight: 1.8 }}>
                <li>各セルの上段は一致した割合、下段は「一致した採決 / 2つの会派がともに対象になった採決」の件数です。対象の採決が少ない回次は、割合が大きく動きます。</li>
                <li>会派の賛否は、その採決の会派別の票数で賛成票が多ければ賛成、反対票が多ければ反対としています。賛成と反対が同数の場合と、票がない場合（投票なしのみ）は、その採決では対象外です。</li>
                <li>参議院のみです（衆議院本会議は議員ごとの投票記録が公開されていません）。参議院でも起立採決や異議なし採決は会派別の票数が記録されないため含まれません。</li>
                <li>並び順は会派名の順です。</li>
              </ul>
              <ListNotices sort={false} style={{ marginTop: 8 }} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function VotesClient(props: {
  alignments: FactionVoteAlignment[] | null;
  voteCounts: Record<number, number>;
}) {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#f4f4f4", padding: "24px" }}>
        <div className="loading-block">
          <div className="loading-spinner" />
          <span>採決データを読み込んでいます...</span>
        </div>
      </div>
    }>
      <VotesContent {...props} />
    </Suspense>
  );
}
