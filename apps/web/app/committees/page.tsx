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
  useEffect(() => { document.title = "委員会一覧 | はたらく議員"; }, []);

  useEffect(() => {
    async function fetchCommittees() {
      const { data, error } = await supabase
        .from("committee_members")
        .select("committee, house")
        .limit(2000);

      if (error) {
        console.error(error);
        setLoading(false);
        return;
      }

      // 委員会ごとに所属人数を集計（member_idベースで重複排除）
      const countMap: Record<string, number> = {};
      const houseMap: Record<string, string> = {};
      for (const row of data || []) {
        const name = row.committee?.trim();
        if (!name) continue;
        countMap[name] = (countMap[name] || 0) + 1;
        if (!houseMap[name]) houseMap[name] = row.house || "その他";
      }

      const result: CommitteeStats[] = Object.entries(countMap)
        .map(([committee, count]) => ({
          committee,
          count,
          house: houseMap[committee] || "その他",
        }))
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
    <div style={{ minHeight: "100vh", background: "#0a0a0a", color: "#e8e8e8",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>

      <div style={{ maxWidth: 900, margin: "0 auto" }}>

        <button onClick={() => router.push("/")}
          style={{ background: "transparent", border: "1px solid #383838", color: "#999999",
            padding: "8px 16px", borderRadius: 8, cursor: "pointer", marginBottom: 24,
            fontSize: 14 }}>
          ← トップに戻る
        </button>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>🏛 委員会一覧</h1>
        <p style={{ color: "#777777", marginBottom: 24, fontSize: 14 }}>
          現在の委員会・調査会ごとの所属議員数
        </p>

        {/* フィルター */}
        <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
          <input
            type="text"
            placeholder="委員会名で検索"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ flex: 1, minWidth: 200, background: "#1e1e1e", border: "1px solid #383838",
              color: "#e8e8e8", padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}
          />
          <select value={selectedHouse} onChange={(e) => setSelectedHouse(e.target.value)}
            style={{ background: "#1e1e1e", border: "1px solid #383838", color: "#e8e8e8",
              padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}>
            <option value="">衆院・参院すべて</option>
            <option value="衆議院">衆議院</option>
            <option value="参議院">参議院</option>
          </select>
          {(search || selectedHouse) && (
            <button onClick={() => { setSearch(""); setSelectedHouse(""); }}
              style={{ background: "#383838", border: "none", color: "#999999",
                padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
              クリア
            </button>
          )}
        </div>

        <p style={{ color: "#555555", marginBottom: 16, fontSize: 14 }}>
          {filtered.length}件の委員会・調査会
        </p>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#777777" }}>
            データ読み込み中...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#777777" }}>
            該当する委員会がありません。
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((c) => {
              const barWidth = (c.count / maxCount) * 100;
              const houseColor = c.house === "衆議院" ? "#d0d0d0" : "#888888";

              return (
                <div key={c.committee}
                  onClick={() => router.push(`/committees/${encodeURIComponent(c.committee)}`)}
                  style={{ background: "#141414", border: "1px solid #1e1e1e",
                    borderRadius: 12, padding: "16px 20px", cursor: "pointer",
                    transition: "border-color 0.2s" }}
                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = houseColor; }}
                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#1e1e1e"; }}>

                  <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#f0f0f0", marginBottom: 4 }}>
                        {c.committee}
                      </div>
                      <span style={{ background: houseColor + "22", color: houseColor,
                        border: `1px solid ${houseColor}44`,
                        padding: "1px 6px", borderRadius: 4, fontSize: 11 }}>
                        {c.house}
                      </span>
                    </div>

                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <span style={{ fontSize: 18, fontWeight: 800, color: "#f0f0f0" }}>
                        {c.count}
                      </span>
                      <span style={{ fontSize: 12, color: "#777777", marginLeft: 4 }}>名</span>
                    </div>
                  </div>

                  <div style={{ background: "#1e1e1e", borderRadius: 4, height: 4, overflow: "hidden" }}>
                    <div style={{ width: `${barWidth}%`, height: "100%",
                      background: houseColor, borderRadius: 4, transition: "width 0.8s ease" }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
