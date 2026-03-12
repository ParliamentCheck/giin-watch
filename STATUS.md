# はたらく議員 — プロジェクト現状ドキュメント

> 最終更新: 2026-03-12

---

## プロジェクト概要

国会議員の活動を可視化するWebサービス「はたらく議員」。
議員の発言数・質問主意書数・委員会所属・採決記録などを収集・スコアリングして公開する。

---

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フロントエンド | Next.js + TypeScript + Tailwind CSS v4（`apps/web/`） |
| データベース | Supabase（PostgreSQL）無料プラン 500MB |
| データ収集 | Python（`apps/collector/`） |
| CI/CD | GitHub Actions（`.github/workflows/`） |
| Git ブランチ | `develop` / `master`（ff-only で master に merge・常にセット） |

---

## コレクター構成

```
apps/collector/
  config.py                    # 共通定数（API URL、制限値など）
  db.py                        # get_client / execute_with_retry / batch_upsert
  utils.py                     # make_member_id / is_procedural_speech など
  run_daily.py                 # 日次収集オーケストレーター（ローカル実行用）
  run_backfill.py              # バックフィルオーケストレーター（--task 引数）
  sources/
    members.py                 # 議員登録（衆院・参院サイトをスクレイピング）
    speeches.py                # NDL API 発言収集（メタデータのみ保存・テキスト破棄）
    questions.py               # 質問主意書（衆院 questions + 参院 sangiin_questions に保存）
    petitions.py               # 請願（衆院 petitions + 参院 sangiin_petitions に保存）
    committees.py              # 委員会所属（衆院・参院 → committee_members に保存）
    votes.py                   # 参院採決記録（votes に保存）※衆院は個人別データ非公開
    bills.py                   # 議員立法（bills に保存）
    keywords.py                # ワードクラウド構築（member_keywords / party_keywords）
    cabinet_scraper.py         # 内閣役職データ
  processors/
    scoring.py                 # speech_count / session_count / question_count / petition_count 再計算
    cleanup.py                 # speeches 上限削除・各種検証タスク
scripts/
  migrate_member_ids.py        # 一回限りのDB移行スクリプト（bracket形式ID → kanji形式）
  backfill_procedural.py       # is_procedural フラグのバックフィル
```

---

## DBテーブル構造

| テーブル | 概要 | member_id形式 |
|---|---|---|
| `members` | 議員マスタ（PK: `id`） | `"{house}-{kanji_name}"` |
| `speeches` | 発言メタデータ（NDL API） | FK to members.id |
| `questions` | 衆院質問主意書 | FK to members.id |
| `sangiin_questions` | 参院質問主意書 | FK to members.id |
| `petitions` | 衆院請願 | `introducer_ids`（配列型） |
| `sangiin_petitions` | 参院請願 | `introducer_ids`（配列型） |
| `committee_members` | 委員会所属 | FK to members.id |
| `votes` | 参院採決記録 | FK to members.id |
| `bills` | 議員立法 | `submitter_ids`（配列型） |
| `member_keywords` | 議員別ワードクラウド | FK to members.id |
| `party_keywords` | 政党別ワードクラウド | — |

**member_id の正しい形式**: `"衆議院-山田太郎"` / `"参議院-山田太郎"`
（スペースなし・漢字のみ・bracket表記なし）

---

## GitHub Actions

### collect.yml — 日次自動収集（UTC 18:00）
実行順序:
1. 議員登録（`sources/members.py`）
2. 発言収集（`sources/speeches.py`）
3. スコア再計算（`processors/scoring.py`）
4. 内閣役職（`sources/cabinet_scraper.py`）
5. 質問主意書（`sources/questions.py`）※衆院+参院
6. 請願（`sources/petitions.py`）※衆院+参院（日次は直近2セッションのみ）
7. 採決記録（`sources/votes.py --mode daily`）※参院・現会期のみ（timeout 10分）
8. 委員会所属（`sources/committees.py`）※衆院+参院
9. キーワード更新（`sources/keywords.py --mode daily`）
10. speeches 上限チェック（`processors/cleanup.py --task truncate-speeches`）

各ステップは `continue-on-error: true` で独立。

### backfill.yml — 手動実行タスク

| タスク | 内容 |
|---|---|
| `migrate-member-ids` | DB内の旧形式IDを一括変換 |
| `scoring-only` | スコアのみ再計算 |
| `speeches-all` | 2021年〜現在年の発言を年単位で順次バックフィル（動的） |
| `speeches-YYYY` | 特定年の発言バックフィル |
| `keyword-all` | キーワード全件再構築（2022年〜現在年・何度実行しても同じ結果） |
| `keyword-full-rebuild` | キーワード全件再構築（遡及年数を `--years` で指定） |
| `votes-collect` | 参院採決記録収集 |
| `bills-collect` | 議員立法収集 |
| `sangiin-questions` | 参院質問主意書収集 |
| `petitions-collect` | 衆院・参院請願収集（全セッション） |

---

## フロントページ構成

| パス | 内容 |
|---|---|
| `/` | トップ（統計・最新活動タブ・政党バーチャート・更新履歴） |
| `/members` | 現職議員一覧（ソート・フィルター・お気に入り★） |
| `/members/[id]` | 議員詳細（委員会・発言・質問・採決・議員立法・請願・キーワード） |
| `/members/former` | 前議員一覧 |
| `/cabinet` | 内閣一覧 |
| `/parties` | 政党・会派別データ |
| `/parties/[name]` | 政党詳細 |
| `/committees` | 委員会一覧 |
| `/committees/[name]` | 委員会詳細（党別構成・委員長/理事/委員・請願タブ） |
| `/bills` | 議員立法一覧（院フィルター・タイトル検索・提出者リンク） |
| `/favorites` | お気に入り議員（マイダッシュボード・URLシェア） |

---

## 設計上の注意事項

### Supabase PostgREST の制限
- **最大1000行/リクエスト**（デフォルト）。`limit(2000)` を指定しても1000行しか返らない
- ページネーションの終了条件は `if not batch: break`（`len(batch) < PAGE` は使ってはいけない）
- 大量OFFSETクエリでstatement_timeoutが発生する → cursor pagination（`id > last_id`）で回避

### members テーブルの書き込み
- `upsert` 禁止（`name NOT NULL` 制約に違反するケースがある）
- 書き込みは **UPDATE のみ**（既存行の更新に限定）
- PK（`members.id`）変更が必要な場合: 新ID行INSERT → 参照テーブルUPDATE → 旧ID行DELETE の順

### speeches テーブル
- 上限: **500,000行**（`SPEECHES_MAX_ROWS`）。超過時は `spoken_at` 昇順で古い順に削除
- 発言テキストはDBに保存しない（キーワード構築後に破棄）
- `is_procedural = True` の発言はスコアリング対象外

---

## 現在のデータ状況（2026-03-08時点）

| 指標 | 値 |
|---|---|
| 登録議員数 | 839名 |
| 発言あり議員 | 725 / 839名 |
| speeches総行数 | 664,385件（うち108,163件はmember_id=NULL） |
| speeches上限 | 500,000行 |

---

## 解決済みの問題

### ③ トップページ「発言記録」が0件表示（commit 17dae0b）
**原因**: `page.tsx` が `speeches` テーブルに `count: "exact"` クエリを送っていたが、RLS が anon のカウントをブロックして 0 を返していた。
**修正**: `members.speech_count` の合計値を使うよう変更。members クエリを1本に統合。

### ① member_id 不一致（bracket形式）
**原因**: 参院サイトが議員名の表示形式を `"犬童周作"` → `"いんどう周作[犬童周作]"` に変更。
`members.id` が bracket形式になり、旧スピーチの `member_id`（kanji形式）と不一致。
**修正**: `sources/members.py` で参院名をkanji名のみに正規化し、読み仮名を `ndl_names` に保存。
`scripts/migrate_member_ids.py` でDB内の既存bracket形式IDを一括変換（手動実行済み）。

### ② スコアリングが全員0になるバグ
**原因**: `processors/scoring.py` の `_fetch_all()` 内ページネーション終了条件のバグ。
`if len(batch) < PAGE` で break していたため、Supabaseが1000行返すとPAGE=2000未満と判定されて即終了 → 先頭1000件しか集計されず。
**修正**: `if not batch: break` に変更（commit 5a20973）。
**結果**: 発言あり議員が 42/839 → 725/839 に改善。

---

## 残タスク

### 要実行（データ補完）
- [ ] **`keyword-all`** を Actions で実行
  → 725名分のキーワードが未構築。2022年〜現在年を全件再構築。何度実行しても正しい結果になる

### 要実行（bills 再収集）
- [ ] **`bills-collect`** を Actions で再実行
  → commit 6c8d874 でスクレイパーを修正済み。修正版で再収集が必要
  → 詳細ページ取得のため完了まで数十分かかる
  → 完了後に以下のSQLで確認:
    ```sql
    SELECT COUNT(*), house FROM bills GROUP BY house;
    WITH all_sids AS (SELECT unnest(submitter_ids) AS sid FROM bills)
    SELECT COUNT(*) AS total, COUNT(m.id) AS matched FROM all_sids a LEFT JOIN members m ON m.id = a.sid;
    ```

### 要実行（請願データ初期取得）
- [ ] **`petitions-collect`** を Actions で実行
  → `petitions` / `sangiin_petitions` テーブルにデータを一括投入
  → 完了後、scoring-only を実行して `petition_count` を更新

### 対応しない・保留
- **議員写真** — 著作権・肖像権リスクがあるため、安全な方法が確認できない限り実装しない
- **衆院採決記録** — 個人別データの収集コストが高すぎるため、良い案が見つかるまで保留
- **旧議員データ管理ポリシー** — 現状 `/members/former` で問題なく動作中。方針が必要になったタイミングで検討

### Phase 3: GitHub Actions 整理
- collect.yml / backfill.yml のさらなる整理（必要に応じて）

---

## キーとなるコード箇所

```python
# apps/collector/db.py
def execute_with_retry(query_fn, *, max_retries=3, label="query"):
    """Supabaseクエリをリトライ付きで実行。"""

# apps/collector/processors/scoring.py
def _fetch_all(table, select):
    """全件カーソルページング。終了条件: if not batch: break（重要）"""

# apps/collector/utils.py
def make_member_id(house, name):
    """議員ID生成: f"{house}-{name}" スペース除去"""

def is_procedural_speech(speech_text):
    """議事進行発言判定: 30文字以下 or 委員長/議長役職を含む"""

def build_member_name_set(member_names: list[str]) -> frozenset[str]:
    """全議員名から除外用 frozenset を構築。ループ前に1回だけ呼ぶ。"""

def should_exclude_word(word, member_name="", all_member_names=None):
    """キーワード除外判定。自身の名前＋全議員名（部分一致）を除外。"""

# apps/collector/sources/keywords.py
def full_rebuild(years: int = 4):
    """全議員キーワードを years 年分ゼロから再構築（冪等）。
    keyword-all は KEYWORD_START_YEAR(2022)〜現在年で呼ぶ。"""
```

---

## データ品質監査（audit.py）

`apps/collector/processors/audit.py` — 日次ジョブの最後に自動実行。

### チェック内容
| チェック | 対象 | 方法 |
|---|---|---|
| 発言数 | ランダム5名 | NDL APIで直近90日の件数とDBを比較。DBが0件なのにNDLに10件超あれば不整合 |
| 大臣職 | DB登録の閣僚全員 | 官邸サイトをスクレイピングし、DBのcabinet_postと照合。官邸に名前がなければ退任の可能性 |

### 不整合時の動作
- `audit.py` が exit 1 で終了
- `collect.yml` の「監査エラーをIssueに報告」ステップが GitHub Issue を自動作成
- Issue にはレポート（議員名・問題の種類・詳細）が記載される
- GitHub の通知設定によりメールで通知が届く
- 調査・修正が完了したら Issue を Close する

### 設計方針
- 全員チェックはコストが高すぎるためランダムサンプリング（5名）を採用
- 同種のエラーが検出されたら「他の議員にも同じ問題がある可能性」として全件調査のきっかけにする
- タイムアウト: 10分

## バックフィル設計原則

- `speeches-all` / `keyword-all` は **`SPEECHES_START_YEAR` / `KEYWORD_START_YEAR` 〜現在年** を動的に計算（ハードコードなし）
- `keyword-all` は `full_rebuild` を使うため **何度実行しても冪等**（メンバーごとにDBを削除→ゼロ積み上げ→保存）
- `keyword-YYYY` 個別タスクは存在しない（マージ方式は二重カウントになるため廃止）
