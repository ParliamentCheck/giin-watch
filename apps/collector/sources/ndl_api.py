"""
はたらく議員 — NDL API 発言メタデータ収集
国会会議録 API から発言データを取得し、メタデータのみを speeches テーブルに保存する。
speech_text は保存しない（キーワード構築は keyword_builder.py が別途処理）。

APIドキュメント: https://kokkai.ndl.go.jp/api.html
"""

from __future__ import annotations

import logging
import sys
import time
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

logger = logging.getLogger("ndl_api")

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
        lambda: client.table("members").select("id, name").limit(2000),
        label="fetch_members",
    )
    member_map: dict[str, str] = {}  # id -> name
    for m in (members_result.data or []):
        member_map[m["id"]] = m["name"]

    start_record = 1
    total_saved = 0
    total_api_records = None

    while True:
        try:
            data = fetch_speeches_from_ndl(date_from, date_until, start_record)
        except requests.RequestException as exc:
            logger.error("NDL API request failed at record %d: %s", start_record, exc)
            break

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
            # 空ページ → 終了
            break

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

            member_id = make_member_id(house, speaker) if house else None

            # 議事進行判定（speech_text をここで一時的に使うが DB には保存しない）
            speech_text = rec.get("speech", "")
            procedural = is_procedural_speech(speech_text)

            # 日付
            spoken_at = rec.get("date", "")

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
                "spoken_at": spoken_at if spoken_at else None,
                "committee": committee,
                "session_number": session_number,
                "house": house,
                "url": speech_url,
                "is_procedural": procedural,
            }
            rows.append(row)

        if rows:
            # member_id が members テーブルに存在しない行は除外
            valid_rows = [r for r in rows if r["member_id"] in member_map]
            orphan_count = len(rows) - len(valid_rows)
            if orphan_count > 0:
                logger.debug("Skipped %d speeches with unknown member_id", orphan_count)

            if valid_rows:
                batch_upsert("speeches", valid_rows, on_conflict="id", label="speeches")
                total_saved += len(valid_rows)

        start_record += len(speech_records)
        if total_api_records and start_record > total_api_records:
            break

        time.sleep(NDL_RATE_LIMIT_SEC)

    logger.info("Speech collection complete. Saved %d records.", total_saved)


# ============================================================
# エントリポイント
# ============================================================
if __name__ == "__main__":
    try:
        collect_speeches()
    except Exception:
        logger.exception("Speech collection failed")
        sys.exit(1)
