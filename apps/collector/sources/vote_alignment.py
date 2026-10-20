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


def fetch_faction_totals() -> list[dict]:
    """vote_faction_totals（投票結果ページ記載の会派別票数）を全件取得。"""
    client = get_client()
    rows: list[dict] = []
    offset = 0
    while True:
        result = execute_with_retry(
            lambda o=offset: client.table("vote_faction_totals")
                .select("vote_key, session_number, faction_name, yes_count, no_count")
                .order("vote_key").order("faction_name")
                .range(o, o + 999),
            label="fetch_vote_faction_totals",
        )
        batch = result.data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        offset += 1000
    logger.info(f"Fetched {len(rows)} faction total records")
    return rows


def compute_faction_alignment() -> int:
    """会派ペアの採決一致を会期ごとに集計して faction_vote_alignments に保存する。

    会派の賛否は、投票結果ページに記載された会派別の票数で決める（推測しない）:
      賛成票 > 反対票 → 賛成 / 反対票 > 賛成票 → 反対 / 同数・0票 → その採決では対象外
    """
    totals = fetch_faction_totals()
    # (会期, 採決) → {会派: 賛否}
    positions: dict[tuple[int, str], dict[str, str]] = defaultdict(dict)
    for r in totals:
        yes, no = r["yes_count"] or 0, r["no_count"] or 0
        if yes == no:
            continue
        positions[(r["session_number"], r["vote_key"])][r["faction_name"]] = "賛成" if yes > no else "反対"

    # (会期, 会派A, 会派B) → [一致件数, 対象件数]
    counts: dict[tuple[int, str, str], list[int]] = defaultdict(lambda: [0, 0])
    for (session, _), pos in positions.items():
        factions = sorted(pos)
        for i in range(len(factions)):
            for j in range(i + 1, len(factions)):
                a, b = factions[i], factions[j]
                c = counts[(session, a, b)]
                c[1] += 1
                if pos[a] == pos[b]:
                    c[0] += 1

    now = datetime.now(timezone.utc).isoformat()
    rows = [{"house": "参議院", "session_number": session, "faction_a": a, "faction_b": b,
             "agree_count": agree, "total_count": total, "updated_at": now}
            for (session, a, b), (agree, total) in counts.items()]
    if rows:
        batch_upsert("faction_vote_alignments", rows,
                     on_conflict="house,session_number,faction_a,faction_b", label="faction_vote_alignments")
    return len(rows)


def main() -> None:
    count = compute_alignment()
    logger.info(f"Done. {count} records saved.")
    faction_count = compute_faction_alignment()
    logger.info(f"Faction alignments: {faction_count} records saved.")


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
