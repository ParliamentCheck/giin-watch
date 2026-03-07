# はたらく議員 — プロジェクト現状ドキュメント

> 最終更新: 2026-03-08

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
    committees.py              # 委員会所属（衆院・参院 → committee_members に保存）
    votes.py                   # 参院採決記録（votes に保存）※衆院は個人別データ非公開
    bills.py                   # 議員立法（bills に保存）
    keywords.py                # ワードクラウド構築（member_keywords / party_keywords）
    cabinet_scraper.py         # 内閣役職データ
  processors/
    scoring.py                 # speech_count / session_count / question_count 再計算
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
6. 委員会所属（`sources/committees.py`）※衆院+参院
7. キーワード更新（`sources/keywords.py --mode daily`）
8. speeches 上限チェック（`processors/cleanup.py --task truncate-speeches`）

各ステップは `continue-on-error: true` で独立。

### backfill.yml — 手動実行タスク

| タスク | 内容 |
|---|---|
| `migrate-member-ids` | DB内の旧形式IDを一括変換 |
| `scoring-only` | スコアのみ再計算 |
| `speeches-all` | 2021〜2024年の発言を全件バックフィル |
| `speeches-YYYY` | 特定年の発言バックフィル |
| `keyword-full-rebuild` | キーワード全件再構築（4年分） |
| `votes-collect` | 参院採決記録収集 |
| `bills-collect` | 議員立法収集 |
| `sangiin-questions` | 参院質問主意書収集 |

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
- [ ] **`keyword-full-rebuild`** を Actions で実行
  → 725名分のキーワードが未構築。`daily_update()` は直近7日間のみ対象のため、全件再構築が必要

### 未実装・未着手
- [ ] **議員立法（bills）のデータ品質確認** — スクレイパーは実装済みだが未検証
- [ ] **議員写真** — プロフィール画像の取得なし
- [ ] **衆院採決記録** — 個人別データが公開されていないため収集不可
- [ ] **旧議員のデータ管理ポリシー** — `is_active=False` 議員の過去データ保持方針未整備

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
```
