import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer as supabase } from "../../lib/supabase-server";

export const revalidate = 86400;

export const metadata: Metadata = {
  title: "選挙結果（政党別）",
  description: "衆議院議員総選挙・参議院議員通常選挙の政党別の得票数と獲得議席数。総務省の公式資料などの数値を政党名のまま掲載しています。",
  openGraph: {
    title: "選挙結果（政党別） | はたらく議員",
    description: "衆参の国政選挙の政党別の得票数と獲得議席数。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/elections" },
};

type Row = {
  party: string;
  election_type: string;
  election_year: number;
  smd_votes: number | null;
  pr_votes: number | null;
  smd_seats: number | null;
  pr_seats: number | null;
};

const fmt = (n: number | null) => (n == null ? "—" : n.toLocaleString());

export default async function ElectionsPage() {
  const { data, error } = await supabase
    .from("election_votes")
    .select("party,election_type,election_year,smd_votes,pr_votes,smd_seats,pr_seats")
    .order("election_year", { ascending: false })
    .limit(1000);
  const rows = (data ?? []) as Row[];

  // 選挙ごとにまとめる（新しい順）
  const elections = new Map<string, Row[]>();
  for (const r of rows) {
    const key = `${r.election_year}|${r.election_type}`;
    const list = elections.get(key);
    if (list) list.push(r); else elections.set(key, [r]);
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a", padding: "24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>🗳 選挙結果（政党別）</h1>
          <p style={{ fontSize: 13, color: "#555555", lineHeight: 1.8, margin: 0 }}>
            国政選挙の政党別の得票数と獲得議席数です。選挙の結果は政党ごとに発表されるため、ここでは政党名をそのまま使っています。
            当選後の会派への所属は政党と一致するとは限りません。国会での所属は<Link href="/factions" style={{ color: "#333333" }}>会派</Link>のページをご覧ください。
          </p>
        </div>

        {error ? (
          <div className="card-xl"><p style={{ fontSize: 13, color: "#555555", margin: 0 }}>選挙結果のデータを取得できませんでした。時間をおいて再度お試しください。</p></div>
        ) : elections.size === 0 ? (
          <div className="card-xl"><p style={{ fontSize: 13, color: "#555555", margin: 0 }}>選挙結果のデータはありません（0件）。</p></div>
        ) : (
          [...elections.entries()].map(([key, list]) => {
            const [year, type] = key.split("|");
            const isShu = type === "衆院";
            const title = isShu ? `${year}年 衆議院議員総選挙` : `${year}年 参議院議員通常選挙`;
            const smdLabel = isShu ? "小選挙区" : "選挙区";
            const seats = (r: Row) => (r.smd_seats ?? 0) + (r.pr_seats ?? 0);
            // 並び順は獲得議席の多い順。同数は比例の得票の多い順、その次は政党名の順。無所属は最後
            const sorted = [...list].sort((a, b) => {
              if (a.party === "無所属" && b.party !== "無所属") return 1;
              if (b.party === "無所属" && a.party !== "無所属") return -1;
              return seats(b) - seats(a) || (b.pr_votes ?? 0) - (a.pr_votes ?? 0) || a.party.localeCompare(b.party, "ja");
            });
            const sum = (f: (r: Row) => number | null) => list.reduce((s, r) => s + (f(r) ?? 0), 0);
            return (
              <section key={key} className="card-xl" style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 12px" }}>{title}</h2>
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 560 }}>
                    <thead>
                      <tr style={{ borderBottom: "2px solid #e0e0e0", color: "#555555", fontSize: 12 }}>
                        <th scope="col" style={{ textAlign: "left", padding: "6px 4px" }}>政党</th>
                        <th scope="col" style={{ textAlign: "right", padding: "6px 4px" }}>{smdLabel}の得票</th>
                        <th scope="col" style={{ textAlign: "right", padding: "6px 4px" }}>比例の得票</th>
                        <th scope="col" style={{ textAlign: "right", padding: "6px 4px" }}>{smdLabel}の議席</th>
                        <th scope="col" style={{ textAlign: "right", padding: "6px 4px" }}>比例の議席</th>
                        <th scope="col" style={{ textAlign: "right", padding: "6px 4px" }}>議席の計</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sorted.map((r) => (
                        <tr key={r.party} style={{ borderBottom: "1px solid #eeeeee" }}>
                          <th scope="row" style={{ textAlign: "left", padding: "6px 4px", fontWeight: 600 }}>{r.party}</th>
                          <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{fmt(r.smd_votes)}</td>
                          <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{fmt(r.pr_votes)}</td>
                          <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{fmt(r.smd_seats)}</td>
                          <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{fmt(r.pr_seats)}</td>
                          <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{seats(r).toLocaleString()}</td>
                        </tr>
                      ))}
                      <tr style={{ borderTop: "2px solid #e0e0e0", color: "#333333" }}>
                        <th scope="row" style={{ textAlign: "left", padding: "6px 4px" }}>合計</th>
                        <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{sum((r) => r.smd_votes).toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{sum((r) => r.pr_votes).toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{sum((r) => r.smd_seats).toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums" }}>{sum((r) => r.pr_seats).toLocaleString()}</td>
                        <td style={{ textAlign: "right", padding: "6px 4px", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{sum(seats).toLocaleString()}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </section>
            );
          })
        )}

        <div className="card" style={{ padding: "14px 18px" }}>
          <ul style={{ fontSize: 12, color: "#555555", margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
            <li>出典：総務省の公式資料（PDF・XLSX）などから手動で入力しています。入力の基準は<Link href="/disclaimer" style={{ color: "#555555" }}>免責事項</Link>をご覧ください。</li>
            <li>議席数は選挙で確定した時点の数で、その後の追加公認・会派への所属・補欠選挙は反映していません。</li>
            <li>「—」は当サイトに記録がないことを示します。並び順は獲得議席の多い順です（無所属は最後）。</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
