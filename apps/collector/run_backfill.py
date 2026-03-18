"""
はたらく議員 — バックフィルオーケストレーター

使い方:
  python apps/collector/run_backfill.py --task scoring-only
  python apps/collector/run_backfill.py --task speeches-all
  python apps/collector/run_backfill.py --task speeches-2024
  python apps/collector/run_backfill.py --task keyword-all
  python apps/collector/run_backfill.py --task keyword-full-rebuild --years 4
  python apps/collector/run_backfill.py --task votes-collect
  python apps/collector/run_backfill.py --task bills-collect
  python apps/collector/run_backfill.py --task sangiin-questions
"""

from __future__ import annotations

import argparse
import logging
import os
import sys
from datetime import date

logger = logging.getLogger("run_backfill")

KEYWORD_START_YEAR = 2022
SPEECHES_START_YEAR = 2021


def main() -> None:
    parser = argparse.ArgumentParser(description="バックフィルタスク実行")
    parser.add_argument("--task", required=True, choices=[
        "migrate-member-ids",
        "scoring-only",
        "speeches-all",
        "speeches-2024", "speeches-2023", "speeches-2022", "speeches-2021",
        "speeches-2018-2020",
        "keyword-all",
        "keyword-full-rebuild",
        "backfill-procedural",
        "votes-collect",
        "bills-collect",
        "shugiin-questions",
        "sangiin-questions",
        "petitions-collect",
    ])
    parser.add_argument("--years", type=int, default=4, help="keyword-full-rebuild の遡及年数")
    args = parser.parse_args()

    task = args.task
    current_year = date.today().year

    if task == "migrate-member-ids":
        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "scripts"))
        from migrate_member_ids import migrate
        migrate()
        from processors.scoring import recalculate_scores
        recalculate_scores()

    elif task == "scoring-only":
        from processors.scoring import recalculate_scores
        recalculate_scores()

    elif task.startswith("speeches-"):
        from sources.speeches import collect_speeches
        from processors.scoring import recalculate_scores
        from processors.cleanup import truncate_speeches

        if task == "speeches-all":
            ranges = [
                (f"{y}-01-01", f"{y}-12-31" if y < current_year else date.today().isoformat())
                for y in range(SPEECHES_START_YEAR, current_year + 1)
            ]
        elif task == "speeches-2018-2020":
            ranges = [("2018-01-01", "2020-12-31")]
        else:
            y = int(task.split("-")[1])
            ranges = [(f"{y}-01-01", f"{y}-12-31" if y < current_year else date.today().isoformat())]

        for date_from, date_until in ranges:
            logger.info("=== %s 〜 %s ===", date_from, date_until)
            collect_speeches(date_from, date_until)
            recalculate_scores()
            truncate_speeches()

    elif task in ("keyword-all", "keyword-full-rebuild"):
        from sources.keywords import full_rebuild
        if task == "keyword-all":
            years = current_year - KEYWORD_START_YEAR + 1
        else:
            years = args.years
        full_rebuild(years=years)

    elif task == "backfill-procedural":
        scripts_dir = os.path.join(os.path.dirname(__file__), "..", "..", "scripts")
        sys.path.insert(0, os.path.abspath(scripts_dir))
        import backfill_procedural
        backfill_procedural.main()

    elif task == "votes-collect":
        from sources.votes import collect_sessions, get_member_ids
        from config import SESSION_MAX
        sessions = list(range(208, max(SESSION_MAX) + 1))
        member_ids = get_member_ids()
        collect_sessions(sessions, member_ids)

    elif task == "bills-collect":
        from sources.bills import collect_bills
        collect_bills()

    elif task == "shugiin-questions":
        from sources.questions import collect_shugiin_questions
        collect_shugiin_questions(full=True)

    elif task == "sangiin-questions":
        from sources.questions import collect_sangiin_questions
        collect_sangiin_questions(full=True)

    elif task == "petitions-collect":
        from sources.petitions import collect_shugiin_petitions, collect_sangiin_petitions
        collect_shugiin_petitions(full=True)
        collect_sangiin_petitions(full=True)

    from processors.scoring import recalculate_scores as _rescore
    if task not in ("scoring-only", "migrate-member-ids") and not task.startswith("speeches-"):
        _rescore()



if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    try:
        main()
    except Exception:
        logger.exception("Backfill task failed")
        sys.exit(1)
