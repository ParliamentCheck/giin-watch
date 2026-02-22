# apps/collector/sources/ndl_api.py
"""
国立国会図書館 国会会議録検索API
https://kokkai.ndl.go.jp/api.html

取得データ: 発言記録・委員会出席記録
登録不要・無料・レート制限あり（1秒1リクエスト推奨）
"""

import time
import logging
from datetime import date
from typing import Generator
import httpx

logger = logging.getLogger(__name__)

NDL_API_BASE = "https://kokkai.ndl.go.jp/api/speech"
RATE_LIMIT_SEC = 1.2  # 余裕を持って1.2秒間隔


def fetch_speeches(
    member_name: str,
    session_from: int,
    session_to: int,
) -> Generator[dict, None, None]:
    """
    指定議員の発言記録をページネーションしながら全件取得する。

    Args:
        member_name: 議員名（漢字）
        session_from: 開始国会回次
        session_to: 終了国会回次

    Yields:
        発言レコード dict（APIレスポンスをそのまま返す）
    """
    start_record = 1
    records_per_page = 100

    while True:
        params = {
            "speaker": member_name,
            "sessionFrom": session_from,
            "sessionTo": session_to,
            "startRecord": start_record,
            "maximumRecords": records_per_page,
            "recordPacking": "json",
        }

        try:
            resp = httpx.get(NDL_API_BASE, params=params, timeout=30)
            resp.raise_for_status()
            data = resp.json()
        except httpx.HTTPError as e:
            logger.error(f"NDL API error for {member_name}: {e}")
            break

        results = data.get("speechRecord", [])
        if not results:
            break

        for record in results:
            yield {
                "id":            record.get("speechID"),
                "member_name":   record.get("speaker"),
                "session":       record.get("session"),
                "committee":     record.get("nameOfHouse") + " " + record.get("nameOfMeeting", ""),
                "date":          record.get("date"),
                "speech_order":  record.get("speechOrder"),
                "source_url":    record.get("speechURL"),
                # 本文はspeech_url経由で別途取得（容量節約のためここでは取らない）
            }

        # 次ページがあるか確認
        next_pos = data.get("nextRecordPosition")
        if not next_pos or next_pos > data.get("numberOfReturn", 0) + start_record:
            break

        start_record = next_pos
        time.sleep(RATE_LIMIT_SEC)


def count_speeches(member_name: str, session: int) -> int:
    """指定議員の指定国会回次の発言回数のみを取得（軽量版）。"""
    params = {
        "speaker": member_name,
        "session": session,
        "maximumRecords": 1,
        "recordPacking": "json",
    }
    try:
        resp = httpx.get(NDL_API_BASE, params=params, timeout=15)
        resp.raise_for_status()
        return int(resp.json().get("numberOfRecords", 0))
    except Exception as e:
        logger.error(f"count_speeches error: {e}")
        return 0
