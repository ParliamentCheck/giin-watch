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
}

export default function BillsClient() {
  const router = useRouter();
  const [bills, setBills] = useState<Bill[]>([]);
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [isComposing, setIsComposing] = useState(false);
  const [filterHouse, setFilterHouse] = useState<string>("全て");
  const [filterCrossParty, setFilterCrossParty] = useState(false);

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
          .select("id,name,party")
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

  const getCrossPartyInfo = (b: Bill) => {
    if (!b.submitter_ids || b.submitter_ids.length < 2) return null;
    const parties = [...new Set(b.submitter_ids.map(id => memberMap[id]?.party).filter(Boolean))];
    return parties.length >= 2 ? parties : null;
  };

  const filtered = bills.filter((b) => {
    if (filterHouse !== "全て" && b.house !== filterHouse) return false;
    if (filterCrossParty && !getCrossPartyInfo(b)) return false;
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
          <button
            onClick={() => setFilterCrossParty(!filterCrossParty)}
            className={`filter-btn${filterCrossParty ? " active" : ""}`}>
            🤝 超党派
          </button>
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

        {/* 一覧 */}
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
                {/* タイトル */}
                <div style={{ marginBottom: 8 }}>
                  {b.source_url ? (
                    <a href={b.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ fontWeight: 600, fontSize: 14, color: "#1a1a1a",
                        textDecoration: "underline", textDecorationColor: "#aaaaaa", textUnderlineOffset: "2px" }}>
                      {b.title}
                      <span style={{ marginLeft: 4, color: "#aaaaaa", fontSize: 11, textDecoration: "none" }}>↗</span>
                    </a>
                  ) : (
                    <span style={{ color: "#888888", fontWeight: 600, fontSize: 14 }}>{b.title}</span>
                  )}
                </div>

                {/* メタ情報 */}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 12, color: "#555555", marginBottom: 8 }}>
                  {b.submitted_at && <span>{b.submitted_at}</span>}
                  {b.session_number && <span>第{b.session_number}回国会</span>}
                  {b.house && (
                    <span className="badge badge-house">{b.house}</span>
                  )}
                  {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                  {getCrossPartyInfo(b) && (
                    <span style={{ fontSize: 11, background: "#e8f5e9", color: "#2e7d32", padding: "1px 8px", borderRadius: 4, fontWeight: 600 }}>
                      🤝 超党派
                    </span>
                  )}
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
    </div>
  );
}
