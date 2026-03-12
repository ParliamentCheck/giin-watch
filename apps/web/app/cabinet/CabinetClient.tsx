"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface Member {
  id: string;
  name: string;
  party: string;
  house: string;
  district: string;
  cabinet_post: string;
}

// 役職の表示優先度（上位ほど先）
const POST_PRIORITY: string[] = [
  "内閣総理大臣",
  "総務大臣",
  "法務大臣",
  "外務大臣",
  "財務大臣",
  "文部科学大臣",
  "厚生労働大臣",
  "農林水産大臣",
  "経済産業大臣",
  "国土交通大臣",
  "環境大臣",
  "防衛大臣",
  "内閣官房長官",
  "デジタル大臣",
  "こども政策担当",
  "少子化対策担当",
  "地方創生担当",
  "経済安全保障担当",
];

function postPriority(post: string): number {
  const idx = POST_PRIORITY.findIndex((p) => post.includes(p));
  if (idx !== -1) return idx;
  if (post.includes("副大臣"))   return 1000;
  if (post.includes("政務官"))   return 2000;
  return 500; // その他の大臣職
}

const PARTY_COLORS: Record<string, string> = {
  "自民党":       "#c0392b",
  "立憲民主党":   "#2980b9",
  "中道改革連合": "#3498db",
  "公明党":       "#8e44ad",
  "日本維新の会": "#318e2c",
  "国民民主党":   "#fabe00",
  "共産党":       "#e74c3c",
  "れいわ新選組": "#e4007f",
  "社民党":       "#795548",
  "参政党":       "#ff6d00",
  "チームみらい": "#00bcd4",
  "日本保守党":   "#607d8b",
  "沖縄の風":     "#009688",
  "有志の会":     "#9c27b0",
  "無所属":       "#7f8c8d",
};

export default function CabinetClient() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);


  useEffect(() => {
    async function fetchCabinet() {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, party, house, district, cabinet_post")
        .eq("is_active", true)
        .not("cabinet_post", "is", null);
      if (error) console.error(error);
      else setMembers((data || []).sort((a, b) => postPriority(a.cabinet_post) - postPriority(b.cabinet_post)));
      setLoading(false);
    }
    fetchCabinet();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>内閣一覧</h1>
      <p style={{ color: "#555555", marginBottom: 24 }}>現在 {members.length}名の内閣構成員を収録</p>

      {loading ? (
        <div className="loading-block">
          <div className="loading-spinner" />
          <span>データを読み込んでいます...</span>
        </div>
      ) : members.length === 0 ? (
        <div className="empty-state">データがありません</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {members.map((m) => {
            const color = PARTY_COLORS[m.party] || "#7f8c8d";
            return (
              <div key={m.id}
                onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                className="card card-hover"
                style={{ padding: "12px 16px", "--hover-color": "#333333" } as React.CSSProperties}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 16px" }}>
                  {/* 大臣職バッジ */}
                  <span className="badge badge-role">
                    👑 {m.cabinet_post}
                  </span>
                  {/* 名前 */}
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#111111", minWidth: 90 }}>
                    {m.name}
                  </span>
                  {/* 政党バッジ */}
                  <span className="badge badge-party" style={{ "--party-color": color } as React.CSSProperties}>
                    {m.party}
                  </span>
                  {/* 院・選挙区 */}
                  <span style={{ color: "#555555", fontSize: 12, whiteSpace: "nowrap" }}>
                    {m.house} · {m.district}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
