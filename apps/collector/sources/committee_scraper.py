import sys
import time
import logging
import httpx
from bs4 import BeautifulSoup

from db import get_client, execute_with_retry, batch_upsert

logger = logging.getLogger(__name__)

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


def main():
    client = get_client()

    # 衆議院議員を一括取得してキャッシュ
    logger.info("衆議院議員を取得中...")
    members_result = execute_with_retry(
        lambda: client.table("members").select("id, name").eq("house", "衆議院").limit(2000),
        label="fetch_shugiin_members",
    )
    member_map: dict[str, str] = {}
    for m in (members_result.data or []):
        key = normalize_name(m["name"])
        member_map[key] = m["id"]
    logger.info(f"衆議院議員: {len(member_map)}名")

    logger.info("委員会一覧を取得中...")
    committees = scrape_committee_list()
    logger.info(f"{len(committees)}件の委員会を発見")

    all_rows: list[dict] = []

    for c in committees:
        logger.info(f"収集中: {c['name']}")
        members = scrape_committee_members(c["name"], c["url"])
        logger.info(f"  → {len(members)}名")

        for m in members:
            name = m["name"]
            all_rows.append({
                "id":        f"shugiin-{c['name']}-{name}",
                "member_id": member_map.get(name),
                "name":      name,
                "committee": m["committee"],
                "role":      m["role"],
                "house":     "衆議院",
            })

        time.sleep(1.0)

    if all_rows:
        batch_upsert("committee_members", all_rows, on_conflict="id", label="shugiin_committee")
    logger.info(f"完了: 合計{len(all_rows)}件の委員会所属を登録")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Committee scraper (衆院) failed")
        sys.exit(1)