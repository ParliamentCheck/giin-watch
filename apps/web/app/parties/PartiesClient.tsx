"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface PartyStats {
  party: string;
  total: number;
}

const PARTY_COLORS: Record<string, string> = {
  "自民党":         "#c0392b",
  "立憲民主党":     "#2980b9",
  "中道改革連合":   "#3498db",
  "公明党":         "#8e44ad",
  "日本維新の会":   "#318e2c",
  "国民民主党":     "#fabe00",
  "共産党":         "#e74c3c",
  "れいわ新選組":   "#e4007f",
  "社民党":         "#795548",
  "参政党":         "#ff6d00",
  "チームみらい":   "#00bcd4",
  "日本保守党":     "#607d8b",
  "沖縄の風":       "#009688",
  "有志の会":       "#9c27b0",
  "無所属":         "#7f8c8d",
};

function PartiesContent() {
  const router = useRouter();
  const [parties, setParties] = useState<PartyStats[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { document.title = "政党・会派 | はたらく議員"; }, []);

  useEffect(() => {
    async function fetchStats() {
      const { data } = await supabase
        .from("members")
        .select("party")
        .eq("is_active", true)
        .limit(2000);

      const partyMap: Record<string, number> = {};
      for (const m of data || []) {
        const p = m.party || "無所属";
        partyMap[p] = (partyMap[p] || 0) + 1;
      }

      const sorted = Object.entries(partyMap)
        .map(([party, total]) => ({ party, total }))
        .sort((a, b) => b.total - a.total);

      setParties(sorted);
      setLoading(false);
    }
    fetchStats();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 0 }}>🗳 政党・会派</h1>
        </div>

        <div className="card-xl">
          {loading ? (
            <div className="loading-block">
              <div className="loading-spinner" />
              <span>データを読み込んでいます...</span>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {parties.map((p) => {
                const color = PARTY_COLORS[p.party] || "#7f8c8d";
                return (
                  <div key={p.party}
                    onClick={() => router.push(`/parties/${encodeURIComponent(p.party)}`)}
                    className="card card-hover"
                    style={{ padding: "14px 20px", "--hover-color": color } as React.CSSProperties}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: color, flexShrink: 0 }} />
                      <span style={{ fontSize: 16, fontWeight: 700, color: "#111111", flex: 1 }}>
                        {p.party}
                      </span>
                      <span style={{ fontSize: 13, color: "#888888" }}>{p.total}名</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default function PartiesClient() {
  return (
    <Suspense fallback={<div className="loading-block" style={{ minHeight: "100vh" }}><div className="loading-spinner" /></div>}>
      <PartiesContent />
    </Suspense>
  );
}
