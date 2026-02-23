import os, time, logging, httpx
from bs4 import BeautifulSoup
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
SANGIIN_BASE = "https://www.sangiin.go.jp/japanese/joho1/kousei/giin"

PARTY_MAP = {
    '自由民主': '自民党', '自民': '自民党',
    '立憲民主': '立憲民主党', '立憲': '立憲民主党',
    '公明': '公明党',
    '日本維新': '日本維新の会', '維新': '日本維新の会',
    '国民民主': '国民民主党', '国民': '国民民主党',
    '日本共産': '共産党', '共産': '共産党',
    'れいわ': 'れいわ新選組',
    '社会民主': '社民党', '社民': '社民党',
    '参政': '参政党',
    'チームみらい': 'チームみらい',
    '日本保守': '日本保守党',
    '沖縄の風': '沖縄の風',
    '中道改革連合': '中道改革連合',
    '中道': '中道改革連合',
    '有志': '有志の会',
    '各派に属しない': '無所属',
    '無所属': '無所属',
}

def normalize_party(raw: str) -> str:
    raw = raw.strip()
    if not raw or len(raw) <= 1:
        return '無所属'
    for key, full in PARTY_MAP.items():
        if key in raw:
            return full
    return raw

def scrape_profile(profile_url: str) -> dict:
    try:
        resp = httpx.get(profile_url, headers=HEADERS, timeout=20)
        resp.encoding = 'utf-8'
        soup = BeautifulSoup(resp.text, 'html.parser')
        text = soup.get_text(separator=' | ', strip=True)

        party = '無所属'
        if '所属会派 |' in text:
            raw = text.split('所属会派 |')[1].split('|')[0].strip()
            party = normalize_party(raw)

        district = '不明'
        if '選挙区・比例区' in text:
            raw = text.split('選挙区・比例区')[1]
            raw = raw.split('|')[1].strip() if '|' in raw else '不明'
            district = raw.split('／')[0].strip()

        return {"party": party, "district": district}

    except Exception as e:
        logger.warning(f"プロフィール取得エラー {profile_url}: {e}")
        return {"party": "無所属", "district": "不明"}

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
            "district":   detail["district"],
            "prefecture": detail["district"],
            "house":      "参議院",
            "source_url": profile_url,
        })

        logger.info(f"[{i+1}/{len(links)}] {name} / {detail['party']} / {detail['district']}")
        time.sleep(1.0)

    return members

def register_members(members: list[dict], client):
    success = 0
    for m in members:
        name = m.get("name", "").strip()
        if not name:
            continue
        try:
            client.table("members").upsert({
                "id":         f"{m['house']}-{name}",
                "name":       name,
                "party":      m.get("party", "無所属"),
                "house":      m["house"],
                "district":   m.get("district", "不明"),
                "prefecture": m.get("prefecture", "不明"),
                "source_url": m.get("source_url"),
                "is_active":  True,
            }).execute()
            success += 1
        except Exception as e:
            logger.warning(f"登録スキップ {name}: {e}")

    logger.info(f"登録完了: {success}名")

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 参議院を全削除して入れ直し
    client.table('members').delete().eq('house', '参議院').execute()
    logger.info("参議院データを削除しました")

    sangiin = scrape_sangiin()
    if sangiin:
        register_members(sangiin, client)

    result = client.table('members').select('id', count='exact').execute()
    logger.info(f"DB合計: {result.count}名")

if __name__ == "__main__":
    main()