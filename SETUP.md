# はたらく議員 — セットアップ手順

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
3. `schema.sql` の内容を全てコピーして実行
4. 「Settings > API」から以下をコピーしておく
   - Project URL
   - anon/public key

> **DBスキーマ変更履歴は `migrations/` ディレクトリに連番で管理しています。**
> 既存プロジェクトへの差分適用は `migrations/NNN_*.sql` を順番に SQL Editor で実行してください。

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

# 動作テスト（議員基本情報）
PYTHONPATH=. python3 sources/members.py

# 動作テスト（発言セッション数）
PYTHONPATH=. python3 sources/speeches.py
```

利用可能なコレクター一覧:

| スクリプト | 収集内容 |
|---|---|
| `sources/members.py` | 議員基本情報（氏名・選挙区・期数等） |
| `sources/speeches.py` | 発言セッション数 |
| `sources/keywords.py` | 発言キーワード |
| `sources/questions.py` | 質問主意書 |
| `sources/bills.py` | 議員立法 |
| `sources/petitions.py` | 請願 |
| `sources/committees.py` | 委員会所属 |
| `sources/votes.py` | 採決記録 |
| `sources/vote_alignment.py` | 政党間採決一致率 |
| `sources/party_whip.py` | 党議拘束推定 |
| `sources/cabinet_scraper.py` | 閣法 |
| `sources/election_votes.py` | 選挙得票数・議席数（手動入力）|

---

## STEP 5｜GitHub Actions 自動実行設定（5分）

GitHubリポジトリの「Settings > Secrets > Actions」で以下を登録:

| Secret名 | 値 |
|---|---|
| SUPABASE_URL | Step2のProject URL |
| SUPABASE_KEY | Step2のanon key |

→ 毎日 JST 午前3時に自動でデータが更新されるようになる

---

## 手動管理データについて

以下のデータは選挙・政治変動のたびに手動で更新が必要です。
詳細は **`DATA_MANAGEMENT.md`** を参照してください。

| データ | ファイル |
|---|---|
| 選挙得票数・議席数 | `apps/collector/sources/election_votes.py` |
| 政党の与野党ステータス | `apps/web/lib/partyStatus.ts` |
| 政党カラー | `apps/web/lib/partyColors.ts` |
| 政党公式URL | `apps/web/app/parties/[party]/PartyDetailClient.tsx` |
| 議員の政党補正 | `apps/collector/sources/members.py` |
| 変更履歴 | `apps/web/lib/changelog.ts` |

---

## 新機能を追加するとき

```bash
# 例: 新しいデータ種別を追加する場合

# 1. コレクタースクリプトを追加
touch apps/collector/sources/new_feature.py

# 2. DBテーブルが必要なら migrations/ に追加
touch migrations/NNN_add_new_feature.sql
# → Supabase SQL Editor で実行

# 3. フロントエンドに表示を追加
#    既存ページに追加: apps/web/app/[page]/page.tsx
#    新規ページ:       apps/web/app/new-page/page.tsx

# 4. GitHub Actions に収集ステップを追加
#    .github/workflows/collect.yml を編集
```

---

## ファイル変更が必要な場面

| やりたいこと | 触るファイル |
|---|---|
| 議員の政党表示を補正する | `apps/collector/sources/members.py` の `PARTY_OVERRIDES` |
| 選挙データを追加する | `apps/collector/sources/election_votes.py` |
| 政党の与野党ステータスを更新 | `apps/web/lib/partyStatus.ts` |
| 政党カラーを追加 | `apps/web/lib/partyColors.ts` |
| DB構造変更 | `migrations/` に連番で追加 |
| UIデザイン変更 | 各 `apps/web/app/` 以下のコンポーネント |
