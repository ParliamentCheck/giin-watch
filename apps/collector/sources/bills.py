"""
はたらく議員 — 議員立法スクレイパー
衆議院・参議院から議員提出法案データを取得して bills テーブルに保存する。

データソース:
  衆院一覧: https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm
  参院一覧: https://www.sangiin.go.jp/japanese/joho1/kousei/gian/{session}/gian.htm
  提出者・日付: 各法案の「経過」詳細ページから取得
"""

from __future__ import annotations

import logging
import re
import sys
import time
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from db import batch_upsert
from utils import make_member_id

logger = logging.getLogger("bill_scraper")

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}

# 和暦オフセット（元号の初年が西暦何年か - 1）
ERA_OFFSETS = {"令和": 2018, "平成": 1988, "昭和": 1925}


# ============================================================
# 共通ヘルパー
# ============================================================

def _parse_jp_date(text: str) -> str | None:
    """和暦日付（例: 令和6年1月26日）を YYYY-MM-DD に変換する。"""
    for era, offset in ERA_OFFSETS.items():
        m = re.search(rf"{era}(\d+)年(\d+)月(\d+)日", text)
        if m:
            return f"{offset + int(m.group(1))}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    m = re.search(r"(\d{4})[年./](\d{1,2})[月./](\d{1,2})", text)
    if m:
        return f"{m.group(1)}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None


def _find_section_table(soup: BeautifulSoup, keyword: str):
    """keyword を含む見出し直後のテーブルを返す。"""
    for tag in soup.find_all(["h2", "h3", "h4", "caption", "p", "td", "th"]):
        if keyword in tag.get_text():
            for sibling in tag.find_all_next():
                if sibling.name == "table":
                    return sibling
                if sibling.name in ["h2", "h3", "h4"]:
                    break
    return None


def _fetch_detail(url: str, house: str) -> tuple[list[str], str | None]:
    """経過詳細ページから提出者リストと提出日を取得する。"""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return [], None
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as exc:
        logger.warning("Detail fetch failed %s: %s", url, exc)
        return [], None

    submitter_ids: list[str] = []
    submitted_at: str | None = None

    for cell in soup.find_all(["th", "td"]):
        text = cell.get_text(strip=True)
        if "提出者" in text:
            sibling = cell.find_next_sibling(["th", "td"])
            if sibling:
                names = [a.get_text(strip=True) for a in sibling.find_all("a")]
                if not names:
                    raw = re.sub(r"\s+", " ", sibling.get_text()).strip()
                    names = re.split(r"[　\s、,]+", raw)
                for name in names:
                    name = re.sub(r"\s+", "", name)
                    if 2 <= len(name) <= 10:
                        submitter_ids.append(make_member_id(house, name))
        elif "提出年月日" in text or ("提出日" in text and "提出年月日" not in text):
            sibling = cell.find_next_sibling(["th", "td"])
            if sibling:
                submitted_at = _parse_jp_date(sibling.get_text())

    return submitter_ids, submitted_at


# ============================================================
# 衆議院 議員提出法案
# ============================================================
SHUGIIN_LIST_URL = "https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm"


def scrape_shugiin_bills(session: int) -> list[dict[str, Any]]:
    """衆議院の議員提出法案（衆法）を取得する。"""
    url = SHUGIIN_LIST_URL.format(session=session)
    logger.info("Fetching Shugiin bills session %d", session)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "shift_jis"
    soup = BeautifulSoup(resp.text, "html.parser")

    table = _find_section_table(soup, "衆法")
    if table is None:
        logger.warning("Shugiin session %d: 衆法テーブルが見つからない", session)
        return []

    rows: list[dict[str, Any]] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        # tds[0]=提出回次, tds[1]=番号, tds[2]=議案名称, tds[3]=審議状況, tds[4]=経過リンク
        bill_num_text = tds[1].get_text(strip=True)
        if not re.fullmatch(r"\d+", bill_num_text):
            continue
        title = tds[2].get_text(strip=True)
        if not title:
            continue
        status = tds[3].get_text(strip=True) if len(tds) > 3 else ""

        submitter_ids: list[str] = []
        submitted_at: str | None = None
        if len(tds) > 4:
            link = tds[4].find("a")
            if link and link.get("href"):
                detail_url = urljoin(url, link["href"])
                submitter_ids, submitted_at = _fetch_detail(detail_url, "衆議院")
                time.sleep(1)

        rows.append({
            "id": f"bill-shu-{session}-{bill_num_text}",
            "title": title,
            "submitter_ids": submitter_ids,
            "submitted_at": submitted_at,
            "session_number": session,
            "status": status,
            "house": "衆議院",
        })

    logger.info("Shugiin session %d: %d bills", session, len(rows))
    return rows


# ============================================================
# 参議院 議員提出法案
# ============================================================
SANGIIN_LIST_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/gian/{session}/gian.htm"


def scrape_sangiin_bills(session: int) -> list[dict[str, Any]]:
    """参議院の議員提出法案（参法）を取得する。"""
    url = SANGIIN_LIST_URL.format(session=session)
    logger.info("Fetching Sangiin bills session %d", session)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    table = _find_section_table(soup, "参法")
    if table is None:
        logger.warning("Sangiin session %d: 参法テーブルが見つからない", session)
        return []

    rows: list[dict[str, Any]] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        bill_num_text = tds[1].get_text(strip=True)
        if not re.fullmatch(r"\d+", bill_num_text):
            continue
        title = tds[2].get_text(strip=True)
        if not title:
            continue
        status = tds[3].get_text(strip=True) if len(tds) > 3 else ""

        submitter_ids: list[str] = []
        submitted_at: str | None = None
        if len(tds) > 4:
            link = tds[4].find("a")
            if link and link.get("href"):
                detail_url = urljoin(url, link["href"])
                submitter_ids, submitted_at = _fetch_detail(detail_url, "参議院")
                time.sleep(1)

        rows.append({
            "id": f"bill-san-{session}-{bill_num_text}",
            "title": title,
            "submitter_ids": submitter_ids,
            "submitted_at": submitted_at,
            "session_number": session,
            "status": status,
            "house": "参議院",
        })

    logger.info("Sangiin session %d: %d bills", session, len(rows))
    return rows


# ============================================================
# メイン
# ============================================================
def collect_bills(sessions: list[int] | None = None) -> None:
    """全セッションの議員立法を収集する。"""
    sessions = sessions or list(range(208, 222))

    total_saved = 0
    for session in sessions:
        for scrape_fn, label in [
            (scrape_shugiin_bills, f"bills_shu:{session}"),
            (scrape_sangiin_bills, f"bills_san:{session}"),
        ]:
            rows = scrape_fn(session)
            if rows:
                seen: set[str] = set()
                deduped = [r for r in rows if not (r["id"] in seen or seen.add(r["id"]))]
                batch_upsert("bills", deduped, on_conflict="id", label=label)
                total_saved += len(deduped)
        time.sleep(2)

    logger.info("Bill collection complete. Saved %d records.", total_saved)


if __name__ == "__main__":
    try:
        collect_bills()
    except Exception:
        logger.exception("Bill collection failed")
        sys.exit(1)
