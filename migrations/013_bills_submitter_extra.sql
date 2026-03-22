-- 提出者の「外N名」を保持するカラムを追加
-- 表示時に「〇〇君 他N名」と表示するために使用
ALTER TABLE bills ADD COLUMN IF NOT EXISTS submitter_extra_count INTEGER NOT NULL DEFAULT 0;
