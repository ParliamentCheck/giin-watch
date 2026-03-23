export const metadata = {
  title: "免責事項",
  description: "「はたらく議員」の免責事項。掲載データは国会の公開記録に基づく集計であり、議員の活動の良否を判定するものではありません。データの正確性・完全性について詳しくはこちらをご確認ください。",
  openGraph: {
    title: "免責事項 | はたらく議員",
    description: "「はたらく議員」の免責事項。掲載データは国会の公開記録に基づく集計であり、議員の活動の良否を判定するものではありません。データの正確性・完全性について詳しくはこちらをご確認ください。",
  },
};

export default function DisclaimerPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        {/* 旧アンカーリンクの互換性維持 */}
        <span id="activity-radar" />
        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111111" }}>免責事項</h1>
          <p style={{ fontSize: 13, color: "#888888", marginTop: 8, marginBottom: 0 }}>
            データの仕様・集計方法については<a href="/faq" style={{ color: "#333333" }}>データ仕様</a>をご確認ください。
          </p>
        </div>

        <div className="card-xl" style={{ fontSize: 13, color: "#888888", lineHeight: 2 }}>
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>免責</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              本サイトの情報の正確性・完全性について保証するものではありません。
              自動収集・スクレイピングの性質上、誤情報が入り込んだり、情報が古くなったりする可能性がございます。
              本サイトの情報を利用したことによって生じたいかなる損害についても、運営者は責任を負いません。
              最終的な情報の確認や判断は、各公的機関の公式情報等をご参照の上、ご自身の責任において行ってください。
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>手動補正データについて</h2>
            <p style={{ lineHeight: 1.9, color: "#888888", marginBottom: 8 }}>
              一部のデータは、公式ソースの仕様上の制約により実態と異なる場合があるため、手動で補正しています。
            </p>
            <ul style={{ lineHeight: 2, color: "#888888", paddingLeft: 20 }}>
              <li>
                <strong style={{ color: "#555" }}>議員の所属政党</strong>：
                衆議院公式サイトでは会派結成に5名以上必要なため、少数政党の議員が「無所属」として登録される場合があります。
                実際の党籍が確認できる場合は正しい政党名に補正しています（河村たかし→減税日本・ゆうこく連合、山本ジョージ→れいわ新選組）。
              </li>
              <li>
                <strong style={{ color: "#555" }}>中道改革連合の超党派議員立法集計</strong>：
                2026年1月以前の法案については、中道改革連合所属議員を旧所属政党（立憲民主党・公明党）として集計しています。
              </li>
              <li>
                <strong style={{ color: "#555" }}>選挙得票数・議席数</strong>：
                総務省公式資料（PDF・XLSX）および各メディアの確定報道に基づき手動入力しています。按分票の小数点以下は切り捨てています。
                無所属連合（参院2025）は無所属に合算、NHK党（参院2022）は選挙区1,106,508票・比例1,253,872票として入力しています。
                計算方法・集計基準の詳細は<a href="/faq#election-votes" style={{ color: "#555" }}>データ仕様</a>をご覧ください。
              </li>
            </ul>
          </section>

          <section>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>無断転載の禁止</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              当サイトで独自に集計・可視化したグラフや活動データ等のコンテンツについて、
              許可なく無断で転載することを禁じます。
              引用の際は、当サイトへのリンクを掲載するとともに、引用元であることを明記してください。
            </p>
          </section>

        </div>

      </div>
    </div>
  );
}
