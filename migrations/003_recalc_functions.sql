-- ============================================================
-- Migration 003: recalc_speech_counts / recalc_question_counts 再定義
-- statement_timeout を無効化して大量データでもタイムアウトしないようにする
-- Supabase SQL Editor に貼り付けて実行する
-- ============================================================

-- ============================================================
-- 1. recalc_speech_counts
--    speeches テーブルから speech_count / session_count を再集計して
--    members テーブルを一括更新する
-- ============================================================
CREATE OR REPLACE FUNCTION recalc_speech_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- PostgREST のデフォルト statement_timeout を無効化（大量データ対応）
    SET LOCAL statement_timeout = 0;

    -- speeches から集計して members を一括更新
    WITH counts AS (
        SELECT
            member_id,
            COUNT(*)                                                          AS speech_count,
            COUNT(DISTINCT (spoken_at, committee))                            AS session_count
        FROM speeches
        WHERE member_id IS NOT NULL
          AND is_procedural = false
        GROUP BY member_id
    )
    UPDATE members m
    SET
        speech_count  = COALESCE(c.speech_count,  0),
        session_count = COALESCE(c.session_count, 0)
    FROM counts c
    WHERE m.id = c.member_id;

    -- speeches が 0 件の議員はカウントをリセット
    UPDATE members
    SET speech_count = 0, session_count = 0
    WHERE id NOT IN (
        SELECT DISTINCT member_id
        FROM speeches
        WHERE member_id IS NOT NULL
          AND is_procedural = false
    );
END;
$$;

-- ============================================================
-- 2. recalc_question_counts
--    questions（衆院）と sangiin_questions（参院）を合算して
--    members.question_count を一括更新する
-- ============================================================
CREATE OR REPLACE FUNCTION recalc_question_counts()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    SET LOCAL statement_timeout = 0;

    WITH q_counts AS (
        SELECT member_id, COUNT(*) AS cnt
        FROM questions
        WHERE member_id IS NOT NULL
        GROUP BY member_id
    ),
    sq_counts AS (
        SELECT member_id, COUNT(*) AS cnt
        FROM sangiin_questions
        WHERE member_id IS NOT NULL
        GROUP BY member_id
    ),
    combined AS (
        SELECT
            COALESCE(q.member_id, sq.member_id)       AS member_id,
            COALESCE(q.cnt, 0) + COALESCE(sq.cnt, 0)  AS question_count
        FROM q_counts q
        FULL OUTER JOIN sq_counts sq ON q.member_id = sq.member_id
    )
    UPDATE members m
    SET question_count = c.question_count
    FROM combined c
    WHERE m.id = c.member_id;

    -- 質問が 0 件の議員はリセット
    UPDATE members
    SET question_count = 0
    WHERE id NOT IN (
        SELECT DISTINCT member_id FROM questions       WHERE member_id IS NOT NULL
        UNION
        SELECT DISTINCT member_id FROM sangiin_questions WHERE member_id IS NOT NULL
    );
END;
$$;
