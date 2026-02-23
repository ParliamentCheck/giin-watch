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

HEADERS   = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
INDEX_URL = "https://www.sangiin.go.jp/japanese/kon_kokkaijyoho/index.html"
BASE_URL  = "https://www.sangiin.go.jp/japanese/joho1/kousei/konkokkai/current/list/"


def normalize_name(name: str) -> str:
    return name.replace("　", " ").replace("\u3000", " ").replace("＜正字＞", "").strip()


def get_committee_urls() -> list:
    """今国会情報トップから全委員会URLを取得する"""
    resp = httpx.get(INDEX_URL, headers=HEADERS, timeout=30)
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    seen = set()
    committees = []
    for link in soup.select("a"):
        href = link.get("href", "")
        if "list/l0" in href:
            filename = href.split("/")[-1]
            if filename not in seen:
                seen.add(filename)
                committees.append(BASE_URL + filename)

    return committees


EXCLUDE = {
    "参議院審議中継", "今国会情報", "氏名", "ライブラリー", "議案情報", "会議録情報",
    "請願", "質問主意書", "参議院公報", "議員情報", "English", "キッズページ",
    "国際関係", "調査室作成資料", "トップ", "利用案内", "著作権", "免責事項",
}


def scrape_committee(url: str) -> tuple:
    """委員会ページから委員会名と委員一覧を取得する"""
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        return None, []
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(separator=" | ", strip=True)

    # 委員会名を取得
    committee_name = ""
    for line in text.split(" | "):
        if "委員会" in line or "調査会" in line or "審査会" in line:
            name = line.replace("参議院", "").strip()
            if 2 < len(name) < 20:
                committee_name = name
                break

    members = []
    parts = text.split(" | ")
    i = 0
    while i < len(parts):
        part = parts[i].strip()
        if part in ["委員長", "理事", "会長", "副会長"]:
            role = part
            if i + 1 < len(parts):
                name = normalize_name(parts[i + 1])
                if name and 2 <= len(name) <= 12 and "（" not in name and name not in EXCLUDE:
                    members.append({"name": name, "role": role})
            i += 3
        elif (2 <= len(part) <= 12
              and "（" not in part
              and i + 1 < len(parts)
              and parts[i + 1].strip().startswith("（")
              and part not in EXCLUDE):
            name = normalize_name(part)
            members.append({"name": name, "role": "委員"})
            i += 2
        else:
            i += 1

    return committee_name, members


def find_member_id(name: str, member_map: dict) -> Optional[str]:
    key = name.replace(" ", "").replace("　", "").strip()
    return member_map.get(key)


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 参議院議員をキャッシュ（スペース除去で正規化）
    logger.info("参議院議員を取得中...")
    members = client.table("members").select("id, name").eq("house", "参議院").execute()
    member_map = {}
    for m in members.data:
        key = m["name"].replace(" ", "").replace("　", "").strip()
        member_map[key] = m["id"]
    logger.info(f"参議院議員: {len(member_map)}名")

    # 委員会URL一覧を取得
    logger.info("委員会一覧を取得中...")
    urls = get_committee_urls()
    logger.info(f"{len(urls)}件の委員会を発見")

    total_saved = 0

    for url in urls:
        committee_name, members_list = scrape_committee(url)
        if not committee_name or not members_list:
            logger.warning(f"スキップ: {url}")
            time.sleep(0.5)
            continue

        logger.info(f"{committee_name}: {len(members_list)}名")

        for m in members_list:
            member_id = find_member_id(m["name"], member_map)
            client.table("committee_members").upsert({
                "id":        f"sangiin-{committee_name}-{m['name']}",
                "member_id": member_id,
                "name":      m["name"],
                "committee": committee_name,
                "role":      m["role"],
                "house":     "参議院",
            }).execute()
            total_saved += 1

        time.sleep(1.0)

    logger.info(f"完了: 合計{total_saved}件の委員会所属を登録")


if __name__ == "__main__":
    main()