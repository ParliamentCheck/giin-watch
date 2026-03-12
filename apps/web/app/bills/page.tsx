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
}

export default function BillsPage() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  useEffect(() => { document.title = "議員立法 | はたらく議員"; }, []);
  const [isComposing, setIsComposing] = useState(false);
  const [filterHouse, setFilterHouse] = useState<string>("全て");

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
          .select("id,name")
          .limit(2000),
      ]);
      setBills(billsRes.data || []);
      const map: Record<string, MemberInfo> = {};
      for (const m of membersRes.data || []) {
        map[m.id] = m;
      }
      setMemberMap(map);
      setLoading(false);
    }
    fetchData();
  }, []);

  const filtered = bills.filter((b) => {
    if (filterHouse !== "全て" && b.house !== filterHouse) return false;
    if (search && !isComposing) {
      const q = search.toLowerCase();
      if (!b.title?.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div style={{
      minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>📋 議員立法</h1>
        <p style={{ color: "#555555", fontSize: 13, marginBottom: 20 }}>
          {loading ? "読み込み中..." : `${filtered.length} 件`}
        </p>

        {/* フィルター・検索 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
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
            style={{
              background: "#ffffff", border: "1px solid #e0e0e0",
              color: "#1a1a1a", padding: "8px 14px", borderRadius: 8,
              fontSize: 13, flex: 1, minWidth: 200, outline: "none",
            }}
          />
        </div>

        {/* 一覧 */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#555555" }}>データ読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#555555" }}>該当する法案がありません。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((b) => (
              <div key={b.id} style={{
                background: "#ffffff", border: "1px solid #e0e0e0",
                borderRadius: 12, padding: "16px 20px",
              }}>
                {/* タイトル */}
                <div style={{ marginBottom: 8 }}>
                  {b.source_url ? (
                    <a href={b.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14,
                        textDecoration: "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#333333")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#1a1a1a")}>
                      {b.title}
                    </a>
                  ) : (
                    <span style={{ color: "#1a1a1a", fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                  )}
                </div>

                {/* メタ情報 */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 8 }}>
                  {b.submitted_at && <span>{b.submitted_at}</span>}
                  {b.session_number && <span>第{b.session_number}回国会</span>}
                  {b.house && (
                    <span style={{
                      background: b.house === "衆議院" ? "#e8e8e8" : "#e8e8e8",
                      color: b.house === "衆議院" ? "#555555" : "#555555",
                      padding: "1px 8px", borderRadius: 4,
                    }}>
                      {b.house}
                    </span>
                  )}
                  {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                </div>

                {/* 提出者 */}
                {b.submitter_ids && b.submitter_ids.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ color: "#888888" }}>提出者:</span>
                    {b.submitter_ids.map((id) => {
                      const m = memberMap[id];
                      return m ? (
                        <span
                          key={id}
                          onClick={() => router.push(`/members/${encodeURIComponent(id)}`)}
                          style={{ color: "#333333", cursor: "pointer" }}
                          onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                          onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}>
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
    </div>
  );
}
