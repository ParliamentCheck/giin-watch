import Link from "next/link";
import { factionColor, factionPath, type FactionHistoryRow } from "../../../lib/factions";

/**
 * 会派の遍歴
 *
 * 2種類の記録を書き分ける（設計書 10章）:
 *   - 会議録ベース（ndl）: 国会会議録に記録された発言時点の会派。最初と最後の発言日。院は表示しない
 *   - 名簿ベース（roster）: 当サイトが衆参の議員名簿で所属を確認した日
 * 空白期間は空白のまま。移動回数などの集計はしない。
 */
export default function FactionHistory({
  rows,
  speakerNames,
  house,
  isActive,
}: {
  rows: FactionHistoryRow[] | null;
  speakerNames: string[];
  house: "衆議院" | "参議院";
  isActive: boolean;
}) {
  const ndl = (rows ?? []).filter((r) => r.source === "ndl").sort((a, b) => a.start_on.localeCompare(b.start_on));
  const roster = (rows ?? []).filter((r) => r.source === "roster").sort((a, b) => a.start_on.localeCompare(b.start_on));
  const ndlSearchUrl = speakerNames.length
    ? `https://kokkai.ndl.go.jp/#/result?speaker=${encodeURIComponent(speakerNames[0])}`
    : "https://kokkai.ndl.go.jp/";

  return (
    <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
      <h2 style={{ fontSize: 14, fontWeight: 700, color: "#222222", margin: "0 0 4px" }}>会派の遍歴</h2>
      <p style={{ fontSize: 12, color: "#555555", margin: "0 0 12px", lineHeight: 1.7 }}>
        国会会議録に記録された発言時点の会派と、当サイトが衆参の議員名簿で確認した会派です。
        会派に入った日・離れた日そのものではありません。発言のない期間は空白のままにしています。
      </p>

      {rows === null ? (
        <p style={{ fontSize: 13, color: "#555555" }}>会派の記録を取得できませんでした。</p>
      ) : (
        <>
          {roster.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "#333333", marginBottom: 6 }}>議員名簿で確認した会派（{house}）</div>
              {roster.map((r) => (
                <div key={`r-${r.faction_name}-${r.start_on}`} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 13, padding: "4px 0", flexWrap: "wrap" }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: factionColor(r.faction_name), flexShrink: 0 }} />
                  {isActive && !r.end_on ? (
                    <Link href={factionPath(house, r.faction_name)} style={{ color: "#1a1a1a" }}>{r.faction_name}</Link>
                  ) : (
                    <span style={{ color: "#1a1a1a" }}>{r.faction_name}</span>
                  )}
                  <span style={{ fontSize: 12, color: "#555555" }}>
                    {r.start_on} に確認{r.end_on ? ` 〜 ${r.end_on} に変化を確認` : "（現在）"}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 12, fontWeight: 700, color: "#333333", marginBottom: 6 }}>国会会議録に記録された発言時点の会派</div>
          {ndl.length === 0 ? (
            <p style={{ fontSize: 13, color: "#555555", margin: 0 }}>
              会議録上の記録はありません（発言の記録がない、または同姓同名の別人の記録と区別できないため表示していません）。
            </p>
          ) : (
            <ol style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {ndl.map((r) => (
                <li key={`n-${r.faction_name}-${r.start_on}`}
                  style={{ display: "flex", gap: 10, alignItems: "baseline", fontSize: 13, padding: "5px 0", borderBottom: "1px solid #eeeeee", flexWrap: "wrap" }}>
                  <span style={{ fontSize: 12, color: "#555555", fontVariantNumeric: "tabular-nums", minWidth: 190 }}>
                    {r.start_on === r.end_on ? r.start_on : `${r.start_on} 〜 ${r.end_on}`}
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#1a1a1a" }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: factionColor(r.faction_name), flexShrink: 0 }} />
                    {r.faction_name}
                  </span>
                  {r.record_count != null && (
                    <span style={{ fontSize: 11, color: "#666666" }}>（この期間の発言 {r.record_count.toLocaleString()}件）</span>
                  )}
                </li>
              ))}
            </ol>
          )}
          <p style={{ fontSize: 11, color: "#555555", margin: "10px 0 0", lineHeight: 1.7 }}>
            会議録の記録は、話者名と読み仮名が一致する発言から作成しています。同姓同名の別人の発言が混ざる可能性がある場合は表示していません。
            {" "}
            <a href={ndlSearchUrl} target="_blank" rel="noopener noreferrer" style={{ color: "#333333" }}>国会会議録検索システムで確認 ↗</a>
          </p>
        </>
      )}
    </div>
  );
}
