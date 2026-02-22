# 議員ウォッチ — プロジェクト構成

## ディレクトリ全体像

```
giin-watch/
│
├── apps/
│   ├── web/                        # Next.js フロントエンド
│   │   ├── app/
│   │   │   ├── page.tsx            # トップページ
│   │   │   ├── members/
│   │   │   │   ├── page.tsx        # 議員一覧
│   │   │   │   └── [id]/page.tsx   # 議員詳細
│   │   │   └── api/
│   │   │       └── ...             # API Routes
│   │   │
│   │   └── components/
│   │       ├── features/           # 機能ごとのコンポーネント（プラグイン）
│   │       │   ├── activity-score/ # 活動スコア表示
│   │       │   ├── voting-record/  # 投票履歴
│   │       │   ├── party-whip/     # 党議拘束チェッカー ★
│   │       │   ├── attendance/     # 出席率
│   │       │   ├── speeches/       # 発言履歴
│   │       │   └── political-funds/# 政治資金
│   │       └── ui/                 # 汎用UIパーツ
│   │
│   └── collector/                  # データ収集スクリプト（Python）
│       ├── sources/                # データソースごとにファイル分割
│       │   ├── ndl_api.py          # 国会図書館API（発言・委員会）
│       │   ├── shugiin_scraper.py  # 衆議院（採決・出席）
│       │   ├── sangiin_scraper.py  # 参議院（採決・出席）
│       │   ├── party_whip.py       # 党議拘束データ ★
│       │   └── political_funds.py  # 政治資金収支報告書
│       ├── scheduler.py            # 定期実行の管理
│       └── run_all.py              # 全収集を一括実行
│
└── packages/
    ├── db/                         # DBスキーマ・マイグレーション
    │   ├── schema.sql
    │   └── migrations/
    ├── scoring/                    # 活動スコア算出ロジック
    │   └── calculator.py
    └── types/                      # 共通型定義（TypeScript）
        └── index.ts
```

## 「プラグイン形式」の考え方

各機能（feature）は以下の3ファイルで完結させる。
追加・削除・無効化が独立してできる。

```
components/features/party-whip/
├── index.tsx        # 表示コンポーネント（UIの責務のみ）
├── hooks.ts         # データ取得・加工ロジック
└── types.ts         # この機能専用の型定義
```

新機能を追加するときは、このフォルダを1つ追加するだけ。
