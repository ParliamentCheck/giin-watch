"""
はたらく議員 — データクリーンアップ & 検証
Phase 5 の実行に使うスクリプト群。

使い方:
  python scripts/cleanup.py --task verify-counts
  python scripts/cleanup.py --task recalc-sessions
  python scripts/cleanup.py --task verify-terms
  python scripts/cleanup.py --task check-orphans
  python scripts/cleanup.py --task db-stats
"""

from __future__ import annotations

import argparse
import logging
import sys

# apps/collector を PYTHONPATH に追加
sys.path.insert(0, "apps/collector")

from db import get_client, execute_with_retry, batch_upsert  # noqa: E402

logger = logging.getLogger("cleanup")


# ============================================================
# 1. カウント検証
# ============================================================
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

        # 実発言数（is_procedural = false）
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

        # 質問主意書数（衆+参）
        q1 = execute_with_retry(
            lambda mid=mid: (
                client.table("questions")
                .select("id", count="exact")
                .eq("member_id", mid)
            ),
            label=f"count_q:{mid}",
        )
        q1_count = q1.count if q1.count is not None else 0

        q2_count = 0
        try:
            q2 = execute_with_retry(
                lambda mid=mid: (
                    client.table("sangiin_questions")
                    .select("id", count="exact")
                    .eq("member_id", mid)
                ),
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
        logger.warning("✗ %d members have count mismatches. Run run_scoring.py to fix.", mismatches)


# ============================================================
# 2. session_count 再計算
# ============================================================
def recalc_sessions() -> None:
    """session_count を speeches テーブルから再計算する。"""
    logger.info("Recalculating session_count ...")

    # run_scoring.py に委譲
    from run_scoring import recalculate_scores
    recalculate_scores()
    logger.info("Done.")


# ============================================================
# 3. 当選回数検証
# ============================================================
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


# ============================================================
# 4. 孤立レコード検出
# ============================================================
def check_orphans() -> None:
    """member_id が members テーブルに存在しないレコードを検出する。"""
    client = get_client()
    members = execute_with_retry(
        lambda: client.table("members").select("id").limit(2000),
        label="fetch_member_ids",
    ).data or []
    member_ids = {m["id"] for m in members}

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

        orphans = set()
        for r in rows:
            if r.get("member_id") and r["member_id"] not in member_ids:
                orphans.add(r["member_id"])

        if orphans:
            logger.warning("Table %s has %d orphan member_ids:", table, len(orphans))
            for oid in list(orphans)[:10]:
                logger.warning("  %s", oid)
        else:
            logger.info("✓ %s: no orphans", table)


# ============================================================
# 5. DB サイズ統計
# ============================================================
def db_stats() -> None:
    """テーブルごとのサイズと行数を表示する。"""
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
            result = execute_with_retry(
                lambda t=table: client.table(t).select("id", count="exact").limit(0),
                label=f"count:{table}",
            )
            count = result.count if result.count is not None else "?"
            logger.info("%-25s %10s", table, str(count))
        except Exception:
            logger.info("%-25s %10s", table, "(not found)")


# ============================================================
# CLI
# ============================================================
TASKS = {
    "verify-counts": verify_counts,
    "recalc-sessions": recalc_sessions,
    "verify-terms": verify_terms,
    "check-orphans": check_orphans,
    "db-stats": db_stats,
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
