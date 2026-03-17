export const metadata = { title: "免責事項" };

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
