"use client";

import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

interface ChangelogEntry {
  id: number;
  date: string;
  description: string;
}

export default function ChangelogPage() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { document.title = "更新履歴 | はたらく議員"; }, []);

  useEffect(() => {
    supabase
      .from("changelog")
      .select("id, date, description")
      .order("date", { ascending: false })
      .order("id", { ascending: false })
      .then(({ data }) => {
        setEntries(data || []);
        setLoading(false);
      });
  }, []);

  const grouped = entries.reduce<Record<string, string[]>>((acc, e) => {
    if (!acc[e.date]) acc[e.date] = [];
    acc[e.date].push(e.description);
    return acc;
  }, {});

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>📋 変更履歴</h1>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#555555" }}>読み込み中...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(grouped).map(([date, descs]) => (
              <div key={date} className="card" style={{ padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#333333", marginBottom: 10 }}>
                  {date}
                </div>
                {descs.map((d, i) => (
                  <p key={i} style={{ fontSize: 13, color: "#888888", lineHeight: 1.8, marginBottom: 4 }}>
                    ・{d}
                  </p>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
