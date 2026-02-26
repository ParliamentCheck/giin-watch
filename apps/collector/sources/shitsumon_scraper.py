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
BASE_URL = "https://www.shugiin.go.jp/internet/itdb_shitsumon.nsf/html/shitsumon/"

# セッションごとの最大件数（定期的に更新が必要）
SESSION_MAX = {
    196: 487,
    197: 145,
    198: 309,
    199: 20,
    200: 186,
    201: 276,
    202: 31,
    203: 83,
    204: 236,
    205: 22,
    206: 22,
    207: 42,
    208: 156,
    209: 41,
    210: 68,
    211: 156,
    212: 141,
    213: 206,
    214: 56,
    215: 51,
    216: 107,
    217: 352,
    218: 21,
    219: 205,
    220: 8,
    221: 300,
}


def normalize_name(name: str) -> str:
    import re
    name = name.replace("　", " ").replace("君", "").strip()
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

    # member_idキャッシュ
    member_cache = {}

    total_saved = 0

    for session, max_num in SESSION_MAX.items():
        logger.info(f"第{session}回国会 質問主意書を収集中...")

        for number in range(1, max_num + 1):
            data = scrape_shitsumon(session, number)

            if data is None:
                if number > 10:  # 10件以上取得後に404なら終了
                    logger.info(f"第{session}回: {number - 1}件で終了")
                    break
                continue

            # 提出者のmember_idを取得
            submitter = data["submitter"]
            if submitter not in member_cache:
                member_cache[submitter] = find_member_id(submitter, data["house"], client)
            member_id = member_cache[submitter]

            client.table("questions").upsert({
                "id":           data["id"],
                "member_id":    member_id,
                "session":      data["session"],
                "number":       data["number"],
                "title":        data["title"],
                "submitter":    data["submitter"],
                "faction":      data["faction"],
                "submitted_at": data["submitted_at"],
                "answered_at":  data["answered_at"],
                "source_url":   data["source_url"],
                "house":        data["house"],
            }).execute()

            total_saved += 1
            logger.info(f"  [{session}-{number:03d}] {data['submitter']} / {data['title'][:30]}")
            time.sleep(0.8)

    # 議員ごとの質問主意書数を集計
    logger.info("質問主意書数を集計中...")
    members = client.table("members").select("id").execute()
    for m in members.data:
        count = client.table("questions").select("id", count="exact").eq("member_id", m["id"]).execute()
        if count.count and count.count > 0:
            client.table("members").update({
                "question_count": count.count
            }).eq("id", m["id"]).execute()

    logger.info(f"収集完了: 合計{total_saved}件")


if __name__ == "__main__":
    main()