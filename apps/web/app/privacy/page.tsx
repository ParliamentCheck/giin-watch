export const metadata = {
  title: "プライバシーポリシー",
  description: "「はたらく議員」のプライバシーポリシー。アクセス解析（Googleアナリティクス）の利用方法や、当サイトにおける個人情報の取り扱いについて説明しています。",
  openGraph: {
    title: "プライバシーポリシー | はたらく議員",
    description: "「はたらく議員」のプライバシーポリシー。アクセス解析（Googleアナリティクス）の利用方法や、当サイトにおける個人情報の取り扱いについて説明しています。",
  },
};

export default function PrivacyPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111111" }}>プライバシーポリシー</h1>
        </div>

        <div className="card-xl" style={{ fontSize: 13, color: "#888888", lineHeight: 2 }}>
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>アクセス解析ツールについて</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              当サイトでは、Googleによるアクセス解析ツール「Googleアナリティクス」を利用しています。
              Googleアナリティクスはトラフィックデータの収集のためにCookieを使用しております。
              トラフィックデータは匿名で収集されており、個人を特定するものではありません。
              Cookieを無効にすることでデータの収集を拒否できますので、お使いのブラウザの設定をご確認ください。
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>広告の配信について</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              当サイトは、第三者配信の広告サービス（Google AdSense）を利用しています。
              広告配信事業者は、ユーザーの興味に応じた商品やサービスの広告を表示するため、
              当サイトや他サイトへのアクセスに関する情報であるCookie（氏名、住所、メールアドレス、
              電話番号は含まれません）を使用することがあります。
            </p>
            <p style={{ lineHeight: 1.9, color: "#888888", marginTop: 12 }}>
              Google AdSenseに関して、このプロセスの詳細やこのような情報が広告配信事業者に
              使用されないようにする方法については、
              <a href="https://policies.google.com/technologies/ads?hl=ja" target="_blank"
                rel="noopener noreferrer" style={{ color: "#333333", textDecoration: "none" }}>
                Googleのポリシーと規約 ↗
              </a>
              をご覧ください。
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>AI分析機能について</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              当サイトのAI分析機能をご利用の際、入力されたAPIキーおよび分析対象のデータは、ブラウザから直接各AI事業者（OpenAI・Google・xAI等）のサーバーへ送信されます。
              これらの情報が当サイトのサーバーに送信・保存されることは一切ありません。
              各AI事業者におけるデータの取り扱いについては、各社のプライバシーポリシーをご確認ください。
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>プライバシーポリシーの変更について</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              当サイトは、個人情報に関して適用される日本の法令を遵守するとともに、
              本ポリシーの内容を適宜見直しその改善に努めます。
              修正された最新のプライバシーポリシーは常に本ページにて開示されます。
            </p>
          </section>
        </div>

      </div>
    </div>
  );
}
