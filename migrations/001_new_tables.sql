-- ============================================================
-- Migration 001: Phase 2+3 — 新テーブル作成 & speeches 変更
-- 実行順序: このファイルを Supabase SQL Editor に貼り付けて実行
-- ============================================================

-- ============================================================
-- 1. speeches テーブルに is_procedural カラムを追加
-- ============================================================
ALTER TABLE speeches
ADD COLUMN IF NOT EXISTS is_procedural boolean DEFAULT false;

COMMENT ON COLUMN speeches.is_procedural IS '議事進行発言フラグ（委員長・議長等の形式的発言）';

-- is_procedural でフィルタリングするためのインデックス
CREATE INDEX IF NOT EXISTS idx_speeches_is_procedural
ON speeches(is_procedural)
WHERE is_procedural = false;

-- ============================================================
-- 2. member_keywords テーブル（ワードクラウド）
-- ============================================================
CREATE TABLE IF NOT EXISTS member_keywords (
    member_id text NOT NULL REFERENCES members(id) ON DELETE CASCADE,
    word      text NOT NULL,
    count     integer NOT NULL DEFAULT 0,
    last_seen_at date,
    PRIMARY KEY (member_id, word)
);

COMMENT ON TABLE member_keywords IS '議員ごとのワードクラウドデータ（上位100語保持）';

CREATE INDEX IF NOT EXISTS idx_member_keywords_member_id
ON member_keywords(member_id);

-- ============================================================
-- 3. party_keywords テーブル（政党ワードクラウド）
-- ============================================================
CREATE TABLE IF NOT EXISTS party_keywords (
    party        text NOT NULL,
    word         text NOT NULL,
    count        integer NOT NULL DEFAULT 0,
    last_seen_at date,
    PRIMARY KEY (party, word)
);

COMMENT ON TABLE party_keywords IS '政党ごとのワードクラウドデータ（所属議員のワードを合算）';

-- ============================================================
-- 4. sangiin_questions テーブル（参議院質問主意書）
-- ============================================================
CREATE TABLE IF NOT EXISTS sangiin_questions (
    id           text PRIMARY KEY,
    member_id    text REFERENCES members(id) ON DELETE SET NULL,
    session      integer,
    title        text,
    submitted_at date,
    url          text
);

COMMENT ON TABLE sangiin_questions IS '参議院質問主意書データ';

CREATE INDEX IF NOT EXISTS idx_sangiin_questions_member_id
ON sangiin_questions(member_id);

-- ============================================================
-- 5. votes テーブル（採決記録）
-- ============================================================
CREATE TABLE IF NOT EXISTS votes (
    id             text PRIMARY KEY,
    member_id      text REFERENCES members(id) ON DELETE SET NULL,
    bill_title     text,
    vote_date      date,
    vote           text,  -- 賛成/反対/棄権/欠席
    session_number integer,
    house          text
);

COMMENT ON TABLE votes IS '採決記録（議員ごとの賛否データ）';

CREATE INDEX IF NOT EXISTS idx_votes_member_id ON votes(member_id);
CREATE INDEX IF NOT EXISTS idx_votes_date ON votes(vote_date);

-- ============================================================
-- 6. bills テーブル（議員立法）
-- ============================================================
CREATE TABLE IF NOT EXISTS bills (
    id             text PRIMARY KEY,
    title          text,
    submitter_ids  text[],  -- 提出者の member_id 配列
    submitted_at   date,
    session_number integer,
    status         text,
    house          text
);

COMMENT ON TABLE bills IS '議員提出法案データ';

CREATE INDEX IF NOT EXISTS idx_bills_submitted_at ON bills(submitted_at);

-- ============================================================
-- 7. RLS（Row Level Security）— 読み取り専用の公開設定
-- ============================================================
-- 新テーブルにも既存テーブルと同じ anon 読み取りポリシーを適用

ALTER TABLE member_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read" ON member_keywords
    FOR SELECT USING (true);

ALTER TABLE party_keywords ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read" ON party_keywords
    FOR SELECT USING (true);

ALTER TABLE sangiin_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read" ON sangiin_questions
    FOR SELECT USING (true);

ALTER TABLE votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read" ON votes
    FOR SELECT USING (true);

ALTER TABLE bills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow anonymous read" ON bills
    FOR SELECT USING (true);
