"""
はたらく議員 — 参議院本会議投票結果スクレイパー
参議院サイトから各国会回次の投票結果を取得し、議員ごとの賛否を記録する。
衆議院は個人別投票記録が公開されていないため対象外。
"""

from __future__ import annotations

import re
import time
import logging
import sys
import httpx
from bs4 import BeautifulSoup

from db import get_client, execute_with_retry, batch_upsert
from utils import make_member_id

logger = logging.getLogger("vote_scraper")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
SANGIIN_BASE = "https://www.sangiin.go.jp"

# 最近の国会回次（208〜221）を対象
TARGET_SESSIONS = list(range(208, 222))


def normalize_name(name: str) -> str:
    name = name.replace("\u3000", " ").replace("\u3000", " ").strip()
    name = re.sub(r"\s+", " ", name)
    return name


def fetch_vote_index(session: int) -> list[dict]:
    url = f"{SANGIIN_BASE}/japanese/touhyoulist/{session}/vote_ind.htm"
    logger.info(f"Fetching vote index: {url}")
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 404:
            logger.warning(f"Session {session}: vote index not found")
            return []
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning(f"Failed to fetch vote index session {session}: {e}")
        return []

    votes = []
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if re.search(rf"{session}-\d{{4}}-v\d{{3}}\.htm", href):
            text = a.get_text(strip=True)
            if href.startswith("http"):
                full_url = href
            elif href.startswith("/"):
                full_url = f"{SANGIIN_BASE}{href}"
            else:
                full_url = f"{SANGIIN_BASE}/japanese/touhyoulist/{session}/{href}"
            votes.append({
                "url": full_url,
                "title": text,
                "session": session,
            })

    logger.info(f"Session {session}: found {len(votes)} vote pages")
    return votes


def parse_vote_page(url: str, session: int, member_ids: set[str]) -> list[dict]:
    logger.info(f"  Parsing: {url}")
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning(f"  Failed to fetch {url}: {e}")
        return []

    # 案件名を取得
    bill_title = ""
    for dd in soup.select("dd"):
        text = dd.get_text(strip=True)
        if len(text) > 5 and "日程" in text:
            bill_title = re.sub(r"^日程第\S+\s*", "", text).strip()
            break
    if not bill_title:
        for dt in soup.find_all("dt"):
            if "案件名" in dt.get_text():
                dd = dt.find_next_sibling("dd")
                if dd:
                    bill_title = dd.get_text(strip=True)
                    break
    if not bill_title:
        h1 = soup.find("h1")
        if h1:
            bill_title = h1.get_text(strip=True)

    # 投票日を取得
    vote_date = None
    for h2 in soup.find_all("h2"):
        date_match = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", h2.get_text())
        if date_match:
            vote_date = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"
            break

    if not bill_title:
        logger.warning(f"  Could not extract bill title from {url}")
        return []

    # 議員ごとの賛否を取得
    records = []
    for li in soup.select("li"):
        li_text = li.get_text(strip=True)
        vote_value = None
        name = None

        if li_text.startswith("賛成"):
            vote_value = "賛成"
            name = li_text[2:]
        elif li_text.startswith("反対"):
            vote_value = "反対"
            name = li_text[2:]
        elif li_text.startswith("投票なし"):
            vote_value = "欠席"
            name = li_text[4:]

        if vote_value and name:
            name = normalize_name(name)
            member_id = make_member_id("参議院", name)

            if member_id not in member_ids:
                continue

            # IDはハッシュで一意にする
            import hashlib
            raw_id = f"{session}-{bill_title}-{member_id}"
            vote_id = f"sv-{hashlib.md5(raw_id.encode()).hexdigest()[:16]}"

            records.append({
                "id": vote_id,
                "member_id": member_id,
                "bill_title": bill_title,
                "vote_date": vote_date,
                "vote": vote_value,
                "session_number": session,
                "house": "参議院",
            })

    logger.info(f"  Extracted {len(records)} records: {bill_title[:50]}")
    return records


def main():
    client = get_client()

    members_result = execute_with_retry(
        lambda: client.table("members").select("id").eq("house", "参議院").limit(2000),
        label="fetch_sangiin_members",
    )
    member_ids = {m["id"] for m in (members_result.data or [])}
    logger.info(f"Found {len(member_ids)} Sangiin members in DB")

    total_saved = 0

    for session in TARGET_SESSIONS:
        vote_pages = fetch_vote_index(session)
        if not vote_pages:
            continue

        for vp in vote_pages:
            records = parse_vote_page(vp["url"], session, member_ids)
            if records:
                batch_upsert("votes", records, on_conflict="id", label=f"votes_s{session}")
                total_saved += len(records)
            time.sleep(1.0)

        time.sleep(2.0)

    logger.info(f"Vote collection complete. Saved {total_saved} records.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Vote scraper failed")
        sys.exit(1)
