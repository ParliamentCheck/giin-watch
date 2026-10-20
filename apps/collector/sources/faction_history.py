"""
はたらく議員 — 会議録からの会派履歴の構築（会派への移行 F3）

国会会議録APIは発言ごとに「発言時点の会派」（speakerGroup）を返す。
議員ごとに全期間の発言を取得し、同じ会派が続く期間ごとに
「その会派での最初の発言日〜最後の発言日」を member_faction_history（source='ndl'）に保存する。

正確性のための約束:
  - 話者名と院が完全一致する発言だけを使う（APIの話者検索は部分一致のため、他人の発言が混ざる）
  - 会派が空の発言（議長としての発言など）は期間の判定に使わない
  - 発言のない期間は推測で埋めない（画面では空白のまま）

使い方（議員を分けて実行できる）:
  python apps/collector/sources/faction_history.py --offset 0 --limit 300
"""

from __future__ import annotations

import argparse
import logging
import re
import sys
import time
from urllib.parse import urlencode

import requests

from config import NDL_API_BASE, NDL_HEADERS, NDL_RATE_LIMIT_SEC
from db import get_client, execute_with_retry, batch_upsert

logger = logging.getLogger("faction_history")

PAGE_SIZE = 100
MAX_RETRIES = 3


def _norm(name: str) -> str:
    return re.sub(r"[\s　]+", "", name or "")


def fetch_member_speeches(speaker: str, house: str) -> list[tuple[str, str]]:
    """話者名・院が完全一致する発言の (日付, 会派) を返す。会派が空の発言は除く。"""
    out: list[tuple[str, str]] = []
    start = 1
    while True:
        params = {
            "speaker": speaker,
            "nameOfHouse": house,
            "recordPacking": "json",
            "maximumRecords": PAGE_SIZE,
            "startRecord": start,
        }
        url = f"{NDL_API_BASE}?{urlencode(params)}"
        data = None
        for attempt in range(MAX_RETRIES):
            try:
                resp = requests.get(url, headers=NDL_HEADERS, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                break
            except requests.RequestException as exc:
                logger.warning("NDL取得失敗 %s start=%d（%d/%d）: %s", speaker, start, attempt + 1, MAX_RETRIES, exc)
                time.sleep(5 * (attempt + 1))
        if data is None:
            # 途中のページが取れないと期間が欠けるため、この議員の履歴は作らない（推測で埋めない）
            raise RuntimeError(f"NDL API から {speaker}（{house}）の発言を取得できませんでした（start={start}）")

        records = data.get("speechRecord", []) or []
        for rec in records:
            if _norm(rec.get("speaker", "")) != _norm(speaker):
                continue
            if house not in (rec.get("nameOfHouse") or ""):
                continue
            group = (rec.get("speakerGroup") or "").strip()
            spoken = rec.get("date") or ""
            if group and spoken:
                out.append((spoken, group))

        total = data.get("numberOfRecords", 0)
        total = int(total) if str(total).isdigit() else 0
        start += len(records)
        if not records or start > total:
            break
        time.sleep(NDL_RATE_LIMIT_SEC)
    return out


def build_runs(speeches: list[tuple[str, str]]) -> list[dict]:
    """日付順に並べ、同じ会派が続く区間ごとに初出日・最終日・件数をまとめる。"""
    runs: list[dict] = []
    for spoken, group in sorted(speeches):
        if runs and runs[-1]["faction_name"] == group:
            runs[-1]["end_on"] = spoken
            runs[-1]["record_count"] += 1
        else:
            runs.append({"faction_name": group, "start_on": spoken, "end_on": spoken, "record_count": 1})
    return runs


def build_for_member(member: dict) -> list[dict]:
    house = member["house"]
    names = {_norm(member.get("name", ""))}
    names |= {_norm(n) for n in (member.get("ndl_names") or [])}
    if member.get("alias_name"):
        names.add(_norm(member["alias_name"]))
    names.discard("")

    speeches: list[tuple[str, str]] = []
    for name in sorted(names):
        speeches.extend(fetch_member_speeches(name, house))
        time.sleep(NDL_RATE_LIMIT_SEC)
    # 話者名の完全一致で絞っているため、別名の検索どうしで同じ発言が重複することはない
    runs = build_runs(speeches)
    return [{"member_id": member["id"], "house": house, "source": "ndl", **r} for r in runs]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--offset", type=int, default=0, help="議員一覧（ID順）の何人目から処理するか")
    parser.add_argument("--limit", type=int, default=0, help="処理する人数（0 = 残り全員）")
    args = parser.parse_args()

    client = get_client()
    members: list[dict] = []
    last_id = ""
    while True:
        batch = execute_with_retry(
            lambda lid=last_id: client.table("members")
                .select("id, name, alias_name, ndl_names, house")
                .gt("id", lid).order("id").limit(1000),
            label="fetch_members",
        ).data or []
        members.extend(batch)
        if len(batch) < 1000:
            break
        last_id = batch[-1]["id"]

    target = members[args.offset: args.offset + args.limit] if args.limit else members[args.offset:]
    logger.info("会派履歴の構築: 全%d名中 %d〜%d人目（%d名）", len(members), args.offset + 1,
                args.offset + len(target), len(target))

    done = failed = 0
    for i, m in enumerate(target, start=1):
        try:
            rows = build_for_member(m)
        except Exception:
            failed += 1
            logger.exception("履歴の構築に失敗: %s", m["id"])
            continue
        # 作り直し：この議員の会議録ベースの履歴を入れ替える
        execute_with_retry(
            lambda mid=m["id"]: client.table("member_faction_history")
                .delete().eq("member_id", mid).eq("source", "ndl"),
            label="delete_ndl_history",
        )
        if rows:
            batch_upsert("member_faction_history", rows,
                         on_conflict="member_id,house,faction_name,source,start_on", label="ndl_history")
        done += 1
        logger.info("[%d/%d] %s: %d区間", i, len(target), m["id"], len(rows))

    logger.info("完了: 成功 %d名 / 失敗 %d名", done, failed)
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    main()
