# はたらく議員 — プロジェクト構成

## ディレクトリ全体像

```
giin-watch/
│
├── .github/
│   └── workflows/
│       ├── collect.yml       # 日次自動収集（UTC 18:00）
│       └── backfill.yml      # 手動バックフィル
│
├── apps/
│   ├── web/                  # Next.js フロントエンド
│   │   ├── app/
│   │   │   ├── page.tsx                      # トップ（ダッシュボード）
│   │   │   ├── layout.tsx                    # 共通レイアウト
│   │   │   ├── members/
│   │   │   │   ├── page.tsx                  # 現職議員一覧
│   │   │   │   ├── former/page.tsx           # 前議員一覧
│   │   │   │   └── [id]/page.tsx             # 議員詳細
│   │   │   ├── cabinet/page.tsx              # 内閣一覧
│   │   │   ├── parties/
│   │   │   │   ├── page.tsx                  # 政党・会派一覧
│   │   │   │   └── [party]/page.tsx          # 政党詳細
│   │   │   ├── committees/
│   │   │   │   ├── page.tsx                  # 委員会一覧
│   │   │   │   └── [name]/page.tsx           # 委員会詳細
│   │   │   ├── changelog/page.tsx            # 更新履歴
│   │   │   ├── about/page.tsx                # サイトについて（仕様書）
│   │   │   ├── disclaimer/page.tsx           # 免責事項
│   │   │   ├── privacy/page.tsx              # プライバシーポリシー
│   │   │   ├── terms/page.tsx                # 利用規約
│   │   │   ├── contact/page.tsx              # お問い合わせ
│   │   │   └── components/
│   │   │       ├── GlobalNav.tsx             # ナビゲーション
│   │   │       ├── GlobalFooter.tsx          # フッター
│   │   │       ├── WordCloud.tsx             # ワードクラウド表示
│   │   │       ├── ElectionSafeMode.tsx      # 選挙期間中の制限表示
│   │   │       └── MaintenanceBanner.tsx     # メンテナンスバナー
│   │   │
│   │   └── lib/
│   │       ├── supabase.ts   # Supabase クライアント
│   │       ├── queries.ts    # 共通クエリ関数
│   │       └── types.ts      # TypeScript 型定義
│   │
│   └── collector/            # データ収集スクリプト（Python）
│       ├── config.py         # 共通定数
│       ├── db.py             # get_client / execute_with_retry / batch_upsert
│       ├── utils.py          # make_member_id / is_procedural_speech 等
│       ├── run_daily.py      # 日次収集オーケストレーター
│       ├── run_backfill.py   # バックフィルオーケストレーター（--task 引数）
│       ├── sources/
│       │   ├── members.py          # 議員登録
│       │   ├── speeches.py         # NDL API 発言収集
│       │   ├── questions.py        # 質問主意書（衆院+参院）
│       │   ├── committees.py       # 委員会所属（衆院+参院）
│       │   ├── votes.py            # 参院採決記録（backfillのみ）
│       │   ├── bills.py            # 議員立法
│       │   ├── keywords.py         # ワードクラウド構築
│       │   └── cabinet_scraper.py  # 内閣役職（首相官邸スクレイピング）
│       └── processors/
│           ├── scoring.py    # スコア再計算
│           └── cleanup.py    # speeches 上限削除
```

## スタック

- **フロントエンド**: Next.js + TypeScript + Tailwind CSS v4
- **DB**: Supabase（PostgreSQL）無料プラン 500MB
- **データ収集**: Python（`apps/collector/`）
- **CI/CD**: GitHub Actions（`.github/workflows/`）
- **ホスティング**: Vercel

## 自動収集の仕組み

GitHub Actions（`collect.yml`）が UTC 18:00（JST 03:00）に毎日実行。
手動バックフィルは `backfill.yml` から `--task` 引数を指定して実行。

日次ジョブの収集順序：
1. 議員登録
2. 発言収集（NDL API）
3. スコア再計算
4. 内閣役職
5. 議員立法（現在セッションのみ）
6. 質問主意書（進行中セッションのみ）
7. 委員会所属
8. キーワード（直近7日の発言者のみ）
9. speeches 上限削除

## アーキテクチャ方針

- 新機能はコンポーネントとして作る
- 既存コードは修正が必要になったタイミングで切り出す
- 動いているものへの大規模リファクタリングは行わない

## 法的運用方針

- すべてのデータは公的機関の公開情報を自動収集したもの
- 人の手による修正・追加・削除は一切行わない
- この原則が著作権・名誉毀損・公職選挙法上のリスクを最小化する盾となる
