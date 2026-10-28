import type { Metadata } from "next";
import Link from "next/link";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import { getCurrentFactions, getFactionBreakdown } from "../../lib/queries";
import { factionColor, factionPath, type FactionRow, type House } from "../../lib/factions";
import { CURRENT_SESSION } from "../../lib/constants";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "会派",
  description: "衆議院・参議院の会派の一覧。会派ごとの所属議員を、衆参の公式の会派名のまま掲載しています。",
  openGraph: {
    title: "会派 | はたらく議員",
    description: "衆議院・参議院の会派の一覧。公式の会派名のまま掲載。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/factions" },
};

const OFFICIAL_LIST: Record<House, { label: string; url: string }> = {
  "衆議院": { label: "衆議院の会派名及び会派別所属議員数", url: "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/shiryo/kaiha_m.htm" },
  "参議院": { label: "参議院の会派別所属議員数", url: `https://www.sangiin.go.jp/japanese/joho1/kousei/giin/kaiha/kaiha${CURRENT_SESSION}.htm` },
};

export default async function FactionsPage() {
  let factions: FactionRow[] = [];
  let breakdown: Awaited<ReturnType<typeof getFactionBreakdown>> = [];
  let failed = false;
  try {
    [factions, breakdown] = await Promise.all([getCurrentFactions(supabase), getFactionBreakdown(supabase)]);
  } catch {
    failed = true;
  }

  // 会派ごとの在籍議員数（当サイトの議員データ）。公式一覧に載っていて議員データにない会派も表示する
  const rows = (house: House) => {
    const map = new Map<string, { name: string; short: string | null; count: number }>();
    for (const f of factions.filter((f) => f.house === house)) {
      map.set(f.name, { name: f.name, short: f.short_name, count: 0 });
    }
    for (const b of breakdown.filter((b) => b.house === house)) {
      const cur = map.get(b.faction) ?? { name: b.faction, short: b.short, count: 0 };
      cur.count = b.count;
      if (!cur.short && b.short) cur.short = b.short;
      map.set(b.faction, cur);
    }
    // 並び順は所属議員数の多い順（衆参の公式の会派一覧と同じ）。同数は会派名の順
    return [...map.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "ja"));
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a", padding: "24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>🏛 会派</h1>
          <p style={{ fontSize: 13, color: "#555555", lineHeight: 1.8, margin: 0 }}>
            会派は、国会の中で活動をともにする議員のグループで、衆議院・参議院それぞれに届け出られます。
            委員の割り当てや質疑の時間などは会派を単位に決まります。政党と同じ名前の会派もあれば、複数の政党や無所属の議員でつくる会派もあります。
            当サイトは衆参の公式の会派名をそのまま表示し、会派から政党を推定することはしません。
          </p>
        </div>

        {failed ? (
          <div className="card-xl"><p style={{ fontSize: 13, color: "#555555", margin: 0 }}>会派のデータを取得できませんでした。時間をおいて再度お試しください。</p></div>
        ) : (
          (["衆議院", "参議院"] as const).map((house) => {
            const list = rows(house);
            const total = list.reduce((s, r) => s + r.count, 0);
            return (
              <section key={house} className="card-xl" style={{ marginBottom: 16 }}>
                <h2 style={{ fontSize: 17, fontWeight: 800, margin: "0 0 4px" }}>{house}</h2>
                <p style={{ fontSize: 12, color: "#555555", margin: "0 0 12px" }}>
                  {list.length}会派・{total}名（当サイトの議員データの人数）。並び順は所属議員数の多い順です（公式の会派一覧と同じ）。
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {list.map((r) => (
                    <Link key={r.name} href={factionPath(house, r.name)} className="card card-hover"
                      style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", textDecoration: "none", color: "#1a1a1a",
                        borderLeft: `4px solid ${factionColor(r.name)}` }}>
                      <span style={{ fontWeight: 700, fontSize: 14, flex: 1 }}>
                        {r.name}
                        {r.short && r.short !== r.name && (
                          <span style={{ fontSize: 12, fontWeight: 400, color: "#555555", marginLeft: 8 }}>（略称: {r.short}）</span>
                        )}
                      </span>
                      <span style={{ fontSize: 13, color: "#333333", whiteSpace: "nowrap" }}>{r.count}名</span>
                    </Link>
                  ))}
                </div>
                <p style={{ fontSize: 12, color: "#555555", margin: "12px 0 0" }}>
                  公式の一覧:{" "}
                  <a href={OFFICIAL_LIST[house].url} target="_blank" rel="noopener noreferrer" style={{ color: "#333333" }}>
                    {OFFICIAL_LIST[house].label} ↗
                  </a>
                  {" "}— 人数は欠員・異動の反映時期により公式の一覧と異なる場合があります。
                </p>
              </section>
            );
          })
        )}

        <div className="card-xl">
          <h2 style={{ fontSize: 15, fontWeight: 700, margin: "0 0 6px" }}>選挙の結果（政党別）</h2>
          <p style={{ fontSize: 13, color: "#555555", margin: 0, lineHeight: 1.7 }}>
            選挙の結果は政党ごとに発表されるため、政党名のまま別のページに掲載しています。{" "}
            <Link href="/elections" style={{ color: "#333333" }}>選挙結果を見る →</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
