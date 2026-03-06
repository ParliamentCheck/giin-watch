"""
はたらく議員 — カウント再計算
speeches / questions / sangiin_questions を Python 側でページング集計して
members テーブルの speech_count / session_count / question_count を更新する。

RPC（PostgreSQL 関数）は Supabase の statement_timeout に引っかかるため使わない。
"""

from __future__ import annotations

import logging
import sys
from collections import defaultdict

from db import get_client, execute_with_retry, batch_upsert

logger = logging.getLogger("run_scoring")

PAGE = 2000  # 1回の API 呼び出しで取得する行数


def _fetch_all(table: str, select: str, filters: list[tuple] | None = None) -> list[dict]:
    """テーブルを全件ページングで取得する。"""
    client = get_client()
    rows: list[dict] = []
    offset = 0
    while True:
        def _query(o=offset):
            q = client.table(table).select(select).range(o, o + PAGE - 1)
            if filters:
                for method, col, val in filters:
                    q = getattr(q, method)(col, val)
            return q

        result = execute_with_retry(_query, label=f"fetch:{table}:{offset}")
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        offset += PAGE
    return rows


def recalculate_scores() -> None:
    client = get_client()

    # ── 全議員 ID を取得 ──────────────────────────────────────
    members = execute_with_retry(
        lambda: client.table("members").select("id").limit(2000),
        label="fetch_member_ids",
    ).data or []
    all_ids = [m["id"] for m in members]
    logger.info("対象議員: %d 名", len(all_ids))

    # ── speech_count / session_count ──────────────────────────
    logger.info("speeches を集計中...")
    speeches = _fetch_all(
        "speeches",
        "member_id, spoken_at, committee, is_procedural",
    )
    logger.info("speeches 取得: %d 件", len(speeches))

    speech_counts: dict[str, int] = defaultdict(int)
    session_sets: dict[str, set] = defaultdict(set)

    for s in speeches:
        mid = s.get("member_id")
        if not mid:
            continue
        if not s.get("is_procedural"):
            speech_counts[mid] += 1
            session_sets[mid].add((s.get("spoken_at"), s.get("committee")))

    speech_updates = [
        {
            "id": mid,
            "speech_count": speech_counts.get(mid, 0),
            "session_count": len(session_sets.get(mid, set())),
        }
        for mid in all_ids
    ]
    batch_upsert("members", speech_updates, on_conflict="id", label="update_speech_counts")
    logger.info("speech_count / session_count 更新完了")

    # ── question_count ────────────────────────────────────────
    logger.info("questions を集計中...")
    question_counts: dict[str, int] = defaultdict(int)

    for table in ("questions", "sangiin_questions"):
        rows = _fetch_all(table, "member_id")
        for row in rows:
            mid = row.get("member_id")
            if mid:
                question_counts[mid] += 1
        logger.info("%s 取得: %d 件", table, len(rows))

    q_updates = [
        {"id": mid, "question_count": question_counts.get(mid, 0)}
        for mid in all_ids
    ]
    batch_upsert("members", q_updates, on_conflict="id", label="update_question_counts")
    logger.info("question_count 更新完了")


if __name__ == "__main__":
    try:
        recalculate_scores()
    except Exception:
        logger.exception("Score recalculation failed")
        sys.exit(1)
