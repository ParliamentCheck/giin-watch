-- bills テーブルの URL カラム整理
-- source_url を honbun_url にリネームし、keika_url を追加する

ALTER TABLE bills RENAME COLUMN source_url TO honbun_url;

ALTER TABLE bills ADD COLUMN IF NOT EXISTS keika_url TEXT;
