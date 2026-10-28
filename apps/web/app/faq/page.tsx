import { SESSION_RANGE_SPEECHES } from "../../lib/constants";

export const metadata = {
  title: "データ仕様",
  description: "「はたらく議員」に掲載しているデータの収集方法・集計ルール・各指標の算出方法を解説。発言数・質問主意書・委員会出席・活動バランスチャートなど、各機能の仕様を確認できます。",
  openGraph: {
    title: "データ仕様 | はたらく議員",
    description: "「はたらく議員」に掲載しているデータの収集方法・集計ルール・各指標の算出方法を解説。発言数・質問主意書・委員会出席・活動バランスチャートなど、各機能の仕様を確認できます。",
  },
};

const sectionStyle = { marginBottom: 32 } as const;
const h2Style = {
  fontSize: "1.1em", fontWeight: 700, color: "#333333", marginBottom: 12,
  textTransform: "uppercase" as const, letterSpacing: 1.5,
  borderLeft: "3px solid #333333", paddingLeft: 10,
} as const;
const pStyle = { lineHeight: 1.9, color: "#888888" } as const;

export default function FaqPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111111" }}>データ仕様</h1>
          <p style={{ fontSize: 13, color: "#888888", marginTop: 8, marginBottom: 0 }}>
            データの収集方法・集計仕様・各機能の算出方法について説明しています。
          </p>
        </div>

        <div className="card-xl" style={{ fontSize: 13, color: "#888888", lineHeight: 2 }}>
        <section style={sectionStyle}>
          <h2 style={h2Style}>データの収集方法</h2>
          <p style={pStyle}>
            本サイトのデータは主に、衆議院・参議院・国立国会図書館の公式サイトで公開されている情報を自動収集したものです。
            ただし、選挙得票数・議席数など一部のデータは総務省公式資料をもとに手動で入力しています。
            また、公式ソースの仕様上の制約により実態と異なる場合がある一部のデータは手動で補正しています（詳細は<a href="/disclaimer" style={{ color: "#888" }}>免責事項</a>をご覧ください）。
          </p>
        </section>

        <section id="data-period" style={sectionStyle}>
          <h2 style={h2Style}>データの更新について</h2>
          <p style={pStyle}>
            データは毎日午前3時に自動収集・更新されます。
            国会会議録の登録には数日〜数週間のタイムラグがあるため、直近の発言は反映されていない場合があります。
            最新・正確な情報は各公式サイトをご確認ください。
          </p>
          <table style={{ marginTop: 16, width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e0e0e0" }}>
                <th style={{ textAlign: "left", padding: "6px 12px 6px 0", color: "#555555", fontWeight: 600 }}>データ種別</th>
                <th style={{ textAlign: "left", padding: "6px 0", color: "#555555", fontWeight: 600 }}>収集範囲</th>
              </tr>
            </thead>
            <tbody style={{ color: "#888888" }}>
              {[
                { label: "発言",         range: "第210回〜（2022年〜）" },
                { label: "質問主意書",   range: "第196回〜（2018年〜）" },
                { label: "請願",         range: "第196回〜（2018年〜）" },
                { label: "採決記録",     range: "第208回〜（2022年〜）参議院のみ・一覧表示は最新100件" },
                { label: "議員立法",     range: "第208回〜（2022年〜）" },
                { label: "閣法",         range: "第208回〜（2022年〜）参議院のみ" },
                { label: "委員会所属",   range: "現在のスナップショットのみ（累積なし）" },
                { label: "キーワード",   range: "直近4年分の発言から集計" },
              ].map((row) => (
                <tr key={row.label} style={{ borderBottom: "1px solid #f0f0f0" }}>
                  <td style={{ padding: "8px 12px 8px 0" }}>{row.label}</td>
                  <td style={{ padding: "8px 0" }}>{row.range}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section id="factions" style={sectionStyle}>
          <h2 style={h2Style}>会派の表記について</h2>
          <p style={pStyle}>
            当サイトは、議員の所属を政党ではなく<strong style={{ color: "#555555" }}>会派</strong>で表示しています。
            会派は国会の中で活動をともにする議員のグループで、衆議院・参議院それぞれに届け出られます。
            会派名は衆参の公式サイト・国会会議録・参議院の投票結果ページに記載された表記をそのまま使い、会派から政党を推定することはしません。
            選挙の結果だけは政党ごとに発表されるため、<a href="/elections" style={{ color: "#555555" }}>選挙結果</a>のページで政党名を使っています。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>過去の記録の会派：</strong>
            発言・採決・議員立法などの過去の記録は、現在の会派に付け替えず、記録の時点の会派で扱います。
            発言の会派は国会会議録の記載、参議院の採決の会派は投票結果ページの記載をそのまま使います。
            議員立法の提出者の会派は、提出日の前後の記録が同じ会派の場合のみ確定し、確定できない場合は集計に含めません。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>会派ページの件数の合計：</strong>
            会派ページの件数の合計は、現在その会派に所属している議員の件数を足したものです。その会派に所属する前の活動も含むため、会派としての活動量を表すものではありません。
          </p>
        </section>

        <section id="faction-history" style={sectionStyle}>
          <h2 style={h2Style}>会派の遍歴について</h2>
          <p style={pStyle}>
            議員ページの「会派の遍歴」には、2種類の記録を分けて表示しています。
          </p>
          <ul style={{ ...pStyle, paddingLeft: 20, marginTop: 8 }}>
            <li>国会会議録に記録された発言時点の会派：会派ごとに、会議録上の最初と最後の発言日を表示します。会派に入った日・離れた日そのものではありません。発言のない期間は空白のままにしています。</li>
            <li>議員名簿で確認した会派：当サイトが衆参の議員名簿で所属を確認した日と、変化を確認した日を表示します。</li>
          </ul>
          <p style={{ ...pStyle, marginTop: 12 }}>
            会議録の記録は、話者名と読み仮名が一致する発言から作成しています。同姓同名の別人の発言と区別できない場合や、同じ日に異なる会派の記録がある場合は表示していません。
            会派の移動の回数などの集計はしていません。
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>発言セッション数について</h2>
          <p style={pStyle}>
            発言セッション数は、同日・同委員会での複数の発言をまとめて1セッションとして集計しています。
            発言の長さや内容は考慮されていません。
            なお、以下の発言はカウントから除外しています：委員長・会長・議長の議事進行発言、および30文字以下の短い発言（相槌等）。
            {`収集対象は${SESSION_RANGE_SPEECHES}の記録に基づきます。`}
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>当選回数について</h2>
          <p style={pStyle}>
            当選回数は現在所属する院（衆議院または参議院）での回数です。
            他院での当選経歴は含まれません。そのため、院を移った（鞍替えした）議員の通算当選回数は実際より少なく表示される場合があります。
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>前議員・辞職議員について</h2>
          <p style={pStyle}>
            次回選挙の参考情報として、過去に国会で活動した前議員・辞職議員のデータも掲載しています。
            落選・辞職・死亡などの理由は区別せず、公式サイトから掲載が外れた時点で「前議員」として扱います。
          </p>
        </section>

        <section id="faction-network" style={sectionStyle}>
          <h2 style={h2Style}>会派ネットワーク（議員立法の共同提出）について</h2>
          <p style={pStyle}>
            議員立法ページの「会派ネットワーク」では、衆議院の議員立法について、提出者の会派の組み合わせごとに件数を数えています。
            提出者の会派は法案を提出した日の時点の会派で、前後の記録が同じ会派の場合のみ確定します。確定できない提出者、提出日の記録がない法案は数えず、確定できた割合を画面に表示しています。
            無所属・各派に属しない議員は会派の組み合わせに含めていません。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            参議院の議員立法は、当サイトでは筆頭の発議者のみを記録しているため対象外です。
            閣法（内閣提出法案）は含まないため、内閣を通じて法案を出す会派の件数は構造的に少なくなります。議員立法の共同提出という限られた指標であり、会派どうしの協力関係の全体を示すものではありません。
          </p>
        </section>

        <section id="vote-alignment" style={sectionStyle}>
          <h2 style={h2Style}>会派別の採決一致について</h2>
          <p style={pStyle}>
            参議院本会議の投票結果ページには、会派ごとの賛成票・反対票が記載されています。当サイトはこの票数で、賛成票が多ければその会派は「賛成」、反対票が多ければ「反対」とし、2つの会派の賛否が同じだった採決の割合を国会の回次ごとに集計しています。
            賛成と反対が同数の場合、票がない場合（投票なしのみ）は、その採決では対象外です。会派は採決の時点のものです。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            衆議院本会議は議員ごとの投票記録が公開されていないため対象外です。参議院でも、起立採決・異議なし採決は会派別の票数が記録されないため含まれません。
          </p>
        </section>

        <section id="activity-radar" style={sectionStyle}>
          <h2 style={h2Style}>活動バランスチャートについて</h2>
          <p style={pStyle}>
            活動バランスチャートは活動量（件数の多さ）を示すものではなく、各議員の活動の比重・傾向を示すものです。
            発言セッション・質問主意書・議員立法・請願の各項目について、全体の最大値を基準として比率を算出した後、
            各項目の比率が均一な議員がチャートの中心から均等に広がるよう調整して表示しています。
            そのため、活動量が大きく異なる場合でも活動の比重が同じであれば同じ形状になります。
            各項目は件数のみを示すものであり、活動の労力・質・重要性を比較するものではありません。
            また、全項目が0件の場合はチャートが空白になります。
          </p>
        </section>

        <section id="election-votes" style={sectionStyle}>
          <h2 style={h2Style}>選挙結果について</h2>
          <p style={pStyle}>
            <a href="/elections" style={{ color: "#555555" }}>選挙結果</a>のページでは、国政選挙の政党別の得票数（選挙区・比例）と獲得議席数を、総務省の公式資料の数値のまま掲載しています。
            データは公式資料（PDF・XLSX）から手動で入力しています。得票率などの独自の指標は計算していません。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>議席数の集計基準：</strong>
            議席数は選挙で確定した時点の数です。当選後の追加公認・会派への所属・補欠選挙は反映していません。
            （例：2026年衆院選で無所属で当選し、その後に政党の追加公認を受けた議員は、無所属に含まれます）
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>対象選挙：</strong>
            衆院2026（令和8年）・参院2025（令和7年）・参院2022（令和4年）。
          </p>
        </section>

        <section id="ai-analysis" style={sectionStyle}>
          <h2 style={h2Style}>AI分析機能について</h2>
          <p style={pStyle}>
            議員の各ページには、ユーザー自身のAPIキーを使ってページ上の公開データをAIで分析・要約できる機能があります。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            AIには、当該ページに表示されている活動データ（発言セッション数・質問主意書・議員立法・採決・請願・所属委員会・頻出キーワード等）がテキストとして渡されます。発言の全文は含まれません。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            入力されたAPIキーおよびデータは、ブラウザから直接AI事業者のサーバーへ送信されます。当サイトのサーバーには一切送信・保存されません。
            出力はAIが自動生成したものであり、当サイトの見解ではありません。
          </p>
        </section>

        <section id="wordcloud" style={{ marginBottom: 0 }}>
          <h2 style={h2Style}>キーワードについて</h2>
          <p style={pStyle}>
            議員の発言データから形態素解析（MeCab）で名詞を抽出し、出現頻度の高い順に表示しています。会派ページのキーワードは、現在その会派に所属している議員のキーワードを合算したものです（その会派に所属する前の発言も含みます）。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            以下は除外しています：
          </p>
          <ul style={{ ...pStyle, paddingLeft: 20, marginTop: 8 }}>
            <li>一般的な助詞・助動詞・記号</li>
            <li>役職名（大臣・副大臣・政務官・長官 等）</li>
            <li>「総理」「総理大臣」「内閣総理大臣」</li>
            <li>議員本人の名前</li>
            <li>1文字の名詞</li>
            <li>30文字以下の短い発言（相槌等）に含まれる語</li>
          </ul>
          <p style={{ ...pStyle, marginTop: 12 }}>
            1議員あたり上位100語を蓄積し、上位50語を表示しています。
            1年以上発言に登場しなかったワードは、新しいワードと順次入れ替わります。
            発言本文はサーバー上で処理後に破棄しており、データベースには保存していません。
          </p>
        </section>
        </div>

      </div>
    </div>
  );
}
