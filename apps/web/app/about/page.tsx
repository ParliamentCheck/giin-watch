export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 32, color: "#f1f5f9" }}>
          当サイトについて
        </h1>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>サイトの目的</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            「はたらく議員」は、国会議員の活動実績を客観的なデータに基づいて可視化し、
            有権者が政治に関心を持つための参考資料として提供することを目的としたWebサイトです。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>データの取得と処理について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当サイトに掲載されているデータは、以下の公的機関が公開している情報を
            プログラム（APIおよびスクレイピング）を用いて毎日自動的に取得・集計したものです。
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
            {[
              { label: "国立国会図書館（国会会議録検索システム）", url: "https://kokkai.ndl.go.jp/" },
              { label: "衆議院 公式ウェブサイト", url: "https://www.shugiin.go.jp/" },
              { label: "参議院 公式ウェブサイト", url: "https://www.sangiin.go.jp/" },
            ].map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{ color: "#3b82f6", textDecoration: "none" }}>
                {s.label} ↗
              </a>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>客観性の担保</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当サイトは特定の政党や政治家を支持・応援するものではありません。
            取得したデータに対して管理者による主観的な修正や手作業による改変は一切行わず、
            システムによる機械的な集計結果のみを掲載しています。
          </p>
        </section>

      </div>
    </div>
  );
}
