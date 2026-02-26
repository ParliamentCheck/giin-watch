export default function ContactPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 32, color: "#f1f5f9" }}>
          お問い合わせ
        </h1>

        <section style={{ marginBottom: 32 }}>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当サイトに関するご質問・ご要望・データの誤りに関するご指摘等がございましたら、
            以下のGoogleフォームよりお問い合わせください。
          </p>
          <div style={{ marginTop: 24 }}>
            <a href="https://docs.google.com/forms/d/e/1FAIpQLSfbk1VxWsO4_LONGCxLku8cxz4OJ1NcvsKXG3XZsflmcmJwMQ/viewform"
              target="_blank" rel="noopener noreferrer"
              style={{
                display: "inline-block", background: "#3b82f6", color: "#ffffff",
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
