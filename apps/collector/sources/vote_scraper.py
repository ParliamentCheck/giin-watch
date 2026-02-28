"""
はたらく議員 — 採決記録スクレイパー
衆議院・参議院の採決データを取得して votes テーブルに保存する。

データソース:
  衆議院: https://www.shugiin.go.jp/internet/itdb_votelist.nsf/html/index.htm
  参議院: https://www.sangiin.go.jp/japanese/joho1/kousei/vote/
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

logger = logging.getLogger("vote_scraper")

# ============================================================
# 衆議院 採決記録
# ============================================================
SHUGIIN_VOTE_LIST_URL = "https://www.shugiin.go.jp/internet/itdb_votelist.nsf/html/index_{session}.htm"


def scrape_shugiin_votes(session: int) -> list[dict[str, Any]]:
    """
    衆議院の採決記録を取得する。
    注意: 衆議院サイトのHTML構造は不定期に変わる可能性がある。
    パース失敗時はログを出して空リストを返す。
    """
    url = SHUGIIN_VOTE_LIST_URL.format(session=session)
    logger.info("Fetching Shugiin votes for session %d: %s", session, url)

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch Shugiin votes session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    rows: list[dict[str, Any]] = []

    # 採決一覧テーブルを探す
    tables = soup.find_all("table")
    for table in tables:
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 4:
                continue

            # 採決日
            date_text = tds[0].get_text(strip=True)
            date_match = re.search(r"(\d{4})[./年](\d{1,2})[./月](\d{1,2})", date_text)
            if not date_match:
                continue
            y, m, d = date_match.groups()
            vote_date = f"{y}-{int(m):02d}-{int(d):02d}"

            # 議案名
            bill_title = tds[1].get_text(strip=True)
            if not bill_title:
                continue

            # 結果詳細リンクがあれば、個別議員の投票を取得
            detail_link = tds[1].find("a")
            if detail_link and detail_link.get("href"):
                detail_url = detail_link["href"]
                if not detail_url.startswith("http"):
                    detail_url = f"https://www.shugiin.go.jp{detail_url}"

                member_votes = scrape_shugiin_vote_detail(
                    detail_url, bill_title, vote_date, session
                )
                rows.extend(member_votes)
                time.sleep(1)

    logger.info("Shugiin session %d: found %d vote records", session, len(rows))
    return rows


def scrape_shugiin_vote_detail(
    url: str, bill_title: str, vote_date: str, session: int
) -> list[dict[str, Any]]:
    """採決詳細ページから個別議員の投票データを取得する。"""
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch vote detail: %s", exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    rows: list[dict[str, Any]] = []
    vote_sections = {
        "賛成": "賛成",
        "反対": "反対",
    }

    for section_label, vote_value in vote_sections.items():
        # 「賛成」「反対」セクションを探す
        for heading in soup.find_all(["h3", "h4", "th", "strong"]):
            if section_label in heading.get_text():
                # 後続のテーブルまたはリストから名前を取得
                parent = heading.find_parent(["table", "div", "section"])
                if parent:
                    for name_elem in parent.find_all(["td", "li"]):
                        name = name_elem.get_text(strip=True)
                        if name and len(name) <= 10 and not any(
                            c in name for c in "0123456789（）()賛成反対棄権"
                        ):
                            member_id = make_member_id("衆議院", name)
                            vote_id = f"vote-shu-{session}-{vote_date}-{name}-{bill_title[:20]}"
                            rows.append({
                                "id": vote_id,
                                "member_id": member_id,
                                "bill_title": bill_title,
                                "vote_date": vote_date,
                                "vote": vote_value,
                                "session_number": session,
                                "house": "衆議院",
                            })
    return rows


# ============================================================
# 参議院 採決記録
# ============================================================
SANGIIN_VOTE_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/vote/{session}/vote_{session}.htm"


def scrape_sangiin_votes(session: int) -> list[dict[str, Any]]:
    """参議院の採決記録を取得する。"""
    url = SANGIIN_VOTE_URL.format(session=session)
    logger.info("Fetching Sangiin votes for session %d: %s", session, url)

    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch Sangiin votes session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    rows: list[dict[str, Any]] = []

    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue

        # 採決日
        date_text = tds[0].get_text(strip=True)
        date_match = re.search(r"(\d{4})[./年](\d{1,2})[./月](\d{1,2})", date_text)
        if not date_match:
            continue
        y, m, d = date_match.groups()
        vote_date = f"{y}-{int(m):02d}-{int(d):02d}"

        # 議案名
        bill_title = tds[1].get_text(strip=True)

        # 詳細リンク
        detail_link = tds[1].find("a") or (tds[2].find("a") if len(tds) > 2 else None)
        if detail_link and detail_link.get("href"):
            detail_url = detail_link["href"]
            if not detail_url.startswith("http"):
                detail_url = f"https://www.sangiin.go.jp{detail_url}"
            member_votes = scrape_sangiin_vote_detail(
                detail_url, bill_title, vote_date, session
            )
            rows.extend(member_votes)
            time.sleep(1)

    logger.info("Sangiin session %d: found %d vote records", session, len(rows))
    return rows


def scrape_sangiin_vote_detail(
    url: str, bill_title: str, vote_date: str, session: int
) -> list[dict[str, Any]]:
    """参議院採決詳細ページから個別議員の投票を取得する。"""
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch Sangiin vote detail: %s", exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    rows: list[dict[str, Any]] = []

    current_vote = ""
    for elem in soup.find_all(["h3", "h4", "th", "td", "strong"]):
        text = elem.get_text(strip=True)
        if "賛成" in text and len(text) < 10:
            current_vote = "賛成"
        elif "反対" in text and len(text) < 10:
            current_vote = "反対"
        elif current_vote and elem.name == "td":
            name = text.strip()
            if name and 2 <= len(name) <= 10:
                member_id = make_member_id("参議院", name)
                vote_id = f"vote-san-{session}-{vote_date}-{name}-{bill_title[:20]}"
                rows.append({
                    "id": vote_id,
                    "member_id": member_id,
                    "bill_title": bill_title,
                    "vote_date": vote_date,
                    "vote": current_vote,
                    "session_number": session,
                    "house": "参議院",
                })

    return rows


# ============================================================
# メイン
# ============================================================
def collect_votes(sessions: list[int] | None = None) -> None:
    """全セッションの採決記録を収集する。"""
    sessions = sessions or list(range(208, 222))  # デフォルト: 208回〜221回

    # members の id セットを取得
    client = get_client()
    members = execute_with_retry(
        lambda: client.table("members").select("id").limit(2000),
        label="fetch_members_for_votes",
    ).data or []
    member_ids = {m["id"] for m in members}

    total_saved = 0
    for session in sessions:
        # 衆議院
        shu_rows = scrape_shugiin_votes(session)
        valid_shu = [r for r in shu_rows if r["member_id"] in member_ids]
        if valid_shu:
            batch_upsert("votes", valid_shu, on_conflict="id", label=f"votes_shu:{session}")
            total_saved += len(valid_shu)

        # 参議院
        san_rows = scrape_sangiin_votes(session)
        valid_san = [r for r in san_rows if r["member_id"] in member_ids]
        if valid_san:
            batch_upsert("votes", valid_san, on_conflict="id", label=f"votes_san:{session}")
            total_saved += len(valid_san)

        time.sleep(2)

    logger.info("Vote collection complete. Saved %d records.", total_saved)


if __name__ == "__main__":
    try:
        collect_votes()
    except Exception:
        logger.exception("Vote collection failed")
        sys.exit(1)
