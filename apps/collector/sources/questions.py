"""
はたらく議員 — 質問主意書収集
衆議院・参議院の質問主意書データを収集する。

  衆議院 → questions テーブル
  参議院 → sangiin_questions テーブル
"""

from __future__ import annotations

import logging
import re
import sys
import time
from typing import Any, Optional

import httpx
import requests
from bs4 import BeautifulSoup

from config import SESSION_MAX, SESSION_MAX_NEXT_START
from db import get_client, execute_with_retry, batch_upsert
from utils import make_member_id

logger = logging.getLogger("questions")

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}


# ============================================================
# 衆議院 質問主意書
# ============================================================

SHUGIIN_BASE_URL = "https://www.shugiin.go.jp/internet/itdb_shitsumon.nsf/html/shitsumon/"


def _normalize_shu(name: str) -> str:
    name = name.replace("\u3000", " ").replace("君", "").strip()
    return re.sub(r" +", " ", name)


def _scrape_shitsumon(session: int, number: int) -> Optional[dict]:
    url = SHUGIIN_BASE_URL + f"{session}{number:03d}.htm"
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=20)
        if resp.status_code == 404:
            return None
        resp.encoding = "shift_jis"
        soup = BeautifulSoup(resp.text, "html.parser")
        text = soup.get_text(separator=" | ", strip=True)

        def extract(label: str) -> str:
            if label + " | " in text:
                return text.split(label + " | ")[1].split(" | ")[0].strip()
            return ""

        title     = extract("質問件名")
        submitter = _normalize_shu(extract("提出者名"))
        faction   = extract("会派名")
        submitted = extract("質問主意書提出年月日")
        answered  = extract("答弁書受領年月日")

        if not title or not submitter:
            return None

        return {
            "id":           f"shitsumon-{session}-{number}",
            "session":      session,
            "number":       number,
            "title":        title,
            "submitter":    submitter,
            "faction":      faction,
            "submitted_at": submitted or None,
            "answered_at":  answered or None,
            "source_url":   url,
            "house":        "衆議院",
        }
    except Exception as e:
        logger.error("エラー session=%d number=%d: %s", session, number, e)
        return None


def collect_shugiin_questions() -> None:
    client = get_client()
    members_result = execute_with_retry(
        lambda: client.table("members").select("id, name").eq("house", "衆議院").limit(2000),
        label="fetch_shugiin_members",
    )
    members_data = members_result.data or []
    member_cache: dict[str, Optional[str]] = {}

    def find_member_id(name: str) -> Optional[str]:
        for m in members_data:
            if _normalize_shu(m["name"]) == name:
                return m["id"]
        return None

    extra_sessions: dict[int, int] = {}
    session_num = SESSION_MAX_NEXT_START
    consecutive_empty = 0
    while consecutive_empty < 2:
        probe = _scrape_shitsumon(session_num, 1)
        if probe is None:
            consecutive_empty += 1
        else:
            extra_sessions[session_num] = 9999
            consecutive_empty = 0
        session_num += 1
    if extra_sessions:
        logger.info("新セッション発見: %s", list(extra_sessions.keys()))

    all_sessions = {**SESSION_MAX, **extra_sessions}
    total_saved = 0

    for session, max_num in all_sessions.items():
        logger.info("第%d回国会 質問主意書を収集中...", session)
        for number in range(1, max_num + 1):
            data = _scrape_shitsumon(session, number)
            if data is None:
                if number > 10:
                    logger.info("第%d回: %d件で終了", session, number - 1)
                    break
                continue

            submitter = data["submitter"]
            if submitter not in member_cache:
                member_cache[submitter] = find_member_id(submitter)
            member_id = member_cache[submitter]

            execute_with_retry(
                lambda d=data, mid=member_id: client.table("questions").upsert({
                    "id":           d["id"],
                    "member_id":    mid,
                    "session":      d["session"],
                    "number":       d["number"],
                    "title":        d["title"],
                    "submitter":    d["submitter"],
                    "faction":      d["faction"],
                    "submitted_at": d["submitted_at"],
                    "answered_at":  d["answered_at"],
                    "source_url":   d["source_url"],
                    "house":        d["house"],
                }),
                label=f"upsert_q:{data['id']}",
            )
            total_saved += 1
            logger.info("  [%d-%03d] %s / %s", session, number, data["submitter"], data["title"][:30])
            time.sleep(0.8)

    logger.info("衆院質問主意書 収集完了: %d件", total_saved)


# ============================================================
# 参議院 質問主意書
# ============================================================

SANGIIN_BASE_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo"
SANGIIN_SESSIONS_BASE = list(range(196, 222))


def _get_sangiin_sessions() -> list[int]:
    sessions = SANGIIN_SESSIONS_BASE.copy()
    next_sess = max(sessions) + 1
    consecutive_missing = 0
    while consecutive_missing < 2:
        url = f"{SANGIIN_BASE_URL}/{next_sess}/syuisyo.htm"
        try:
            resp = requests.head(url, timeout=10)
            if resp.status_code == 200:
                sessions.append(next_sess)
                consecutive_missing = 0
                logger.info("新セッション発見: 第%d回", next_sess)
            else:
                consecutive_missing += 1
        except requests.RequestException:
            consecutive_missing += 1
        next_sess += 1
    return sessions


def _scrape_sangiin_session(session: int) -> list[dict[str, Any]]:
    url = f"{SANGIIN_BASE_URL}/{session}/syuisyo.htm"
    logger.info("Fetching session %d: %s", session, url)
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        logger.warning("Failed to fetch session %d: %s", session, exc)
        return []

    resp.encoding = resp.apparent_encoding or "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    rows: list[dict[str, Any]] = []

    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        num_match = re.search(r"(\d+)", tds[0].get_text(strip=True))
        if not num_match:
            continue
        question_number = int(num_match.group(1))

        title = tds[1].get_text(strip=True)
        question_url = ""
        title_link = tds[1].find("a")
        if title_link and title_link.get("href"):
            href = title_link["href"]
            question_url = href if href.startswith("http") else f"https://www.sangiin.go.jp{href}"

        submitter = tds[2].get_text(strip=True) if len(tds) > 2 else ""

        submitted_at = None
        if len(tds) > 3:
            date_match = re.search(r"(\d{4})[./年](\d{1,2})[./月](\d{1,2})", tds[3].get_text(strip=True))
            if date_match:
                y, m, d = date_match.groups()
                submitted_at = f"{y}-{int(m):02d}-{int(d):02d}"

        rows.append({
            "id":           f"sangiin-shitsumon-{session}-{question_number}",
            "member_id":    make_member_id("参議院", submitter) if submitter else None,
            "session":      session,
            "title":        title,
            "submitted_at": submitted_at,
            "url":          question_url,
        })

    logger.info("Session %d: found %d questions", session, len(rows))
    return rows


def collect_sangiin_questions(sessions: list[int] | None = None) -> None:
    sessions = sessions or _get_sangiin_sessions()
    client = get_client()
    member_ids = {
        m["id"]
        for m in (
            execute_with_retry(
                lambda: client.table("members").select("id").eq("house", "参議院").limit(2000),
                label="fetch_sangiin_members",
            ).data or []
        )
    }

    total_saved = 0
    for session in sessions:
        rows = _scrape_sangiin_session(session)
        valid_rows = [r for r in rows if r.get("member_id") in member_ids]
        if valid_rows:
            batch_upsert("sangiin_questions", valid_rows, on_conflict="id", label=f"sq:{session}")
            total_saved += len(valid_rows)
        time.sleep(1)

    logger.info("参院質問主意書 収集完了: %d件", total_saved)


def main() -> None:
    collect_shugiin_questions()
    collect_sangiin_questions()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Question collection failed")
        sys.exit(1)
