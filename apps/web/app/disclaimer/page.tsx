export default function DisclaimerPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "40px 24px" }}>
      <div style={{ maxWidth: 720, margin: "0 auto" }}>

        <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 32, color: "#f1f5f9" }}>
          免責事項・データについて
        </h1>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>データの収集方法</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            本サイトのデータは、衆議院・参議院・国立国会図書館の公式サイトで公開されている情報を自動収集したものです。
            運営者による手動での追加・修正・削除は一切行っていません。
            表示されるデータはすべて公的機関の公開情報に基づいており、運営者の判断や意図は反映されていません。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>政党・会派の表記について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            「政党・会派」の表記は、衆議院・参議院の公式サイトに登録された所属会派名を表示しています。
            選挙時の届出政党と国会での所属会派が異なる場合があります（例：特定政党から出馬したが、国会では無所属会派に属する場合）。
            正確な届出政党については各公式サイトをご確認ください。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>データの更新について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            データは毎日午前3時に自動収集・更新されます。
            国会会議録の登録には1〜2週間のタイムラグがあるため、直近の発言は反映されていない場合があります。
            最新・正確な情報は各公式サイトをご確認ください。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>発言セッション数について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            発言セッション数は、同日・同委員会での複数の発言をまとめて1セッションとして集計しています。
            発言の長さや内容は考慮されていません。
            なお、委員長・会長としての議事進行発言（「○○委員長」として記録された発言）はカウントから除外しています。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>当選回数について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当選回数は現在所属する院（衆議院または参議院）での回数です。
            他院での当選経歴は含まれません。そのため、院を移った（鞍替えした）議員の通算当選回数は実際より少なく表示される場合があります。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>前議員・辞職議員について</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            次回選挙の参考情報として、過去に国会で活動した前議員・辞職議員のデータも掲載しています。
            死亡した議員のデータは掲載していません。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>免責</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            本サイトの情報の正確性・完全性について保証するものではありません。
            AIによる自動解析の性質上、誤情報が入り込んだり、情報が古くなったりする可能性がございます。
            本サイトの情報を利用したことによって生じたいかなる損害についても、運営者は責任を負いません。
            最終的な情報の確認や判断は、各公的機関の公式情報等をご参照の上、ご自身の責任において行ってください。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>無断転載の禁止</h2>
          <p style={{ lineHeight: 1.9, color: "#94a3b8" }}>
            当サイトで独自に集計・可視化したグラフやランキング等のコンテンツについて、
            許可なく無断で転載することを禁じます。
            引用の際は、当サイトへのリンクを掲載するとともに、引用元であることを明記してください。
          </p>
        </section>

        <section style={{ marginBottom: 32 }}>
          <h2 style={{ fontSize: 15, fontWeight: 700, color: "#94a3b8", marginBottom: 12,
            textTransform: "uppercase", letterSpacing: 1 }}>データソース</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[
              { label: "国立国会図書館 国会会議録検索システム", url: "https://kokkai.ndl.go.jp/" },
              { label: "衆議院公式サイト", url: "https://www.shugiin.go.jp/" },
              { label: "参議院公式サイト", url: "https://www.sangiin.go.jp/" },
            ].map((s) => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                style={{ color: "#3b82f6", textDecoration: "none" }}>
                {s.label} ↗
              </a>
            ))}
          </div>
        </section>

      </div>
    </div>
  );
}
