-- sangiin_questions テーブルの整備
-- 1. url カラムを source_url にリネーム（フロントの期待するカラム名に統一）
-- 2. number カラム追加（質問番号）
-- 3. 既存レコードの number をIDから抽出

ALTER TABLE sangiin_questions RENAME COLUMN url TO source_url;

ALTER TABLE sangiin_questions ADD COLUMN IF NOT EXISTS number integer;

-- 既存レコード sangiin-{session}-{number:03d} 形式から number を抽出
UPDATE sangiin_questions
SET number = CAST(split_part(id, '-', 3) AS integer)
WHERE number IS NULL AND id ~ '^sangiin-\d+-\d+$';
