"""
はたらく議員 — スコア再計算
members テーブルの speech_count / session_count / question_count を再集計する。
is_procedural = true の発言は除外してカウントする。
"""

from __future__ import annotations

import logging
import sys

from db import get_client, batch_upsert, execute_with_retry

logger = logging.getLogger("run_scoring")


def recalculate_scores() -> None:
    client = get_client()

    # ----------------------------------------------------------
    # 1. 発言数（is_procedural を除外）
    # ----------------------------------------------------------
    logger.info("Calculating speech_count (excluding procedural) ...")

    # Supabase では集約関数が使いにくいため、全件取得して集計する
    # speeches テーブルから member_id と is_procedural を取得
    speech_rows = []
    offset = 0
    page_size = 2000
    while True:
        result = execute_with_retry(
            lambda o=offset: (
                client.table("speeches")
                .select("member_id, is_procedural")
                .range(o, o + page_size - 1)
            ),
            label="fetch_speeches_for_scoring",
        )
        batch = result.data or []
        speech_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    logger.info("Fetched %d speech rows", len(speech_rows))

    # member_id ごとに集計
    speech_counts: dict[str, int] = {}
    session_sets: dict[str, set[str]] = {}  # member_id -> set of (committee, spoken_at)

    # session_count 用に追加フィールドが必要 → 別途取得
    speech_detail_rows = []
    offset = 0
    while True:
        result = execute_with_retry(
            lambda o=offset: (
                client.table("speeches")
                .select("member_id, is_procedural, committee, spoken_at")
                .range(o, o + page_size - 1)
            ),
            label="fetch_speeches_detail_for_scoring",
        )
        batch = result.data or []
        speech_detail_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    for row in speech_detail_rows:
        mid = row["member_id"]
        is_proc = row.get("is_procedural", False)
        if is_proc:
            continue
        speech_counts[mid] = speech_counts.get(mid, 0) + 1
        # session = 同一委員会×同一日
        session_key = f"{row.get('committee', '')}:{row.get('spoken_at', '')}"
        if mid not in session_sets:
            session_sets[mid] = set()
        session_sets[mid].add(session_key)

    # ----------------------------------------------------------
    # 2. 質問主意書数（衆議院 questions + 参議院 sangiin_questions）
    # ----------------------------------------------------------
    logger.info("Calculating question_count ...")

    question_counts: dict[str, int] = {}

    # 衆議院
    q_rows = execute_with_retry(
        lambda: client.table("questions").select("member_id").limit(10000),
        label="fetch_questions",
    ).data or []
    for row in q_rows:
        mid = row["member_id"]
        question_counts[mid] = question_counts.get(mid, 0) + 1

    # 参議院（テーブルが存在する場合のみ）
    try:
        sq_rows = execute_with_retry(
            lambda: client.table("sangiin_questions").select("member_id").limit(10000),
            label="fetch_sangiin_questions",
        ).data or []
        for row in sq_rows:
            mid = row["member_id"]
            question_counts[mid] = question_counts.get(mid, 0) + 1
    except Exception as exc:
        logger.warning("sangiin_questions table not available: %s", exc)

    # ----------------------------------------------------------
    # 3. members テーブルに書き戻し
    # ----------------------------------------------------------
    logger.info("Fetching all members ...")
    members = execute_with_retry(
        lambda: client.table("members").select("id").limit(2000),
        label="fetch_members_ids",
    ).data or []

    updates = []
    for m in members:
        mid = m["id"]
        updates.append({
            "id": mid,
            "speech_count": speech_counts.get(mid, 0),
            "session_count": len(session_sets.get(mid, set())),
            "question_count": question_counts.get(mid, 0),
        })

    logger.info("Updating %d members ...", len(updates))
    batch_upsert("members", updates, on_conflict="id", label="scoring_update")

    logger.info("Score recalculation complete.")


if __name__ == "__main__":
    try:
        recalculate_scores()
    except Exception:
        logger.exception("Score recalculation failed")
        sys.exit(1)
