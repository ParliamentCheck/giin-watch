"""
is_procedural バックフィル — 完了済み
speech_text は削除済みのため、このスクリプトは何もしない。
バックフィルは 2026-02-28 に SQL で直接実行済み。
"""
import logging
logger = logging.getLogger("backfill_procedural")
logging.basicConfig(level=logging.INFO)

if __name__ == "__main__":
    logger.info("is_procedural backfill already completed via SQL. Nothing to do.")
