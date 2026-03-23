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

        <section id="party-stats-note" style={sectionStyle}>
          <h2 style={h2Style}>政党・会派の表記について</h2>
          <p style={pStyle}>
            「政党・会派」の表記は、衆議院・参議院の公式サイトに登録された所属会派名を表示しています。
            選挙時の届出政党と国会での所属会派が異なる場合があります（例：特定政党から出馬したが、国会では無所属会派に属する場合）。
            正確な届出政党については各公式サイトをご確認ください。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>政党ページの集計値について：</strong>
            発言・質問主意書・議員立法などの活動実績は、現時点での所属議員をもとに集計しています。
            そのため、議員の移籍・会派の合流・解党などが発生した場合、過去の活動実績が移籍前の政党から移籍後の政党へ移動し、双方の集計値が変動します。
            過去の活動が「どの政党に所属していたときのものか」を遡って正確に区別することは構造上困難なため、現在の所属を基準とした集計としています。
          </p>
        </section>

        <section style={sectionStyle}>
          <h2 style={h2Style}>発言セッション数について</h2>
          <p style={pStyle}>
            発言セッション数は、同日・同委員会での複数の発言をまとめて1セッションとして集計しています。
            発言の長さや内容は考慮されていません。
            なお、以下の発言はカウントから除外しています：委員長・会長・議長の議事進行発言、および30文字以下の短い発言（相槌等）。
            収集対象は第210回〜第221回国会の記録に基づきます。
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

        <section id="party-network" style={sectionStyle}>
          <h2 style={h2Style}>政党間共同提出ネットワークについて</h2>
          <p style={pStyle}>
            議員立法ページの「政党ネットワーク」タブでは、議員立法の共同提出者データをもとに、政党間の共同提出件数を集計・可視化しています。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>中道改革連合について：</strong>
            中道改革連合は旧公明党・旧立憲民主党の議員が合流して2026年1月16日に結成された会派です。
            ネットワーク集計では、結成日以前に提出された法案については前所属政党（公明党または立憲民主党）として扱い、結成日以降に提出された法案については中道改革連合として扱います。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>構造的バイアスについて：</strong>
            与党は主に内閣を通じて法案（閣法）を提出するため、議員立法の提出数は野党より少なくなる傾向があります。
            そのため、与党の共同提出件数が少ないことは活動量の少なさを意味しません。
            本データは議員立法の共同提出という限定的な指標であり、政党間の協力関係全体を示すものではありません。
          </p>
        </section>

        <section id="activity-radar" style={sectionStyle}>
          <h2 style={h2Style}>活動バランスチャートについて</h2>
          <p style={pStyle}>
            活動バランスチャートは活動量（件数の多さ）を示すものではなく、各議員・政党の活動の比重・傾向を示すものです。
            発言セッション・質問主意書・議員立法・請願の各項目について、全体の最大値を基準として比率を算出した後、
            各項目の比率が均一な議員・政党がチャートの中心から均等に広がるよう調整して表示しています。
            そのため、活動量が大きく異なる場合でも活動の比重が同じであれば同じ形状になります。
            各項目は件数のみを示すものであり、活動の労力・質・重要性を比較するものではありません。
            また、全項目が0件の場合はチャートが空白になります。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            政党ページのチャートには上記4項目に加え「委員会役職（委員長・理事・会長・副会長）」の5項目を使用しています。
            委員会役職は現在のスナップショットであり、過去の累積値ではありません。
          </p>
        </section>

        <section id="election-votes" style={sectionStyle}>
          <h2 style={h2Style}>選挙得票率 vs 議席率について</h2>
          <p style={pStyle}>
            政党ページの「得票率 vs 議席率」では、各選挙での得票率と議席率の乖離を可視化しています。
            データは総務省公式資料（PDF・XLSX）に基づき手動入力しています。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>得票率の計算方法（独自指標）：</strong>
            衆院選・参院選ともに、小選挙区（選挙区）得票数と比例得票数を合算した値を総投票数で割った値を得票率として使用しています。
            有権者が投じる2票（選挙区票・比例票）を等しく「国民の声」として扱うことで、実際に投じられた全票と議席のギャップを示す指標です。
            報道各社が主に使用する「小選挙区のみ」の得票率とは数値が異なります（当サイトの数値の方が小さくなります）。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>議席数の集計基準：</strong>
            議席数は選挙確定時点の数値を使用しています。当選後の追加公認・会派移籍は反映しません。
            （例：2026年衆院選で無所属当選後に自民党へ追加公認された議員は、選挙時の集計では無所属に含まれます）
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>対象選挙：</strong>
            衆院2026（令和8年）・参院2025（令和7年）・参院2022（令和4年）。
            現職議員が在籍しない政党・団体は表示対象外です。
          </p>
          <p style={{ ...pStyle, marginTop: 12 }}>
            <strong style={{ color: "#555555" }}>無所属の得票率について：</strong>
            無所属候補は比例代表に出馬できないため、比例得票数は常に0となります。
            この計算方式では分母に小選挙区＋比例の総投票数を用いるため、無所属の得票率は政党と比べて構造的に低く算出されます（実際の小選挙区での支持よりも小さい値になります）。
          </p>
        </section>

        <section id="ai-analysis" style={sectionStyle}>
          <h2 style={h2Style}>AI分析機能について</h2>
          <p style={pStyle}>
            議員・政党の各ページには、ユーザー自身のAPIキーを使ってページ上の公開データをAIで分析・要約できる機能があります。
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
            議員・政党の発言データから形態素解析（MeCab）で名詞を抽出し、出現頻度の高い順に表示しています。
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
