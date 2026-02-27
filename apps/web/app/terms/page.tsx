export default function TermsPage() {
  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 24 }}>利用規約</h1>

        <div style={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 16,
          padding: 28, fontSize: 13, color: "#94a3b8", lineHeight: 2 }}>

          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 12 }}>第1条（目的）</h2>
          <p style={{ marginBottom: 20 }}>
            本規約は、「はたらく議員」（以下「当サイト」）の利用条件を定めるものです。
            当サイトは、国会会議録等の公開記録および公開情報から機械的に集計した一部指標を表示するサービスです。
            当サイトの表示は、議員の活動の良否・有無を判定するものではありません。
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 12 }}>第2条（参照範囲）</h2>
          <p style={{ marginBottom: 20 }}>
            当サイトが参照するデータは、国立国会図書館の会議録検索システムAPI、衆議院・参議院の公開情報等に限られます。
            党務、地元活動、非公開の政策調整、非公開会議等、参照できない活動は含みません。
            「0件」は当サイト参照範囲の公開データ上で未検出であることを示し、活動の有無や良否の判断を示すものではありません。
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 12 }}>第3条（禁止行為）</h2>
          <p style={{ marginBottom: 8 }}>当サイトの利用にあたり、以下の行為を禁止します。</p>
          <p style={{ marginBottom: 4, paddingLeft: 16 }}>（1）誹謗中傷・嫌がらせ・脅迫・差別を目的とした利用</p>
          <p style={{ marginBottom: 4, paddingLeft: 16 }}>（2）特定候補者・政党に対する投票行動の誘導を目的とした利用（特に選挙期間）</p>
          <p style={{ marginBottom: 4, paddingLeft: 16 }}>（3）自動収集（スクレイピング）、過負荷アクセス、改ざん・なりすまし</p>
          <p style={{ marginBottom: 20, paddingLeft: 16 }}>（4）共有リンクの再配布・加工による誤認誘導</p>

          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 12 }}>第4条（免責事項）</h2>
          <p style={{ marginBottom: 20 }}>
            当サイトのデータは公的機関の公開情報を自動収集・整理したものであり、情報の正確性・完全性・最新性を保証するものではありません。
            データの反映遅延・表記揺れ等により、欠落や誤帰属が生じる可能性があります。
            当サイトの情報に基づく判断・行動について、運営者は一切の責任を負いません。
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 12 }}>第5条（データの訂正）</h2>
          <p style={{ marginBottom: 20 }}>
            データの誤りを発見された場合は、対象議員名・対象データ項目・正しいと主張する内容・根拠を明示の上、
            GitHubリポジトリのIssue等を通じてお知らせください。可能な限りURLまたは公的資料の参照先を添付してください。
            具体性を欠く申し立て（対象データ項目・根拠が不明）については対応いたしかねます。
          </p>

          <h2 style={{ fontSize: 16, fontWeight: 700, color: "#e2e8f0", marginBottom: 12 }}>第6条（規約の変更）</h2>
          <p style={{ marginBottom: 20 }}>
            運営者は、必要と判断した場合、本規約を変更することがあります。
            変更後の規約は当ページに掲載した時点で効力を生じるものとします。
          </p>

          <p style={{ color: "#475569", fontSize: 11, marginTop: 24 }}>
            制定日：2026年2月27日
          </p>
        </div>
      </div>
    </div>
  );
}
