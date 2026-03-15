# はたらく議員 — プロジェクト構成

> 最終更新: 2026-03-16

## ディレクトリ全体像

```
giin-watch/
├── .github/
│   └── workflows/
│       ├── collect.yml          # 日次自動収集（UTC 18:00 = JST 3:00）
│       ├── backfill.yml         # 手動バックフィル（年・タスク選択）
│       ├── cleanup.yml          # 手動クリーンアップ（truncate-speeches 等）
│       └── keyword-full-rebuild.yml  # キーワード全件再構築
│
├── apps/
│   ├── web/                     # Next.js フロントエンド
│   │   ├── app/
│   │   │   ├── page.tsx                       # トップ（統計・最新活動・政党バーチャート・更新履歴）
│   │   │   ├── layout.tsx                     # 共通レイアウト（metadata・JSON-LD）
│   │   │   ├── sitemap.ts                     # sitemap.xml 動的生成
│   │   │   ├── robots.ts                      # robots.txt
│   │   │   ├── members/
│   │   │   │   ├── page.tsx / MembersClient.tsx          # 現職議員一覧
│   │   │   │   ├── former/page.tsx / FormerMembersClient.tsx  # 前議員一覧
│   │   │   │   └── [id]/page.tsx / MemberDetailClient.tsx    # 議員詳細
│   │   │   ├── cabinet/page.tsx / CabinetClient.tsx      # 現内閣（役職順）
│   │   │   ├── parties/
│   │   │   │   ├── page.tsx / PartiesClient.tsx           # 政党・会派一覧
│   │   │   │   └── [party]/page.tsx / PartyDetailClient.tsx  # 政党詳細
│   │   │   ├── committees/
│   │   │   │   ├── page.tsx / CommitteesClient.tsx        # 委員会一覧
│   │   │   │   └── [name]/page.tsx / CommitteeDetailClient.tsx # 委員会詳細
│   │   │   ├── bills/page.tsx / BillsClient.tsx           # 議員立法・閣法・政党ネットワーク
│   │   │   ├── votes/page.tsx / VotesClient.tsx           # 政党別採決一致率
│   │   │   ├── favorites/page.tsx / FavoritesClient.tsx   # お気に入り議員
│   │   │   ├── changelog/page.tsx / ChangelogClient.tsx   # 更新履歴
│   │   │   ├── about/                         # サイトについて
│   │   │   ├── disclaimer/                    # 免責事項（レーダーチャート説明含む）
│   │   │   ├── privacy/                       # プライバシーポリシー
│   │   │   ├── terms/                         # 利用規約
│   │   │   └── contact/                       # お問い合わせ（Googleフォーム）
│   │   │
│   │   ├── components/
│   │   │   ├── GlobalNav.tsx                  # ヘッダーナビゲーション
│   │   │   ├── GlobalFooter.tsx               # フッター
│   │   │   └── MemberChip.tsx                 # 議員リンクチップ（前議員はグレー表示）
│   │   │
│   │   ├── app/components/
│   │   │   ├── ActivityTabs.tsx               # トップページ活動タブ
│   │   │   ├── ActivityRadar.tsx              # 活動バランスレーダーチャート
│   │   │   └── WordCloud.tsx                  # ワードクラウド（d3-cloud）
│   │   │
│   │   └── lib/
│   │       ├── supabase.ts                    # Supabase クライアント
│   │       ├── favorites.ts                   # お気に入り管理（localStorage）
│   │       ├── partyColors.ts                 # 政党カラー定義
│   │       └── changelog.ts                   # 更新履歴データ
│   │
│   └── collector/               # データ収集スクリプト（Python）
│       ├── config.py            # 共通定数（SESSION_MAX・PARTY_MAP 等）
│       ├── db.py                # get_client / execute_with_retry / batch_upsert
│       ├── utils.py             # make_member_id / is_procedural_speech 等
│       ├── run_daily.py         # 日次収集オーケストレーター
│       ├── run_backfill.py      # バックフィルオーケストレーター（--task 引数）
│       ├── sources/
│       │   ├── members.py             # 議員登録（衆院・参院スクレイピング）
│       │   ├── speeches.py            # NDL API 発言収集（メタデータのみ・本文破棄）
│       │   ├── questions.py           # 質問主意書（衆院 + 参院）
│       │   ├── petitions.py           # 請願（衆院 + 参院）
│       │   ├── committees.py          # 委員会所属（衆院 + 参院）
│       │   ├── votes.py               # 参院採決記録（衆院は個人別非公開）
│       │   ├── bills.py               # 議員立法 + 閣法（参院サイトを正として収集）
│       │   ├── keywords.py            # ワードクラウド構築（MeCab形態素解析）
│       │   └── cabinet_scraper.py     # 内閣役職データ（首相官邸スクレイピング）
│       └── processors/
│           ├── scoring.py             # speech_count / session_count / question_count / bill_count / petition_count 再計算
│           ├── cleanup.py             # speeches 上限削除・各種検証タスク
│           └── audit.py              # データ品質監査（日次自動実行・不整合時GitHub Issue作成）
│
├── scripts/
│   ├── register_missing_former_members.py  # bills/speeches に登場する前議員の一括登録
│   └── （その他一回限りの移行スクリプト）
│
├── supabase/
│   └── migrations/              # DBスキーマ変更履歴
│
├── former_members_review.md     # 前議員候補の手動判定リスト（要確認214名）
├── PROJECT_SPEC_v2.md           # 技術仕様書（詳細）
├── PROJECT_STRUCTURE.md         # 本ファイル
└── STATUS.md                    # 現在のデータ状況・機能一覧
```

## スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js + TypeScript + Tailwind CSS v4 |
| DB | Supabase（PostgreSQL）無料プラン 500MB |
| データ収集 | Python（`apps/collector/`） |
| CI/CD | GitHub Actions |
| ホスティング | Vercel |

## 日次ジョブの収集順序（collect.yml）

1. 議員登録（members.py）
2. 発言収集（speeches.py）
3. スコア再計算（scoring.py）
4. 内閣役職（cabinet_scraper.py）
5. 質問主意書（questions.py）
6. 請願（petitions.py）
7. 採決記録（votes.py --mode daily）
8. 委員会所属（committees.py）
9. キーワード更新（keywords.py --mode daily）
10. speeches 上限チェック（cleanup.py）
11. データ品質監査（audit.py）

## アーキテクチャ方針

- 新機能はコンポーネントとして作る
- 動いているものへの大規模リファクタリングは行わない
- 全ページは `page.tsx`（サーバー・metadata）+ `XxxClient.tsx`（クライアント）に分離
- タブ・ソート・フィルターの状態はURLパラメータに反映（SNSシェア対応）
- 発言本文はDBに保存しない（キーワード構築後に破棄）

## 法的運用方針

- すべてのデータは公的機関の公開情報を自動収集したもの
- 人の手による修正・追加・削除は一切行わない
- この原則が著作権・名誉毀損・公職選挙法上のリスクを最小化する盾となる
