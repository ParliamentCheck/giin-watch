-- 法案種別カラムを追加（議員立法 / 閣法）
ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_type TEXT NOT NULL DEFAULT '議員立法';
