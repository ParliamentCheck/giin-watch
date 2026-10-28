"""
はたらく議員 — 会議録からの会派履歴の構築（会派への移行 F3）

国会会議録APIは発言ごとに「発言時点の会派」（speakerGroup）を返す。
議員（人物）ごとに全期間・衆参両院の発言を取得し、同じ会派が続く区間ごとに
「その会派での最初の発言日〜最後の発言日」を member_faction_history（source='ndl'）に保存する。

正確性のための約束（同姓同名の別人の発言を混ぜない）:
  - 話者名が完全一致する発言だけを使う（APIの話者検索は部分一致のため）
  - 読み仮名が名簿と会議録の両方にあって異なる発言は使わない（同じ漢字表記の別人）
  - 同姓同名の別人として登録済みの名前（config.HOMONYM_SPEAKER_GROUPS）は、その議員の会派の発言だけを使う
  - 同じ日に異なる会派で記録されている議員は、別人の発言が混ざっている可能性があるため履歴を作らない
    （ログに出し、データ品質監査の対象にする）
  - 会派が空の発言（議長としての発言など）は期間の判定に使わない
  - 発言のない期間は推測で埋めない（画面では空白のまま）
  - 院は区別しない（大臣・発議者として他院の会議で発言した記録も本人の記録として扱う）。
    house 列は議員レコード（現在または最後の院）を表し、各区間の院を表すものではない

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

from config import NDL_API_BASE, NDL_HEADERS, NDL_RATE_LIMIT_SEC, HOMONYM_SPEAKER_GROUPS
from db import get_client, execute_with_retry, batch_upsert

logger = logging.getLogger("faction_history")

PAGE_SIZE = 100
MAX_RETRIES = 3


class ConflictError(Exception):
    """同じ日に異なる会派の記録がある（別人の発言が混ざっている可能性）"""


def _norm(name: str) -> str:
    return re.sub(r"[\s\u3000]+", "", name or "")


def fetch_member_speeches(speaker: str) -> list[dict]:
    """話者名が完全一致する発言の {date, group, yomi, house} を返す（衆参両院）。"""
    out: list[dict] = []
    start = 1
    while True:
        params = {
            "speaker": speaker,
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
            raise RuntimeError(f"NDL API から {speaker} の発言を取得できませんでした（start={start}）")

        records = data.get("speechRecord", []) or []
        for rec in records:
            if _norm(rec.get("speaker", "")) != _norm(speaker):
                continue
            group = (rec.get("speakerGroup") or "").strip()
            spoken = rec.get("date") or ""
            if group and spoken:
                out.append({"date": spoken, "group": group,
                            "yomi": _norm(rec.get("speakerYomi") or ""), "house": rec.get("nameOfHouse") or ""})

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
    names = {_norm(member.get("name", ""))}
    names |= {_norm(n) for n in (member.get("ndl_names") or [])}
    if member.get("alias_name"):
        names.add(_norm(member["alias_name"]))
    names.discard("")
    reading = _norm((member.get("last_name_reading") or "") + (member.get("first_name_reading") or ""))

    kept: list[tuple[str, str]] = []
    skipped_yomi = skipped_homonym = 0
    for name in sorted(names):
        allowed = HOMONYM_SPEAKER_GROUPS.get(name, {}).get(member["id"]) if name in HOMONYM_SPEAKER_GROUPS else None
        for rec in fetch_member_speeches(name):
            if name in HOMONYM_SPEAKER_GROUPS and rec["group"] not in (allowed or []):
                skipped_homonym += 1
                continue
            if reading and rec["yomi"] and rec["yomi"] != reading:
                skipped_yomi += 1
                continue
            kept.append((rec["date"], rec["group"]))
        time.sleep(NDL_RATE_LIMIT_SEC)

    # 同じ日に異なる会派 → 別人の発言が混ざっている可能性があるため履歴を作らない
    by_date: dict[str, set[str]] = {}
    for d, g in kept:
        by_date.setdefault(d, set()).add(g)
    conflicts = sorted(d for d, gs in by_date.items() if len(gs) > 1)
    if conflicts:
        raise ConflictError(f"{member['id']}: 同じ日に異なる会派の記録があります（{len(conflicts)}日、例: {conflicts[:3]}）")

    if skipped_yomi or skipped_homonym:
        logger.info("%s: 読み仮名の不一致 %d件・同姓同名の別人 %d件を除外", member["id"], skipped_yomi, skipped_homonym)
    runs = build_runs(kept)
    return [{"member_id": member["id"], "house": member["house"], "source": "ndl", **r} for r in runs]


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
                .select("id, name, alias_name, ndl_names, house, last_name_reading, first_name_reading")
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
    conflicted: list[str] = []
    for i, m in enumerate(target, start=1):
        try:
            rows = build_for_member(m)
        except ConflictError as exc:
            # 別人の発言が混ざっている可能性 → 既存の会議録ベースの履歴も消して表示させない
            conflicted.append(m["id"])
            logger.warning("履歴を作りません（要確認）: %s", exc)
            rows = []
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

    logger.info("完了: 成功 %d名 / 失敗 %d名 / 要確認（同じ日に異なる会派） %d名", done, failed, len(conflicted))
    if conflicted:
        logger.warning("要確認の議員: %s", ", ".join(conflicted))
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    main()
