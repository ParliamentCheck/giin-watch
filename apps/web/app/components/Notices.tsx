// 法的要件の固定注記（PROJECT_SPEC 5.3）。文言を変更する場合は仕様書とあわせて変更すること。
// 読みやすさのため文字色は白地で 4.5:1 以上（#555555 = 7.5:1）を確保する。

const noticeStyle: React.CSSProperties = {
  fontSize: 12,
  lineHeight: 1.6,
  color: "#555555",
};

/** スコープ宣言（layout で全ページに常時表示） */
export function ScopeNotice() {
  return (
    <div
      role="note"
      aria-label="当サイトの表示範囲について"
      style={{
        ...noticeStyle,
        background: "#ffffff",
        borderBottom: "1px solid #e0e0e0",
        padding: "6px 16px",
        textAlign: "center",
      }}
    >
      当サイトは、国会会議録等の公開記録および公開情報から機械的に集計した一部指標を表示します。
      党務、地元活動、非公開の政策調整、非公開会議等、参照できない活動は含みません。
      当サイトの表示は、活動の良否・有無を判定するものではありません。
    </div>
  );
}

/** フィルター横注記（「0件」の意味） */
export function CountNotice({ style }: { style?: React.CSSProperties }) {
  return (
    <p role="note" style={{ ...noticeStyle, margin: 0, ...style }}>
      「0件」は当サイト参照範囲の公開データ上で未検出であることを示します。活動の有無や良否の判断を示すものではありません。
    </p>
  );
}

/** ソート横注記（並び替えの意味） */
export function SortNotice({ style }: { style?: React.CSSProperties }) {
  return (
    <p role="note" style={{ ...noticeStyle, margin: 0, ...style }}>
      並び替えは当サイトの参照範囲に基づく集計値を使用しています。参照範囲外の活動は含みません。
    </p>
  );
}

/** 件数のフィルター・並び替えがある一覧の直下に置く注記一式 */
export function ListNotices({ sort = true, style }: { sort?: boolean; style?: React.CSSProperties }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 2, ...style }}>
      <CountNotice />
      {sort && <SortNotice />}
    </div>
  );
}
