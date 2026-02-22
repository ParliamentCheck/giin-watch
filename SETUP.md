# 議員ウォッチ — セットアップ手順

## 前提条件
- Node.js 20以上
- Python 3.12以上
- GitHubアカウント
- Supabase アカウント（無料）

---

## STEP 1｜リポジトリ作成（5分）

```bash
# GitHubで新規リポジトリ "giin-watch" を作成後
git clone https://github.com/あなたのユーザー名/giin-watch.git
cd giin-watch

# このプロジェクトのファイル一式をコピーして配置
git add .
git commit -m "initial commit"
git push
```

---

## STEP 2｜Supabase セットアップ（10分）

1. https://supabase.com でプロジェクト作成
2. 「SQL Editor」を開く
3. `packages/db/schema.sql` の内容を全てコピーして実行
4. 「Settings > API」から以下をコピーしておく
   - Project URL
   - anon/public key

---

## STEP 3｜フロントエンド起動（5分）

```bash
cd apps/web
cp .env.example .env.local

# .env.local を編集
NEXT_PUBLIC_SUPABASE_URL=（Step2でコピーしたURL）
NEXT_PUBLIC_SUPABASE_ANON_KEY=（Step2でコピーしたキー）

npm install
npm run dev
# → http://localhost:3000 で開く
```

---

## STEP 4｜データ収集スクリプトのテスト（10分）

```bash
cd apps/collector
pip install -r requirements.txt

# 環境変数を設定
export SUPABASE_URL=（Step2でコピーしたURL）
export SUPABASE_KEY=（Step2でコピーしたキー）

# 動作テスト（発言回数取得）
python sources/ndl_api.py

# スコア計算テスト
python ../../packages/scoring/calculator.py
```

---

## STEP 5｜GitHub Actions 自動実行設定（5分）

GitHubリポジトリの「Settings > Secrets > Actions」で以下を登録:

| Secret名 | 値 |
|---|---|
| SUPABASE_URL | Step2のProject URL |
| SUPABASE_KEY | Step2のanon key |

→ 毎日午前3時（JST）に自動でデータが更新されるようになる

---

## 新機能を追加するとき

```bash
# 例: 「質問主意書チェッカー」を追加する場合

# 1. コンポーネントフォルダを作る
mkdir apps/web/components/features/written-questions

# 2. 3ファイルを作る
touch apps/web/components/features/written-questions/index.tsx  # UI
touch apps/web/components/features/written-questions/hooks.ts   # データ
touch apps/web/components/features/written-questions/types.ts   # 型

# 3. DBにテーブルが必要なら schema.sql に追記してSupabaseで実行

# 4. 収集スクリプトが必要なら
touch apps/collector/sources/written_questions.py

# 5. GitHub Actions の collect.yml に実行ステップを追加
```

**既存のコードは一切触らなくていい。**

---

## ファイル変更が必要な場面

| やりたいこと | 触るファイル |
|---|---|
| スコアの計算式を変える | `packages/scoring/calculator.py` のみ |
| 新しい指標を追加 | 新featureフォルダ + schema.sql |
| 党サイトのURL変更に対応 | `collector/sources/party_whip.py` のみ |
| UIデザイン変更 | 各feature/index.tsx のみ |
| DB構造変更 | `packages/db/migrations/` に追加 |
