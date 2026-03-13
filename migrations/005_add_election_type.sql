-- Migration 005: members.election_type カラム追加
-- 衆議院: 小選挙区 / 比例
-- 参議院: 選挙区 / 比例

ALTER TABLE members ADD COLUMN IF NOT EXISTS election_type TEXT;
