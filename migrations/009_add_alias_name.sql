-- 議員の通称名（公称名）カラムを追加
-- 参院議員の 通称名[本名] 形式に対応：alias_name = 通称名, name = 本名（戸籍名）
ALTER TABLE members ADD COLUMN IF NOT EXISTS alias_name text;
