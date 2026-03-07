"""
はたらく議員 — バックフィルオーケストレーター

使い方:
  python apps/collector/run_backfill.py --task scoring-only
  python apps/collector/run_backfill.py --task speeches-all
  python apps/collector/run_backfill.py --task speeches-2024
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

logger = logging.getLogger("run_backfill")


def main() -> None:
    parser = argparse.ArgumentParser(description="バックフィルタスク実行")
    parser.add_argument("--task", required=True, choices=[
        "migrate-member-ids",
        "scoring-only",
        "speeches-all",
        "speeches-2024", "speeches-2023", "speeches-2022", "speeches-2021",
        "speeches-2018-2020",
        "keyword-full-rebuild",
        "backfill-procedural",
        "votes-collect",
        "bills-collect",
        "sangiin-questions",
    ])
    parser.add_argument("--years", type=int, default=4, help="keyword-full-rebuild の遡及年数")
    args = parser.parse_args()

    task = args.task

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

        year_ranges = {
            "speeches-all":      [("2021-01-01", "2021-12-31"), ("2022-01-01", "2022-12-31"),
                                   ("2023-01-01", "2023-12-31"), ("2024-01-01", "2024-12-31")],
            "speeches-2024":     [("2024-01-01", "2024-12-31")],
            "speeches-2023":     [("2023-01-01", "2023-12-31")],
            "speeches-2022":     [("2022-01-01", "2022-12-31")],
            "speeches-2021":     [("2021-01-01", "2021-12-31")],
            "speeches-2018-2020": [("2018-01-01", "2020-12-31")],
        }
        for date_from, date_until in year_ranges[task]:
            logger.info("=== %s 〜 %s ===", date_from, date_until)
            collect_speeches(date_from, date_until)
            recalculate_scores()
            truncate_speeches()

    elif task == "keyword-full-rebuild":
        from sources.keywords import full_rebuild
        full_rebuild(years=args.years)

    elif task == "backfill-procedural":
        scripts_dir = os.path.join(os.path.dirname(__file__), "..", "..", "scripts")
        sys.path.insert(0, os.path.abspath(scripts_dir))
        import backfill_procedural
        backfill_procedural.main()

    elif task == "votes-collect":
        from sources.votes import main as collect_votes
        collect_votes()

    elif task == "bills-collect":
        from sources.bills import collect_bills
        collect_bills()

    elif task == "sangiin-questions":
        from sources.questions import collect_sangiin_questions
        collect_sangiin_questions()

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
