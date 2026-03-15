# はたらく議員 — 現状ドキュメント

> 最終更新: 2026-03-16

---

## 1. サービス概要

**URL**: https://www.hataraku-giin.com/
**目的**: 国会議員の活動を公開データに基づいてデータで見える化する
**基本方針**: 議員を断定・評価・序列化しない。集計結果の表示に特化する

---

## 2. 収録データの全体像

### 2.1 DBテーブルと収録内容

| テーブル | 収録内容 | 収録範囲 |
|---------|---------|---------|
| `members` | 議員マスタ（現職 + 前議員） | 全員 |
| `speeches` | 発言メタデータ（NDL API） | 第210回〜第221回国会（2017年10月〜） |
| `questions` | 衆院質問主意書 | 第196回〜第221回国会 |
| `sangiin_questions` | 参院質問主意書 | 第196回〜第221回国会 |
| `petitions` | 衆院請願 | 直近複数セッション |
| `sangiin_petitions` | 参院請願 | 直近複数セッション |
| `committee_members` | 委員会所属（現時点スナップショット） | 最新のみ |
| `votes` | 参院採決記録（個人別） | 第208回〜第221回国会（衆院は個人別非公開） |
| `bills` | 議員立法 + 閣法 | 第208回〜第221回国会 |
| `member_keywords` | 議員別ワードクラウド（上位100語） | 直近4年分の発言から構築 |
| `party_keywords` | 政党別ワードクラウド（上位100語） | member_keywords の合算 |
| `site_settings` | サイト設定（メンテナンスバナー等） | — |

### 2.2 各テーブルの重要な制約・特性

**speeches**
- 発言本文は保存しない（キーワード構築後に破棄）
- 上限 500,000行。超過時は古い順に自動削除
- `is_procedural = true` の議事進行発言はスコア対象外

**members**
- `id`: `"{house}-{氏名}"` 形式（スペース全除去）
- `is_active`: 現職 = true / 前議員 = false
- `ndl_names`: NDL API の表記ゆれ対応（例: 吉良佳子 ↔ 吉良よし子）
- `prev_party`: 中道改革連合メンバーの旧所属政党（公明党 or 立憲民主党）

**bills**
- `bill_type`: `"議員立法"` / `"閣法"` で区別
- 閣法のみ: `committee_shu/san`・`vote_date_shu/san`・`vote_result_shu/san`・`law_number`・`promulgated_at` を収録
- 閣法の `submitter_ids` は空配列（提出者は「内閣」）

**votes**
- 参議院のみ。衆議院は個人別投票記録を公開していない

### 2.3 データ量（2026-03-08時点）

| 指標 | 値 |
|-----|---|
| 登録議員数（現職） | 約713名 |
| 登録議員数（前議員） | 約200名以上 |
| speeches 総行数 | 664,385件（うち約108,000件は member_id=NULL） |
| speeches 上限 | 500,000行 |

---

## 3. 実装済み機能一覧

### ページ

| パス | 機能 |
|-----|------|
| `/` | 統計カード・最新活動タブ（委員会・質問・立法・請願）・政党バーチャート・更新履歴 |
| `/members` | 現職議員一覧（政党・院フィルター・各種ソート・お気に入り★） |
| `/members/[id]` | 議員詳細（発言・質問・採決・立法・請願・キーワード・活動バランスレーダー）|
| `/members/former` | 前議員一覧（政党・院フィルター・各種ソート） |
| `/parties` | 政党・会派一覧（ソート・URL共有） |
| `/parties/[party]` | 政党詳細（議員・委員長理事・ワードクラウド・議席内訳・活動バランスレーダー） |
| `/committees` | 委員会一覧（検索・フィルター） |
| `/committees/[name]` | 委員会詳細（委員長理事・議員一覧・請願）タブ構成 |
| `/bills` | 議員立法・閣法・政党ネットワーク分析 3タブ構成 |
| `/votes` | 政党別採決一致率マトリクス（会期プルダウン・URL共有） |
| `/cabinet` | 現内閣（役職順） |
| `/favorites` | お気に入り議員（最大10名・localStorage・URLシェア） |
| `/changelog` | 更新履歴 |

### 議員詳細ページの機能

- **採決タブ（参院のみ）**: 賛成・反対・欠席・欠席率の統計カード＋フィルター
- **議員立法タブ**: 提出法案 / 共同提出パートナー サブタブ
- **活動バランスレーダーチャート**: 発言・議員立法・質問主意書・請願の4軸（全議員最大値で正規化）
- **プロンプト作成ボタン**: 議員情報をAI向けプロンプトとしてクリップボードにコピー
- **SSR**: 初期データをサーバーレンダリング（AIクローラー対応）

### /bills ページの機能

**議員立法タブ**: 院フィルター・タイトル検索・提出者チップ（前議員はグレー）

**閣法タブ**:
- 成立/廃案/審議中の件数統計カード＋成立率
- 法案名・提出日・国会回次・院・付託委員会を表示
- 「👤 発言議員」ボタン: 付託委員会×会期で発言した議員を展開
  - ※ 付託委員会で同会期中に発言した議員であり、この法案のみを審議した議員ではない（注釈あり）
  - 「会議録テキスト」リンクでNDL会議録ページへ直リンク

**政党ネットワークタブ**: 共同提出政党ペアTOP10＋ヒートマップマトリクス（クリックでドリルダウン）

### SEO / AIO / LLMO

- sitemap.xml 動的生成（全議員・政党・委員会ページ）
- robots.txt（GPTBot・ClaudeBot・PerplexityBot 明示許可）
- llms.txt（AI向けドキュメント）
- 全ページ OGP メタデータ
- 動的ページに JSON-LD（Person / PoliticalParty / GovernmentOrganization）
- `/members/[id]` は初期HTMLにデータを含むSSR済み

---

## 4. データの特性と制約（事実）

### テーブル間の結合キー

| 結合 | キー |
|-----|------|
| speeches → members | `speeches.member_id = members.id` |
| bills → members | `bills.submitter_ids` 配列に `members.id` を含む（議員立法のみ） |
| bills → speeches | `bills.committee_shu/san` と `speeches.committee` の文字列照合 + `bills.session_number = speeches.session_number` |
| votes → members | `votes.member_id = members.id` |
| petitions → members | `petitions.introducer_ids` 配列に `members.id` を含む |

### 収録されているが現在UIで未表示のフィールド

| フィールド | テーブル | 内容 |
|-----------|---------|------|
| `vote_result_shu` | bills | 衆院採決態様（賛成多数・全会一致 等） |
| `vote_result_san` | bills | 参院採決態様 |
| `law_number` | bills | 法律番号（成立法案のみ） |
| `promulgated_at` | bills | 公布日（成立法案のみ） |

### データの構造的特性

- **speeches**: 発言本文は保存しない。`committee`・`spoken_at`・`session_number` のメタデータのみ
- **committee_members**: 現時点のスナップショットのみ。過去の役職履歴は持たない
- **members.party**: 現在の所属政党のみ。過去の政党変遷は記録しない（ただし `prev_party` で中道改革連合メンバーの旧所属政党のみ保持）
- **votes**: 参議院のみ。衆議院は個人別投票記録を公開していないため収録なし
- **bills（閣法）**: `committee_shu/san` と `speeches.committee` は文字列照合のため、同委員会・同会期の発言全体が紐づく（法案単位の絞り込みは不可）
- **speeches の member_id=NULL**: 約108,000件。NDL APIの表記と members.name が一致しない発言者

---

## 5. 前議員の収録状況

- **現在の前議員数**: `/members/former` に `is_active=false` で収録
- **2026-03-15 に72名を一括登録**: bills/speeches に登場するが未収録だった前議員を追加
- **収録の対象範囲**: speeches DBに発言記録がある議員 + bills の submitter_ids に登場する議員
- **要確認リスト**: `former_members_review.md` に手動判定待ちの214名が残存

---

## 6. 未着手・保留の機能

| 項目 | 状況 |
|-----|------|
| 閣法の採決態様・法律番号の表示 | DB収録済み・UI未実装 |
| 前議員ページの採決・立法タブ | 未決定 |
| 採決データのバックフィル（第208回以前） | 保留 |
| 議員の政党所属変遷の記録 | 設計上困難（現在の政党のみ保持） |
| `former_members_review.md` 残214名の追加 | ユーザー手動判定待ち |

---

## 7. 既知の制約・注意事項

- **speeches の member_id=NULL**: NDL API の speaker_name と members.name が一致しない場合に発生。現在約108,000件
- **speeches 上限**: 500,000行。日次で古いものから自動削除される
- **Supabase 1000行制限**: 全クエリに `.limit(2000)` が必要（デフォルト1000行）
- **データ反映遅延**: NDL APIへの審議録反映は1〜2週間かかる場合がある
- **中道改革連合**: 旧公明党・旧立憲民主党が合流した会派。政党ネットワーク分析では `prev_party` で元の政党に戻して集計する
- **超党派ラベル**: 法案単位での「超党派」判定は不正確のため非実装。集計レベルの政党ネットワーク分析のみ実装済み
