export const metadata = {
  title: "このサイトについて",
  description: "「はたらく議員」は、国会議員の活動を公開記録のデータで可視化する情報サイトです。有権者が議員の実績を客観的に確認し、政治をより身近に感じるためのサポートを目的としています。",
  openGraph: {
    title: "このサイトについて | はたらく議員",
    description: "「はたらく議員」は、国会議員の活動を公開記録のデータで可視化する情報サイトです。有権者が議員の実績を客観的に確認し、政治をより身近に感じるためのサポートを目的としています。",
  },
};

export default function AboutPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111111" }}>当サイトについて</h1>
        </div>

        <div className="card-xl" style={{ fontSize: 13, color: "#888888", lineHeight: 2 }}>
          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>サイトの目的</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              『はたらく議員』は、日本の国会議員の活動を、公開記録に基づく客観的なデータのみを用いて可視化するウェブサイトです。有権者が国会での実際の活動状況を容易に確認できるよう整理し、より深い政治理解をサポートすることを目的としています。
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>データソース</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              掲載データは、以下の公的機関がインターネット上で公開している情報を基にしています。
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 16 }}>
              {[
                { label: "国立国会図書館「国会会議録検索システム」", url: "https://kokkai.ndl.go.jp/" },
                { label: "衆議院 公式ウェブサイト", url: "https://www.shugiin.go.jp/" },
                { label: "参議院 公式ウェブサイト", url: "https://www.sangiin.go.jp/" },
                { label: "首相官邸（閣僚名簿）", url: "https://www.kantei.go.jp/" },
              ].map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                  style={{ color: "#333333", textDecoration: "none" }}>
                  {s.label} ↗
                </a>
              ))}
            </div>
            <p style={{ lineHeight: 1.9, color: "#888888", marginTop: 16 }}>
              システムが定期的にアクセスし、発言記録、質問主意書、議員立法、請願、採決（参議院のみ）、および委員会の所属状況等を集計しています。
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>基本方針</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              当サイトは特定の政治的立場に偏ることなく運営されています。特定の議員や政党に対する主観的な評価、独自のスコアリング、ランキング付けは一切行いません。質問主意書の提出件数、請願の紹介、法案の共同提出、本会議や委員会での発言回数など、公式記録として確認できる数値および属性情報のみを抽出して表示します。データの収集から集計に至るプロセスはすべてシステムによる自動処理で行い、運営者の恣意的な情報の取捨選択が介入しない設計としています。
            </p>
          </section>

          <section style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>データの仕様に関する留意点</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              日本の国会の仕組みやデータ公開の仕様により、当サイトのデータには以下の前提があります。
            </p>
            <p style={{ lineHeight: 1.9, color: "#888888", marginTop: 12 }}>
              <strong style={{ color: "#333333" }}>データ反映のタイムラグ：</strong>
              実際の国会での審議や活動が公式のシステムに登録され、当サイトに反映されるまでには、数日〜数週間の時間を要します。
            </p>
            <p style={{ lineHeight: 1.9, color: "#888888", marginTop: 12 }}>
              <strong style={{ color: "#333333" }}>衆議院の採決データについて：</strong>
              現在の日本の国会において、議員個人の賛否（投票記録）が公式に公開されているのは参議院のみです。そのため、当サイトの採決データも参議院議員のみを対象としています。
            </p>
            <p style={{ lineHeight: 1.9, color: "#888888", marginTop: 12 }}>
              <strong style={{ color: "#333333" }}>議会内の役割による数値の差異：</strong>
              与党議員は内閣提出法案（閣法）を中心に対応し、委員会では進行役（委員長や理事等）を務めることが多いため、個人名での法案提出や発言セッション数が野党議員と比較して少なくなる傾向があります。数値の多寡のみで活動全体を単純比較することはできません。
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
              textTransform: "uppercase", letterSpacing: 1.5,
              borderLeft: "3px solid #333333", paddingLeft: 10 }}>独自機能の考え方</h2>
            <p style={{ lineHeight: 1.9, color: "#888888" }}>
              <strong style={{ color: "#333333" }}>活動バランス（レーダーチャート）：</strong>
              各ページに表示されるレーダーチャートは、活動の「優劣」や「絶対量」を示すものではありません。発言、質問主意書、議員立法、請願といった活動のなかで、その議員や政党が「どの手段に比重を置いているか（活動の傾向）」を図示するものです。
            </p>
            <p style={{ lineHeight: 1.9, color: "#888888", marginTop: 12 }}>
              <strong style={{ color: "#333333" }}>AI分析機能：</strong>
              当サイトでは、ユーザーご自身のAI環境（APIキー）を用いて、サイト上の公開データを分析・要約できる機能を提供しています。ご入力いただいたAPIキーはご利用のブラウザ内にのみ保存され、当サイトのサーバーに送信・保存されることは一切ありません。出力される分析結果は、ユーザーの環境下でAIが自動生成した推測であり、当サイトの公式見解や評価ではありません。当サイトは評価や断定を行わず、解釈はユーザーに委ねられます。
            </p>
          </section>
        </div>

      </div>
    </div>
  );
}
