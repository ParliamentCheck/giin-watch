"""
はたらく議員 — ワードクラウド構築
NDL API から発言本文を一時取得 → 形態素解析 → member_keywords / party_keywords に集計。
発言本文は DB に保存しない（メモリ上で処理して破棄）。

使い方:
  # 日次更新（新しい発言のみ）
  python keyword_builder.py --mode daily

  # 初回構築 / 完全再構築（4年分）
  python keyword_builder.py --mode full

  # 特定年の再構築
  python keyword_builder.py --mode year --year 2024
"""

from __future__ import annotations

import argparse
import logging
import sys
import time
from collections import Counter
from datetime import date, timedelta
from typing import Any
from urllib.parse import urlencode

import requests

try:
    import MeCab
except ImportError:
    MeCab = None  # type: ignore

from config import (
    NDL_API_BASE,
    NDL_RATE_LIMIT_SEC,
    KEYWORDS_MAX_STORE,
    KEYWORDS_STALE_DAYS,
    MIN_SPEECH_LENGTH,
)
from db import get_client, batch_upsert, execute_with_retry, delete_rows
from utils import should_exclude_word, is_stale_keyword

logger = logging.getLogger("keyword_builder")

# ============================================================
# MeCab 初期化
# ============================================================
_tagger = None


def get_tagger():
    global _tagger
    if _tagger is None:
        if MeCab is None:
            raise RuntimeError("MeCab is not installed. Run: pip install mecab-python3 unidic-lite")
        _tagger = MeCab.Tagger()
    return _tagger


# ============================================================
# 形態素解析 → 名詞抽出
# ============================================================
def extract_nouns(text: str) -> list[str]:
    """テキストから名詞を抽出して返す。"""
    if len(text) <= MIN_SPEECH_LENGTH:
        return []
    tagger = get_tagger()
    node = tagger.parseToNode(text)
    nouns = []
    while node:
        features = node.feature.split(",")
        # 品詞が名詞（一般名詞、固有名詞、サ変接続）
        if features[0] == "名詞" and features[1] in ("一般", "固有名詞", "サ変接続"):
            surface = node.surface
            if len(surface) > 1:  # 1文字の名詞は除外
                nouns.append(surface)
        node = node.next
    return nouns


# ============================================================
# NDL API から特定議員の発言本文を取得
# ============================================================
def fetch_speech_texts_for_member(
    member_name: str,
    house: str,
    date_from: str,
    date_until: str,
) -> list[tuple[str, str]]:
    """
    NDL API から指員の発言テキストを取得する。
    Returns: list of (speech_text, spoken_date)
    """
    results: list[tuple[str, str]] = []
    start_record = 1

    while True:
        params = {
            "speaker": member_name,
            "nameOfHouse": house,
            "from": date_from,
            "until": date_until,
            "recordPacking": "json",
            "maximumRecords": 100,
            "startRecord": start_record,
        }
        url = f"{NDL_API_BASE}?{urlencode(params)}"

        try:
            resp = requests.get(url, timeout=60)
            resp.raise_for_status()
            data = resp.json()
        except Exception as exc:
            logger.warning("NDL API error for %s: %s", member_name, exc)
            break

        records = data.get("speechRecord", [])
        if not records:
            break

        for rec in records:
            text = rec.get("speech", "")
            spoken = rec.get("date", "")
            if text:
                results.append((text, spoken))

        total = data.get("numberOfRecords", 0)
        if isinstance(total, str):
            total = int(total) if total.isdigit() else 0
        start_record += len(records)
        if start_record > total:
            break

        time.sleep(NDL_RATE_LIMIT_SEC)

    return results


# ============================================================
# 議員のキーワードを構築・更新
# ============================================================
def build_keywords_for_member(
    member_id: str,
    member_name: str,
    house: str,
    date_from: str,
    date_until: str,
    existing_keywords: dict[str, dict] | None = None,
) -> list[dict[str, Any]]:
    """
    指定期間の発言からキーワードを抽出し、既存キーワードとマージして上位100語を返す。

    Parameters
    ----------
    existing_keywords : dict[word, {count, last_seen_at}] or None
        既存の member_keywords データ。None なら初回構築。

    Returns
    -------
    list[dict]
        member_keywords テーブルに upsert する行リスト。
    """
    existing = existing_keywords or {}

    # NDL API から発言取得
    speeches = fetch_speech_texts_for_member(member_name, house, date_from, date_until)
    if not speeches:
        logger.debug("No speeches for %s in %s~%s", member_name, date_from, date_until)
        return []

    # 形態素解析してカウント
    period_counter: Counter[str] = Counter()
    latest_date_per_word: dict[str, str] = {}

    for text, spoken_date in speeches:
        nouns = extract_nouns(text)
        for noun in nouns:
            if should_exclude_word(noun, member_name):
                continue
            period_counter[noun] += 1
            # last_seen_at を更新（より新しい日付を保持）
            if noun not in latest_date_per_word or spoken_date > latest_date_per_word[noun]:
                latest_date_per_word[noun] = spoken_date

    # 既存キーワードとマージ
    merged: dict[str, dict] = {}
    for word, info in existing.items():
        merged[word] = {
            "count": info["count"],
            "last_seen_at": info["last_seen_at"],
        }

    for word, count in period_counter.items():
        if word in merged:
            merged[word]["count"] += count
            new_date = latest_date_per_word.get(word, "")
            if new_date > (merged[word]["last_seen_at"] or ""):
                merged[word]["last_seen_at"] = new_date
        else:
            merged[word] = {
                "count": count,
                "last_seen_at": latest_date_per_word.get(word, ""),
            }

    # 古いキーワードにペナルティ: stale なものはソートで下位に
    def sort_key(item: tuple[str, dict]) -> tuple[bool, int]:
        word, info = item
        stale = is_stale_keyword(info["last_seen_at"])
        return (not stale, info["count"])  # non-stale first, then by count desc

    sorted_words = sorted(merged.items(), key=sort_key, reverse=True)
    top_words = sorted_words[:KEYWORDS_MAX_STORE]

    rows = []
    for word, info in top_words:
        rows.append({
            "member_id": member_id,
            "word": word,
            "count": info["count"],
            "last_seen_at": info["last_seen_at"] or None,
        })

    return rows


# ============================================================
# 政党キーワード集約
# ============================================================
def rebuild_party_keywords() -> None:
    """member_keywords を政党ごとに合算して party_keywords を再構築する。"""
    client = get_client()
    logger.info("Rebuilding party_keywords ...")

    # 全 member_keywords を取得
    all_mk: list[dict] = []
    offset = 0
    page_size = 2000
    while True:
        result = execute_with_retry(
            lambda o=offset: (
                client.table("member_keywords")
                .select("member_id, word, count, last_seen_at")
                .range(o, o + page_size - 1)
            ),
            label="fetch_all_member_keywords",
        )
        batch = result.data or []
        all_mk.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    # member_id → party のマッピング
    members = execute_with_retry(
        lambda: client.table("members").select("id, party").limit(2000),
        label="fetch_members_party",
    ).data or []
    member_party: dict[str, str] = {m["id"]: m["party"] for m in members}

    # 政党ごとに集計
    party_data: dict[str, dict[str, dict]] = {}  # party -> {word -> {count, last_seen_at}}
    for mk in all_mk:
        party = member_party.get(mk["member_id"])
        if not party:
            continue
        if party not in party_data:
            party_data[party] = {}
        word = mk["word"]
        if word not in party_data[party]:
            party_data[party][word] = {"count": 0, "last_seen_at": ""}
        party_data[party][word]["count"] += mk["count"]
        ls = mk.get("last_seen_at") or ""
        if ls > (party_data[party][word]["last_seen_at"] or ""):
            party_data[party][word]["last_seen_at"] = ls

    # 各政党の上位100語を upsert
    for party, words in party_data.items():
        sorted_words = sorted(
            words.items(),
            key=lambda x: (not is_stale_keyword(x[1]["last_seen_at"]), x[1]["count"]),
            reverse=True,
        )[:KEYWORDS_MAX_STORE]

        rows = []
        for word, info in sorted_words:
            rows.append({
                "party": party,
                "word": word,
                "count": info["count"],
                "last_seen_at": info["last_seen_at"] or None,
            })

        # 既存データを削除して入れ替え
        try:
            delete_rows("party_keywords", "party", party, label=f"delete_pk:{party}")
        except Exception:
            pass  # テーブルが空の場合
        if rows:
            batch_upsert("party_keywords", rows, on_conflict="party,word", label=f"pk:{party}")

    logger.info("Party keywords rebuilt for %d parties.", len(party_data))


# ============================================================
# 日次更新
# ============================================================
def daily_update() -> None:
    """新しい発言のみ処理してキーワードを更新する。"""
    client = get_client()

    # keywords_updated_at が古い or NULL の議員を対象
    members = execute_with_retry(
        lambda: (
            client.table("members")
            .select("id, name, house, keywords_updated_at")
            .eq("is_active", True)
            .limit(2000)
        ),
        label="fetch_members_for_keywords",
    ).data or []

    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=7)).isoformat()  # 1週間分（NDL遅延考慮）

    updated = 0
    for m in members:
        member_id = m["id"]
        member_name = m["name"]
        house = m["house"]

        # 既存キーワードを取得
        existing_rows = execute_with_retry(
            lambda mid=member_id: (
                client.table("member_keywords")
                .select("word, count, last_seen_at")
                .eq("member_id", mid)
            ),
            label=f"fetch_mk:{member_id}",
        ).data or []

        existing = {
            r["word"]: {"count": r["count"], "last_seen_at": r.get("last_seen_at", "")}
            for r in existing_rows
        }

        # 差分期間のキーワードを構築
        new_rows = build_keywords_for_member(
            member_id, member_name, house,
            date_from=yesterday,
            date_until=today,
            existing_keywords=existing,
        )

        if new_rows:
            # 既存を削除して入れ替え
            try:
                delete_rows("member_keywords", "member_id", member_id)
            except Exception:
                pass
            batch_upsert(
                "member_keywords", new_rows,
                on_conflict="member_id,word",
                label=f"mk:{member_id}",
            )
            # keywords_updated_at を更新
            execute_with_retry(
                lambda mid=member_id: (
                    client.table("members")
                    .update({"keywords_updated_at": today})
                    .eq("id", mid)
                ),
                label=f"update_kw_ts:{member_id}",
            )
            updated += 1

        # API レート制限を遵守
        time.sleep(NDL_RATE_LIMIT_SEC)

    logger.info("Daily keyword update complete. Updated %d members.", updated)
    rebuild_party_keywords()


# ============================================================
# 全件再構築
# ============================================================
def full_rebuild(years: int = 4) -> None:
    """過去 N 年分の発言から全議員のキーワードを再構築する。"""
    client = get_client()

    members = execute_with_retry(
        lambda: (
            client.table("members")
            .select("id, name, house")
            .limit(2000)
        ),
        label="fetch_all_members",
    ).data or []

    today = date.today()
    start_year = today.year - years

    logger.info("Full rebuild: %d members, years %d-%d", len(members), start_year, today.year)

    for m in members:
        member_id = m["id"]
        member_name = m["name"]
        house = m["house"]
        accumulated: dict[str, dict] = {}

        # 年単位で累積構築
        for year in range(start_year, today.year + 1):
            date_from = f"{year}-01-01"
            date_until = f"{year}-12-31" if year < today.year else today.isoformat()

            rows = build_keywords_for_member(
                member_id, member_name, house,
                date_from=date_from,
                date_until=date_until,
                existing_keywords=accumulated,
            )

            # 結果を accumulated に反映
            accumulated = {}
            for r in rows:
                accumulated[r["word"]] = {
                    "count": r["count"],
                    "last_seen_at": r["last_seen_at"] or "",
                }

            logger.debug("%s: year %d → %d keywords", member_name, year, len(accumulated))

        # DB に保存
        if accumulated:
            try:
                delete_rows("member_keywords", "member_id", member_id)
            except Exception:
                pass
            final_rows = [
                {
                    "member_id": member_id,
                    "word": w,
                    "count": info["count"],
                    "last_seen_at": info["last_seen_at"] or None,
                }
                for w, info in accumulated.items()
            ]
            batch_upsert(
                "member_keywords", final_rows,
                on_conflict="member_id,word",
                label=f"full_mk:{member_id}",
            )

        # keywords_updated_at 更新
        execute_with_retry(
            lambda mid=member_id: (
                client.table("members")
                .update({"keywords_updated_at": today.isoformat()})
                .eq("id", mid)
            ),
            label=f"update_kw_ts:{member_id}",
        )

    logger.info("Full keyword rebuild complete for %d members.", len(members))
    rebuild_party_keywords()


# ============================================================
# 単年再構築
# ============================================================
def year_rebuild(year: int) -> None:
    """特定年のデータだけを再処理する。"""
    logger.info("Year rebuild for %d", year)
    full_rebuild(years=date.today().year - year + 1)


# ============================================================
# CLI
# ============================================================
def main() -> None:
    parser = argparse.ArgumentParser(description="ワードクラウド構築")
    parser.add_argument("--mode", choices=["daily", "full", "year"], default="daily")
    parser.add_argument("--year", type=int, help="--mode year の場合に対象年を指定")
    parser.add_argument("--years", type=int, default=4, help="--mode full の遡及年数")
    args = parser.parse_args()

    if args.mode == "daily":
        daily_update()
    elif args.mode == "full":
        full_rebuild(years=args.years)
    elif args.mode == "year":
        if not args.year:
            parser.error("--mode year requires --year")
        year_rebuild(args.year)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Keyword builder failed")
        sys.exit(1)
