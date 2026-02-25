import os
import time
import logging
import httpx
from bs4 import BeautifulSoup
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

HEADERS  = {"User-Agent": "GiinWatch/1.0"}
BASE_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/syuisyo"
SESSIONS = list(range(208, 221))


def normalize_name(name: str) -> str:
    return name.replace("　", " ").replace("君", "").replace("さん", "").strip()


def build_member_map(client) -> dict:
    result = client.table("members").select("id, name").eq("house", "参議院").execute()
    member_map = {}
    for m in result.data:
        key = m["name"].replace(" ", "").replace("　", "").strip()
        member_map[key] = m["id"]
        if "[" in m["name"]:
            short = m["name"].split("[")[0]
            key2 = short.replace(" ", "").replace("　", "").strip()
            member_map[key2] = m["id"]
    logger.info(f"参議院議員マップ: {len(member_map)}名")
    return member_map


def get_question_links(session: int) -> list:
    url  = f"{BASE_URL}/{session}/syuisyo.htm"
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")

    links = []
    for a in soup.select("a"):
        href = a.get("href", "")
        text = a.get_text(strip=True)
        if href.startswith("meisai/m") and href.endswith(".htm"):
            num = href.replace("meisai/m", "").replace(".htm", "").replace(str(session), "")
            links.append({
                "title":  text,
                "url":    f"{BASE_URL}/{session}/{href}",
                "number": int(num) if num.isdigit() else 0,
            })
    return links


def scrape_detail(url: str) -> dict:
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(separator=" | ", strip=True)
    parts = text.split(" | ")

    result = {}
    for i, p in enumerate(parts):
        p = p.strip()
        if p == "提出者" and i + 1 < len(parts):
            result["submitter"] = normalize_name(parts[i + 1].strip())
        elif p == "提出日" and i + 1 < len(parts):
            result["submitted_at"] = parts[i + 1].strip()
        elif p == "答弁書受領日" and i + 1 < len(parts):
            result["answered_at"] = parts[i + 1].strip()
        elif p == "提出回次" and i + 1 < len(parts):
            result["session"] = parts[i + 1].strip().replace("回", "")
    return result


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client     = create_client(SUPABASE_URL, SUPABASE_KEY)
    member_map = build_member_map(client)

    total = 0

    for session in SESSIONS:
        logger.info(f"第{session}回国会を取得中...")
        links = get_question_links(session)
        logger.info(f"  {len(links)}件の質問主意書")

        for link in links:
            detail = scrape_detail(link["url"])
            submitter = detail.get("submitter", "")
            key       = submitter.replace(" ", "").replace("　", "").strip()
            member_id = member_map.get(key)

            row = {
                "id":           f"sangiin-{session}-{link['number']:03d}",
                "member_id":    member_id,
                "session":      session,
                "number":       link["number"],
                "title":        link["title"],
                "submitter":    submitter,
                "submitted_at": detail.get("submitted_at", ""),
                "answered_at":  detail.get("answered_at"),
                "source_url":   link["url"],
                "house":        "参議院",
            }
            client.table("questions").upsert(row).execute()
            total += 1

            if member_id:
                logger.info(f"  ✓ {submitter} / {link['title'][:30]}")
            else:
                logger.warning(f"  ✗ 未マッチ: {submitter} / {link['title'][:30]}")

            time.sleep(0.8)

    # question_countを更新
    logger.info("question_count を集計中...")
    members = client.table("members").select("id").eq("house", "参議院").execute()
    for m in members.data:
        result = client.table("questions").select("id", count="exact").eq("member_id", m["id"]).execute()
        count = result.count or 0
        if count > 0:
            client.table("members").update({"question_count": count}).eq("id", m["id"]).execute()

    logger.info(f"完了: 合計{total}件の質問主意書を登録")


if __name__ == "__main__":
    main()
