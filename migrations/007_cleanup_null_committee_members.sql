-- Migration 007: committee_members の蓄積した null member_id 行を削除
-- NULL は UNIQUE(member_id, committee, role) で等価判定されないため
-- 毎日の収集ごとに新行が INSERT され続けていた。
-- この migration で既存の重複分を全削除し、collector 側の修正で以後は蓄積しない。

DELETE FROM committee_members WHERE member_id IS NULL;
