"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

interface PartyStats {
  party: string;
  total: number;
}

interface ElectionVotes {
  id: string;
  party: string;
  election_type: string;
  election_year: number;
  smd_votes: number | null;
  pr_votes: number | null;
  smd_seats: number | null;
  pr_seats: number | null;
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
  "減税日本・ゆうこく連合": "#7cb342",
  "日本保守党":     "#607d8b",
  "沖縄の風":       "#009688",
  "有志の会":       "#9c27b0",
  "無所属":         "#7f8c8d",
};

// 選挙データの政党名（フルネーム）→ 色
const ELECTION_PARTY_COLORS: Record<string, string> = {
  "自由民主党":         "#c0392b",
  "立憲民主党":         "#2980b9",
  "中道改革連合":       "#3498db",
  "公明党":             "#8e44ad",
  "日本維新の会":       "#318e2c",
  "国民民主党":         "#fabe00",
  "日本共産党":         "#e74c3c",
  "れいわ新選組":       "#e4007f",
  "社会民主党":         "#795548",
  "参政党":             "#ff6d00",
  "チームみらい":       "#00bcd4",
  "日本保守党":         "#607d8b",
  "減税日本・ゆうこく連合": "#7cb342",
  "NHK党":              "#9e9e9e",
  "ＮＨＫ党":          "#9e9e9e",
  "無所属連合":         "#7f8c8d",
  "みんなでつくる党":   "#9e9e9e",
};

type ElectionTab = "衆院2026" | "参院2025" | "参院2022";

function ElectionDivergenceSection() {
  const [votes, setVotes] = useState<ElectionVotes[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<ElectionTab>("衆院2026");

  useEffect(() => {
    async function fetchVotes() {
      const { data } = await supabase
        .from("election_votes")
        .select("*")
        .order("election_year", { ascending: false });
      setVotes(data || []);
      setLoading(false);
    }
    fetchVotes();
  }, []);

  if (loading) {
    return (
      <div className="loading-block" style={{ padding: 32 }}>
        <div className="loading-spinner" />
        <span>選挙データを読み込んでいます...</span>
      </div>
    );
  }

  if (votes.length === 0) {
    return (
      <div style={{ color: "#888", padding: 24, textAlign: "center", fontSize: 14 }}>
        選挙データがまだ登録されていません
      </div>
    );
  }

  // 指定選挙のデータを取得
  function getElectionData(type: string, year: number) {
    return votes.filter(v => v.election_type === type && v.election_year === year);
  }

  // 得票率 vs 議席率 テーブルを描画
  function renderDivergenceTable(rows: ElectionVotes[], label: string) {
    const totalVotes = rows.reduce((sum, r) => sum + (r.smd_votes || 0) + (r.pr_votes || 0), 0);
    const totalSeats = rows.reduce((sum, r) => sum + (r.smd_seats || 0) + (r.pr_seats || 0), 0);

    const computed = rows
      .map(r => {
        const votes_ = (r.smd_votes || 0) + (r.pr_votes || 0);
        const seats = (r.smd_seats || 0) + (r.pr_seats || 0);
        const votePct = totalVotes > 0 ? (votes_ / totalVotes) * 100 : 0;
        const seatPct = totalSeats > 0 ? (seats / totalSeats) * 100 : 0;
        return { party: r.party, votes: votes_, smdVotes: r.smd_votes || 0, prVotes: r.pr_votes || 0, seats, smdSeats: r.smd_seats || 0, prSeats: r.pr_seats || 0, votePct, seatPct, gap: seatPct - votePct };
      })
      .filter(r => r.votes > 0 || r.seats > 0)
      .sort((a, b) => b.seats - a.seats);

    return (
      <div>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>
          {label} ／ 総投票数: {totalVotes.toLocaleString()} ／ 総議席: {totalSeats}
          　※ 得票率は小選挙区（選挙区）・比例の合算票を総投票数で割った値（独自指標）。報道各社が主に使う小選挙区のみの数値とは異なります。議席数は選挙確定時点の数値で、当選後の追加公認・会派移籍は反映していません。出典: 総務省公式資料。
        </p>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e0e0e0" }}>
                <th style={{ textAlign: "left", padding: "6px 8px", color: "#666", fontWeight: 600 }}>政党</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#666", fontWeight: 600, whiteSpace: "nowrap" }}>獲得票数</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#666", fontWeight: 600, whiteSpace: "nowrap" }}>得票率</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#666", fontWeight: 600, whiteSpace: "nowrap" }}>議席率</th>
                <th style={{ textAlign: "right", padding: "6px 8px", color: "#666", fontWeight: 600, whiteSpace: "nowrap" }}>乖離</th>
                <th style={{ padding: "6px 8px", minWidth: 120 }}></th>
              </tr>
            </thead>
            <tbody>
              {computed.map(r => {
                const color = ELECTION_PARTY_COLORS[r.party] || "#7f8c8d";
                const isPositive = r.gap >= 0;
                return (
                  <tr key={r.party} style={{ borderBottom: "1px solid #f0f0f0" }}>
                    <td style={{ padding: "8px 8px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                        <span style={{ fontWeight: 600, color: "#111" }}>{r.party}</span>
                        <span style={{ fontSize: 11, color: "#999" }}>{r.seats}議席</span>
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 8px", color: "#444", whiteSpace: "nowrap" }}>
                      <div>{r.votes.toLocaleString()}</div>
                      <div style={{ fontSize: 11, color: "#aaa" }}>
                        {r.smdVotes > 0 && <span>選{r.smdVotes.toLocaleString()}</span>}
                        {r.smdVotes > 0 && r.prVotes > 0 && <span> / </span>}
                        {r.prVotes > 0 && <span>比{r.prVotes.toLocaleString()}</span>}
                      </div>
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 8px", color: "#444" }}>
                      {r.votePct.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 8px", color: "#444" }}>
                      {r.seatPct.toFixed(1)}%
                    </td>
                    <td style={{ textAlign: "right", padding: "8px 8px", fontWeight: 700,
                      color: isPositive ? "#c0392b" : "#2980b9" }}>
                      {isPositive ? "+" : ""}{r.gap.toFixed(1)}%
                    </td>
                    <td style={{ padding: "8px 8px" }}>
                      {/* 乖離バー */}
                      <div style={{ position: "relative", height: 14, background: "#f0f0f0", borderRadius: 4, overflow: "hidden" }}>
                        {/* 得票率 */}
                        <div style={{
                          position: "absolute", top: 0, left: 0, height: "100%",
                          width: `${Math.min(r.votePct, 100)}%`,
                          background: color, opacity: 0.35,
                        }} />
                        {/* 議席率 */}
                        <div style={{
                          position: "absolute", top: 0, left: 0, height: "100%",
                          width: `${Math.min(r.seatPct, 100)}%`,
                          background: color, opacity: 0.85,
                        }} />
                      </div>
                      <div style={{ fontSize: 10, color: "#aaa", marginTop: 2, display: "flex", justifyContent: "space-between" }}>
                        <span>薄: 得票率</span>
                        <span>濃: 議席率</span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const tabs: { key: ElectionTab; label: string }[] = [
    { key: "衆院2026", label: "衆院 2026" },
    { key: "参院2025", label: "参院 2025" },
    { key: "参院2022", label: "参院 2022" },
  ];

  return (
    <div>
      {/* タブ */}
      <div className="tab-bar tab-bar-container" style={{ flexWrap: "wrap", marginBottom: 20 }}>
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`tab-pill${tab === t.key ? " active" : ""}`}
            style={{ flex: 1, minWidth: 80, padding: "8px 0" }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "衆院2026" && renderDivergenceTable(
        getElectionData("衆院", 2026),
        "2026年（令和8年）衆議院議員総選挙"
      )}
      {tab === "参院2025" && renderDivergenceTable(
        getElectionData("参院", 2025),
        "2025年（令和7年）参議院議員通常選挙"
      )}
      {tab === "参院2022" && renderDivergenceTable(
        getElectionData("参院", 2022),
        "2022年（令和4年）参議院議員通常選挙"
      )}
    </div>
  );
}

function PartiesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? "list";
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    router.replace(`${window.location.pathname}?${p.toString()}`);
  };

  const [parties, setParties] = useState<PartyStats[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const label = tab === "divergence" ? "得票率 vs 議席率" : "政党・会派";
    document.title = `${label} | はたらく議員`;
  }, [tab]);

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

  const PAGE_TABS = [
    { key: "list", label: "政党一覧" },
    { key: "divergence", label: "得票率 vs 議席率" },
  ];

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>

        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 0 }}>🗳 政党・会派</h1>
        </div>

        <div className="tab-bar tab-bar-container" style={{ flexWrap: "wrap" }}>
          {PAGE_TABS.map(t => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`tab-pill${tab === t.key ? " active" : ""}`}
              style={{ flex: 1, minWidth: 120, padding: "10px 0" }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "list" && (
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
        )}

        {tab === "divergence" && (
          <div className="card-xl">
            <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
              国民の投票がどれだけ議席に反映されているかを選挙別に可視化しています。
              乖離がプラスの場合、得票率より多くの議席を獲得していることを示します。
              なお、現職議員が在籍しない政党・団体は表示対象外です。
            </p>
            <p style={{ fontSize: 13, color: "#666", marginBottom: 16 }}>
              乖離が生じる主な原因は<strong>小選挙区制</strong>です。1選挙区から1人しか当選しないため、2位以下の票はすべて死票になります。
              その結果、大政党は得票率以上の議席を獲得しやすく、小政党は票を集めても議席に結びつきにくい構造になっています。
              比例代表制はこれを一部補正しますが、完全には解消しません。
            </p>
            {/* 指標の考え方 */}
            <div style={{
              background: "#f0f4ff",
              border: "1px solid #c0d0f0",
              borderRadius: 8,
              padding: "14px 18px",
              marginBottom: 24,
            }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#334499", marginBottom: 8 }}>
                📐 当サイトの得票率の計算方法
              </div>
              <p style={{ fontSize: 13, color: "#334499", margin: 0, lineHeight: 1.8 }}>
                日本の衆院選では有権者は<strong>小選挙区に1票・比例に1票</strong>の計2票を投じます。
                当サイトはこの2票を「国民の声」として等しく扱い、
                <strong>小選挙区得票数＋比例得票数の合計を総投票数で割った値</strong>を得票率として使用しています。
              </p>
              <p style={{ fontSize: 13, color: "#334499", margin: "8px 0 0", lineHeight: 1.8 }}>
                報道各社が主に使う「小選挙区のみ」の数値とは異なるため、乖離幅が小さくなります。
                これは歪みを過小評価するのではなく、<strong>国民が実際に投じた全票と議席のギャップをそのまま示す</strong>ことを優先した独自指標です。
              </p>
            </div>
            <ElectionDivergenceSection />
          </div>
        )}

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
