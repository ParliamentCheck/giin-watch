"""
はたらく議員 — NDL API 発言メタデータ収集
国会会議録 API から発言データを取得し、メタデータのみを speeches テーブルに保存する。
speech_text は保存しない（キーワード構築は keywords.py が別途処理）。
ただし長文発言（300字以上）の先頭1000字は speech_excerpts テーブルに最大30件保持する。

APIドキュメント: https://kokkai.ndl.go.jp/api.html
"""

from __future__ import annotations

import logging
import re
import sys
import time
from collections import defaultdict
from datetime import date
from typing import Any
from urllib.parse import urlencode

import requests

from config import (
    NDL_API_BASE,
    NDL_DATE_FROM,
    NDL_DATE_UNTIL,
    NDL_RATE_LIMIT_SEC,
)
from db import get_client, batch_upsert, execute_with_retry
from utils import make_member_id, is_procedural_speech

try:
    from keywords import save_member_keywords_from_texts, rebuild_party_keywords
    _KEYWORDS_AVAILABLE = True
except Exception:
    _KEYWORDS_AVAILABLE = False

logger = logging.getLogger("ndl_api")

# 発言抜粋の設定
EXCERPT_MIN_LENGTH = 300   # ヘッダー除去後この文字数以上を「長文」とみなす
EXCERPT_MAX_LENGTH = 1000  # 保存する文字数

# 保持グループ：直近5件 + 5グループ×5件 = 最大30件
# 各グループの境界（今日からの日数）。指数的に広がる。
EXCERPT_RECENT_COUNT = 5   # 直近N件は常に保持
EXCERPT_GROUPS = [
    (0,   90),   # Group A: 直近3ヶ月
    (90,  270),  # Group B: 3〜9ヶ月前
    (270, 630),  # Group C: 9〜21ヶ月前
    (630, 1350), # Group D: 21〜45ヶ月前
    (1350, 2820),# Group E: 45〜94ヶ月前（約8年前まで）
]
EXCERPT_PER_GROUP = 5      # グループごとに保持する件数

# NDL発言テキストの冒頭ヘッダーを除去するパターン
# 例: 「○梅村みずほ君　」「○委員長（田中一郎君）　」
_HEADER_RE = re.compile(r"^○[^　]{1,40}　")


def clean_speech_text(text: str) -> str:
    """冒頭の発言者ヘッダー（○名前　）を除去して本文を返す。"""
    return _HEADER_RE.sub("", text).strip()


# ============================================================
# NDL API リクエスト
# ============================================================
def fetch_speeches_from_ndl(
    date_from: str,
    date_until: str,
    start_record: int = 1,
    records_per_page: int = 100,
) -> dict[str, Any]:
    """NDL API を呼び出して結果を返す。"""
    params = {
        "from": date_from,
        "until": date_until,
        "recordPacking": "json",
        "maximumRecords": records_per_page,
        "startRecord": start_record,
    }
    url = f"{NDL_API_BASE}?{urlencode(params)}"
    logger.debug("Requesting: %s", url)
    resp = requests.get(url, timeout=60)
    resp.raise_for_status()
    return resp.json()


# ============================================================
# メイン収集ロジック
# ============================================================
def collect_speeches(date_from: str | None = None, date_until: str | None = None) -> None:
    date_from = date_from or NDL_DATE_FROM
    date_until = date_until or NDL_DATE_UNTIL
    logger.info("Collecting speeches from %s to %s", date_from, date_until)

    # 既存の member_id 一覧を取得して照合用にキャッシュ
    client = get_client()
    members_result = execute_with_retry(
        lambda: client.table("members").select("id, name, house, ndl_names").limit(2000),
        label="fetch_members",
    )
    ndl_name_to_id: dict[str, str] = {}  # normalized_name -> member_id
    member_info: dict[str, dict] = {}    # member_id -> {name, house}
    for m in (members_result.data or []):
        for ndl_name in (m.get("ndl_names") or []):
            ndl_name_to_id[re.sub(r"\s+", "", ndl_name)] = m["id"]
        if m.get("name"):
            normalized = re.sub(r"\s+", "", m["name"])
            ndl_name_to_id.setdefault(normalized, m["id"])
        member_info[m["id"]] = {"name": m.get("name", ""), "house": m.get("house", "")}
    logger.info("Member name map built: %d entries", len(ndl_name_to_id))

    # キーワード構築用テキスト蓄積バッファ
    member_texts: dict[str, list[tuple[str, str]]] = defaultdict(list)

    # 発言抜粋バッファ: member_id -> [{id, spoken_at, ...}]
    member_excerpts: dict[str, list[dict]] = defaultdict(list)

    records_per_page = 100
    start_record = 1
    total_saved = 0
    total_api_records = None

    while True:
        # リトライ付きリクエスト（最大3回）
        data = None
        for attempt in range(3):
            try:
                data = fetch_speeches_from_ndl(date_from, date_until, start_record)
                break
            except requests.RequestException as exc:
                logger.warning("NDL API request failed at record %d (attempt %d/3): %s", start_record, attempt + 1, exc)
                if attempt < 2:
                    time.sleep(5)
        if data is None:
            logger.error("NDL API request failed after 3 attempts at record %d. Skipping page.", start_record)
            start_record += records_per_page
            continue

        # レスポンス構造の解析
        speech_records = data.get("speechRecord", [])
        if not speech_records:
            # numberOfRecords が 0 の場合
            num = data.get("numberOfRecords", 0)
            if isinstance(num, str):
                num = int(num) if num.isdigit() else 0
            if num == 0:
                logger.info("No records found for the specified period.")
                break
            # 空ページ → スキップして次へ
            logger.warning("Empty page at record %d. Skipping.", start_record)
            start_record += records_per_page
            continue

        if total_api_records is None:
            num = data.get("numberOfRecords", 0)
            total_api_records = int(num) if isinstance(num, str) else num
            logger.info("Total records from API: %d", total_api_records)

        rows = []
        for rec in speech_records:
            speech_id = rec.get("speechID", "")
            if not speech_id:
                continue

            # 院の判定
            house = ""
            name_of_house = rec.get("nameOfHouse", "")
            if "衆議院" in name_of_house:
                house = "衆議院"
            elif "参議院" in name_of_house:
                house = "参議院"

            # 議員名から member_id を生成
            speaker = rec.get("speaker", "").strip()
            if not speaker:
                continue

            speaker_normalized = re.sub(r"\s+", "", speaker)
            member_id = ndl_name_to_id.get(speaker_normalized) if house else None

            # 日付
            spoken_at = rec.get("date", "")

            # 議事進行判定 + キーワード用テキスト蓄積
            speech_text = rec.get("speech", "")
            procedural = is_procedural_speech(speech_text)
            if not procedural and member_id and speech_text:
                member_texts[member_id].append((speech_text, spoken_at or ""))

                # 発言抜粋の候補として蓄積（長文のみ）
                cleaned = clean_speech_text(speech_text)
                if len(cleaned) >= EXCERPT_MIN_LENGTH:
                    member_excerpts[member_id].append({
                        "id": speech_id,
                        "member_id": member_id,
                        "spoken_at": spoken_at if spoken_at else None,
                        "committee": committee,
                        "session_number": session_number,
                        "source_url": speech_url,
                        "excerpt": cleaned[:EXCERPT_MAX_LENGTH],
                        "original_length": len(cleaned),
                    })

            # NDL URL
            speech_url = rec.get("speechURL", "")

            # 委員会名
            committee = rec.get("nameOfMeeting", "")

            # 国会回次
            session_str = rec.get("session", "")
            session_number = None
            if session_str:
                try:
                    session_number = int(session_str)
                except ValueError:
                    pass

            row = {
                "id": speech_id,
                "member_id": member_id,
                "speaker_name": speaker_normalized if house else None,
                "spoken_at": spoken_at if spoken_at else None,
                "committee": committee,
                "session_number": session_number,
                "source_url": speech_url,
                "is_procedural": procedural,
            }
            rows.append(row)

        if rows:
            # 院が特定できた発言のみ保存（政府参考人など院不明の発言は除外）
            valid_rows = [r for r in rows if r["speaker_name"] is not None]
            orphan_count = len(rows) - len(valid_rows)
            if orphan_count > 0:
                logger.debug("Skipped %d speeches with no house affiliation", orphan_count)

            if valid_rows:
                batch_upsert("speeches", valid_rows, on_conflict="id", label="speeches")
                total_saved += len(valid_rows)

        start_record += len(speech_records)
        if total_api_records and start_record > total_api_records:
            break

        time.sleep(NDL_RATE_LIMIT_SEC)

    logger.info("Speech collection complete. Saved %d records.", total_saved)

    _save_and_trim_excerpts(client, member_excerpts)

    # キーワード構築（MeCab が利用可能な場合のみ）
    if _KEYWORDS_AVAILABLE and member_texts:
        logger.info("Building keywords for %d members ...", len(member_texts))
        try:
            updated = save_member_keywords_from_texts(member_texts, member_info)
            logger.info("Keywords built for %d members.", updated)
            rebuild_party_keywords()
        except Exception:
            logger.warning("Keyword build failed", exc_info=True)


def _save_and_trim_excerpts(client, member_excerpts: dict) -> None:
    """speech_excerpts をupsertし、グループ分散トリムを実行する。speeches テーブルには触れない。"""
    if not member_excerpts:
        return

    # 発言抜粋の保存
    if member_excerpts:
        logger.info("Saving speech excerpts for %d members ...", len(member_excerpts))
        all_excerpt_rows = []
        for rows_for_member in member_excerpts.values():
            all_excerpt_rows.extend(rows_for_member)

        if all_excerpt_rows:
            batch_upsert("speech_excerpts", all_excerpt_rows, on_conflict="id", label="speech_excerpts")

        # 議員ごとに「直近5件 + 5グループ×バケツ分散5件」に整理
        today = date.today()

        updated_member_ids = list(member_excerpts.keys())
        for member_id in updated_member_ids:
            try:
                # 全件取得（日付昇順）
                all_res = execute_with_retry(
                    lambda mid=member_id: (
                        client.table("speech_excerpts")
                        .select("id,spoken_at")
                        .eq("member_id", mid)
                        .order("spoken_at", desc=False)
                    ),
                    label=f"excerpt_all_{member_id}",
                )
                all_rows = [r for r in (all_res.data or []) if r.get("spoken_at")]
                if not all_rows:
                    continue

                # 直近EXCERPT_RECENT_COUNT件（降順で先頭N件）
                recent_ids = {r["id"] for r in all_rows[-EXCERPT_RECENT_COUNT:]}

                # 各グループ内をバケツ分散で選択
                group_ids: set[str] = set()
                for day_from, day_until in EXCERPT_GROUPS:
                    cutoff_from = (today - __import__("datetime").timedelta(days=day_until)).isoformat()
                    cutoff_until = (today - __import__("datetime").timedelta(days=day_from)).isoformat()
                    group_rows = [
                        r for r in all_rows
                        if cutoff_from <= r["spoken_at"] < cutoff_until
                    ]
                    if not group_rows:
                        continue
                    # グループ内をEXCERPT_PER_GROUP等分してバケツ選択
                    from_ms = __import__("datetime").datetime.fromisoformat(cutoff_from).timestamp()
                    until_ms = __import__("datetime").datetime.fromisoformat(cutoff_until).timestamp()
                    bucket_ms = (until_ms - from_ms) / EXCERPT_PER_GROUP
                    used: set[str] = set()
                    for i in range(EXCERPT_PER_GROUP):
                        mid_ms = from_ms + bucket_ms * i + bucket_ms / 2
                        best_id, best_diff = None, float("inf")
                        for r in group_rows:
                            if r["id"] in used:
                                continue
                            r_ms = __import__("datetime").datetime.fromisoformat(r["spoken_at"]).timestamp()
                            diff = abs(r_ms - mid_ms)
                            if diff < best_diff:
                                best_diff, best_id = diff, r["id"]
                        if best_id:
                            group_ids.add(best_id)
                            used.add(best_id)

                keep_ids = list(recent_ids | group_ids)
                if keep_ids:
                    execute_with_retry(
                        lambda mid=member_id, ids=keep_ids: (
                            client.table("speech_excerpts")
                            .delete()
                            .eq("member_id", mid)
                            .not_.in_("id", ids)
                        ),
                        label=f"excerpt_cleanup_{member_id}",
                    )
            except Exception:
                logger.warning("Failed to cleanup excerpts for %s", member_id, exc_info=True)

        logger.info("Speech excerpts saved.")


def collect_speech_excerpts_only(date_from: str | None = None, date_until: str | None = None) -> None:
    """speech_excerpts のみを更新する。speeches テーブル・スコア・キーワードには触れない。
    バックフィルや再整理の際にサイトへの影響なしで実行できる。"""
    date_from = date_from or NDL_DATE_FROM
    date_until = date_until or NDL_DATE_UNTIL
    logger.info("Collecting speech excerpts only: %s to %s", date_from, date_until)

    client = get_client()
    members_result = execute_with_retry(
        lambda: client.table("members").select("id, name, house, ndl_names").limit(2000),
        label="fetch_members",
    )
    ndl_name_to_id: dict[str, str] = {}
    for m in (members_result.data or []):
        for ndl_name in (m.get("ndl_names") or []):
            ndl_name_to_id[re.sub(r"\s+", "", ndl_name)] = m["id"]
        if m.get("name"):
            ndl_name_to_id.setdefault(re.sub(r"\s+", "", m["name"]), m["id"])

    member_excerpts: dict[str, list[dict]] = defaultdict(list)
    records_per_page = 100
    start_record = 1
    total_api_records = None

    while True:
        data = None
        for attempt in range(3):
            try:
                data = fetch_speeches_from_ndl(date_from, date_until, start_record)
                break
            except requests.RequestException as exc:
                logger.warning("NDL request failed at %d (attempt %d/3): %s", start_record, attempt + 1, exc)
                if attempt < 2:
                    time.sleep(5)
        if data is None:
            start_record += records_per_page
            continue

        speech_records = data.get("speechRecord", [])
        if not speech_records:
            num = data.get("numberOfRecords", 0)
            if isinstance(num, str):
                num = int(num) if num.isdigit() else 0
            if num == 0:
                break
            start_record += records_per_page
            continue

        if total_api_records is None:
            num = data.get("numberOfRecords", 0)
            total_api_records = int(num) if isinstance(num, str) else num

        for rec in speech_records:
            speech_id = rec.get("speechID", "")
            if not speech_id:
                continue
            name_of_house = rec.get("nameOfHouse", "")
            house = "衆議院" if "衆議院" in name_of_house else ("参議院" if "参議院" in name_of_house else "")
            if not house:
                continue
            speaker = re.sub(r"\s+", "", rec.get("speaker", "").strip())
            member_id = ndl_name_to_id.get(speaker)
            if not member_id:
                continue
            speech_text = rec.get("speech", "")
            if is_procedural_speech(speech_text):
                continue
            cleaned = clean_speech_text(speech_text)
            if len(cleaned) < EXCERPT_MIN_LENGTH:
                continue
            member_excerpts[member_id].append({
                "id": speech_id,
                "member_id": member_id,
                "spoken_at": rec.get("date") or None,
                "committee": rec.get("nameOfMeeting", ""),
                "session_number": int(rec["session"]) if rec.get("session", "").isdigit() else None,
                "source_url": rec.get("speechURL", ""),
                "excerpt": cleaned[:EXCERPT_MAX_LENGTH],
                "original_length": len(cleaned),
            })

        start_record += len(speech_records)
        if total_api_records and start_record > total_api_records:
            break
        time.sleep(NDL_RATE_LIMIT_SEC)

    logger.info("Excerpt collection complete. %d members found.", len(member_excerpts))
    _save_and_trim_excerpts(client, member_excerpts)


# ============================================================
# エントリポイント
# ============================================================
if __name__ == "__main__":
    try:
        collect_speeches()
    except Exception:
        logger.exception("Speech collection failed")
        sys.exit(1)
