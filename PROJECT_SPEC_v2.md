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
| id | text PK | `{house}-{正規化name}`（スペースは全除去） |
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
| question_count | integer | 質問主意書数（questions＋sangiin_questionsの合算） |
| bill_count | integer | 議員立法提出数（billsテーブルから集計） |
| keywords | jsonb | ワードクラウド用キーワード |
| keywords_updated_at | timestamptz | キーワード最終更新日時 |
| cabinet_post | text | 内閣役職（大臣・副大臣・政務官等） |
| source_url | text | 元データURL |

#### speeches（発言）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | NDL API由来のID |
| member_id | text FK → members.id | |
| spoken_at | date | 発言日 |
| committee | text | 委員会名 |
| session_number | integer | 国会回次 |
| house | text | 衆議院 / 参議院 |
| source_url | text | NDLサイトへのリンク |
| is_procedural | boolean | 議事進行発言フラグ |

**インデックス**: `idx_speeches_member_id` ON speeches(member_id)

**データ管理方針**:
- 発言本文（speech_text）は保存しない。表示用メタデータのみ
- speechesテーブルにはレコード数の上限を設け、超過分は古いレコードから削除する
- session_countはspeechesの全レコードから集計してmembersに保存（Single Source of Truth）

#### questions（質問主意書・衆議院専用）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | `shitsumon-{session}-{number}` |
| member_id | text FK → members.id | |
| session | integer | 国会回次 |
| number | integer | 質問番号 |
| title | text | 質問タイトル |
| submitter | text | 提出者名 |
| faction | text | 会派名 |
| submitted_at | text | 提出日 |
| answered_at | text | 答弁日 |
| source_url | text | 衆議院サイトへのリンク |
| house | text | 衆議院（固定） |
| created_at | timestamp | 登録日時 |

※ 衆議院の質問主意書専用。参議院はsangiin_questionsテーブルを使用する。

#### sangiin_questions（参議院質問主意書）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | `sangiin-{session}-{number}` |
| member_id | text FK → members.id | |
| session | integer | 国会回次 |
| title | text | 質問タイトル |
| submitted_at | date | 提出日 |
| url | text | 参議院サイトへのリンク |

#### petitions（請願・衆議院）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | |
| session | integer | 国会回次 |
| number | integer | 請願番号 |
| title | text | 請願タイトル |
| committee_name | text | 付託委員会名 |
| result | text | 結果（採択 / 不採択 / 審査未了 等） |
| result_date | date | 結果日 |
| source_url | text | 衆議院サイトへのリンク |
| introducer_names | text[] | 紹介議員名の配列 |
| introducer_ids | text[] | 紹介議員のmember_id配列 |
| house | text | 衆議院（固定） |

#### sangiin_petitions（請願・参議院）
petitionsテーブルと同じ構造。house は 参議院（固定）。

#### votes（採決記録・参議院のみ）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | MD5(session + bill_title + member_id) |
| member_id | text FK → members.id | |
| bill_title | text | 議案名 |
| vote_date | date | 採決日 |
| vote | text | 賛成 / 反対 / 棄権 / 欠席 |
| session_number | integer | 国会回次 |
| house | text | 参議院（固定） |

**注**: 衆議院は個人別の投票記録を公開していないため参議院のみ収集。

#### bills（議員立法）
| カラム | 型 | 説明 |
|-------|---|------|
| id | text PK | |
| title | text | 法案名 |
| submitter_ids | text[] | 提出者のmember_id配列 |
| submitted_at | date | 提出日 |
| session_number | integer | 国会回次 |
| status | text | 状態（審議中 / 可決 / 廃案 等） |
| house | text | 衆議院 / 参議院 |
| source_url | text | 各院サイトへのリンク |

**データソース**: 衆議院サイト + 参議院サイトの法案一覧ページ → 経過情報ページを個別クロール。

#### committee_members（委員会所属）
| カラム | 型 | 説明 |
|-------|---|------|
| id | serial PK | |
| member_id | text FK → members.id | |
| name | text | 議員名 |
| committee | text | 委員会名 |
| role | text | 委員長 / 理事 / 会長 / 副会長 等 |
| house | text | 衆議院 / 参議院 |

#### member_keywords（キーワード頻度）
| カラム | 型 | 説明 |
|-------|---|------|
| member_id | text FK → members.id | |
| word | text | キーワード |
| count | integer | 出現回数 |
| last_seen_at | date | 最後にこのワードが出現した発言の日付 |
| PK: (member_id, word) |

**設計方針**:
- 1議員あたり上位100語を保持、表示は上位50語
- 年単位でNDL APIから発言取得 → 抽出 → countを加算
- 新しいワードが入ったら下位を押し出す

#### party_keywords（政党ワードクラウド）
| カラム | 型 | 説明 |
|-------|---|------|
| party | text | 政党名 |
| word | text | キーワード |
| count | integer | 所属議員の合算出現回数 |
| last_seen_at | date | 最後にこのワードが出現した日付 |
| PK: (party, word) |

**構築方式:**
- member_keywordsの更新後に、政党ごとに所属議員のワードを合算
- 1政党あたり上位100語を保持、表示は上位50語

#### site_settings（サイト設定）
| カラム | 型 | 説明 |
|-------|---|------|
| key | text PK | 設定キー |
| value | text | 設定値 |

**現在の設定**:
- `maintenance_banner`: 値があればメンテナンスバナー表示（内容がそのままバナーテキスト）
- `election_safe_mode`: 値があれば選挙セーフモードON

### 3.2 外部キー制約

以下の外部キー制約を設定済み：
- `speeches.member_id → members.id`
- `questions.member_id → members.id`
- `sangiin_questions.member_id → members.id`
- `votes.member_id → members.id`
- `committee_members.member_id → members.id`
- `member_keywords.member_id → members.id`

### 3.3 削除済みテーブル（使用しない）
以下のテーブルは不要のため削除済み：
- `activity_scores`（議員を評価・序列化しないという基本方針に反するため削除）
- `attendance`（空テーブル・未使用）
- `vote_records`（空テーブル・votesテーブルに統合）
- `political_funds`（空テーブル・未使用）
- `party_whip`（空テーブル・未使用）

### 3.4 ワードクラウド構築・更新方式

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

**ワード抽出ルール:**
- MeCabで形態素解析し名詞を抽出
- 以下を除外（STOP_WORDS）:
  - 一般的な助詞・助動詞・記号
  - 「総理」「総理大臣」「内閣総理大臣」
  - 「○○大臣」「○○副大臣」「○○政務官」「○○長官」（endswithで除外）
  - 議員自身の名前
  - 1文字の名詞
- 30文字以下の発言（相槌等）はそもそも抽出対象外

---

## 4. コレクター設計（Python）

### 4.1 現在の構成
```
apps/collector/
  config.py                    # 共通設定（SESSION_MAX、PARTY_MAP等）
  db.py                        # DB接続・リトライ付きクエリ
  utils.py                     # 名前正規化・政党正規化
  sources/
    members.py                 # 議員データ登録（衆参サイト）
    speeches.py                # 発言メタデータ収集（NDL API）
    questions.py               # 質問主意書（衆院・参院）
    petitions.py               # 請願（衆院・参院）
    votes.py                   # 採決記録（参議院のみ）
    bills.py                   # 議員立法（衆院・参院）
    cabinet_scraper.py         # 内閣役職（官邸サイト）
    committees.py              # 委員会所属
    keywords.py                # ワードクラウド更新
  processors/
    scoring.py                 # 活動スコア再計算（speech_count等集計）
    cleanup.py                 # speechesテーブル上限管理
    audit.py                   # データ品質監査
```

### 4.2 共通化すべきもの（config.py）

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
    '無所属': '無所属',
}
```

#### 与党設定
```python
RULING_PARTIES = ["自民党", "日本維新の会"]
```

#### 議事進行発言の判定
- 発言テキスト冒頭50文字の `○` の後、最初の `　`（全角スペース）までに以下を含む場合:
  - 「委員長」→ 議事進行
  - 「会長」→ 議事進行
  - 「議長」→ 議事進行
- 30文字以下の発言 → 除外（「はい」等の相槌）

#### 議員IDの正規化
- `{house}-{re.sub(r'\s+', '', name)}`（スペースは全除去）

### 4.3 質問主意書のセッション範囲
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

### 4.4 NDL API設定
- 取得期間: 環境変数 `NDL_DATE_FROM` / `NDL_DATE_UNTIL`
- 日次更新のデフォルト: 直近1年分
- NDL APIのレート制限: 1リクエスト/0.5秒の待機
- NDL APIのデータ反映遅延: 審議から1〜2週間

### 4.5 processors/scoring.py（集計処理）
日次収集の後に実行。以下を集計してmembersテーブルに反映：
- `speech_count`: speechesテーブルからmember_idごとのCOUNT
- `session_count`: speechesテーブルからmember_idごとのCOUNT(DISTINCT committee || '-' || spoken_at)
- `question_count`: questionsテーブル + sangiin_questionsテーブルのmember_idごとの合算COUNT
- `bill_count`: billsテーブルのsubmitter_idsにmember_idを含む件数

### 4.6 votes.py（採決記録収集）
- `--mode daily`: 現会期のみ収集
- `--mode backfill`: 第208回国会以降を全収集
- データソース: 参議院本会議の採決一覧ページ

---

## 5. フロントエンド設計

### 5.1 現在のページ構成
```
/                        トップページ（統計概要・最新活動・政党構成）
/members                 現職議員一覧（検索・フィルター・ソート）
/members/[id]            議員詳細（委員会・発言・質問・採決・立法・請願・キーワード）
/members/former          前議員一覧
/parties                 政党・会派一覧（ソート付き）?sort= でURL共有可
/parties/[party]         政党詳細（議員・委員長理事・ワードクラウド・内訳）?tab= ?sort= でURL共有可
/committees              委員会一覧（検索・フィルター）
/committees/[name]       委員会詳細（委員長理事・議員一覧・請願）?tab= ?sort= でURL共有可
/votes                   政党別採決一致率マトリクス（会期プルダウン・?session= でURL共有可）
/bills                   議員立法一覧（院フィルター・タイトル検索）
/favorites               お気に入り議員（活動タイムライン・最大10名）
/cabinet                 現内閣（役職順）
/about                   サイトについて
/disclaimer              免責事項
/terms                   利用規約
/changelog               変更履歴
/privacy                 プライバシーポリシー
/contact                 お問い合わせ（Googleフォーム）
```

### 5.2 共通コンポーネント
```
components/
  GlobalNav.tsx             ヘッダーナビゲーション
  GlobalFooter.tsx          フッター
  MaintenanceBanner.tsx     メンテナンスバナー（site_settings管理）
  ElectionSafeBanner.tsx    選挙セーフモードバナー（site_settings管理）
  ActivityTabs.tsx          トップページの活動タブ（質問主意書・委員会・請願）
  WordCloud.tsx             ワードクラウド可視化（d3-cloud使用）
```

### 5.3 重要な実装ルール

#### Supabaseクエリ
- 全てのmembersクエリに `.limit(2000)` を付ける（デフォルト1000行制限対策）
- `.single()` のクエリにはlimit不要

#### データ取得の堅牢性
- 議員詳細ページ（/members/[id]）のデータ取得は `Promise.allSettled` を使用
- 1つのクエリが失敗しても他のデータは正常に表示される
- 質問主意書は questions（衆院）と sangiin_questions（参院）の両方から取得しマージ

#### revalidate設定
- サーバーコンポーネントのページには `export const revalidate = 3600` を設定
- "use client" のページには revalidate は使用不可（ブラウザから直接Supabaseにクエリ）

#### ページコンポーネントのアーキテクチャ（サーバー/クライアント分離）

SEO対応のため、全ページを以下の構造に統一する：

```
app/bills/
  page.tsx           ← サーバーコンポーネント（metadata + generateMetadata を export）
  BillsClient.tsx    ← クライアントコンポーネント（"use client"、全インタラクション）
```

- `page.tsx` は `"use client"` を付けない。`export const metadata` または `generateMetadata` を定義し、クライアントコンポーネントを `<return <XxxClient />;` でレンダリングするだけ
- `XxxClient.tsx` は元の `page.tsx` と同内容。`"use client"` を維持。`document.title` の `useEffect` は削除（metadataが代替）
- 動的ページ（`[id]`, `[party]`, `[name]`）は `generateMetadata` でSupabaseを叩いてページ固有のタイトル・descriptionを生成する
- 動的ページのサーバー側では JSON-LD もレンダリングし、`<script type="application/ld+json">` としてHTMLに埋め込む

命名規則：
| ディレクトリ | サーバーファイル | クライアントファイル |
|-------------|----------------|-------------------|
| `bills/` | `page.tsx` | `BillsClient.tsx` |
| `votes/` | `page.tsx` | `VotesClient.tsx` |
| `cabinet/` | `page.tsx` | `CabinetClient.tsx` |
| `committees/` | `page.tsx` | `CommitteesClient.tsx` |
| `parties/` | `page.tsx` | `PartiesClient.tsx` |
| `members/` | `page.tsx` | `MembersClient.tsx` |
| `members/former/` | `page.tsx` | `FormerMembersClient.tsx` |
| `members/[id]/` | `page.tsx` | `MemberDetailClient.tsx` |
| `parties/[party]/` | `page.tsx` | `PartyDetailClient.tsx` |
| `committees/[name]/` | `page.tsx` | `CommitteeDetailClient.tsx` |
| `changelog/` | `page.tsx` | `ChangelogClient.tsx` |
| `favorites/` | `page.tsx` | `FavoritesClient.tsx` |

#### URLへのUI状態反映

SNSシェア・外部リンクで同じ画面が再現できるよう、**タブ・ソート・フィルターの状態はURLパラメータに反映**する。

標準パターン：
```tsx
// "use client" コンポーネント内（Suspenseラッパー必須）
import { useSearchParams, usePathname, useRouter } from "next/navigation";

const searchParams = useSearchParams();
const pathname     = usePathname();

// 読み取り
const tab    = searchParams.get("tab")  ?? "default_tab";
const sortBy = searchParams.get("sort") ?? "default_sort";

// 書き込み
const setTab = (t: string) => {
  const p = new URLSearchParams(searchParams.toString());
  p.set("tab", t);
  router.replace(`${pathname}?${p.toString()}`);
};
```

- `useSearchParams()` を使用するコンポーネントは必ず `<Suspense>` でラップする（Next.js App Router の要件）
- ラップパターン: `XxxClient.tsx` に `XxxContent`（実ロジック）と `export default XxxClient`（Suspenseラッパー）を持つ

使用しているURLパラメータ：
| パラメータ | ページ | 例 |
|-----------|-------|---|
| `?tab=` | `/members/[id]`, `/parties/[party]`, `/committees/[name]` | `?tab=speeches` |
| `?sort=` | `/parties`, `/parties/[party]`, `/committees/[name]` | `?sort=speech_count` |
| `?session=` | `/votes` | `?session=217` |

#### 議員詳細ページの注釈表示
カードとタブの間に以下の注釈を表示：
```
※ 発言セッションは同日・同委員会の発言を1回として集計（第210回〜第221回国会の記録に基づく）。当選回数は現在の所属院におけるものです。
```
※ 会期範囲はバックフィル完了後に更新すること

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

#### 採決データの制約
- 採決記録（votes）は参議院のみ。衆議院は個人別投票記録を公開していない
- 議員詳細の採決タブ・投票一致率ページは参議院議員のみ対象
- 衆議院議員に対しては「衆議院は個人別の投票記録が公開されていない」と明示する

#### 外部サービス連携
- Google AdSense: `ads.txt` + body内Scriptタグ（pub-1728847761086799）
- Google Analytics: G-1QJP14PKPF
- 訂正申し立て: https://docs.google.com/forms/d/e/1FAIpQLSfs3iOuviV2CV5BddBbG2rmPYQ4QVnRvEn8pm3j3rNpdPBlpg/viewform

---

## 6. GitHub Actions ワークフロー

### 日次更新 (.github/workflows/collect.yml)
```
cron: "0 18 * * *" (JST 3:00)
timeout: 90分
steps:
  1.  議員データ登録        sources/members.py
  2.  発言データ収集        sources/speeches.py
  3.  活動スコア再計算      processors/scoring.py
  4.  内閣役職データ取得    sources/cabinet_scraper.py
  5.  質問主意書収集        sources/questions.py
  6.  請願収集              sources/petitions.py
  7.  採決記録収集（現会期）sources/votes.py --mode daily  [timeout: 10分]
  8.  委員会所属収集        sources/committees.py          [timeout: 15分]
  9.  キーワード更新        sources/keywords.py --mode daily [timeout: 20分, スキップ可]
  10. speeches上限チェック  processors/cleanup.py --task truncate-speeches
  11. データ品質監査        processors/audit.py  [失敗時はGitHub Issueを自動作成]
  12. 実行結果サマリー出力
```

**手動実行オプション**: `skip_keywords=true` でキーワード更新をスキップ可能

### 過去データ取得 (.github/workflows/backfill.yml)
- 手動実行（workflow_dispatch）
- 年を選択: 2024 / 2023 / 2022 / 2021 / 2018-2020
- 1年分ずつ順番に実行すること（並列はSupabase過負荷の原因）

### キーワード全件再構築 (.github/workflows/keyword-full-rebuild.yml)
- 手動実行（workflow_dispatch）
- member_keywordsとparty_keywordsをtruncateし、全議員分を再構築

---

## 7. 既知の問題・保留事項

### 衆参鞍替え議員の当選回数
- 当選回数は公式サイトの情報をそのまま使用する（現在の院での回数のみ）
- 衆議院: `1（参2）` → カッコ前の `1` のみ取得（`re.split(r'[（(]', terms_raw)[0]`）
- 参議院: プロフィールページの「当選 X 回」を使用
- 鞍替え情報（他院での経歴）は一切表示しない
- 理由: 衆→参と参→衆で公式データの記載が非対称であり、片方だけ表示するとユーザーを混乱させるため

### speechesテーブルのレコード上限
- cleanup.py --task truncate-speeches で管理しているが、上限値は未確定
- 将来のデータ増加を見据えて値を決定する必要がある

### データ品質監査
- audit.py が不整合を検出した場合はGitHub Issueに自動報告される
- 定期的にIssueを確認・対処すること

---

## 8. 過去の失敗と教訓

### データ正確性
- **教訓**: 100%正確でなければ実装しない
- **例**: 鞍替え検出（NDL API + プロフィール解析）→ 偽陽性が排除できず全面撤回

### IDの重複
- **原因**: スクレイピング毎にスペースの入り方が変わった
- **対策**: ID生成時に `re.sub(r'\s+', '', name)` で全スペース除去に統一
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

### 不要テーブルの放置
- **原因**: 使わないテーブル（activity_scores等）をシステムに残し続けた
- **対策**: 不要なものは明確に削除する
- **教訓**: 「使わないから無視」はメンテナンス性の敵

### 仕様書の不遵守
- **原因**: 仕様書を確認せず、目の前のエラーを直すことに集中して仕様と異なる実装をした
- **対策**: 判断の分岐点で必ず仕様書を参照する
- **教訓**: 仕様書があっても読まなければ存在しないのと同じ

---

## 9. 外部リンク・認証情報

- **Google AdSense**: pub-1728847761086799
- **Google Analytics**: G-1QJP14PKPF
- **Supabase**: 環境変数 SUPABASE_URL / SUPABASE_KEY（GitHub Secrets）
- **訂正フォーム**: https://docs.google.com/forms/d/e/1FAIpQLSfs3iOuviV2CV5BddBbG2rmPYQ4QVnRvEn8pm3j3rNpdPBlpg/viewform
- **問い合わせフォーム**: https://docs.google.com/forms/d/e/1FAIpQLSezkzLqHaSg4nXtKfU2ANb3wUkb9IFcN45Lv3DRoZTReYqafA/viewform

---

## 10. 開発ルール

### 絶対遵守事項
1. **自動化徹底**: できる限り人の手を入れず、自動で更新反映できる仕様にする
2. **法的安全性最優先**: 法的危険性に最大限注意し、運営の安全性をできる限り確保する
3. **勝手に判断しない**: 不明点・判断に迷う点は必ず相談する。先走って実装しない
4. **正確性100%**: 100%正確でなければ実装しない。推測・補正は禁止
5. **デプロイ前確認**: 複数の修正がある場合、まとめてデプロイ。途中で「次は？」と聞く
6. **衆参データの非対称性に注意**: 衆議院と参議院で取得できるデータ項目・形式が異なる場合、どちらに合わせるか必ず確認する。片方にしかないデータを片方だけ表示しない
7. **仕様書を必ず参照**: コードの変更前に必ず仕様書を確認し、仕様と整合する実装を行う
8. **将来のデータ増加を考慮**: 現時点で問題なくても、将来のデータ増加を見据えた設計にする

---

## 11. 運用手順

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

## 12. フロントエンド設計方針

### デザインコンセプト
- **モノクロベース**: UIは明るいグレー（`#f4f4f4`）ベースのモノクロ
- 色がつくのは**政党カラー**と**データ可視化**のみ（採決の赤/緑など）
- 「人の手を介さず、粛々とデータを見せるだけ」というスタンスを表現する

### CSSアーキテクチャ

#### 基本原則
インラインstyleの直書きは禁止。スタイルは `globals.css` で定義したクラスを使う。
これにより：
- テーマ変更が `globals.css` 1ファイルの変更で全ページに反映される
- `onMouseEnter/Leave` でJSがスタイルを書き換えない（CSS `:hover` に統一）
- 新しいページを追加した際に自動的に統一感が保たれる

#### デザイントークン（CSS変数）
`globals.css` の `:root` で定義。色を直書きしてはいけない。

```css
--bg-page / --bg-card / --bg-subtle / --bg-muted   /* 背景 */
--text-primary / --text-body / --text-secondary / --text-muted  /* テキスト */
--border / --border-subtle                          /* ボーダー */
--radius-sm / --radius-md / --radius-lg / --radius-xl  /* 角丸 */
```

#### 共通クラス一覧
| クラス | 用途 |
|--------|------|
| `.card` | 白背景カード（border + radius） |
| `.card-xl` | ヘッダーカード（padding + margin込み） |
| `.card-hover` | ホバーでボーダー色変化（`--hover-color`変数で色指定） |
| `.card-hover-lift` | 同上 + 浮き上がり（一覧ページのカード） |
| `.filter-btn` / `.active` | フィルター・ソートボタン |
| `.tab-bar-container` | タブバー外枠 |
| `.tab-pill` / `.active` | タブボタン |
| `.member-row` | 議員行（クリッカブルリスト） |
| `.badge` + `.badge-party` | 政党バッジ（`--party-color`変数で色指定） |
| `.badge-role` | 役職バッジ（グレー） |
| `.badge-result` | 結果バッジ（`--result-color`変数で色指定） |
| `.input-field` | フォーム入力欄 |
| `.loading-spinner` | アニメーション付きスピナー（丸型、CSS `animation: spin`） |
| `.loading-block` | スピナー＋テキストを中央寄せで表示するコンテナ |
| `.empty-state` | 空データ表示（テキスト中央・`color: var(--text-muted)`） |
| `.btn-back` / `.btn-cta` / `.btn-sub` / `.btn-danger` | 各種ボタン |
| `.fav-btn` / `.active` | お気に入りボタン |
| `.footer-link` | フッターリンク |
| `.section-title` | セクション見出し（大文字・muted） |
| `.progress-bar` / `.progress-fill` | プログレスバー |

#### 動的カラーの扱い
政党カラーなどランタイムで決まる色は、CSSカスタムプロパティで渡す：

```tsx
// 政党バッジ
<span className="badge badge-party" style={{"--party-color": color} as React.CSSProperties}>
  {party}
</span>

// ホバーで政党カラーのボーダーに変わるカード
<div className="card card-hover" style={{"--hover-color": color} as React.CSSProperties}>
```

CSSクラス側で `color-mix()` を使ってバリアントを生成する。

#### インラインstyleを残してよい場合
- `width: ${pct}%`（プログレスバーの幅など、計算値）
- `padding: 20px`（カードごとに異なるpadding）
- `border: \`1px solid ${color}44\``（政党カラーの透過ボーダー）

これ以外は原則クラスを使う。

### 今後の発展
現状はCSSクラスによるスタイル統一。チームが拡大したり機能が増えた場合は、
**コンポーネント抽象化**（`<MemberRow>`、`<Badge party={...}>`）が次のステップ。
コンポーネント化すれば見た目だけでなく構造も保証できる。

---

## 13. SEO / AIO / LLMO

### 13.1 実装済みファイル構成

```
apps/web/
  app/
    robots.ts          # robots.txt の Next.js 生成ファイル
    sitemap.ts         # sitemap.xml の Next.js 動的生成（Supabaseから全ページURL取得）
  public/
    llms.txt           # LLM・AIクローラー向け案内文書（新興標準）
    og-image.svg       # OGP画像（共通）
    ads.txt            # Google AdSense 設定
```

### 13.2 メタデータ戦略

#### 静的ページ（固定タイトル）
`export const metadata: Metadata` を `page.tsx`（サーバーコンポーネント）に定義：
```tsx
export const metadata: Metadata = {
  title: "議員立法",
  description: "衆議院・参議院に提出された議員立法の一覧。...",
  openGraph: { title: "...", description: "..." },
  alternates: { canonical: "https://www.hataraku-giin.com/bills" },
};
```

#### 動的ページ（[id], [party], [name]）
`generateMetadata` でSupabaseから議員名・政党名等を取得してページ固有のメタデータを生成：
```tsx
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const { data } = await supabase.from("members").select("name, party, ...").eq("id", id).single();
  return {
    title: data.name,
    description: `${data.name}（${data.party}）の国会活動データ...`,
    openGraph: { ... },
    alternates: { canonical: `https://www.hataraku-giin.com/members/${id}` },
  };
}
```

#### グローバル設定（layout.tsx）
| 設定 | 内容 |
|------|------|
| `metadataBase` | `https://www.hataraku-giin.com` |
| `title.template` | `"%s \| はたらく議員"` |
| `description` | 140字以内の日本語説明文 |
| `keywords` | 国会議員・議員活動・衆議院・参議院 等 |
| `openGraph` | title, description, locale: ja_JP, images: og-image.svg |
| `twitter` | card: summary_large_image, images: og-image.svg |

### 13.3 構造化データ（JSON-LD）

サーバーコンポーネントから `<script type="application/ld+json">` として埋め込む。

| ページ | schema.org タイプ | 内容 |
|--------|-----------------|------|
| `layout.tsx`（全ページ） | `WebSite` + `Organization` | サイト全体・SearchAction（/members?q=）・ロゴ |
| `/members/[id]` | `Person` | 議員名・役職・所属政党・URL |
| `/parties/[party]` | `PoliticalParty` | 政党名・所属議員数・URL |
| `/committees/[name]` | `GovernmentOrganization` | 委員会名・委員長・URL |

### 13.4 サイトマップ（sitemap.ts）

Next.js の `app/sitemap.ts` で動的生成。Supabaseから以下を取得してURL一覧を構築：
- 静的ルート（/, /members, /parties 等）: 固定で記述
- `/members/[id]`: `is_active = true` の全議員ID
- `/parties/[party]`: membersテーブルの distinct party
- `/committees/[name]`: committee_membersテーブルの distinct committee

`changeFrequency` / `priority` は重要度に応じて設定（トップ: 1.0、議員詳細: 0.8 等）

### 13.5 robots.ts

```
全クローラー: / 許可、/favorites と /api/ は拒否
GPTBot / ClaudeBot / PerplexityBot: 明示的に許可
Sitemap: https://www.hataraku-giin.com/sitemap.xml
```

### 13.6 llms.txt（AI向けドキュメント）

`public/llms.txt` に以下を記載：
- サービス概要・目的
- 提供データの種類と取得元
- 主要ページ一覧
- 利用上の注意（データは公開情報のみ・活動の評価ではない）
- AI回答時の注意点

### 13.7 next.config.ts セキュリティヘッダー

```
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
X-XSS-Protection: 1; mode=block
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: camera=(), microphone=(), geolocation=()
```

静的アセット（SVG/PNG等）には `Cache-Control: public, max-age=86400` を設定。
`poweredByHeader: false` で `X-Powered-By: Next.js` ヘッダーを除去。

### 13.8 政党名短縮表記（votes ページ）

マトリクスの列ヘッダーはスマホでの重なり防止のため短縮名を使用（`PARTY_SHORT` マップ）：

| 正式名 | 短縮名 |
|-------|-------|
| 自民党 | 自民 |
| 立憲民主党 | 立憲 |
| 日本維新の会 | 維新 |
| 国民民主党 | 国民 |
| れいわ新選組 | れいわ |
| チームみらい | みらい |
| 日本保守党 | 保守 |
| 中道改革連合 | 中道改革 |
| 沖縄の風 | 沖縄風 |
| （その他） | そのまま表示 |

---

## 14. 未決定事項

### データ・機能
- speechesテーブルのレコード上限値の確定
- 採決データのバックフィル範囲（第208回以前に遡るか）
- 前議員ページに採決・立法タブを表示するか

### 運用
- PARTY_MAPの定期見直しタイミング（選挙後・会派変更後等）
