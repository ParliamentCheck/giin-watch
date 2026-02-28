"""
はたらく議員 — スコア再計算
members テーブルの speech_count / session_count / question_count を再集計する。
is_procedural = true の発言は除外してカウントする。
"""

from __future__ import annotations

import logging
import sys

from db import get_client, execute_with_retry

logger = logging.getLogger("run_scoring")


def recalculate_scores() -> None:
    client = get_client()

    # ----------------------------------------------------------
    # 1. 発言データを全件取得（ページング）
    # ----------------------------------------------------------
    logger.info("Fetching all speeches for scoring ...")
    speech_detail_rows = []
    offset = 0
    page_size = 2000
    while True:
        result = execute_with_retry(
            lambda o=offset: (
                client.table("speeches")
                .select("member_id, is_procedural, committee, spoken_at")
                .range(o, o + page_size - 1)
            ),
            label="fetch_speeches_for_scoring",
        )
        batch = result.data or []
        speech_detail_rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    logger.info("Fetched %d speech rows", len(speech_detail_rows))

    # member_id ごとに集計（is_procedural を除外）
    speech_counts: dict[str, int] = {}
    session_sets: dict[str, set[str]] = {}

    for row in speech_detail_rows:
        mid = row["member_id"]
        is_proc = row.get("is_procedural", False)
        if is_proc:
            continue
        speech_counts[mid] = speech_counts.get(mid, 0) + 1
        session_key = f"{row.get('committee', '')}:{row.get('spoken_at', '')}"
        if mid not in session_sets:
            session_sets[mid] = set()
        session_sets[mid].add(session_key)

    # ----------------------------------------------------------
    # 2. 質問主意書数（衆議院 + 参議院）
    # ----------------------------------------------------------
    logger.info("Calculating question_count ...")
    question_counts: dict[str, int] = {}

    q_rows = execute_with_retry(
        lambda: client.table("questions").select("member_id").limit(10000),
        label="fetch_questions",
    ).data or []
    for row in q_rows:
        mid = row["member_id"]
        if mid:
            question_counts[mid] = question_counts.get(mid, 0) + 1

    try:
        sq_rows = execute_with_retry(
            lambda: client.table("sangiin_questions").select("member_id").limit(10000),
            label="fetch_sangiin_questions",
        ).data or []
        for row in sq_rows:
            mid = row["member_id"]
            if mid:
                question_counts[mid] = question_counts.get(mid, 0) + 1
    except Exception as exc:
        logger.warning("sangiin_questions table not available: %s", exc)

    # ----------------------------------------------------------
    # 3. members テーブルを1件ずつ update（upsertしない）
    # ----------------------------------------------------------
    logger.info("Fetching all members ...")
    members = execute_with_retry(
        lambda: client.table("members").select("id").limit(2000),
        label="fetch_members_ids",
    ).data or []

    logger.info("Updating %d members ...", len(members))
    updated = 0
    for m in members:
        mid = m["id"]
        execute_with_retry(
            lambda mid=mid: (
                client.table("members")
                .update({
                    "speech_count": speech_counts.get(mid, 0),
                    "session_count": len(session_sets.get(mid, set())),
                    "question_count": question_counts.get(mid, 0),
                })
                .eq("id", mid)
            ),
            label=f"update_score:{mid}",
        )
        updated += 1
        if updated % 100 == 0:
            logger.info("  Updated %d / %d", updated, len(members))

    logger.info("Score recalculation complete. Updated %d members.", updated)


if __name__ == "__main__":
    try:
        recalculate_scores()
    except Exception:
        logger.exception("Score recalculation failed")
        sys.exit(1)
