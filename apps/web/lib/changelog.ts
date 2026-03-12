export interface ChangelogEntry {
  date: string;
  title: string;
  description?: string;
}

const changelog: ChangelogEntry[] = [
  {
    date: "2026-03-12",
    title: "SEO・AI検索エンジン対応を強化",
    description: "サイトマップ自動生成・robots.txt整備・llms.txt追加・各ページへの構造化データ（JSON-LD）埋め込みにより、検索エンジンおよびAIクローラーへの情報提供を強化しました。",
  },
  {
    date: "2026-03-12",
    title: "政党別採決一致率ページを改善",
    description: "会期フィルターをドロップダウンに変更、モバイルでの政党名省略表示、タブ・ソート状態のURL反映、ローディングスピナーを追加しました。",
  },
  {
    date: "2026-03-12",
    title: "議員立法一覧ページを追加",
    description: "全議員立法を一覧で確認できるページ（/bills）を追加しました。院フィルター・タイトル検索・提出者リンクに対応しています。",
  },
  {
    date: "2026-03-11",
    title: "委員会詳細ページをタブ表示に変更",
    description: "「委員長・理事」「議員一覧」「請願」の3タブで切り替え表示できるようになりました。",
  },
  {
    date: "2026-03-11",
    title: "トップページに請願タブを追加",
    description: "質問主意書・委員会活動・請願をタブで切り替えて確認できるようになりました。",
  },
  {
    date: "2026-03-11",
    title: "請願の並び順を日付降順に変更",
    description: "議員詳細ページの請願一覧が新しい順に表示されるようになりました。",
  },
];

export default changelog;
