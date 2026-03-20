# データ管理方針

はたらく議員のデータは「自動収集」と「手動管理」の2種類に分かれる。

---

## 自動収集データ（毎日 JST 03:00 に GitHub Actions が実行）

| データ種別 | コレクター | 収集元 |
|---|---|---|
| 議員基本情報（氏名・選挙区・期数等） | `sources/members.py` | 衆議院・参議院公式サイト |
| 発言セッション数・キーワード | `sources/speeches.py` / `sources/keywords.py` | 国立国会図書館API |
| 質問主意書 | `sources/questions.py` | 国立国会図書館API |
| 議員立法 | `sources/bills.py` | 国立国会図書館API |
| 請願 | `sources/petitions.py` | 国立国会図書館API |
| 委員会所属 | `sources/committees.py` | 衆議院・参議院公式サイト |
| 採決記録（参議院） | `sources/votes.py` | 参議院公式サイト |
| 採決記録（衆議院） | `sources/votes.py` | 衆議院公式サイト |
| 政党間採決一致率 | `sources/vote_alignment.py` | 採決記録から算出 |
| 党議拘束推定 | `sources/party_whip.py` | 採決記録から算出 |
| 閣法 | `sources/cabinet_scraper.py` | 参議院公式サイト |
| 発言抜粋（AI分析用） | `sources/speeches.py`（収集と同時処理） | 国立国会図書館API |

---

## 発言抜粋（speech_excerpts）の仕様

AI分析機能のコンテキストとして使用する発言テキストを管理する。

### 収集ロジック

- `speeches.py` の収集ループ内で、発言テキストを取得した際に同時処理（追加のNDLアクセスなし）
- 冒頭のヘッダー（`○議員名　` 形式）を正規表現で除去してから文字数を計算
- ヘッダー除去後 **300字以上** を「長文」と判定して保存対象とする
- 保存内容：ヘッダー除去後の先頭 **1,000字**
- 議員ごとに `spoken_at` 降順で **最大10件** を保持（古いものは自動削除）

### 保存先テーブル：`speech_excerpts`

| カラム | 内容 |
|---|---|
| `id` | NDLのspeechID |
| `member_id` | 議員ID |
| `spoken_at` | 発言日 |
| `committee` | 委員会名 |
| `session_number` | 国会回次 |
| `source_url` | NDL会議録URL |
| `excerpt` | ヘッダー除去後の先頭1,000字 |
| `original_length` | ヘッダー除去後の元の文字数 |

### AI分析への使用

- 議員詳細ページのAI分析タブで、直近 **5件** をコンテキストとして使用（`SPEECH_EXCERPT_COUNT = 5`）
- 発言ヘッダーには `source_url`（NDL会議録URL）を含め、AI出力の「主な出典」に反映される
- 件数の調整は `apps/web/app/members/[id]/AIAnalysis.tsx` の `SPEECH_EXCERPT_COUNT` を変更するだけ

---

## 手動管理データ（選挙・政治変動のたびに手動で更新が必要）

### 1. 選挙得票数・議席数
**ファイル：** `apps/collector/sources/election_votes.py`
**更新タイミング：** 選挙確定後
**手順：**
1. 総務省公式資料（PDF/XLSX）で得票数を確認
2. 各メディア確定報道で議席数を確認
3. `SHUGIIN_XXXX` / `SANGIIN_XXXX` の定数を追記
4. `add_rows(...)` に追加
5. `SUPABASE_URL=... SUPABASE_KEY=... PYTHONPATH=. python3 sources/election_votes.py` を実行

**注意事項：**
- 按分票の小数点以下は切り捨て
- 議席数は**選挙確定時点**の値（追加公認・会派移籍後は反映しない）
- 無所属連合は「無所属」に合算する
- DBには古い行が残るため、不要な行は Supabase ダッシュボードの SQL Editor で `DELETE` する

---

### 2. 政党の与野党ステータス
**ファイル：** `apps/web/lib/partyStatus.ts`
**更新タイミング：** 政権交代・連立変更・政党合流・解党など
**内容：** 政党ごとの「与党/野党/閣外協力」ステータスの期間履歴
**注意：** AI分析のコンテキストとしても使用されるため、`note` フィールドに経緯を詳しく記載する

---

### 3. 政党カラー
**ファイル：** `apps/web/lib/partyColors.ts`
**更新タイミング：** 新政党が国会に議席を持ったとき
**注意：** `PartiesClient.tsx` の `ELECTION_PARTY_COLORS`（フルネーム版）にも同時追加が必要

---

### 4. 政党公式URL
**ファイル：** `apps/web/app/parties/[party]/PartyDetailClient.tsx` の `PARTY_URLS`
**更新タイミング：** 新政党追加時・URLが変わったとき

---

### 5. 議員の政党補正（PARTY_OVERRIDES）
**ファイル：** `apps/collector/sources/members.py`
**更新タイミング：** 公式サイトの会派制度により実際の党籍と表示が異なる議員が生じたとき
**現在の補正内容：**
- 河村たかし → 減税日本・ゆうこく連合（衆議院公式では5名未満のため無所属登録）
- 山本ジョージ → れいわ新選組（同上）

補正後は `SUPABASE_URL=... SUPABASE_KEY=... PYTHONPATH=. python3 sources/members.py` を実行してDBに反映する。

---

### 6. 変更履歴（changelog）
**ファイル：** `apps/web/lib/changelog.ts`
**更新タイミング：** ユーザーに見える変更をリリースしたとき

---

### 7. DBスキーマ変更
**ファイル：** `migrations/` ディレクトリに連番で追加
**手順：**
1. `migrations/NNN_description.sql` を作成
2. Supabase ダッシュボードの SQL Editor で実行
3. RLSポリシーも忘れずに設定（INSERT/UPDATE/DELETE それぞれ必要）

---

## DB直接操作が必要なケース

以下はコレクターだけでは対応できないため、Supabase ダッシュボードの SQL Editor で実行する：

| ケース | SQL例 |
|---|---|
| 古い election_votes 行の削除 | `DELETE FROM election_votes WHERE id = '公明党-衆院-2026';` |
| 議員の政党を直接修正 | `UPDATE members SET party = '〇〇党' WHERE name = '〇〇';` |
| テーブル全体のリセット | `TRUNCATE TABLE テーブル名;` |

**注意：** anon key では DELETE が RLS でブロックされる場合がある。その際は Supabase ダッシュボードから `CREATE POLICY "anon delete" ON テーブル名 FOR DELETE USING (true);` を実行する。
