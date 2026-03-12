export const metadata = { title: "お問い合わせ" };

export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#030d0d", color: "#dff0f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 32, color: "#edfafa" }}>
          お問い合わせ
        </h1>

        <section style={{ marginBottom: 32 }}>
          <p style={{ lineHeight: 1.9, color: "#7ab8b8" }}>
            当サイトに関するご質問・ご要望・データの誤りに関するご指摘等がございましたら、
            以下のGoogleフォームよりお問い合わせください。
          </p>
          <div style={{ marginTop: 24 }}>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSezkzLqHaSg4nXtKfU2ANb3wUkb9IFcN45Lv3DRoZTReYqafA/viewform"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-block", background: "#0d9488", color: "#ffffff",
                padding: "14px 32px", borderRadius: 10, fontSize: 15,
                fontWeight: 700, textDecoration: "none", transition: "all 0.2s",
              }}>
              お問い合わせフォームを開く ↗
            </a>
          </div>
        </section>

      </div>
    </div>
  );
}
