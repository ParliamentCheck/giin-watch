# はたらく議員 — プロジェクト仕様書

## 1. プロジェクト概要

**サイト名**: はたらく議員
**URL**: https://www.hataraku-giin.com/
**目的**: 国会議員の活動を、公開データに基づいてデータで見える化する
**リポジトリ**: GitHub - ParliamentCheck/giin-watch
**ローカルパス**: /Volumes/ACASIS-SSD/Users/ssd/Desktop/giin-watch

### 基本方針
- システムは議員を断定・評価・序列化しない
- 表示は公開記録から得られる集計結果（数値・属性）に限定
- 正確性は最も重視する。100%正確でなければ実装しない
- 公開データの表示はOK。自動推測・補正は100%正確な場合のみ

---

## 2. 技術スタック

| レイヤー | 技術 |
|---------|------|
| フロントエンド | Next.js 16.1.6 + TypeScript + Tailwind CSS v4 |
| データベース | Supabase (PostgreSQL)・無料プラン (500MB) |
| ホスティング | Vercel |
| データ収集 | Python (GitHub Actions で毎日 JST 3:00 自動実行) |
| バージョン管理 | GitHub (develop → preview確認 → master → 本番) |

### デプロイフロー
```
develop → push → Vercel preview
確認後:
  git checkout master
  git merge develop
  git push
  git checkout develop
```

### 注意事項
- previewは本番と同じSupabase DBを参照する
- フロント変更はpreviewで確認可能
- コレクター（Python）変更はmasterマージ＋Actions実行で確認
- 自動実行は毎日 JST 3:00（cron: "0 18 * * *" UTC）

---

## 3. データベース設計

### 3.1 現在のテーブル

#### members（議員）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | {house}-{正規化name}（スペースは全除去） |
| name | text | 議員名 |
| party | text | 政党名（正規化済み） |
| faction | text | 会派名（生データ） |
| house | text | 衆議院 / 参議院 |
| district | text | 選挙区 |
| prefecture | text | 都道府県 |
| terms | integer | 当選回数（現在の院のみ） |
| is_active | boolean | 現職かどうか |
| speech_count | integer | 発言数 |
| session_count | integer | 発言セッション数 |
| question_count | integer | 質問主意書数 |
| keywords | jsonb | ワードクラウド用キーワード |
| keywords_updated_at | timestamptz | キーワード最終更新日時 |
| cabinet_post | text | 内閣役職（大臣・副大臣・政務官等） |
| source_url | text | 元データURL |

#### speeches（発言）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | NDL API由来のID |
| member_id | text FK | members.id |
| speech_text | text | 発言全文（★リファクタリングで削除予定） |
| spoken_at | date | 発言日 |
| committee | text | 委員会名 |
| session_number | integer | 国会回次 |
| house | text | 衆議院 / 参議院 |
| url | text | NDLサイトへのリンク |

**インデックス**: `idx_speeches_member_id` ON speeches(member_id)

#### questions（質問主意書・衆議院）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | `shitsumon-{session}-{number}` |
| member_id | text FK | members.id |
| session | integer | 国会回次 |
| title | text | 質問タイトル |
| submitted_at | date | 提出日 |
| url | text | 衆議院サイトへのリンク |

#### committee_members（委員会所属）
| カラム | 型 | 説明 |
|-------|---|------|
| id | serial PK | |
| member_id | text FK | members.id |
| name | text | 議員名 |
| committee | text | 委員会名 |
| role | text | 委員長 / 理事 / 会長 / 副会長 等 |
| house | text | 衆議院 / 参議院 |

#### site_settings（サイト設定）
| カラム | 型 | 説明 |
|-------|---|------|
| key | text PK | 設定キー |
| value | text | 設定値 |

**現在の設定**:
- `maintenance_banner`: 値があればメンテナンスバナー表示（内容がそのままバナーテキスト）
- `election_safe_mode`: 値があれば選挙セーフモードON

#### changelog（変更履歴）
| カラム | 型 | 説明 |
|-------|---|------|
| id | serial PK | |
| date | date | 変更日 |
| description | text | 変更内容 |
| created_at | timestamptz | 登録日時 |

### 3.2 リファクタリングで追加予定のテーブル

#### member_keywords（キーワード頻度）
| カラム | 型 | 説明 |
|-------|---|------|
| member_id | text FK | members.id |
| word | text | キーワード |
| count | integer | 出現回数 |
| last_seen_at | date | 最後にこのワードが出現した発言の日付 |
| PK: (member_id, word) |

**設計方針**: 
- 1議員あたり上位100語を保持、表示は上位50語
- 年単位でNDL APIから発言取得 → 抽出 → countを加算
- 新しいワードが入ったら下位を押し出す

#### ワードクラウド構築・更新方式

**初回構築（バッチ・1回のみ）:**
1. 対象: 現在登録されている現職＋前議員
2. 4年前の発言からNDL APIで取得（1年分ずつ）
3. 各年の発言テキストからワードを抽出し、ワードごとの出現カウントとlast_seen_at（その年の最終発言日）を記録
4. 次年のデータを取得・構築する際:
   - その年のワードクラウドデータを構築
   - 前年のカウントと比較し、同じワードは合算＋last_seen_atを更新
   - 新しいワードは古いワードと比較して、上位から100語を残し、不要なものは捨てる
   - last_seen_atが1年以上前のワードは入替対象
5. これを全年分繰り返す
6. 全議員のワード構築完了後、政党ごとに所属議員のワードを合算してparty_keywordsを生成
7. 発言本文はDBに保存しない（処理後に破棄）

**日次更新:**
1. 新しい発言のみNDL APIから本文を取得
2. ワードを抽出
3. member_keywordsの既存countに加算＋last_seen_atを更新
4. 上位100語に整理（下位を押し出す）
5. **last_seen_atが1年以上前のワードは、カウントに関係なく入替対象とする**（過去の課題が解決して扱わなくなった場合に、新しいワードと入れ替わるようにする）
6. 議員のワード更新後、政党ごとに所属議員のワードを合算してparty_keywordsを更新
7. 発言本文は破棄（DBに保存しない）

**完全再構築が必要な場合（除外ワード変更時等）:**
- 初回構築と同じ手順で1からやり直す
- NDL APIから全件再取得が必要（レート制限があるため時間がかかる）
- 頻度は低いので問題ない

**ワード抽出ルール:**
- MeCab等の形態素解析で名詞を抽出
- 以下を除外（STOP_WORDS）:
  - 一般的な助詞・助動詞・記号
  - 「総理」「総理大臣」「内閣総理大臣」
  - 「○○大臣」「○○副大臣」「○○政務官」「○○長官」（endswithで除外）
  - 議員自身の名前
  - 1文字の名詞
- 30文字以下の発言（相槌等）はそもそも抽出対象外

#### 政党ワードクラウド
- 政党に所属する全議員のワードを集約し、政党としてのワードクラウドを生成する
- 政党詳細ページ（/parties/[party]）に表示
- member_keywordsから所属議員のワードを合算して生成

**party_keywordsテーブル:**
| カラム | 型 | 説明 |
|-------|---|------|
| party | text FK | 政党名 |
| word | text | キーワード |
| count | integer | 所属議員の合算出現回数 |
| last_seen_at | date | 最後にこのワードが出現した日付 |
| PK: (party, word) |

**構築方式:**
- member_keywordsの更新後に、政党ごとに所属議員のワードを合算
- 1政党あたり上位100語を保持、表示は上位50語
- last_seen_atが1年以上前のワードは入替対象（議員と同じルール）
- 議員の政党異動時は次回更新で自動的に反映される

#### votes（採決記録）新規
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | |
| member_id | text FK | |
| bill_title | text | 議案名 |
| vote_date | date | 採決日 |
| vote | text | 賛成/反対/棄権/欠席 |
| session_number | integer | 国会回次 |
| house | text | |

#### bills（議員立法）新規
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | |
| title | text | 法案名 |
| submitter_ids | text[] | 提出者のmember_id |
| submitted_at | date | 提出日 |
| session_number | integer | 国会回次 |
| status | text | 状態 |
| house | text | |

#### sangiin_questions（参議院質問主意書）新規
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | |
| member_id | text FK | |
| session | integer | 国会回次 |
| title | text | |
| submitted_at | date | |
| url | text | |

※ party_keywordsテーブルは上記「政党ワードクラウド」の項を参照

### 3.3 speechesテーブルの変更予定
- `speech_text` カラムを削除（容量削減: 281MB → 16MB）
- `is_procedural` boolean カラムを追加（委員長・議長の議事進行発言フラグ）
- NDL API取得時にテキスト冒頭を判定してフラグ付与
- フラグ判定: 発言テキスト冒頭の `○○○委員長` `○○○会長` `○○○議長` パターン

---

## 4. コレクター設計（Python）

### 4.1 現在の構成
```
apps/collector/
  requirements.txt
  run_scoring.py          # スコア再計算
  sources/
    register_members.py   # 議員データ登録（衆参サイト）
    ndl_api.py            # 発言データ収集（NDL API）
    shitsumon_scraper.py  # 質問主意書（衆議院）
    cabinet_scraper.py    # 内閣役職（官邸サイト）
    keyword_extractor.py  # ワードクラウド
```

### 4.2 リファクタリング後の構成
```
apps/collector/
  config.py               # 共通設定（日付、PARTY_MAP、STOP_WORDS等）
  db.py                   # DB接続・リトライ付きクエリ
  utils.py                # 名前正規化・政党正規化
  run_scoring.py          # スコア再計算（is_procedural使用）
  sources/
    register_members.py   # 議員データ登録
    ndl_api.py            # 発言メタデータ収集（本文保存しない）
    shitsumon_scraper.py  # 質問主意書（衆議院）
    sangiin_shitsumon.py  # 質問主意書（参議院）★新規
    cabinet_scraper.py    # 内閣役職
    keyword_builder.py    # ワードクラウド構築（議員＋政党、年単位）★新規
    vote_scraper.py       # 採決記録★新規
    bill_scraper.py       # 議員立法★新規
```

### 4.3 共通化すべきもの（config.py）

#### PARTY_MAP（政党名正規化）
```python
PARTY_MAP = {
    '自由民主': '自民党', '自民': '自民党',
    '立憲民主': '立憲民主党', '立憲': '立憲民主党',
    '公明': '公明党',
    '日本維新': '日本維新の会', '維新': '日本維新の会',
    '国民民主': '国民民主党', '国民': '国民民主党',
    '日本共産': '共産党', '共産': '共産党',
    'れいわ': 'れいわ新選組',
    '社会民主': '社民党', '社民': '社民党',
    '参政': '参政党',
    'チームみらい': 'チームみらい', 'みらい': 'チームみらい',
    '日本保守': '日本保守党',
    '沖縄の風': '沖縄の風',
    '中道改革連合': '中道改革連合', '中道': '中道改革連合',
    '有志': '有志の会',
    '各派に属しない': '無所属',
    '減税保守こども': '無所属',
    '不明（前議員）': '無所属',
    'ＮＨＫから国民を守る党': 'NHK党', 'NHK': 'NHK党',
    '教育無償化を実現する会': '日本維新の会',
    '新緑風会': '国民民主党',
    '無所属': '無所属',
}
```

#### 与党設定
```python
RULING_PARTIES = ["自民党", "日本維新の会"]
```

#### STOP_WORDS（ワードクラウド除外語）
- 「総理」「総理大臣」「内閣総理大臣」
- 「○○大臣」「○○副大臣」「○○政務官」「○○長官」→ endswithで除外
- 議員自身の名前を除外

#### 議事進行発言の判定
- 発言テキスト冒頭50文字の `○` の後、最初の `　`（全角スペース）までに以下を含む場合:
  - 「委員長」→ 議事進行
  - 「会長」→ 議事進行
  - 「議長」→ 議事進行
- 30文字以下の発言 → 除外（「はい」等の相槌）

#### 議員IDの正規化
- `{house}-{re.sub(r'\s+', '', name)}` （スペースは全角2つに統一）

### 4.4 質問主意書のセッション範囲
```python
SESSION_MAX = {
    196: 487, 197: 145, 198: 309, 199: 20,
    200: 186, 201: 276, 202: 31, 203: 83,
    204: 236, 205: 22, 206: 22, 207: 42,
    208: 156, 209: 41, 210: 68, 211: 156,
    212: 141, 213: 206, 214: 56, 215: 51,
    216: 107, 217: 352, 218: 21, 219: 205,
    220: 8, 221: 300,
}
```

### 4.5 NDL API設定
- 取得期間: 環境変数 `NDL_DATE_FROM` / `NDL_DATE_UNTIL`
- 日次更新のデフォルト: 直近1年分
- NDL APIのレート制限: 1リクエスト/0.5秒の待機
- NDL APIのデータ反映遅延: 審議から1〜2週間

---

## 5. フロントエンド設計

### 5.1 現在のページ構成
```
/ (トップ)              - 統計概要、最新発言、政党内訳
/members                - 現職議員一覧（検索・フィルター）
/members/[id]           - 議員詳細（発言・質問・ワードクラウド）
/members/former         - 前議員一覧
/parties                - 政党別データ
/parties/[party]        - 政党詳細
/activity               - 議員活動データ（旧ランキング）
/about                  - サイトについて
/disclaimer             - 免責事項
/terms                  - 利用規約
/changelog              - 変更履歴
/privacy                - プライバシーポリシー
/contact                - お問い合わせ（Googleフォーム）
```

### 5.2 共通コンポーネント
```
components/
  GlobalNav.tsx             - ヘッダーナビゲーション
  GlobalFooter.tsx          - フッター（各ページリンク）
  MaintenanceBanner.tsx     - メンテナンスバナー（site_settings管理）
  ElectionSafeMode.tsx      - 選挙セーフモード（site_settings管理）
```

### 5.3 重要な実装ルール

#### Supabaseクエリ
- 全てのmembersクエリに `.limit(2000)` を付ける（デフォルト1000行制限対策）
- `.single()` のクエリにはlimit不要

#### 禁止表現（UIの全出力で禁止）
- 評価語: サボり／怠慢／不誠実／ワースト／晒し／告発／糾弾
- 原因推定語: 逮捕／勾留／入院／病気／逃亡／長期不在
- 因果断定語: 〜のため質問できない／機会が奪われる／制約がある
- 扇情語: 衝撃／炎上／拡散希望
- 「ランキング」→「活動データ」に置換済み

#### 固定注記（法的要件）
- **スコープ宣言**: layout.tsxに常時表示
  ```
  当サイトは、国会会議録等の公開記録および公開情報から機械的に集計した一部指標を表示します。
  党務、地元活動、非公開の政策調整、非公開会議等、参照できない活動は含みません。
  当サイトの表示は、活動の良否・有無を判定するものではありません。
  ```
- **フィルター横注記**:
  ```
  「0件」は当サイト参照範囲の公開データ上で未検出であることを示します。
  活動の有無や良否の判断を示すものではありません。
  ```
- **ソート横注記**:
  ```
  並び替えは当サイトの参照範囲に基づく集計値を使用しています。参照範囲外の活動は含みません。
  ```

#### 活動データページの機能
- デフォルトソート: 氏名順（五十音）
- ソート: 氏名順 / 数値降順 / 数値昇順
- 昇順選択時: 確認ダイアログを表示
- 役職者（cabinet_postあり）: 初期非表示＋カウンター表示
- 選挙セーフモード中: 昇順ソートUI非表示
- 政党スコア評価はなし（非裁定性の徹底）

#### 外部サービス連携
- Google AdSense: `ads.txt` + body内Scriptタグ（pub-1728847761086799）
- Google Analytics: G-1QJP14PKPF
- 訂正申し立て: Googleフォーム
  https://docs.google.com/forms/d/e/1FAIpQLSfs3iOuviV2CV5BddBbG2rmPYQ4QVnRvEn8pm3j3rNpdPBlpg/viewform

---

## 6. GitHub Actions ワークフロー

### 日次更新 (.github/workflows/collect.yml)
```
cron: "0 18 * * *" (JST 3:00)
steps:
  1. 議員データ登録 (register_members.py)
  2. 発言データ収集 (ndl_api.py)
  3. 活動スコア再計算 (run_scoring.py)
  4. 内閣役職データ取得 (cabinet_scraper.py)
  5. キーワード抽出 (keyword_extractor.py) ← 現在タイムアウトで無効化中
```

### 過去データ取得 (.github/workflows/backfill.yml)
- 手動実行（workflow_dispatch）
- 年を選択: 2024 / 2023 / 2022 / 2021 / 2018-2020
- 1年分ずつ順番に実行すること（並列はSupabase過負荷の原因）

---

## 7. リファクタリング計画

### Phase 1: コレクター共通化
1. config.py / db.py / utils.py 作成
2. 各スクリプトを共通モジュール使用に書き換え
3. エラーハンドリング統一（1つ失敗しても全体が止まらない）

### Phase 2: 新データ追加
4. 参議院質問主意書スクレイパー
5. 採決記録スクレイパー
6. 議員立法スクレイパー
7. DB新テーブル作成

### Phase 3: speech_text廃止
8. keyword_builder.py（年単位・累積カウント方式）
9. is_proceduralフラグ付与ロジック
10. speech_textカラム削除
11. VACUUM FULL実行

### Phase 4: フロント改修
12. lib/queries.ts（共通クエリ関数）
13. lib/types.ts（型定義）
14. 議員詳細ページに採決記録・法案提出を追加
15. 活動データページに新指標追加

### Phase 5: データクリーンアップ
16. キーワード全件再構築
17. session_count再計算
18. terms修正確認

---

## 8. 既知の問題・保留事項

### データの問題（リファクタリングで対応）
- キーワード抽出がタイムアウトで無効化中
- session_countに委員長除外ロジックが未反映（コードは修正済み、次回実行で反映）
- 過去データbackfillが2023年途中で止まった
- speech_textが容量を圧迫（281MB）

### 衆参鞍替え議員の当選回数
- 当選回数は公式サイトの情報をそのまま使用する（現在の院での回数のみ）
- 衆議院: `1（参2）` → カッコ前の `1` のみ取得（`re.split(r'[（(]', terms_raw)[0]`）
- 参議院: プロフィールページの「当選 X 回」を使用
- 鞍替え情報（他院での経歴）は一切表示しない
- 理由: 衆→参と参→衆で公式データの記載が非対称であり、片方だけ表示するとユーザーを混乱させるため

### 仕様書Phase 3（未実装・保留）
- HMAC署名付きスナップショット共有
- append-only監査ログ
- 共有リンク失効
- 管理画面（2FA）
- → 現時点で共有機能がないため優先度低。将来必要になったら実装

---

## 9. 過去の失敗と教訓

### データ正確性
- **教訓**: 100%正確でなければ実装しない
- **例**: 鞍替え検出（NDL API + プロフィール解析）→ 偽陽性が排除できず全面撤回

### IDの重複
- **原因**: スクレイピング毎にスペースの入り方が変わった
- **対策**: ID生成時に `re.sub(r'\s+', '  ', name)` で正規化
- **教訓**: IDの正規化は初期設計で入れるべき

### Supabase 1000行制限
- **症状**: 全ページでmembersが最大1000件しか返らない
- **対策**: 全クエリに `.limit(2000)` を追加
- **教訓**: Supabaseのデフォルト制限を常に意識する

### VACUUM FULLタイムアウト
- **原因**: 大量upsertのdead tuplesが蓄積
- **対策**: statement timeoutの一時変更、またはデータ設計の見直し
- **教訓**: 大量データのupsertは分割して実行

### 当選回数の全角カッコ
- **原因**: `6（参1）` の全角カッコ `（` を半角 `(` でsplitしていた → `61` になった
- **対策**: `re.split(r'[（(]', terms_raw)[0]` に修正
- **教訓**: 日本語のHTMLは全角文字に注意

### 政党名の表記揺れ
- **原因**: 衆議院の会派名と参議院の会派名が異なる
- **対策**: PARTY_MAPを網羅的に定義
- **教訓**: 会派名は変わりやすいので、PARTY_MAPは定期的に見直す

---

## 10. 外部リンク・認証情報

- **Google AdSense**: pub-1728847761086799
- **Google Analytics**: G-1QJP14PKPF
- **Supabase**: 環境変数 SUPABASE_URL / SUPABASE_KEY（GitHub Secrets）
- **訂正フォーム**: https://docs.google.com/forms/d/e/1FAIpQLSfs3iOuviV2CV5BddBbG2rmPYQ4QVnRvEn8pm3j3rNpdPBlpg/viewform
- **問い合わせフォーム**: https://docs.google.com/forms/d/e/1FAIpQLSezkzLqHaSg4nXtKfU2ANb3wUkb9IFcN45Lv3DRoZTReYqafA/viewform

---

## 11. 開発ルール

### 絶対遵守事項
1. **自動化徹底**: できる限り人の手を入れず、自動で更新反映できる仕様にする
2. **法的安全性最優先**: 法的危険性に最大限注意し、運営の安全性をできる限り確保する
3. **勝手に判断しない**: 不明点・判断に迷う点は必ず相談する。先走って実装しない
4. **正確性100%**: 100%正確でなければ実装しない。推測・補正は禁止
5. **デプロイ前確認**: 複数の修正がある場合、まとめてデプロイ。途中で「次は？」と聞く
6. **衆参データの非対称性に注意**: 衆議院と参議院で取得できるデータ項目・形式が異なる場合、どちらに合わせるか必ず確認する。片方にしかないデータを片方だけ表示しない

---

## 12. 運用手順

### メンテナンスバナーの表示/非表示
1. Supabase → Table Editor → site_settings
2. `maintenance_banner` の value にテキスト入力 → 表示
3. value を空にする → 非表示

### 選挙セーフモードのON/OFF
1. Supabase → Table Editor → site_settings
2. `election_safe_mode` の value に何か入力 → ON
3. value を空にする → OFF

### キーワード全件リセット
```sql
UPDATE members SET keywords_updated_at = NULL;
```
→ 次回Actions実行で再抽出

### 過去データ取得
Actions → 「過去データ一括取得」→ Run workflow → 年を選択
※1年ずつ順番に実行すること

---

## 13. 未決定事項（次のチャットで決める）

### フロントの表示方針
- 採決記録をどう表示するか（議員詳細ページ？独立ページ？）
- 議員立法も同様
- 活動データページのソート項目に「採決参加数」「法案提出数」を追加するか
- 議員詳細ページのレイアウト

### 運用
- エラー時の通知方法（今はActions失敗に気づけない）
- 採決・法案データの取得頻度
- 発言データの保持期間（現在は3〜4年分を想定）

### 仕様書Phase 3
- 実装の必要性とタイミング