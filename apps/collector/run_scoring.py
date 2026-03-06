"""
はたらく議員 — カウント再計算
speeches / questions / sangiin_questions を Python 側でページング集計して
members テーブルの speech_count / session_count / question_count を更新する。

upsert（INSERT + ON CONFLICT UPDATE）は name NOT NULL 違反を起こすため使わない。
members テーブルへの書き込みは UPDATE のみ（既存行の更新に限定する）。
"""

from __future__ import annotations

import logging
import sys
from collections import defaultdict

from db import get_client, execute_with_retry

logger = logging.getLogger("run_scoring")

PAGE = 2000


def _fetch_all(table: str, select: str) -> list[dict]:
    """テーブルを全件カーソルページングで取得する（OFFSET 不使用で statement timeout 回避）。"""
    client = get_client()
    rows: list[dict] = []
    last_id: str = ""
    # カーソルに id カラムが必要
    cols = [s.strip() for s in select.split(",")]
    select_with_id = select if "id" in cols else select + ", id"
    while True:
        result = execute_with_retry(
            lambda lid=last_id: (
                client.table(table)
                .select(select_with_id)
                .order("id")
                .gt("id", lid)
                .limit(PAGE)
            ),
            label=f"fetch:{table}:{len(rows)}",
        )
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < PAGE:
            break
        last_id = batch[-1]["id"]
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
    speeches = _fetch_all("speeches", "member_id, spoken_at, committee, is_procedural")
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

    # ── members を UPDATE（upsert は使わない） ─────────────────
    # batch_upsert は内部で INSERT を試みて name NOT NULL 違反が起きるため、
    # 個別 UPDATE で既存行のカウントカラムだけを上書きする
    logger.info("members を更新中...")
    updated = 0
    for mid in all_ids:
        patch = {
            "speech_count":   speech_counts.get(mid, 0),
            "session_count":  len(session_sets.get(mid, set())),
            "question_count": question_counts.get(mid, 0),
        }
        execute_with_retry(
            lambda m=mid, p=patch: client.table("members").update(p).eq("id", m),
            label=f"upd:{mid}",
        )
        updated += 1

    logger.info("更新完了: %d 名", updated)


if __name__ == "__main__":
    try:
        recalculate_scores()
    except Exception:
        logger.exception("Score recalculation failed")
        sys.exit(1)
