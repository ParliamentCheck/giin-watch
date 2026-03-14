-- ============================================================
-- Migration 006: committee_members.id に DEFAULT を追加
-- ============================================================
-- 問題: commit 342da65 で script 側の id 生成を削除したが
--       DB 側の id カラムに DEFAULT が未設定のため
--       INSERT 時に id=null となり NOT NULL 制約違反が発生していた。
-- 対処: DEFAULT gen_random_uuid()::text を設定する。
--       既存の text 形式 ID は変更しない。
-- ============================================================

-- id カラムに DEFAULT を設定（commit 342da65 でスクリプト側の id 生成を削除したが
-- DB 側に DEFAULT が未設定だったため INSERT 時に id=null → NOT NULL 制約違反が発生していた）
ALTER TABLE committee_members
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

-- member_id=null の孤立行を削除
-- （旧スクレイパーが名前マッチングに失敗して生成した行。
--   on_conflict="member_id,committee,role" は null を一意と見なさないため
--   再収集しても上書きされず残り続け、委員会ページで「不明」表示・/members/null 遷移を引き起こす）
DELETE FROM committee_members WHERE member_id IS NULL;
