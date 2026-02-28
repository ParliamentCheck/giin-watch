import re
import time
import logging
import httpx
from typing import Optional
from bs4 import BeautifulSoup

# 共通モジュールからインポート
from config import SESSION_MAX
from db import get_client, execute_with_retry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HEADERS  = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
BASE_URL = "https://www.shugiin.go.jp/internet/itdb_shitsumon.nsf/html/shitsumon/"


def normalize_name(name: str) -> str:
    name = name.replace("\u3000", " ").replace("君", "").strip()
    return re.sub(r" +", " ", name)


def scrape_shitsumon(session: int, number: int) -> Optional[dict]:
    url = BASE_URL + f"{session}{number:03d}.htm"
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

        title      = extract("質問件名")
        submitter  = normalize_name(extract("提出者名"))
        faction    = extract("会派名")
        submitted  = extract("質問主意書提出年月日")
        answered   = extract("答弁書受領年月日")

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
        logger.error(f"エラー session={session} number={number}: {e}")
        return None


def find_member_id(name: str, house: str, members_data: list[dict]) -> Optional[str]:
    for m in members_data:
        if normalize_name(m["name"]) == name:
            return m["id"]
    return None


def main():
    client = get_client()

    # member_idキャッシュ（一度だけ取得）
    members_result = execute_with_retry(
        lambda: client.table("members").select("id, name").eq("house", "衆議院").limit(2000),
        label="fetch_shugiin_members",
    )
    members_data = members_result.data or []
    member_cache = {}

    total_saved = 0

    for session, max_num in SESSION_MAX.items():
        logger.info(f"第{session}回国会 質問主意書を収集中...")

        for number in range(1, max_num + 1):
            data = scrape_shitsumon(session, number)

            if data is None:
                if number > 10:
                    logger.info(f"第{session}回: {number - 1}件で終了")
                    break
                continue

            # 提出者のmember_idを取得
            submitter = data["submitter"]
            if submitter not in member_cache:
                member_cache[submitter] = find_member_id(submitter, data["house"], members_data)
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
                label=f"upsert_q:{d['id']}",
            )

            total_saved += 1
            logger.info(f"  [{session}-{number:03d}] {data['submitter']} / {data['title'][:30]}")
            time.sleep(0.8)

    # 質問主意書数の集計は run_scoring.py に任せる
    logger.info(f"収集完了: 合計{total_saved}件")


if __name__ == "__main__":
    main()
