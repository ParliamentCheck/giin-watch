-- 議員発言抜粋テーブル
-- 各議員の長文発言（300字以上）の先頭1000字を最大10件保持する
-- AI分析のコンテキストとして使用する

CREATE TABLE speech_excerpts (
  id               TEXT PRIMARY KEY,        -- NDL の speechID
  member_id        TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  spoken_at        DATE,
  committee        TEXT,
  session_number   INTEGER,
  source_url       TEXT,
  excerpt          TEXT NOT NULL,           -- ヘッダー除去後の先頭1000字
  original_length  INTEGER,                 -- ヘッダー除去後の元の文字数
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_speech_excerpts_member_spoken
  ON speech_excerpts (member_id, spoken_at DESC NULLS LAST);

-- RLS
ALTER TABLE speech_excerpts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "anon select" ON speech_excerpts FOR SELECT USING (true);
