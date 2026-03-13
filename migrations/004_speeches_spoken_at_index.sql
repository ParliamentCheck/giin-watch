-- Migration 004: speeches.spoken_at にインデックス追加
-- 目的: truncate-speeches の ORDER BY spoken_at ASC クエリのタイムアウト解消

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_speeches_spoken_at
ON speeches(spoken_at);
