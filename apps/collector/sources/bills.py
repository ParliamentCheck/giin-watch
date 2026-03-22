"""
はたらく議員 — 議員立法・閣法スクレイパー
衆議院・参議院から議員提出法案と閣法データを取得して bills テーブルに保存する。

データソース:
  衆院一覧: https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm
  参院一覧: https://www.sangiin.go.jp/japanese/joho1/kousei/gian/{session}/gian.htm
  提出者・日付: 各法案の「経過」詳細ページから取得

閣法の取得方針:
  閣法は衆参両院のサイトに同一法案が掲載されるが、参議院の詳細ページ（meisai）に
  衆参両院の委員会付託・採決情報が集約されるため、参議院サイトのみを正とする。
  衆議院側の閣法（cabinet-shu-*）は取得しない。
  衆院ページにHTML法律案があるが当サイトでは法律案本文は取得対象外であり、
  参院ページにPDF版があるため衆院HTMLの取得理由もない。
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


def _fetch_detail(url: str, house: str) -> tuple[list[str], str | None, str]:
    """経過詳細ページから提出者リスト・提出日・ステータスを取得する。
    衆院 keika ページと参院 meisai ページ両方に対応する。
    戻り値: (submitter_ids, submitted_at, status)
    """
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return [], None, ""
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as exc:
        logger.warning("Detail fetch failed %s: %s", url, exc)
        return [], None, ""

    primary_ids: list[str] = []   # 議案提出者 / 発議者（筆頭のみ）
    full_ids: list[str] = []      # 議案提出者一覧（全員 / 衆院のみ）
    submitted_at: str | None = None
    status: str = ""
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

        elif "公布" in text and sib_text:
            status = "成立"

        elif text == "継続区分" and sib_text:
            if not status:
                status = "参議院で閉会中審査"

    if not status and "未了" in soup.get_text():
        status = "未了"

    return (full_ids if full_ids else primary_ids), submitted_at, status


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
        source_url: str | None = None
        if len(tds) > 4:
            link = tds[4].find("a")
            if link and link.get("href"):
                detail_url = urljoin(url, link["href"])
                submitter_ids, submitted_at, _ = _fetch_detail(detail_url, "衆議院")
                time.sleep(1)
        if len(tds) > 5:
            text_link = tds[5].find("a")
            if text_link and text_link.get("href"):
                source_url = urljoin(url, text_link["href"])

        rows.append({
            "id": f"bill-shu-{session}-{bill_num_text}",
            "title": title,
            "submitter_ids": submitter_ids,
            "submitted_at": submitted_at,
            "session_number": session,
            "status": status,
            "house": "衆議院",
            "source_url": source_url,
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
        submitter_ids: list[str] = []
        submitted_at: str | None = None
        status: str = ""
        source_url: str | None = None
        # tds[2]（件名）のリンクが meisai 詳細ページ（tds[4] は PDF）
        link = tds[2].find("a")
        if link and link.get("href"):
            detail_url = urljoin(url, link["href"])
            source_url = detail_url
            submitter_ids, submitted_at, status = _fetch_detail(detail_url, "参議院")
            time.sleep(1)

        rows.append({
            "id": f"bill-san-{session}-{bill_num_text}",
            "title": title,
            "submitter_ids": submitter_ids,
            "submitted_at": submitted_at,
            "session_number": session,
            "status": status,
            "house": "参議院",
            "source_url": source_url,
        })

    logger.info("Sangiin session %d: %d bills", session, len(rows))
    return rows


# ============================================================
# 参議院 閣法
# ============================================================
# 衆院閣法スクレイパーは廃止済み（→ モジュール docstring 参照）


def _fetch_cabinet_detail(meisai_url: str) -> dict[str, Any]:
    """参院 meisai 詳細ページから閣法の詳細情報を取得する。

    取得フィールド:
      status, law_number, promulgated_at,
      committee_shu, committee_san,
      vote_date_shu, vote_date_san,
      vote_result_shu, vote_result_san
    """
    result: dict[str, Any] = {
        "status": "", "law_number": None, "promulgated_at": None,
        "committee_shu": None, "committee_san": None,
        "vote_date_shu": None, "vote_date_san": None,
        "vote_result_shu": None, "vote_result_san": None,
    }
    try:
        resp = requests.get(meisai_url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return result
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException:
        return result

    current_house: str | None = None

    for tag in soup.find_all(["h3", "h4", "th", "td", "caption"]):
        text = tag.get_text(strip=True)

        # 院セクション見出しの検出
        if "衆議院" in text and tag.name in ["h3", "h4", "caption", "th"]:
            current_house = "shu"
        elif "参議院" in text and tag.name in ["h3", "h4", "caption", "th"]:
            current_house = "san"

        if tag.name != "th":
            continue

        val_cell = tag.find_next_sibling("td")
        val = val_cell.get_text(strip=True) if val_cell else ""

        if "公布" in text:
            if val:
                result["promulgated_at"] = _parse_jp_date(val)
                result["status"] = "成立"
        elif "法律番号" in text:
            result["law_number"] = val or None
        elif current_house and "付託委員会" in text:
            result[f"committee_{current_house}"] = val or None
        elif current_house and "議決日" in text:
            parsed = _parse_jp_date(val)
            if parsed:
                result[f"vote_date_{current_house}"] = parsed
        elif current_house and "採決態様" in text:
            result[f"vote_result_{current_house}"] = val or None

    if not result["status"] and "未了" in soup.get_text():
        result["status"] = "未了"

    return result

def scrape_sangiin_cabinet_bills(session: int) -> list[dict[str, Any]]:
    """参議院の閣法（内閣提出法案）を取得する。"""
    url = SANGIIN_LIST_URL.format(session=session)
    logger.info("Fetching Sangiin cabinet bills session %d", session)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    table = _find_section_table(soup, "内閣提出")
    if table is None:
        logger.warning("Sangiin session %d: 内閣提出テーブルが見つからない", session)
        return []

    rows: list[dict[str, Any]] = []
    for tr in table.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        bill_num_text = tds[1].get_text(strip=True)
        if not re.fullmatch(r"\d+", bill_num_text):
            continue

        title_cell = tds[2]
        title = title_cell.get_text(strip=True)
        if not title:
            continue

        submitted_at: str | None = None
        source_url: str | None = None
        detail: dict[str, Any] = {}
        link = title_cell.find("a")
        if link and link.get("href"):
            detail_url = urljoin(url, link["href"])
            source_url = detail_url
            _, submitted_at, _ = _fetch_detail(detail_url, "参議院")
            detail = _fetch_cabinet_detail(detail_url)
            time.sleep(1)

        rows.append({
            "id": f"cabinet-san-{session}-{bill_num_text}",
            "title": title,
            "submitter_ids": [],
            "submitted_at": submitted_at,
            "session_number": session,
            "status": detail.get("status", ""),
            "house": "参議院",
            "source_url": source_url,
            "bill_type": "閣法",
            "law_number":     detail.get("law_number"),
            "promulgated_at": detail.get("promulgated_at"),
            "committee_shu":  detail.get("committee_shu"),
            "committee_san":  detail.get("committee_san"),
            "vote_date_shu":  detail.get("vote_date_shu"),
            "vote_date_san":  detail.get("vote_date_san"),
            "vote_result_shu": detail.get("vote_result_shu"),
            "vote_result_san": detail.get("vote_result_san"),
        })

    logger.info("Sangiin cabinet bills session %d: %d bills", session, len(rows))
    return rows


# ============================================================
# メイン
# ============================================================
def collect_bills(sessions: list[int] | None = None, daily: bool = False) -> None:
    """議員立法・閣法を収集する。daily=True のときは現在進行中のセッションのみ対象。"""
    if daily:
        current = _detect_current_session()
        sessions = [current]
        logger.info("日次モード: 第%d回国会のみ対象", current)
    else:
        sessions = sessions or list(range(208, 222))

    total_saved = 0
    for session in sessions:
        for scrape_fn, label in [
            (scrape_shugiin_bills,         f"bills_shu:{session}"),
            (scrape_sangiin_bills,         f"bills_san:{session}"),
            (scrape_sangiin_cabinet_bills, f"cabinet_san:{session}"),
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
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--daily", action="store_true", help="現在進行中の国会回次のみ収集")
    args = parser.parse_args()
    try:
        collect_bills(daily=args.daily)
    except Exception:
        logger.exception("Bill collection failed")
        sys.exit(1)
