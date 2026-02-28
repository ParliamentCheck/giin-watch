"""
はたらく議員 — 議員立法スクレイパー
衆議院・参議院から議員提出法案データを取得して bills テーブルに保存する。

データソース:
  衆議院: https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/menu.htm
  参議院: https://www.sangiin.go.jp/japanese/joho1/kousei/gian/{session}/gian.htm
"""

from __future__ import annotations

import logging
import re
import sys
import time
from typing import Any

import requests
from bs4 import BeautifulSoup

from db import get_client, batch_upsert, execute_with_retry
from utils import make_member_id

logger = logging.getLogger("bill_scraper")


# ============================================================
# 衆議院 議員提出法案
# ============================================================
SHUGIIN_BILL_URL = "https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm"


def scrape_shugiin_bills(session: int) -> list[dict[str, Any]]:
    """衆議院の議員提出法案を取得する。"""
    url = SHUGIIN_BILL_URL.format(session=session)
    logger.info("Fetching Shugiin bills for session %d: %s", session, url)

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch Shugiin bills session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    rows: list[dict[str, Any]] = []

    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 4:
            continue

        # 議案番号
        num_text = tds[0].get_text(strip=True)
        if not re.search(r"\d+", num_text):
            continue
        bill_number = re.search(r"(\d+)", num_text).group(1)

        # 法案名
        title = tds[1].get_text(strip=True)
        if not title:
            continue

        # 提出者
        submitter_text = tds[2].get_text(strip=True) if len(tds) > 2 else ""
        submitter_ids = _parse_submitters(submitter_text, "衆議院")

        # 提出日
        submitted_at = None
        if len(tds) > 3:
            date_text = tds[3].get_text(strip=True)
            date_match = re.search(r"(\d{4})[./年](\d{1,2})[./月](\d{1,2})", date_text)
            if date_match:
                y, m, d = date_match.groups()
                submitted_at = f"{y}-{int(m):02d}-{int(d):02d}"

        # ステータス
        status = tds[4].get_text(strip=True) if len(tds) > 4 else ""

        bill_id = f"bill-shu-{session}-{bill_number}"
        rows.append({
            "id": bill_id,
            "title": title,
            "submitter_ids": submitter_ids,
            "submitted_at": submitted_at,
            "session_number": session,
            "status": status,
            "house": "衆議院",
        })

    logger.info("Shugiin session %d: found %d bills", session, len(rows))
    return rows


# ============================================================
# 参議院 議員提出法案
# ============================================================
SANGIIN_BILL_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/gian/{session}/gian.htm"


def scrape_sangiin_bills(session: int) -> list[dict[str, Any]]:
    """参議院の議員提出法案を取得する。"""
    url = SANGIIN_BILL_URL.format(session=session)
    logger.info("Fetching Sangiin bills for session %d: %s", session, url)

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch Sangiin bills session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    rows: list[dict[str, Any]] = []

    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue

        num_text = tds[0].get_text(strip=True)
        if not re.search(r"\d+", num_text):
            continue
        bill_number = re.search(r"(\d+)", num_text).group(1)

        title = tds[1].get_text(strip=True)
        if not title:
            continue

        submitter_text = tds[2].get_text(strip=True) if len(tds) > 2 else ""
        submitter_ids = _parse_submitters(submitter_text, "参議院")

        submitted_at = None
        if len(tds) > 3:
            date_text = tds[3].get_text(strip=True)
            date_match = re.search(r"(\d{4})[./年](\d{1,2})[./月](\d{1,2})", date_text)
            if date_match:
                y, m, d = date_match.groups()
                submitted_at = f"{y}-{int(m):02d}-{int(d):02d}"

        status = tds[4].get_text(strip=True) if len(tds) > 4 else ""

        bill_id = f"bill-san-{session}-{bill_number}"
        rows.append({
            "id": bill_id,
            "title": title,
            "submitter_ids": submitter_ids,
            "submitted_at": submitted_at,
            "session_number": session,
            "status": status,
            "house": "参議院",
        })

    logger.info("Sangiin session %d: found %d bills", session, len(rows))
    return rows


# ============================================================
# ヘルパー
# ============================================================
def _parse_submitters(text: str, house: str) -> list[str]:
    """提出者テキストを議員IDリストに変換する。"""
    if not text:
        return []
    # 「外N名」を除去
    text = re.sub(r"外\d+名", "", text)
    text = re.sub(r"ほか\d+名", "", text)
    # 区切り文字で分割
    names = re.split(r"[、，,・\s]+", text.strip())
    ids = []
    for name in names:
        name = name.strip()
        if name and 2 <= len(name) <= 10:
            ids.append(make_member_id(house, name))
    return ids


# ============================================================
# メイン
# ============================================================
def collect_bills(sessions: list[int] | None = None) -> None:
    """全セッションの議員立法を収集する。"""
    sessions = sessions or list(range(208, 222))

    total_saved = 0
    for session in sessions:
        shu_rows = scrape_shugiin_bills(session)
        if shu_rows:
            batch_upsert("bills", shu_rows, on_conflict="id", label=f"bills_shu:{session}")
            total_saved += len(shu_rows)

        san_rows = scrape_sangiin_bills(session)
        if san_rows:
            batch_upsert("bills", san_rows, on_conflict="id", label=f"bills_san:{session}")
            total_saved += len(san_rows)

        time.sleep(2)

    logger.info("Bill collection complete. Saved %d records.", total_saved)


if __name__ == "__main__":
    try:
        collect_bills()
    except Exception:
        logger.exception("Bill collection failed")
        sys.exit(1)
