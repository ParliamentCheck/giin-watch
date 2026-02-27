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
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>📋 変更履歴</h1>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>読み込み中...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(grouped).map(([date, descs]) => (
              <div key={date} style={{ background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", marginBottom: 10 }}>
                  {date}
                </div>
                {descs.map((d, i) => (
                  <p key={i} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8, marginBottom: 4 }}>
                    ・{d}
                  </p>
                ))}
              </div>
cd /Volumes/ACASIS-SSD/Users/ssd/Desktop/giin-watch

python3 << 'PYEOF'
p = 'apps/web/app/components/GlobalFooter.tsx'
with open(p) as f:
    t = f.read()

t = t.replace(
    '{ label: "利用規約", path: "/terms" },',
    '{ label: "利用規約", path: "/terms" },\n  { label: "変更履歴", path: "/changelog" },'
)

with open(p, 'w') as f:
    f.write(t)
print('done')
PYEOF

git add -A
git commit -m "feat: 変更履歴ページ追加＋役職者初期非表示（Phase2-2,2-3）"
git push origin develop
git checkout master
git merge develop
git push
git checkout develop



cd /Volumes/ACASIS-SSD/Users/ssd/Desktop/giin-watch

mkdir -p apps/web/app/changelog

cat > apps/web/app/changelog/page.tsx << 'EOF'
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
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>📋 変更履歴</h1>

        {loading ? (
          <div style={{ textAlign: "center", padding: 60, color: "#64748b" }}>読み込み中...</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            {Object.entries(grouped).map(([date, descs]) => (
              <div key={date} style={{ background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 12, padding: 20 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#3b82f6", marginBottom: 10 }}>
                  {date}
                </div>
                {descs.map((d, i) => (
                  <p key={i} style={{ fontSize: 13, color: "#94a3b8", lineHeight: 1.8, marginBottom: 4 }}>
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
