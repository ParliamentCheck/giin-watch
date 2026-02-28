"""
はたらく議員 — is_procedural フラグ バックフィル
既存の speeches テーブルの speech_text を読んで is_procedural を判定・更新する。
speech_text 削除前に1回だけ実行する。

使い方:
  python scripts/backfill_procedural.py
"""

from __future__ import annotations

import logging
import sys

from db import get_client, execute_with_retry
from utils import is_procedural_speech

logger = logging.getLogger("backfill_procedural")

BATCH_SIZE = 1000


def backfill() -> None:
    client = get_client()

    # speech_text が存在する行を分割取得して処理
    offset = 0
    total_updated = 0
    total_procedural = 0

    while True:
        logger.info("Fetching speeches [%d:%d] ...", offset, offset + BATCH_SIZE)
        result = execute_with_retry(
            lambda o=offset: (
                client.table("speeches")
                .select("id, speech_text")
                .range(o, o + BATCH_SIZE - 1)
            ),
            label=f"fetch_speeches_{offset}",
        )
        rows = result.data or []
        if not rows:
            break

        updates = []
        for row in rows:
            speech_text = row.get("speech_text", "")
            procedural = is_procedural_speech(speech_text or "")
            updates.append({
                "id": row["id"],
                "is_procedural": procedural,
            })
            if procedural:
                total_procedural += 1

        # バッチ更新
        if updates:
            # Supabase upsert で更新
            for i in range(0, len(updates), 500):
                chunk = updates[i:i+500]
                execute_with_retry(
                    lambda c=chunk: client.table("speeches").upsert(c, on_conflict="id"),
                    label=f"upsert_procedural_{offset+i}",
                )
            total_updated += len(updates)

        logger.info(
            "Processed %d rows (procedural: %d / total updated: %d)",
            len(rows), total_procedural, total_updated,
        )

        if len(rows) < BATCH_SIZE:
            break
        offset += BATCH_SIZE

    logger.info(
        "Backfill complete. Total: %d, Procedural: %d (%.1f%%)",
        total_updated,
        total_procedural,
        (total_procedural / total_updated * 100) if total_updated else 0,
    )


if __name__ == "__main__":
    try:
        backfill()
    except Exception:
        logger.exception("Backfill failed")
        sys.exit(1)
