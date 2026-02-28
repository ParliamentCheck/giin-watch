-- ============================================================
-- Migration 002: Phase 3 — speech_text 削除（容量 281MB → 16MB）
-- ============================================================
--
-- ★★★ 重要 ★★★
-- このマイグレーションは以下の条件を全て満たしてから実行すること:
--
--   1. Migration 001 が完了している
--   2. keyword_builder.py --mode full で全議員のキーワードが再構築済み
--   3. speeches テーブルの is_procedural フラグが全行に付与済み
--   4. バックアップを取得済み
--
-- 一度 speech_text を削除すると復元できない（NDL API から再取得は可能だが時間がかかる）
-- ============================================================

-- Step 1: speech_text カラムを削除
ALTER TABLE speeches DROP COLUMN IF EXISTS speech_text;

-- Step 2: VACUUM FULL で物理的にディスク領域を回収
-- ※ Supabase の SQL Editor からは実行できない場合がある
-- ※ その場合は Supabase ダッシュボード → Database → Vacuum から実行
-- ※ またはタイムアウト対策として statement_timeout を延長する
-- 
-- SET statement_timeout = '300000';  -- 5分
-- VACUUM FULL speeches;
-- RESET statement_timeout;

-- Step 3: インデックスを再構築して最適化
REINDEX TABLE speeches;

-- Step 4: テーブルサイズを確認
SELECT
    pg_size_pretty(pg_total_relation_size('speeches')) as total_size,
    pg_size_pretty(pg_relation_size('speeches')) as table_size,
    pg_size_pretty(pg_indexes_size('speeches')) as index_size;
