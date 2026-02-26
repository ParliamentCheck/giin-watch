export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 32, color: "#f1f5f9" }}>
          プライバシーポリシー
        </h1>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>アクセス解析ツールについて</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当サイトでは、Googleによるアクセス解析ツール「Googleアナリティクス」を利用しています。
            Googleアナリティクスはトラフィックデータの収集のためにCookieを使用しております。
            トラフィックデータは匿名で収集されており、個人を特定するものではありません。
            Cookieを無効にすることでデータの収集を拒否できますので、お使いのブラウザの設定をご確認ください。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>広告の配信について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当サイトは、第三者配信の広告サービス（Google AdSense等）を利用する予定、または利用しています。
            広告配信事業者は、ユーザーの興味に応じた商品やサービスの広告を表示するため、
            当サイトや他サイトへのアクセスに関する情報であるCookie（氏名、住所、メールアドレス、
            電話番号は含まれません）を使用することがあります。
          </p>
          <p style={{ lineHeight: 1.9, color: "#94a3b8", marginTop: 12 }}>
            Google AdSenseに関して、このプロセスの詳細やこのような情報が広告配信事業者に
            使用されないようにする方法については、
            <a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank"
              rel="noopener noreferrer" style={{ color: "#3b82f6", textDecoration: "none" }}>
              Googleのポリシーと規約 ↗
            </a>
            をご覧ください。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>プライバシーポリシーの変更について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当サイトは、個人情報に関して適用される日本の法令を遵守するとともに、
            本ポリシーの内容を適宜見直しその改善に努めます。
            修正された最新のプライバシーポリシーは常に本ページにて開示されます。
          </p>
        </section>

      </div>
    </div>
  );
}
