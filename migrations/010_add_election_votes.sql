-- 政党別選挙得票数・当選人数テーブル
-- 衆院2026/2024、参院2025/2022 を格納する
-- 得票率 vs 議席率の乖離可視化に使用

CREATE TABLE IF NOT EXISTS election_votes (
  id            text PRIMARY KEY,           -- "{party}-{election_type}-{year}"
  party         text NOT NULL,
  election_type text NOT NULL,              -- "衆院" | "参院"
  election_year int  NOT NULL,
  smd_votes     bigint,                     -- 小選挙区/選挙区 得票数
  pr_votes      bigint,                     -- 比例代表 得票数
  smd_seats     int,                        -- 小選挙区/選挙区 当選数
  pr_seats      int,                        -- 比例代表 当選数
  created_at    timestamptz DEFAULT now()
);

-- RLS: 読み取りは全員可、書き込みは認証済みのみ
ALTER TABLE election_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON election_votes FOR SELECT USING (true);
