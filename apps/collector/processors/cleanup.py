"""
はたらく議員 — データクリーンアップ & 検証

使い方:
  python apps/collector/processors/cleanup.py --task verify-counts
  python apps/collector/processors/cleanup.py --task recalc-sessions
  python apps/collector/processors/cleanup.py --task verify-terms
  python apps/collector/processors/cleanup.py --task check-orphans
  python apps/collector/processors/cleanup.py --task db-stats
  python apps/collector/processors/cleanup.py --task truncate-speeches
"""

from __future__ import annotations

import argparse
import logging
import sys

from db import get_client, execute_with_retry

logger = logging.getLogger("cleanup")


def verify_counts() -> None:
    """members の集計値が speeches/questions テーブルと一致するか検証する。"""
    client = get_client()
    members = execute_with_retry(
        lambda: client.table("members").select("id, name, speech_count, question_count").limit(2000),
        label="verify_counts",
    ).data or []

    mismatches = 0
    for m in members:
        mid = m["id"]

        speeches = execute_with_retry(
            lambda mid=mid: (
                client.table("speeches")
                .select("id", count="exact")
                .eq("member_id", mid)
                .eq("is_procedural", False)
            ),
            label=f"count_speeches:{mid}",
        )
        actual_speech = speeches.count if speeches.count is not None else 0

        q1 = execute_with_retry(
            lambda mid=mid: client.table("questions").select("id", count="exact").eq("member_id", mid),
            label=f"count_q:{mid}",
        )
        q1_count = q1.count if q1.count is not None else 0

        q2_count = 0
        try:
            q2 = execute_with_retry(
                lambda mid=mid: client.table("sangiin_questions").select("id", count="exact").eq("member_id", mid),
                label=f"count_sq:{mid}",
            )
            q2_count = q2.count if q2.count is not None else 0
        except Exception:
            pass

        actual_question = q1_count + q2_count
        if m["speech_count"] != actual_speech or m["question_count"] != actual_question:
            mismatches += 1
            logger.warning(
                "MISMATCH %s: speech=%d(actual=%d) question=%d(actual=%d)",
                m["name"], m["speech_count"], actual_speech,
                m["question_count"], actual_question,
            )

    if mismatches == 0:
        logger.info("✓ All counts match.")
    else:
        logger.warning("✗ %d members have count mismatches. Run scoring.py to fix.", mismatches)


def recalc_sessions() -> None:
    """session_count を speeches テーブルから再計算する。"""
    logger.info("Recalculating session_count ...")
    from processors.scoring import recalculate_scores
    recalculate_scores()
    logger.info("Done.")


def verify_terms() -> None:
    """terms が NULL または異常値の議員を一覧する。"""
    client = get_client()
    members = execute_with_retry(
        lambda: client.table("members").select("id, name, house, terms").eq("is_active", True).limit(2000),
        label="verify_terms",
    ).data or []

    issues = []
    for m in members:
        if m["terms"] is None:
            issues.append(f"  NULL: {m['name']} ({m['house']})")
        elif m["terms"] <= 0:
            issues.append(f"  <=0 : {m['name']} ({m['house']}) terms={m['terms']}")
        elif m["terms"] > 20:
            issues.append(f"  >20 : {m['name']} ({m['house']}) terms={m['terms']}")

    if issues:
        logger.warning("当選回数に問題がある議員:")
        for line in issues:
            logger.warning(line)
    else:
        logger.info("✓ All terms look reasonable.")


def check_orphans() -> None:
    """member_id が members テーブルに存在しないレコードを検出する。"""
    client = get_client()
    member_ids = {
        m["id"]
        for m in (
            execute_with_retry(
                lambda: client.table("members").select("id").limit(2000),
                label="fetch_member_ids",
            ).data or []
        )
    }

    tables_to_check = ["speeches", "questions", "committee_members"]
    optional_tables = ["sangiin_questions", "votes", "member_keywords"]

    for table in tables_to_check + optional_tables:
        try:
            rows = execute_with_retry(
                lambda t=table: client.table(t).select("member_id").limit(10000),
                label=f"orphan_check:{table}",
            ).data or []
        except Exception:
            logger.info("Table %s not found, skipping.", table)
            continue

        orphans = {r["member_id"] for r in rows if r.get("member_id") and r["member_id"] not in member_ids}
        if orphans:
            logger.warning("Table %s has %d orphan member_ids:", table, len(orphans))
            for oid in list(orphans)[:10]:
                logger.warning("  %s", oid)
        else:
            logger.info("✓ %s: no orphans", table)


def truncate_speeches(max_rows: int | None = None) -> None:
    """speeches テーブルが上限を超えたら spoken_at 昇順（古い順）で削除する。"""
    from config import SPEECHES_MAX_ROWS
    limit = max_rows or SPEECHES_MAX_ROWS

    client = get_client()
    count = execute_with_retry(
        lambda: client.table("speeches").select("id", count="exact").limit(0),
        label="count_speeches",
    ).count or 0
    logger.info("speeches: %d 行（上限: %d）", count, limit)

    if count <= limit:
        logger.info("上限以下のため削除不要。")
        return

    to_delete = count - limit
    logger.info("%d 行削除します（古い順・バッチ処理）", to_delete)

    BATCH = 500
    deleted = 0
    while deleted < to_delete:
        n = min(BATCH, to_delete - deleted)
        rows = execute_with_retry(
            lambda n=n: (
                client.table("speeches")
                .select("id")
                .order("spoken_at", desc=False)
                .limit(n)
            ),
            label=f"fetch_delete_ids:{deleted}",
        ).data or []

        if not rows:
            logger.warning("削除対象行を取得できませんでした（%d/%d削除済み）", deleted, to_delete)
            break

        ids = [r["id"] for r in rows]
        execute_with_retry(
            lambda b=ids: client.table("speeches").delete().in_("id", b),
            label=f"delete_speeches:{deleted}",
        )
        deleted += len(rows)
        logger.info("削除済み: %d / %d", deleted, to_delete)

    after = execute_with_retry(
        lambda: client.table("speeches").select("id", count="exact").limit(0),
        label="count_after_cleanup",
    )
    logger.info("削除後: %d 行", after.count or 0)


def db_stats() -> None:
    """テーブルごとの行数を表示する。"""
    client = get_client()
    tables = [
        "members", "speeches", "questions", "committee_members",
        "site_settings", "changelog",
        "member_keywords", "party_keywords",
        "sangiin_questions", "votes", "bills",
    ]

    logger.info("%-25s %10s", "Table", "Rows")
    logger.info("-" * 37)
    for table in tables:
        try:
            count = execute_with_retry(
                lambda t=table: client.table(t).select("id", count="exact").limit(0),
                label=f"count:{table}",
            ).count
            logger.info("%-25s %10s", table, str(count) if count is not None else "?")
        except Exception:
            logger.info("%-25s %10s", table, "(not found)")


TASKS = {
    "verify-counts":    verify_counts,
    "recalc-sessions":  recalc_sessions,
    "verify-terms":     verify_terms,
    "check-orphans":    check_orphans,
    "truncate-speeches": truncate_speeches,
    "db-stats":         db_stats,
}


def main() -> None:
    parser = argparse.ArgumentParser(description="データクリーンアップ & 検証")
    parser.add_argument("--task", choices=list(TASKS.keys()), required=True)
    args = parser.parse_args()
    TASKS[args.task]()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(message)s")
    try:
        main()
    except Exception:
        logger.exception("Cleanup task failed")
        sys.exit(1)
