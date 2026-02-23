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
HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}

SHUGIIN_BASE = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/"

# あ行〜わ行の全ページ
SHUGIIN_PAGES = {
    "あ行": "1giin.htm",
    "か行": "2giin.htm",
    "さ行": "3giin.htm",
    "た行": "4giin.htm",
    "な行": "5giin.htm",
    "は行": "6giin.htm",
    "ま行": "7giin.htm",
    "や行": "8giin.htm",
    "ら行": "9giin.htm",
    "わ行": "10giin.htm",
}

PARTY_MAP = {
    "自民": "自民党",
    "立憲": "立憲民主党",
    "公明": "公明党",
    "維新": "日本維新の会",
    "国民": "国民民主党",
    "共産": "共産党",
    "れいわ": "れいわ新選組",
    "社民": "社民党",
    "参政": "参政党",
    "無所属": "無所属",
}


def normalize_party(raw: str) -> str:
    raw = raw.strip()
    if not raw:
        return '無所属'
    for key, full in PARTY_MAP.items():
        if key in raw:
            return full
    # 1文字や明らかにおかしい値は無所属に
    if len(raw) <= 1:
        return '無所属'
    return raw


def scrape_shugiin() -> list[dict]:
    """衆議院議員一覧を全ページ取得する"""
    logger.info("衆議院議員一覧を取得中...")
    members = []

    for row_label, page in SHUGIIN_PAGES.items():
        url = SHUGIIN_BASE + page
        try:
            resp = httpx.get(url, headers=HEADERS, timeout=30)
            resp.encoding = "shift_jis"
            soup = BeautifulSoup(resp.text, "html.parser")

            for row in soup.select("table tr"):
                cells = row.select("td")
                if len(cells) < 4:
                    continue
                name = cells[0].get_text(strip=True).replace("君", "").replace("\u3000", " ").strip()
                party = normalize_party(cells[2].get_text(strip=True))
                district = cells[3].get_text(strip=True)
                terms = cells[4].get_text(strip=True) if len(cells) > 4 else ""

                if not name or len(name) < 2 or name in ["氏名", "氏名ふりがな会派選挙区当選回数"]:
                    continue

                # 選挙区から都道府県を抽出
                prefecture = district.replace("(比)", "").strip()
                prefecture = prefecture.rstrip("0123456789")

                members.append({
                    "name":        name,
                    "party":       party,
                    "district":    district,
                    "prefecture":  prefecture,
                    "house":       "衆議院",
                    "terms":       terms,
                })

            logger.info(f"  {row_label}: {len([m for m in members])}名累計")
            time.sleep(1.0)

        except Exception as e:
            logger.error(f"{row_label} エラー: {e}")
            continue

    logger.info(f"衆議院 合計: {len(members)}名取得")
    return members


def scrape_sangiin() -> list[dict]:
    """参議院議員一覧を取得する"""
    logger.info("参議院議員一覧を取得中...")

    for session in range(217, 212, -1):
        url = f"https://www.sangiin.go.jp/japanese/joho1/kousei/giin/{session}/giin.htm"
        try:
            resp = httpx.get(url, headers=HEADERS, timeout=15)
            if resp.status_code != 200:
                time.sleep(0.5)
                continue

            resp.encoding = "utf-8"
            soup = BeautifulSoup(resp.text, "html.parser")
            members = []

            for row in soup.select("table tr"):
                cells = row.select("td")
                if len(cells) < 2:
                    continue
                name = cells[0].get_text(strip=True)
                party = normalize_party(cells[1].get_text(strip=True)) if len(cells) > 1 else "不明"
                district = cells[2].get_text(strip=True) if len(cells) > 2 else "不明"

                if not name or len(name) < 2 or name in ["氏名", "会派名"]:
                    continue

                members.append({
                    "name":       name,
                    "party":      party,
                    "district":   district,
                    "prefecture": district,
                    "house":      "参議院",
                })

            if members:
                logger.info(f"参議院 第{session}回国会: {len(members)}名取得")
                return members

        except Exception as e:
            logger.warning(f"セッション{session}エラー: {e}")
            continue

    logger.error("参議院URLが見つかりませんでした")
    return []


def register_members(members: list[dict], client):
    success = 0
    skip = 0

    for m in members:
        name = m.get("name", "").strip()
        if not name:
            continue

        member_id = f"{m['house']}-{name}"

        try:
            terms_raw = m.get("terms", "")
            try:
                terms = int("".join(filter(str.isdigit, terms_raw.split("(")[0])) or "0")
            except:
                terms = None

            client.table("members").upsert({
                "id":         member_id,
                "name":       name,
                "party":      m.get("party", "不明"),
                "house":      m["house"],
                "district":   m.get("district", "不明"),
                "prefecture": m.get("prefecture", "不明"),
                "terms":      terms,
                "is_active":  True,
            }).execute()
            success += 1

        except Exception as e:
            logger.warning(f"登録スキップ {name}: {e}")
            skip += 1

    logger.info(f"登録完了: {success}名成功 / {skip}名スキップ")


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    shugiin = scrape_shugiin()
    if shugiin:
        register_members(shugiin, client)

    time.sleep(2)

    sangiin = scrape_sangiin()
    if sangiin:
        register_members(sangiin, client)

    result = client.table("members").select("id", count="exact").execute()
    logger.info(f"DB登録済み議員数: {result.count}名")


if __name__ == "__main__":
    main()