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
    """和暦日付（例: 令和6年1月26日、令和 7年 2月 5日）を YYYY-MM-DD に変換する。"""
    for era, offset in ERA_OFFSETS.items():
        m = re.search(rf"{era}\s*(\d+)年\s*(\d+)月\s*(\d+)日", text)
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
            # caption はテーブル内にあるので親テーブルを直接返す
            if tag.name == "caption":
                parent = tag.find_parent("table")
                if parent:
                    return parent
            for sibling in tag.find_all_next():
                if sibling.name == "table":
                    return sibling
                if sibling.name in ["h2", "h3", "h4"]:
                    break
    return None


_BILL_TYPE_HOUSE = {"衆法": "衆議院", "参法": "参議院"}


def _parse_name_cell(cell_el: Any, house: str) -> list[str]:
    """提出者セルから member_id リストを返す。"""
    raw = re.sub(r"外[〇一二三四五六七八九十百千\d]+名", "", cell_el.get_text()).strip()
    result = []
    for part in re.split(r"[、,，；;]+", raw):
        name = re.sub(r"[君氏]$", "", part.strip())
        name = re.sub(r"\s+", "", name)
        if 2 <= len(name) <= 10:
            result.append(make_member_id(house, name))
    return result


def _fetch_detail(url: str, house: str) -> tuple[list[str], str | None]:
    """経過詳細ページから提出者リストと提出日を取得する。
    衆院 keika ページと参院 meisai ページ両方に対応する。
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return [], None
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as exc:
        logger.warning("Detail fetch failed %s: %s", url, exc)
        return [], None

    primary_ids: list[str] = []   # 議案提出者 / 発議者（筆頭のみ）
    full_ids: list[str] = []      # 議案提出者一覧（全員 / 衆院のみ）
    submitted_at: str | None = None
    actual_house = house

    for cell in soup.find_all(["th", "td"]):
        text = cell.get_text(strip=True)
        sibling = cell.find_next_sibling(["th", "td"])
        if sibling is None:
            continue
        sib_text = sibling.get_text(strip=True)

        if text == "議案種類":
            # 衆院 keika ページ: 衆法/参法から提出者の院を確定
            actual_house = _BILL_TYPE_HOUSE.get(sib_text, house)

        elif text in ("議案提出者", "提出者", "発議者"):
            if not primary_ids:
                primary_ids = _parse_name_cell(sibling, actual_house)

        elif text == "議案提出者一覧":
            # 衆院 keika ページ: 全提出者リスト（優先使用）
            full_ids = _parse_name_cell(sibling, actual_house)

        elif text == "提出日" or f"{actual_house}議案受理年月日" in text or "提出年月日" in text:
            if submitted_at is None:
                submitted_at = _parse_jp_date(sib_text)

    return (full_ids if full_ids else primary_ids), submitted_at


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

_KNOWN_SESSION = 221  # 既知の最新回次


def _detect_current_session() -> int:
    """参議院法案一覧ページの存在確認で現在の国会回次を検出する。"""
    session = _KNOWN_SESSION
    while True:
        url = SANGIIN_LIST_URL.format(session=session + 1)
        try:
            r = requests.head(url, headers=HEADERS, timeout=10)
            if r.status_code == 200:
                session += 1
            else:
                break
        except requests.RequestException:
            break
    return session


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
        # tds[2]（件名）のリンクが meisai 詳細ページ（tds[4] は PDF）
        link = tds[2].find("a")
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
def collect_bills(sessions: list[int] | None = None, daily: bool = False) -> None:
    """議員立法を収集する。daily=True のときは現在進行中のセッションのみ対象。"""
    if daily:
        current = _detect_current_session()
        sessions = [current]
        logger.info("日次モード: 第%d回国会のみ対象", current)
    else:
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
