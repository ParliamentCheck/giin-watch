-- packages/db/schema.sql
-- Supabase（PostgreSQL）用スキーマ
-- テーブルはエンティティごとに独立。機能追加時はALTER TABLEで拡張する。

-- ─── 議員 ─────────────────────────────────────────────────────
CREATE TABLE members (
  id                TEXT PRIMARY KEY,  -- 例: "shugiin-12345"
  name              TEXT NOT NULL,
  name_reading      TEXT,
  legal_name        TEXT,              -- 通名使用の場合の戸籍氏名
  nationality       TEXT,
  party             TEXT NOT NULL,
  house             TEXT NOT NULL CHECK (house IN ('衆議院', '参議院')),
  district          TEXT NOT NULL,
  prefecture        TEXT NOT NULL,
  terms             INTEGER,
  age               INTEGER,
  photo_url         TEXT,
  is_active         BOOLEAN DEFAULT TRUE,
  source_url        TEXT,              -- 公式プロフィールURL
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 出席 ─────────────────────────────────────────────────────
CREATE TABLE attendance (
  id                BIGSERIAL PRIMARY KEY,
  member_id         TEXT REFERENCES members(id),
  session_number    INTEGER NOT NULL,
  total_days        INTEGER NOT NULL,
  attended_days     INTEGER NOT NULL,
  absent_days       INTEGER GENERATED ALWAYS AS (total_days - attended_days) STORED,
  rate              NUMERIC(4,3),      -- 0.000 〜 1.000
  UNIQUE(member_id, session_number)
);

-- ─── 採決記録 ──────────────────────────────────────────────────
CREATE TABLE vote_records (
  id                BIGSERIAL PRIMARY KEY,
  member_id         TEXT REFERENCES members(id),
  bill_id           TEXT NOT NULL,
  bill_name         TEXT NOT NULL,
  session_number    INTEGER NOT NULL,
  voted_at          DATE NOT NULL,
  choice            TEXT NOT NULL CHECK (choice IN ('賛成','反対','欠席','棄権')),
  house             TEXT NOT NULL,
  UNIQUE(member_id, bill_id)
);

-- ─── 発言記録 ──────────────────────────────────────────────────
CREATE TABLE speeches (
  id                TEXT PRIMARY KEY,   -- 国会図書館APIのID
  member_id         TEXT REFERENCES members(id),
  session_number    INTEGER NOT NULL,
  committee         TEXT NOT NULL,       -- 委員会名 or "本会議"
  spoken_at         DATE NOT NULL,
  duration_minutes  INTEGER,
  summary           TEXT,
  source_url        TEXT NOT NULL
);

-- ─── 法案 ─────────────────────────────────────────────────────
CREATE TABLE bills (
  id                TEXT PRIMARY KEY,
  name              TEXT NOT NULL,
  session_number    INTEGER NOT NULL,
  submitted_at      DATE,
  result            TEXT CHECK (result IN ('可決','否決','審議中','廃案')),
  category          TEXT,               -- 分野タグ
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 政治資金 ─────────────────────────────────────────────────
CREATE TABLE political_funds (
  id                BIGSERIAL PRIMARY KEY,
  member_id         TEXT REFERENCES members(id),
  year              INTEGER NOT NULL,
  total_income      BIGINT,
  total_expense     BIGINT,
  donation_company  BIGINT,
  donation_personal BIGINT,
  source_url        TEXT,
  UNIQUE(member_id, year)
);

-- ─── 党議拘束 ─────────────────────────────────────────────────
CREATE TABLE party_whip (
  id                BIGSERIAL PRIMARY KEY,
  bill_id           TEXT REFERENCES bills(id),
  party             TEXT NOT NULL,
  official_stance   TEXT CHECK (official_stance IN ('賛成','反対','欠席','棄権')),
  stance_source     TEXT,               -- 出典URL
  confidence        TEXT NOT NULL DEFAULT 'unknown'
                    CHECK (confidence IN ('confirmed','inferred','unknown')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(bill_id, party)
);

-- ─── 活動スコア（キャッシュ） ──────────────────────────────────
CREATE TABLE activity_scores (
  member_id         TEXT PRIMARY KEY REFERENCES members(id),
  score             INTEGER NOT NULL,
  score_attendance  INTEGER,
  score_speeches    INTEGER,
  score_questions   INTEGER,
  score_bills       INTEGER,
  score_committee   INTEGER,
  calculated_at     TIMESTAMPTZ DEFAULT NOW()
);

-- ─── インデックス ──────────────────────────────────────────────
CREATE INDEX idx_members_party       ON members(party);
CREATE INDEX idx_members_prefecture  ON members(prefecture);
CREATE INDEX idx_vote_records_bill   ON vote_records(bill_id);
CREATE INDEX idx_vote_records_member ON vote_records(member_id);
CREATE INDEX idx_speeches_member     ON speeches(member_id);
