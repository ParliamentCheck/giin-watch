"""
はたらく議員 — 政党別採決一致率計算

参議院採決データ（votes テーブル）から政党間の投票一致率を算出し、
party_vote_alignments テーブルに保存する。

アルゴリズム:
  1. 全採決記録と議員→政党マッピングを取得
  2. 法案ごとに各政党の多数決（賛成 or 反対）を決定
  3. 全政党ペアについて「同じ多数決を取った割合」を計算
  4. party_vote_alignments に upsert
"""

from __future__ import annotations

import logging
import sys
from collections import defaultdict
from datetime import datetime, timezone

from db import get_client, execute_with_retry, batch_upsert

logger = logging.getLogger("vote_alignment")


def fetch_all_votes() -> list[dict]:
    """votes テーブルを全件取得（cursor pagination）。"""
    client = get_client()
    all_votes: list[dict] = []
    last_id = ""

    while True:
        result = execute_with_retry(
            lambda lid=last_id: client.table("votes")
                .select("id, member_id, bill_title, vote")
                .gt("id", lid)
                .order("id")
                .limit(1000),
            label="fetch_votes",
        )
        batch = result.data or []
        if not batch:
            break
        all_votes.extend(batch)
        last_id = batch[-1]["id"]
        if len(batch) < 1000:
            break

    logger.info(f"Fetched {len(all_votes)} vote records")
    return all_votes


def fetch_member_parties() -> dict[str, str]:
    """member_id → party のマッピングを取得。参院議員のみ対象。"""
    client = get_client()
    result = execute_with_retry(
        lambda: client.table("members")
            .select("id, party")
            .eq("house", "参議院")
            .limit(2000),
        label="fetch_member_parties",
    )
    mapping = {m["id"]: m["party"] for m in (result.data or []) if m.get("party")}
    logger.info(f"Fetched party mapping for {len(mapping)} Sangiin members")
    return mapping


def compute_alignment() -> int:
    """一致率を計算して DB に保存する。保存件数を返す。"""
    votes = fetch_all_votes()
    member_party = fetch_member_parties()

    # bill_title → party → {"賛成": n, "反対": n}
    bill_party_counts: dict[str, dict[str, dict[str, int]]] = defaultdict(
        lambda: defaultdict(lambda: defaultdict(int))
    )
    for v in votes:
        party = member_party.get(v["member_id"])
        if not party or v["vote"] not in ("賛成", "反対"):
            continue
        bill_party_counts[v["bill_title"]][party][v["vote"]] += 1

    # bill_title → party → "賛成" or "反対"（多数決）
    bill_party_majority: dict[str, dict[str, str]] = {}
    for bill, parties in bill_party_counts.items():
        majorities: dict[str, str] = {}
        for party, counts in parties.items():
            yes = counts.get("賛成", 0)
            no  = counts.get("反対", 0)
            if yes + no >= 1:
                majorities[party] = "賛成" if yes >= no else "反対"
        if len(majorities) >= 2:
            bill_party_majority[bill] = majorities

    logger.info(f"Bills with multi-party votes: {len(bill_party_majority)}")

    # 全政党リスト（アルファベット順で一意なペアを作る）
    all_parties = sorted({p for m in bill_party_majority.values() for p in m})
    logger.info(f"Parties found: {all_parties}")

    now = datetime.now(timezone.utc).isoformat()
    rows: list[dict] = []

    for i, pa in enumerate(all_parties):
        for pb in all_parties[i + 1:]:
            both = same = 0
            for majorities in bill_party_majority.values():
                if pa in majorities and pb in majorities:
                    both += 1
                    if majorities[pa] == majorities[pb]:
                        same += 1
            # サンプルが少なすぎる場合はスキップ
            if both < 5:
                continue
            rows.append({
                "party_a":        pa,
                "party_b":        pb,
                "alignment_rate": round(same / both, 4),
                "sample_size":    both,
                "updated_at":     now,
            })

    if rows:
        batch_upsert(
            "party_vote_alignments",
            rows,
            on_conflict="party_a,party_b",
            label="vote_alignment",
        )
        logger.info(f"Upserted {len(rows)} party alignment records")
    else:
        logger.warning("No alignment records computed — votes table may be empty")

    return len(rows)


def main() -> None:
    count = compute_alignment()
    logger.info(f"Done. {count} records saved.")


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    try:
        main()
    except Exception:
        logger.exception("vote_alignment failed")
        sys.exit(1)
