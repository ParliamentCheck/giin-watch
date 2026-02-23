import os
import time
import logging
import httpx
from typing import Optional
from bs4 import BeautifulSoup
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

HEADERS  = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
BASE_URL = "https://www.shugiin.go.jp/Internet/itdb_iinkai.nsf/html/iinkai/"
LIST_URL = BASE_URL + "list.htm"


def normalize_name(name: str) -> str:
    return name.replace("　", " ").replace("君", "").replace("\u3000", " ").strip()


def scrape_committee_list() -> list:
    """委員会一覧ページから全委員会のURLを取得する"""
    resp = httpx.get(LIST_URL, headers=HEADERS, timeout=30)
    resp.encoding = "shift_jis"
    soup = BeautifulSoup(resp.text, "html.parser")

    committees = []
    for link in soup.select("a"):
        href = link.get("href", "")
        text = link.get_text(strip=True)
        if "iin_j" in href and text:
            committees.append({
                "name": text,
                "url":  BASE_URL + href,
            })
    return committees


def scrape_committee_members(committee_name: str, url: str) -> list:
    """委員会ページから委員一覧を取得する"""
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        return []
    resp.encoding = "shift_jis"
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(separator=" | ", strip=True)

    members = []
    # 「役職 | 氏名 | ふりがな | 会派」の形式で繰り返されるパターンを解析
    parts = text.split(" | ")
    i = 0
    while i < len(parts):
        part = parts[i].strip()
        if part in ["委員長", "委員", "理事", "会長", "副会長"]:
            role = part
            if i + 1 < len(parts):
                name = normalize_name(parts[i + 1])
                if name and len(name) > 1 and "君" in parts[i + 1]:
                    members.append({
                        "name":      name,
                        "role":      role,
                        "committee": committee_name,
                    })
            i += 4  # 役職・氏名・ふりがな・会派をスキップ
        else:
            i += 1

    return members


def find_member_id(name: str, house: str, client) -> Optional[str]:
    result = client.table("members").select("id, name").eq("house", house).execute()
    for m in result.data:
        if normalize_name(m["name"]) == name:
            return m["id"]
    return None


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    member_cache = {}

    logger.info("委員会一覧を取得中...")
    committees = scrape_committee_list()
    logger.info(f"{len(committees)}件の委員会を発見")

    total_saved = 0

    for c in committees:
        logger.info(f"収集中: {c['name']}")
        members = scrape_committee_members(c["name"], c["url"])
        logger.info(f"  → {len(members)}名")

        for m in members:
            name = m["name"]
            if name not in member_cache:
                member_cache[name] = find_member_id(name, "衆議院", client)
            member_id = member_cache[name]

            client.table("committee_members").upsert({
                "id":         f"shugiin-{c['name']}-{name}",
                "member_id":  member_id,
                "name":       name,
                "committee":  m["committee"],
                "role":       m["role"],
                "house":      "衆議院",
            }).execute()
            total_saved += 1

        time.sleep(1.0)

    logger.info(f"完了: 合計{total_saved}件の委員会所属を登録")


if __name__ == "__main__":
    main()