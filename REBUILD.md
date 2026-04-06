# はたらく議員 — リビルド管理ファイル

> 目的：将来にわたって情報を正しく表示し続けること。そのために、堅牢で更新性・拡張性が高くリスクが最小限に抑えられたシステムを維持する。

---

## 現在のフェーズ

| フェーズ | 内容 | 状態 |
|---------|------|------|
| 1. 調査・洗い出し | 全体を横断的に調査し、問題を網羅的に把握する | ✅ 完了（2026-04-05） |
| 2. 設計 | 「この設計にすれば全て解決する」という統一案を確立する | ✅ 完了（2026-04-05） |
| 3. 実装（前半） | MemberChip・queries.ts・MemberDetailClient・トップページ | ✅ 完了（2026-04-05） |
| 3. 実装（後半） | **全リストページのクエリ集約**（質問・請願・法案・採決・委員会） | 🔲 進行中 |

**フェーズ3後半が残っている。「フェーズ3完了」は誤記だった。**

---

## フェーズ1 調査で確認した根本原因

「同じ種類のミスが繰り返される」原因は3つの構造的欠陥に集約される。

### 根本原因 1：型とデータとクエリが連動していない

- `lib/types.ts` の Member interface に `speech_count`・`prev_party` が未定義 → TypeScript の保護が効かない
- `lib/queries.ts` が存在しない型（`SiteSetting`, `ChangelogEntry`, `MemberDetail`, `PartyDetail`）をインポート → コンパイルエラーを抱えたまま
- `lib/queries.ts` はどのページにも import されていない（完全なデッドコード）
- 各ページが Supabase を直接呼ぶため、select するフィールドがページごとにバラバラ

### 根本原因 2：表示ルールを呼び出し側が持っている

- `MemberChip` の `isFormer` prop が optional → 渡し忘れても TypeScript エラーにならない
- `isFormer` を渡すには上流クエリに `is_active` が含まれている必要があるが、`page.tsx` の3クエリには含まれていない
- 結果：トップページの活動タブ（質問主意書・委員会活動・議員立法）で前議員が現職色で表示される

**具体的な渡し忘れ箇所（コードで確認済み）：**

| ファイル | 行 | タブ | is_active の有無 |
|---------|-----|------|----------------|
| `apps/web/app/components/ActivityTabs.tsx` | 110 | 質問主意書 | データ構造に存在しない |
| `apps/web/app/components/ActivityTabs.tsx` | 140 | 委員会活動 | データ構造に存在しない |
| `apps/web/app/components/ActivityTabs.tsx` | 182 | 議員立法 | データ構造に存在しない |

**上流クエリの不備（コードで確認済み）：**

| 関数（`apps/web/app/page.tsx`） | select 内容 | 問題 |
|-------------------------------|-------------|------|
| `getRecentQuestions()` | `members(name, party)` | `is_active` なし |
| `getLatestCommitteeActivity()` | `"id, name, party"` | `is_active` なし |
| `getRecentBills()` | `"id, name, party"` | `is_active` なし |

（比較：`getRecentPetitions()` は `"id, name, party, is_active, alias_name"` で正しく取得済み）

### 根本原因 3：queries.ts の内部バグ（使われていないが、将来使おうとしたとき壊れる）

| 関数 | バグ内容 |
|------|---------|
| `getSpeechesForMember` | `url` を select しているが実テーブルのカラム名は `source_url` |
| `getMemberDetail` | `Promise.all` → 1クエリ失敗で全データが飛ぶ |
| `getChangelog` | 存在しない Supabase テーブルをクエリ（changelog は静的ファイル） |
| `isElectionSafeMode` / `getMaintenanceBanner` | 機能・コンポーネント削除済みの残骸 |
| `getDashboardStats` | `m.speech_count` を参照するが Member 型に未定義 |

---

## フェーズ2 設計決定事項

### 設計方針（確定）

**A. queries.ts を唯一のデータアクセス層とする（フル採用）**

部分採用では「間違った使い方ができない構造」を作れない。1つでも直接呼び出しが残れば、そこから `is_active` が抜け落ちる可能性が再び生まれる。

例外として認めるもの：ページ固有の複合計算クエリ（`getPartyAlignmentMatrix` 等）。これらは再利用不可能な計算ロジックを含むため pages に残す。

クライアント側のインタラクティブクエリ（フィルター・ソート・検索）は、実行パラメータがユーザー入力によって変化するため queries.ts に集約できない。ただし、これらも **`MEMBER_SELECT` 定数**（後述）を使って select フィールドを統一する。

**B. MemberChip は `is_active` を required prop とする**

`isFormer?: boolean`（optional）を `is_active: boolean`（required）に変更する。
- `isFormer` の計算（`!is_active`）はコンポーネント内部に移動
- required にすることで渡し忘れがコンパイルエラーになる
- 呼び出し側は「前議員かどうか」を意識しなくてよい

**C. 標準 member フィールドセットを1箇所に定義する**

```typescript
// lib/queries.ts に定義
export const MEMBER_SELECT = "id,name,alias_name,party,prev_party,house,district,is_active,cabinet_post,session_count,question_count,bill_count,petition_count,speech_count,terms" as const;
```

全クエリがこの定数を参照することで、フィールドの追加・削除が1箇所の変更で全ページに反映される。

---

## フェーズ3 実装計画

**Step間の依存関係：Step 1 → Step 2 → Step 3（A+Bは原子的） → Step 4 → Step 5**

Step 3A と Step 3B は必ず同時に実施すること（片方だけでは TypeScript エラーで壊れる）。

---

### Step 1：types.ts の完成（前提。最初に実施）

**ファイル：** `apps/web/lib/types.ts`

**変更内容：** Member interface に以下を追加

```typescript
speech_count: number | null;   // 追加（現在なし）
prev_party: string | null;     // 追加（現在なし）
```

**確認：** 追加後、`lib/queries.ts` の `getDashboardStats` で `m.speech_count` を参照している箇所の型エラーが解消されること。

---

### Step 2：queries.ts のクリーンアップ（Step 1 の後）

**ファイル：** `apps/web/lib/queries.ts`

**削除するもの（全て確認済み未使用）：**
- import 文から `SiteSetting`, `ChangelogEntry`, `MemberDetail`, `PartyDetail` を削除
- `getChangelog()` 関数を削除（changelog は `lib/changelog.ts` の静的データを使う）
- `isElectionSafeMode()` 関数を削除（機能削除済みの残骸）
- `getMaintenanceBanner()` 関数を削除（機能削除済みの残骸）
- `getPartyDetail()` 関数を削除（pages に残す複合クエリのため）

**修正するもの：**
- `getSpeechesForMember`: select 内の `url` → `source_url`、`house` を追加（Speech 型の全フィールドに合わせる）
- `getMemberDetail`: `Promise.all` → `Promise.allSettled` に変更、エラー時も他データを返す
- 全 `getActiveMembers` / `getFormerMembers` / `getAllMembers` の select を `MEMBER_SELECT` 定数に変更

**追加するもの：**
```typescript
export const MEMBER_SELECT = "id,name,alias_name,party,prev_party,house,district,is_active,cabinet_post,session_count,question_count,bill_count,petition_count,speech_count,terms" as const;
```

**完了の確認：** `npx tsc --noEmit` でエラーなし。

---

### Step 3A：MemberChip の is_active 必須化（Step 3B と同時に実施）

**ファイル：** `apps/web/components/MemberChip.tsx`

**変更内容：**
```typescript
// 変更前
interface Props {
  id: string; name: string; party: string; isFormer?: boolean;
}
export default function MemberChip({ id, name, party, isFormer = false }: Props) {
  const color = isFormer ? "#aaaaaa" : partyColor(party);

// 変更後
interface Props {
  id: string; name: string; party: string; is_active: boolean;
}
export default function MemberChip({ id, name, party, is_active }: Props) {
  const color = is_active ? partyColor(party) : "#aaaaaa";
```

**この変更により TypeScript エラーが発生する全ファイル（Step 3B で同時修正）：**

| ファイル | 変更箇所 | 現在 | 変更後 |
|---------|---------|------|--------|
| `apps/web/app/bills/BillsClient.tsx` | 432,630,794行 | `isFormer={!m.is_active}` | `is_active={m.is_active}` |
| `apps/web/app/questions/QuestionsClient.tsx` | 235,316行 | `isFormer={!q.members.is_active}` | `is_active={q.members.is_active}` |
| `apps/web/app/committees/[name]/CommitteeDetailClient.tsx` | 459行 | `isFormer={!member.is_active}` | `is_active={member.is_active}` |
| `apps/web/app/petitions/PetitionsClient.tsx` | 321行 | `isFormer={!member.is_active}` | `is_active={member.is_active}` |
| `apps/web/app/components/ActivityTabs.tsx` | 110,140,182行 | prop なし | `is_active={...}` を追加（Step 3B 後） |

---

### Step 3B：上流クエリへの is_active 追加（Step 3A と同時に実施）

**ファイル：** `apps/web/app/page.tsx` と `apps/web/app/components/ActivityTabs.tsx`

**page.tsx の変更（3箇所）：**

```typescript
// getRecentQuestions() 内
// 変更前: .select("...,members(name, party)")
// 変更後: .select("...,members(name, party, is_active)")

// getLatestCommitteeActivity() 内 memberMap 取得クエリ
// 変更前: .select("id, name, party")
// 変更後: .select("id, name, party, is_active")
// memberMap の型も変更: Map<string, { name: string; party: string; is_active: boolean }>
// groupsのmembersも変更: members: [...g.memberIds].map((id) => ({ id, ..., is_active: memberMap.get(id)?.is_active ?? true }))

// getRecentBills() 内 members 取得クエリ
// 変更前: .select("id, name, party")
// 変更後: .select("id, name, party, is_active")
// memberMap の型も変更: Record<string, { name: string; party: string; is_active: boolean }>
// submitters のマッピングも変更: { id, name, party, is_active }
```

**ActivityTabs.tsx の変更（interface 3箇所）：**

```typescript
// 変更前
interface Question {
  members: { name: string; party: string } | null;
}
interface CommitteeActivity {
  members: { id: string; name: string; party: string }[];
}
interface Bill {
  submitters: { id: string; name: string; party: string }[];
}

// 変更後
interface Question {
  members: { name: string; party: string; is_active: boolean } | null;
}
interface CommitteeActivity {
  members: { id: string; name: string; party: string; is_active: boolean }[];
}
interface Bill {
  submitters: { id: string; name: string; party: string; is_active: boolean }[];
}
```

**ActivityTabs.tsx MemberChip 呼び出しの変更：**

```typescript
// line 110（質問主意書タブ）
// 変更前: <MemberChip id={q.member_id} name={q.members.name} party={q.members.party} />
// 変更後: <MemberChip id={q.member_id} name={q.members.name} party={q.members.party} is_active={q.members.is_active} />

// line 140（委員会活動タブ）
// 変更前: <MemberChip key={m.id} id={m.id} name={m.name} party={m.party} />
// 変更後: <MemberChip key={m.id} id={m.id} name={m.name} party={m.party} is_active={m.is_active} />

// line 182（議員立法タブ）
// 変更前: <MemberChip key={s.id} id={s.id} name={s.name} party={s.party} />
// 変更後: <MemberChip key={s.id} id={s.id} name={s.name} party={s.party} is_active={s.is_active} />

// line 252（請願タブ）
// 変更前: isFormer={!member.is_active}
// 変更後: is_active={member.is_active}
```

**完了の確認：** `npx tsc --noEmit` でエラーなし。トップページのすべてのタブで前議員が灰色表示されること。

---

### Step 4：全ページのクエリを queries.ts 経由に統一

**対象ファイル：** 以下のページが Supabase を直接呼ぶ箇所を queries.ts 関数に置き換える

| ページ | 関数 | 置き換え先 |
|--------|------|-----------|
| `members/page.tsx` | `getActiveMembers()` 相当のクエリ | `getActiveMembers()` |
| `members/former/page.tsx` | `getFormerMembers()` 相当のクエリ | `getFormerMembers()` |
| `parties/page.tsx` | 議員一覧取得 | `getActiveMembers()` |
| `cabinet/page.tsx` | 議員一覧（cabinet_post あり） | `getActiveMembers()` |

**例外（置き換えない）：**
- `page.tsx` の `getPartyAlignmentMatrix()`：複合計算ロジック、再利用不可
- `page.tsx` の `getCurrentSessionStats()`：複合集計クエリ
- クライアントコンポーネントのインタラクティブクエリ（動的フィルター・ソート）：MEMBER_SELECT 定数を使って select フィールドを統一するだけでよい

**クライアント側の対応（全 *Client.tsx）：**
members テーブルへの直接クエリで `.select("id, name, party, ...")` と書いている箇所を、MEMBER_SELECT 定数が必要なフィールドを網羅しているか確認する。足りない場合は MEMBER_SELECT に追加する（1箇所の変更で全体に反映）。

---

### Step 5：ホームページ統計の count:exact 化

**ファイル：** `apps/web/app/page.tsx`

**変更内容：** `getStats()` 内の `shugiin` / `sangiin` / `total` カウントを `.filter().length` から DB の `count: "exact"` 取得に変更する。

```typescript
// 変更前（現状）
const members = membersRes.data || [];
const shugiin = members.filter((m: any) => m.house === "衆議院").length;
const sangiin = members.filter((m: any) => m.house === "参議院").length;
const total   = members.length;

// 変更後
// Promise.all の中に追加
supabase.from("members").select("id", { count: "exact", head: true }).eq("is_active", true).eq("house", "衆議院"),
supabase.from("members").select("id", { count: "exact", head: true }).eq("is_active", true).eq("house", "参議院"),
// → shugiinCount.count, sangiinCount.count を使う
```

---

## 既知の問題（調査結果反映版）

### 表示の正確さ（優先度：高）

| # | 問題 | 詳細 | ステータス |
|---|------|------|-----------|
| D-1 | ActivityTabs の3箇所で前議員が現職色で表示 | 上流クエリに `is_active` なし。Step 3 で解消 | ✅ 対応済み |
| D-2 | ホームページの院別議員数が `.length` 依存 | 現時点では実害なし（700名 < 2000）。Step 5 で解消 | ✅ 対応済み |
| D-3 | queries.ts が完全なデッドコード（型エラーあり） | 使われていないが将来の地雷。Step 2 で解消 | ✅ 対応済み |
| D-4 | 全ページで通称名（alias_name）が未使用 | MemberChip に alias_name がなく、ラサール石井等が法定名で表示されていた。CommitteeDetailClient 委員一覧タブも修正済み | ✅ 対応済み |
| Q-1 | speeches の member_id=NULL が約108,000件 | NDL表記と members.name の不一致 | 🔲 部分対処 |
| Q-2 | ~~前議員リスト未完成~~ **修正：自動管理済み** | members.py が日次で全院リセット→再登録。register_former_members.py は遡及的追加専用 | ✅ 深刻度低 |
| Q-3 | bills の提出者 member_id=NULL | 調査済み（2026-04-05）。提出者なしの議員立法9件は全て「委員長提出法案」（役職名が提出者欄に入るため個人IDに紐付かない）。閣法336件の空は正常。実害は「委員長提出9件が法案ページで提出者無表示」のみ。表示方法の設計判断が必要 | 🔲 設計判断待ち |
| D-5 | 委員会一覧の人数が詳細と異なる | Supabase の max_rows=1000 上限により全1,178行のうち178行が欠落。committee_members を range pagination（0-999, 1000-1999）で2回取得して修正。sitemap.ts も同様に修正 | ✅ 対応済み（2026-04-06） |

### 構造的リスク（優先度：中）

| # | 問題 | 詳細 | ステータス |
|---|------|------|-----------|
| R-0 | サーバーページが queries.ts 非経由 | queries.ts の全関数に `client` 引数（デフォルト=クライアント用）を追加。`members/page.tsx`・`cabinet/page.tsx` を queries.ts 経由に変更。`parties/page.tsx` は `select("party")` のみの集計クエリのため例外（REBUILD.md設計方針の「複合計算クエリ」に該当）。`CabinetClient` のローカル Member 定義も lib/types.ts に統合 | ✅ 対応済み |
| R-1 | audit.py が「0件でも古データがあれば未検知」 | `check_collector_freshness()` を追加。speeches/questions の最新レコード日付が14日以上前なら発火 | ✅ 対応済み（2026-04-06） |
| R-2 | スクレイパーが公式サイトの構造変化で無音で壊れる | `check_null_rates()` を追加。questions/sangiin_questions の submitted_at NULL率・speeches の member_id NULL率を30日間監視。30%超で発火 | ✅ 対応済み（2026-04-06） |
| R-3 | PARTY_MAP と CURRENT_SESSION 等がフロント・Python の両方にハードコード | 新政党・新回次対応時の対応漏れリスク | 🔲 |

### フェーズ3後半：残作業（優先度：高）

**問題の本質：** 発言・質問・請願・法案など、同じデータを複数ページで呼び出しているのに、クエリロジックがページごとに個別実装されている。一方を修正してももう一方に反映されない。

| # | 問題 | 具体的な重複 | ステータス |
|---|------|-------------|-----------|
| W-1 | 質問主意書のクエリが2箇所に重複（月別推移含む） | `questions/page.tsx`・`QuestionsClient.tsx`の重複fetch削除。`getMonthlyQuestions`も`.limit(2000)`バグつきで残存していたため`getMonthlyQuestionsTrend`としてページネーション実装でqueries.tsに移動 | ✅ 対応済み |
| W-2 | 請願のクエリが2箇所に重複 | `petitions/page.tsx`の`fetchAllServer`+members取得 と `PetitionsClient.tsx`の`fetchAll`+members取得が同一 | ✅ 対応済み |
| W-3 | 法案ページにSSRなし・クライアント直接フェッチ | `BillsClient.tsx`のbills・membersフェッチを`getBillsByType`・`getAllMembers`経由に変更。ローカル`Bill`・`MemberInfo`型を削除 | ✅ 対応済み |
| W-4 | 各Clientファイルにローカル型定義が残存 | `QuestionListItem`・`PetitionListItem`を`lib/types.ts`に追加。`Bill`に欠落フィールド追加。各Clientのローカル定義削除 | ✅ 対応済み |
| W-5 | `as any`キャストで型チェックが無効化されている | queries.tsを含む多数のファイルで`(d as any)`が多用され、TypeScriptの保護が効いていない | ✅ 対応済み（2026-04-06） |

**解決方針:**
- `queries.ts` に `getAllQuestionsWithMembers()`, `getAllSangiinQuestionsWithMembers()`, `getAllPetitionRows()`, `getAllSangiinPetitionRows()`, `getPetitionMemberMap()` を追加
- `lib/types.ts` に `QuestionListItem`, `PetitionListItem` を追加
- 各page.tsx と各Client.tsxの重複fetchを削除し、queries.tsの関数に統一
- W-5のas anyは段階的に対処（影響範囲が広いため後回し可）

### 利便性（優先度：低）

| # | 問題 | 詳細 | ステータス |
|---|------|------|-----------|
| U-1 | フィルター・タブ状態がURLに反映されていないページがある | ブックマーク・共有ができない | ✅ 対応済み（2026-04-06）|

### SEO・クローラー対応

| # | 問題 | 詳細 | ステータス |
|---|------|------|-----------|
| S-1 | クローラーが主要ページを空HTMLと認識 | Next.js CSRのため初期HTMLにコンテンツなし | ✅ 2026-04-04 SSR対応済み |

---

## サイト全機能一覧

### フロントエンド ページ

| ページ | URL | 主な機能 | 使用テーブル | 状態 |
|--------|-----|---------|-------------|------|
| トップ | `/` | 統計カード・最新活動タブ・政党バー・更新履歴 | members, speeches, questions, bills, petitions | ✅ |
| 現職議員一覧 | `/members` | 政党・院フィルター・ソート・お気に入り | members | ✅ |
| 議員詳細 | `/members/[id]` | 発言・質問・採決・立法・請願・レーダー・AI分析 | members, speeches, questions, votes, bills, petitions | ✅ |
| 前議員一覧 | `/members/former` | 政党・院フィルター・ソート | members (is_active=false) | ✅ |
| 政党一覧 | `/parties` | ソート・統計 | members, votes | ✅ |
| 政党詳細 | `/parties/[party]` | 議員一覧・活動レーダー・採決・AI分析・選挙得票 | members, committee_members, votes | ✅ |
| 委員会一覧 | `/committees` | 検索・フィルター | committee_members | ✅ |
| 委員会詳細 | `/committees/[name]` | 委員長理事・議員・請願（3タブ） | committee_members, petitions | ✅ |
| 法案 | `/bills` | 議員立法・閣法・政党ネットワーク（3タブ） | bills, speeches, members | ✅ |
| 採決 | `/votes` | 政党別一致率マトリックス・会期フィルター | votes, members | ✅ |
| 内閣 | `/cabinet` | 大臣・副大臣・政務官リスト | members | ✅ |
| 質問主意書 | `/questions` | 一覧・検索・統計タブ | questions, sangiin_questions, members | ✅ |
| 請願 | `/petitions` | 一覧・検索・統計タブ | petitions, sangiin_petitions, members | ✅ |
| お気に入り | `/favorites` | localStorage管理・URLシェア | members | ✅ |
| 更新履歴 | `/changelog` | 機能追加履歴 | changelog.ts（静的） | ✅ |
| サイトについて | `/about` | — | — | ✅ |
| 免責事項 | `/disclaimer` | — | — | ✅ |

---

### データ収集スクリプト

| スクリプト | 収集内容 | ソース | テーブル | 日次 | バックフィル |
|-----------|--------|--------|---------|------|------------|
| members.py | 議員基本情報 | 衆院・参院公式 | members | ✅ | — |
| speeches.py | 発言メタデータ | NDL API | speeches, speech_excerpts | ✅ | ✅ |
| scoring.py | カウント再計算 | 各テーブル集計 | members（更新） | ✅ | ✅ |
| cabinet_scraper.py | 内閣役職 | 首相官邸 | members（cabinet_post） | ✅ | — |
| bills.py | 法案情報 | 衆院公式 | bills | ✅ | ✅ |
| questions.py | 質問主意書 | 衆院・参院公式 | questions, sangiin_questions | ✅ | ✅ |
| petitions.py | 請願 | 衆院・参院公式 | petitions, sangiin_petitions | ✅ | ✅ |
| committees.py | 委員会所属 | 衆院・参院公式 | committee_members | ✅ | — |
| votes.py | 参院採決記録 | 参院公式 | votes | ✅ | ✅ |
| keywords.py | ワードクラウド | speeches テーブル | member_keywords, party_keywords | ✅ | ✅ |
| vote_alignment.py | 政党別採決一致率 | votes テーブル | vote_alignment | ✅ | — |
| audit.py | データ品質監査 | NDL API・官邸・本番 | — | ✅ | — |
| cleanup.py | speeches 上限管理 | speeches テーブル | speeches（削除） | ✅ | — |
| election_votes.py | 選挙得票・議席 | 総務省 | election_votes | 手動 | — |

**is_active の管理方式（重要）：**
`members.py` は毎日①全議員を `is_active=False` にリセット ②今日スクレイプできた現職を `is_active=True` で upsert する。通常の選挙・任期切れは自動で反映される。スクレイプ件数が異常値（衆院<400・参院<200）のときはリセットを行わず RuntimeError を出す安全策あり。`register_former_members.py` は NDL に発言記録があるが現官公式サイトに載っていない過去の議員を遡及的に追加する専用スクリプト。

---

### DBテーブル一覧

| テーブル | 主な用途 | 備考 |
|---------|---------|------|
| members | 議員マスタ（現職＋前議員） | *_count フィールドで集計値を保持 |
| speeches | 発言メタデータ | 上限500,000行。本文なし |
| speech_excerpts | 長文発言抜粋 | 300字以上・最大30件/議員 |
| bills | 議員立法＋閣法 | bill_type カラムで区別 |
| votes | 参院採決（個人別） | 衆院は非公開のため未収録 |
| questions | 衆院質問主意書 | |
| sangiin_questions | 参院質問主意書 | |
| petitions | 衆院請願 | |
| sangiin_petitions | 参院請願 | |
| committee_members | 委員会所属（現時点スナップショット） | 履歴なし |
| member_keywords | 議員別ワードクラウド（上位100語） | |
| party_keywords | 政党別ワードクラウド | member_keywords の合算 |
| vote_alignment | 政党別採決一致率 | |
| election_votes | 選挙得票数・当選人数 | |
| site_settings | サイト設定 | キーは現在未使用 |

---

### 共通コンポーネント

#### UIコンポーネント（`components/` / `app/components/`）

| ファイル | 用途 | 備考 |
|--------|------|------|
| MemberChip.tsx | 議員リンクチップ | Props は `Pick<Member, "id"\|"name"\|"alias_name"\|"party"\|"is_active">` — 全て required。内部で `alias_name ?? name` を計算 |
| Paginator.tsx | ページネーション | |
| Analytics.tsx | アクセス解析タグ | |
| GlobalNav.tsx | ヘッダーナビゲーション | |
| GlobalFooter.tsx | フッター | |
| FloatingMemberSearch.tsx | フローティング議員検索 | |
| ActivityRadar.tsx | 活動バランスレーダーチャート | |
| ActivityTabs.tsx | トップページ活動タブ | **Step 3B で interface 更新** |
| WordCloud.tsx | ワードクラウド | |
| AIAnalysisBase.tsx | AI分析ボタン・プロンプト生成 | |

#### ライブラリ（`lib/`）

| ファイル | 用途 | 備考 |
|--------|------|------|
| supabase.ts | Supabaseクライアント（クライアントサイド） | |
| supabase-server.ts | Supabaseクライアント（サーバーサイド） | |
| types.ts | TypeScript型定義 | **Step 1 で speech_count・prev_party 追加** |
| queries.ts | 共通クエリ関数 | **Step 2 でクリーンアップ・MEMBER_SELECT 追加** |
| partyColors.ts | 政党カラー・短縮名（唯一のソース） | |
| partyStatus.ts | 政党ステータス判定 | |
| favorites.ts | お気に入り管理（localStorage） | |
| changelog.ts | 更新履歴データ（静的） | |

---

## 作業ルール

- **修正前に必ず報告する**（調査→報告→承認→修正）
- **同種の問題を横断的に洗い出してから修正する**
- **プッシュ前にローカル確認を提案する**（`cd apps/web && npm run dev`）
- **数値には集計期間を添える**
- **MemberChip には `is_active` を渡す**（Step 3 以降。渡し忘れはコンパイルエラーになる）
- **DBの集計値（`*_count`）を信頼し、フェッチ配列の `.length` に頼らない**
- **スクレイパーはHTML構造を実確認してから書く**
- **members テーブルへのクエリは MEMBER_SELECT 定数を使う**（Step 2 以降）

---

最終更新: 2026-04-06

### 本日の作業まとめ（2026-04-06）
- Q-1 調査：NULLスピーチ107,593件の内訳を分析
  - 請願紹介実績との照合で47名の前議員を特定（方針：質問・立法・請願に名前があれば議員と判断）
  - register_former_members.py に47名追加 → 3,592件の speeches を紐付け完了
  - 残課題：衆議院立憲→中道の党名修正（後回し）、scoring-only 要実行
- R-1/R-2：audit.py に `check_collector_freshness()` / `check_null_rates()` を追加
- audit.py バグ修正：
  - DB側の `is_procedural=False` フィルターを削除（NDL との比較対象を統一）
  - NDL検索名を `member["name"]` から `ndl_names[0]` に変更（全角スペース入り名前の誤検知を排除）
  - これにより過去の全5件の誤検知（坂本哲志・鈴木エリ・芳賀道也・木戸口英司・渡辺真太朗）の原因を解消

### 次回着手候補（優先度順）
1. **scoring-only backfill**：新規登録47名の *_count 再計算（Actions → backfill.yml → scoring-only）
2. **W-5**：`as any` キャスト排除
3. **Q-3**：委員長提出法案の表示方法を決める（「委員会提出」表示 or 別分類）
4. **R-3**：PARTY_MAP / CURRENT_SESSION のフロント・Python 二重ハードコード
