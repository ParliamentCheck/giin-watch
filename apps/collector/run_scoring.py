"""
はたらく議員 — スコア再計算
PostgreSQL関数を呼び出して
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

    logger.info("Recalculating speech_count and session_count ...")
    execute_with_retry(
        lambda: client.rpc("recalc_speech_counts").execute(),
        label="recalc_speech_counts",
    )

    logger.info("Recalculating question_count ...")
    execute_with_retry(
        lambda: client.rpc("recalc_question_counts").execute(),
        label="recalc_question_counts",
    )

    logger.info("Score recalculation complete.")


if __name__ == "__main__":
    try:
        recalculate_scores()
    except Exception:
        logger.exception("Score recalculation failed")
        sys.exit(1)
