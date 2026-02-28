import re
import time
import logging
import httpx
from bs4 import BeautifulSoup

# 共通モジュールからインポート
from config import PARTY_MAP, PARTY_MAP_KEYS_SORTED
from db import get_client, execute_with_retry, batch_upsert
from utils import make_member_id, normalize_party, parse_terms

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
SANGIIN_BASE = "https://www.sangiin.go.jp/japanese/joho1/kousei/giin"
SHUGIIN_BASE = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/"


def scrape_profile(profile_url: str) -> dict:
    try:
        resp = httpx.get(profile_url, headers=HEADERS, timeout=20)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')
        text = soup.get_text(separator=' | ', strip=True)

        # 会派（生データをそのまま保存）
        faction = '無所属'
        if '所属会派 |' in text:
            faction = text.split('所属会派 |')[1].split('|')[0].strip()

        # 政党（共通モジュールで変換）
        party = normalize_party(faction)

        # 選挙区
        district = '不明'
        if '選挙区・比例区' in text:
            raw = text.split('選挙区・比例区')[1]
            district = raw.split('|')[1].strip().split('／')[0].strip() if '|' in raw else '不明'

        # 当選回数（共通モジュールで解析）
        terms = None
        m = re.search(r"当選\s*(\d+)\s*回", text)
        if m:
            terms = int(m.group(1))

        return {"party": party, "faction": faction, "district": district, "terms": terms}

    except Exception as e:
        logger.warning(f"プロフィール取得エラー {profile_url}: {e}")
        return {"party": "無所属", "faction": "無所属", "district": "不明", "terms": None}


def scrape_sangiin() -> list[dict]:
    logger.info("参議院議員一覧を取得中...")
    url = f"{SANGIIN_BASE}/221/giin.htm"
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'html.parser')

    members = []
    links = soup.select('a[href*=profile]')
    logger.info(f"プロフィールリンク: {len(links)}件")

    for i, link in enumerate(links):
        name = link.get_text(strip=True).replace('\u3000', ' ').strip()
        if not name or len(name) < 2:
            continue

        profile_path = link.get('href', '').split('/')[-1]
        profile_url = f"{SANGIIN_BASE}/profile/{profile_path}"
        detail = scrape_profile(profile_url)

        members.append({
            "name":       name,
            "party":      detail["party"],
            "faction":    detail["faction"],
            "district":   detail["district"],
            "prefecture": detail["district"],
            "house":      "参議院",
            "terms":      detail.get("terms"),
            "source_url": profile_url,
        })

        logger.info(f"[{i+1}/{len(links)}] {name} / {detail['faction']} / {detail['party']} / {detail['district']}")
        time.sleep(1.0)

    return members


def scrape_shugiin() -> list[dict]:
    logger.info("衆議院議員一覧を取得中...")
    members = []

    for i in range(1, 11):
        url = SHUGIIN_BASE + f'{i}giin.htm'
        resp = httpx.get(url, headers=HEADERS, timeout=30)
        resp.encoding = 'shift_jis'
        soup = BeautifulSoup(resp.text, 'html.parser')

        for row in soup.select('table tr'):
            cells = row.select('td')
            if len(cells) < 4:
                continue
            name = cells[0].get_text(strip=True).replace('君', '').replace('\u3000', ' ').strip()
            if not name or len(name) < 2 or '氏名' in name or '行' in name:
                continue
            faction = cells[2].get_text(strip=True)
            party   = normalize_party(faction)
            district = cells[3].get_text(strip=True)
            terms_raw = cells[4].get_text(strip=True) if len(cells) > 4 else '0'
            terms = parse_terms(terms_raw)

            members.append({
                "name":       name,
                "party":      party,
                "faction":    faction,
                "district":   district,
                "prefecture": district.replace('(比)', '').replace('（比）', '').rstrip('0123456789').strip(),
                "house":      "衆議院",
                "terms":      terms,
            })

        logger.info(f"ページ{i}完了")
        time.sleep(1.0)

    logger.info(f"衆議院 合計: {len(members)}名取得")
    return members


def register_members(members: list[dict]) -> None:
    rows = []
    for m in members:
        name = m.get("name", "").strip()
        if not name:
            continue
        rows.append({
            "id":         make_member_id(m["house"], name),
            "name":       name,
            "party":      m.get("party", "無所属"),
            "faction":    m.get("faction"),
            "house":      m["house"],
            "district":   m.get("district", "不明"),
            "prefecture": m.get("prefecture", "不明"),
            "terms":      m.get("terms"),
            "source_url": m.get("source_url"),
            "is_active":  True,
        })

    if rows:
        batch_upsert("members", rows, on_conflict="id", label="register_members")
    logger.info(f"登録完了: {len(rows)}名")


def main():
    client = get_client()

    # 全員を一旦 is_active=false にして、スクレイプで見つかった議員だけ true に戻す
    execute_with_retry(
        lambda: client.table("members").update({"is_active": False}).eq("house", "衆議院"),
        label="reset_shugiin",
    )
    execute_with_retry(
        lambda: client.table("members").update({"is_active": False}).eq("house", "参議院"),
        label="reset_sangiin",
    )
    logger.info("全議員の is_active を false にリセットしました")

    shugiin = scrape_shugiin()
    if shugiin:
        register_members(shugiin)

    time.sleep(2)

    sangiin = scrape_sangiin()
    if sangiin:
        register_members(sangiin)

    shugiin_count = execute_with_retry(
        lambda: client.table('members').select('id', count='exact').eq('house', '衆議院'),
        label="count_shugiin",
    )
    sangiin_count = execute_with_retry(
        lambda: client.table('members').select('id', count='exact').eq('house', '参議院'),
        label="count_sangiin",
    )
    total = execute_with_retry(
        lambda: client.table('members').select('id', count='exact'),
        label="count_total",
    )
    logger.info(f"衆議院: {shugiin_count.count}名")
    logger.info(f"参議院: {sangiin_count.count}名")
    logger.info(f"DB合計: {total.count}名")


if __name__ == "__main__":
    main()
