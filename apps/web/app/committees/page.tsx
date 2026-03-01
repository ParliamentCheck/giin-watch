"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface CommitteeStats {
  committee: string;
  count: number;
  house: string;
}

export default function CommitteesPage() {
  const router = useRouter();
  const [committees, setCommittees] = useState<CommitteeStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHouse, setSelectedHouse] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    async function fetchCommittees() {
      const { data, error } = await supabase
        .from("speeches")
        .select("committee")
        .neq("committee", "");

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      // 委員会ごとに集計
      const countMap: Record<string, number> = {};
      for (const row of data || []) {
        const name = row.committee?.trim();
        if (!name) continue;
        countMap[name] = (countMap[name] || 0) + 1;
      }

      // 院を推定（本会議・衆議院→衆議院、参議院→参議院）
      const result: CommitteeStats[] = Object.entries(countMap)
        .map(([committee, count]) => {
          let house = "その他";
          if (committee.includes("衆議院") || committee.includes("衆院")) house = "衆議院";
          else if (committee.includes("参議院") || committee.includes("参院")) house = "参議院";
          return { committee, count, house };
        })
        .sort((a, b) => b.count - a.count);

      setCommittees(result);
      setLoading(false);
    }
    fetchCommittees();
  }, []);

  const filtered = committees.filter((c) => {
    if (selectedHouse && c.house !== selectedHouse) return false;
    if (search && !c.committee.includes(search)) return false;
    return true;
  });

  const maxCount = filtered[0]?.count || 1;

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        {/* ヘッダー */}
        <button onClick={() => router.push("/")}
          style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8",
            padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24,
            fontSize: 14 }}>
          ← トップに戻る
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🏛 委員会別発言数</h1>
        <p style={{ color: "#64748b", marginBottom: 24, fontSize: 14 }}>
          第219〜221回国会の委員会・本会議別の発言件数（収録済みデータに基づく）
        </p>

        {/* フィルター */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="委員会名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, background: "#1e293b", border: "1px solid #334155",
              color: "#e2e8f0", padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}
          />
          <select value={selectedHouse} onChange={(e) => setSelectedHouse(e.target.value)}
            style={{ background: "#1e293b", border: "1px solid #334155", color: "#e2e8f0",
              padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}>
            <option value="">🏛 衆院・参院・その他</option>
            <option value="衆議院">衆議院</option>
            <option value="参議院">参議院</option>
            <option value="その他">その他</option>
          </select>
          {(search || selectedHouse) && (
            <button onClick={() => { setSearch(""); setSelectedHouse(""); }}
              style={{ background: "#334155", border: "none", color: "#94a3b8",
                padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
              クリア
            </button>
          )}
        </div>

        <p style={{ color: "#475569", marginBottom: 16, fontSize: 14 }}>
          {filtered.length}件の委員会・会議
        </p>

        {/* 委員会リスト */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
            データ読み込み中...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>
            データ収集中です。しばらくお待ちください。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((c, i) => {
              const barWidth = (c.count / maxCount) * 100;
              const houseColor = c.house === "衆議院" ? "#3b82f6"
                : c.house === "参議院" ? "#8b5cf6" : "#64748b";

              return (
                <div key={c.committee}
                  style={{ background: "#0f172a", border: "1px solid #1e293b",
                    borderRadius: 12, padding: "16px 20px" }}>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    {/* 順位 */}
                    <div style={{ fontSize: 13, color: "#475569", minWidth: 28, textAlign: "right" }}>
                      {i + 1}
                    </div>

                    {/* 委員会名 */}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#f1f5f9", marginBottom: 2 }}>
                        {c.committee}
                      </div>
                      <span style={{ background: houseColor + "22", color: houseColor,
                        border: `1px solid ${houseColor}44`,
                        padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>
                        {c.house}
                      </span>
                    </div>

                    {/* 発言数 */}
                    <div style={{ textAlign: "right", flexShrink: 0, minWidth: 60 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "#f1f5f9" }}>
                        {c.count.toLocaleString()}
                      </span>
                      <span style={{ fontSize: 12, color: "#64748b", marginLeft: 4 }}>件</span>
                    </div>
                  </div>

                  {/* バー */}
                  <div style={{ background: "#1e293b", borderRadius: 4, height: 4, overflow: "hidden" }}>
                    <div style={{ width: `${barWidth}%`, height: "100%",
                      background: houseColor, borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 注意書き */}
        <div style={{ marginTop: 32, padding: 16, background: "#0f172a",
          border: "1px solid #1e293b", borderRadius: 12, fontSize: 12, color: "#475569" }}>
          ※ 発言件数は国立国会図書館「国会会議録検索システム」に登録された発言数です。
          データ収集が完了するまで件数が少なく表示される場合があります。
        </div>
      </div>
    </div>
  );
}