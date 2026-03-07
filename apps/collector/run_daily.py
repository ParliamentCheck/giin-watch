"""
はたらく議員 — 日次データ収集オーケストレーター

使い方:
  python apps/collector/run_daily.py
  SKIP_KEYWORDS=true python apps/collector/run_daily.py
"""

from __future__ import annotations

import logging
import os
import sys

logger = logging.getLogger("run_daily")


def _step(name: str, fn) -> bool:
    try:
        fn()
        logger.info("[OK] %s", name)
        return True
    except Exception:
        logger.exception("[FAIL] %s", name)
        return False


def main() -> None:
    from sources.members import main as collect_members
    from sources.speeches import collect_speeches
    from processors.scoring import recalculate_scores
    from sources.cabinet_scraper import main as collect_cabinet
    from sources.questions import collect_shugiin_questions, collect_sangiin_questions
    from sources.committees import collect_shugiin_committees, collect_sangiin_committees
    from sources.keywords import daily_update as keywords_daily
    from processors.cleanup import truncate_speeches

    skip_keywords = os.environ.get("SKIP_KEYWORDS", "").lower() in ("1", "true", "yes")

    results = {
        "members":        _step("議員データ登録",    collect_members),
        "speeches":       _step("発言データ収集",     collect_speeches),
        "scoring":        _step("スコア再計算",        recalculate_scores),
        "cabinet":        _step("内閣役職",           collect_cabinet),
        "questions_shu":  _step("質問主意書（衆）",   collect_shugiin_questions),
        "questions_san":  _step("質問主意書（参）",   collect_sangiin_questions),
        "committees_shu": _step("委員会（衆）",       collect_shugiin_committees),
        "committees_san": _step("委員会（参）",       collect_sangiin_committees),
    }

    if not skip_keywords:
        results["keywords"] = _step("キーワード更新", keywords_daily)

    _step("speeches 上限チェック", truncate_speeches)

    if not all([results["members"], results["speeches"], results["scoring"]]):
        logger.warning("重要ステップが1つ以上失敗しました")
        sys.exit(1)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    main()
