export const metadata = {
  title: "お問い合わせ",
  description: "「はたらく議員」へのお問い合わせ窓口。データの誤りのご指摘・ご質問・ご要望はGoogleフォームよりお送りください。",
  openGraph: {
    title: "お問い合わせ | はたらく議員",
    description: "「はたらく議員」へのお問い合わせ窓口。データの誤りのご指摘・ご質問・ご要望はGoogleフォームよりお送りください。",
  },
};

export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 32, color: "#111111" }}>
          お問い合わせ
        </h1>

        <section style={{ marginBottom: 32 }}>
          <p style={{ lineHeight: 1.9, color: "#888888" }}>
            当サイトに関するご質問・ご要望・データの誤りに関するご指摘等がございましたら、
            以下のGoogleフォームよりお問い合わせください。
          </p>
          <div style={{ marginTop: 24 }}>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSezkzLqHaSg4nXtKfU2ANb3wUkb9IFcN45Lv3DRoZTReYqafA/viewform"
              target="_blank" rel="noopener noreferrer"
              className="btn-cta">
              お問い合わせフォームを開く ↗
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}
