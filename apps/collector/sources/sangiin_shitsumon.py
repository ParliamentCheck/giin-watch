"""
はたらく議員 — 参議院質問主意書スクレイパー
参議院サイトから質問主意書データを取得して sangiin_questions テーブルに保存する。

参議院質問主意書一覧: https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo/{session}/syuisyo.htm
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

logger = logging.getLogger("sangiin_shitsumon")

BASE_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo"

# 対象セッション範囲（必要に応じて拡張）
SANGIIN_SESSIONS = list(range(196, 222))  # 196回〜221回


def scrape_session(session: int) -> list[dict[str, Any]]:
    """特定セッションの質問主意書一覧をスクレイピングする。"""
    url = f"{BASE_URL}/{session}/syuisyo.htm"
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

    # テーブル内の各行を解析
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue

        # 番号
        num_text = tds[0].get_text(strip=True)
        num_match = re.search(r"(\d+)", num_text)
        if not num_match:
            continue
        question_number = int(num_match.group(1))

        # タイトル（リンクから）
        title_link = tds[1].find("a")
        title = tds[1].get_text(strip=True)
        question_url = ""
        if title_link and title_link.get("href"):
            href = title_link["href"]
            if not href.startswith("http"):
                question_url = f"https://www.sangiin.go.jp{href}"
            else:
                question_url = href

        # 提出者
        submitter = tds[2].get_text(strip=True) if len(tds) > 2 else ""

        # 提出日（あれば）
        submitted_at = None
        if len(tds) > 3:
            date_text = tds[3].get_text(strip=True)
            date_match = re.search(r"(\d{4})[./年](\d{1,2})[./月](\d{1,2})", date_text)
            if date_match:
                y, m, d = date_match.groups()
                submitted_at = f"{y}-{int(m):02d}-{int(d):02d}"

        # member_id の生成
        member_id = make_member_id("参議院", submitter) if submitter else None

        question_id = f"sangiin-shitsumon-{session}-{question_number}"

        rows.append({
            "id": question_id,
            "member_id": member_id,
            "session": session,
            "title": title,
            "submitted_at": submitted_at,
            "url": question_url,
        })

    logger.info("Session %d: found %d questions", session, len(rows))
    return rows


def collect_sangiin_questions(sessions: list[int] | None = None) -> None:
    """全セッションの参議院質問主意書を収集する。"""
    sessions = sessions or SANGIIN_SESSIONS

    # members テーブルから参議院議員の id を取得して照合
    client = get_client()
    members = execute_with_retry(
        lambda: (
            client.table("members")
            .select("id")
            .eq("house", "参議院")
            .limit(2000)
        ),
        label="fetch_sangiin_members",
    ).data or []
    member_ids = {m["id"] for m in members}

    total_saved = 0
    for session in sessions:
        rows = scrape_session(session)
        # member_id が members に存在する行のみ保存
        valid_rows = [r for r in rows if r.get("member_id") in member_ids]
        orphan = len(rows) - len(valid_rows)
        if orphan > 0:
            logger.debug("Session %d: %d questions with unknown member_id", session, orphan)

        if valid_rows:
            batch_upsert("sangiin_questions", valid_rows, on_conflict="id", label=f"sq:{session}")
            total_saved += len(valid_rows)

        time.sleep(1)  # サーバー負荷軽減

    logger.info("Sangiin question collection complete. Saved %d.", total_saved)


if __name__ == "__main__":
    try:
        collect_sangiin_questions()
    except Exception:
        logger.exception("Sangiin question collection failed")
        sys.exit(1)
