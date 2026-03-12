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
      minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px",
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 4 }}>📋 議員立法</h1>
        <p style={{ color: "#64748b", fontSize: 13, marginBottom: 20 }}>
          {loading ? "読み込み中..." : `${filtered.length} 件`}
        </p>

        {/* フィルター・検索 */}
        <div style={{ display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
          {["全て", "衆議院", "参議院"].map((h) => (
            <button key={h} onClick={() => setFilterHouse(h)}
              style={{
                background: filterHouse === h ? "#3b82f6" : "#0f172a",
                border: `1px solid ${filterHouse === h ? "#3b82f6" : "#1e293b"}`,
                color: filterHouse === h ? "white" : "#64748b",
                padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                fontSize: 12, fontWeight: filterHouse === h ? 700 : 400,
              }}>
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
              background: "#0f172a", border: "1px solid #1e293b",
              color: "#e2e8f0", padding: "8px 14px", borderRadius: 8,
              fontSize: 13, flex: 1, minWidth: 200, outline: "none",
            }}
          />
        </div>

        {/* 一覧 */}
        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>データ読み込み中...</div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>該当する法案がありません。</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {filtered.map((b) => (
              <div key={b.id} style={{
                background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 12, padding: "16px 20px",
              }}>
                {/* タイトル */}
                <div style={{ marginBottom: 8 }}>
                  {b.source_url ? (
                    <a href={b.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14,
                        textDecoration: "none" }}
                      onMouseEnter={(e) => (e.currentTarget.style.color = "#3b82f6")}
                      onMouseLeave={(e) => (e.currentTarget.style.color = "#e2e8f0")}>
                      {b.title}
                    </a>
                  ) : (
                    <span style={{ color: "#e2e8f0", fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                  )}
                </div>

                {/* メタ情報 */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#64748b", marginBottom: 8 }}>
                  {b.submitted_at && <span>{b.submitted_at}</span>}
                  {b.session_number && <span>第{b.session_number}回国会</span>}
                  {b.house && (
                    <span style={{
                      background: b.house === "衆議院" ? "#1e3a5f" : "#1a3a2f",
                      color: b.house === "衆議院" ? "#60a5fa" : "#34d399",
                      padding: "1px 8px", borderRadius: 4,
                    }}>
                      {b.house}
                    </span>
                  )}
                  {b.status && <span style={{ color: "#94a3b8" }}>{b.status}</span>}
                </div>

                {/* 提出者 */}
                {b.submitter_ids && b.submitter_ids.length > 0 && (
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", fontSize: 12 }}>
                    <span style={{ color: "#475569" }}>提出者:</span>
                    {b.submitter_ids.map((id) => {
                      const m = memberMap[id];
                      return m ? (
                        <span
                          key={id}
                          onClick={() => router.push(`/members/${encodeURIComponent(id)}`)}
                          style={{ color: "#3b82f6", cursor: "pointer" }}
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
