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

# 衆議院公式サイトの会派登録と実際の党籍が異なる議員の手動補正
# 理由: 会派結成に必要な人数（5名以上）を満たさない少数政党は
#       衆議院サイト上で「無所属」扱いになるため
PARTY_OVERRIDES: dict[str, str] = {
    "衆議院-河村たかし": "減税日本・ゆうこく連合",  # 小選挙区当選、会派未満のため無所属登録
    "衆議院-山本ジョージ": "れいわ新選組",           # 比例当選、会派未満のため無所属登録
}


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

        election_type = "比例" if "比例" in district else "選挙区"
        return {"party": party, "faction": faction, "district": district, "terms": terms, "election_type": election_type}

    except Exception as e:
        logger.warning(f"プロフィール取得エラー {profile_url}: {e}")
        return {"party": "無所属", "faction": "無所属", "district": "不明", "terms": None}


def get_current_sangiin_session() -> int:
    """参議院サイトから最新の国会回次を動的に取得する。"""
    session = 221  # 既知の最新回次
    while True:
        url = f"{SANGIIN_BASE}/{session + 1}/giin.htm"
        try:
            resp = httpx.head(url, headers=HEADERS, timeout=10)
            if resp.status_code == 200:
                session += 1
            else:
                break
        except Exception:
            break
    return session


def _split_name_parts(text: str) -> list[str]:
    """全角スペース・半角スペース・改行で分割してパーツを返す"""
    return [p for p in re.split(r'[\u3000\n\s]+', text.strip()) if p]


def scrape_sangiin() -> list[dict]:
    logger.info("参議院議員一覧を取得中...")
    current_session = get_current_sangiin_session()
    logger.info("参議院 現在の国会回次: 第%d回", current_session)
    url = f"{SANGIIN_BASE}/{current_session}/giin.htm"
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    resp.encoding = 'utf-8'
    soup = BeautifulSoup(resp.text, 'html.parser')

    # 一覧テーブルから姓名・読みの分割データを先に収集
    # テーブル構造: cells[0]=氏名（全角SP区切り）, cells[1]=読み（全角SP区切り）
    name_split_map: dict[str, dict] = {}  # 正規化済み氏名 → {last, first, last_r, first_r}
    for row in soup.select('table tr'):
        cells = row.find_all('td')
        if len(cells) != 6:
            continue
        raw_name    = cells[0].get_text(strip=False)
        raw_reading = cells[1].get_text(strip=True)
        if not re.search(r'[\u4e00-\u9fff\u3400-\u4dbf]', raw_name):
            continue
        bracket = re.search(r'\[(.+?)\]', raw_name)
        if bracket:
            name_parts = _split_name_parts(bracket.group(1))
        else:
            name_parts = _split_name_parts(raw_name)
        reading_parts = _split_name_parts(raw_reading)
        if len(name_parts) >= 2 and len(reading_parts) >= 2:
            key = re.sub(r'\s+', '', name_parts[0] + ''.join(name_parts[1:]))
            name_split_map[key] = {
                "last_name":          name_parts[0],
                "first_name":         ''.join(name_parts[1:]),
                "last_name_reading":  reading_parts[0],
                "first_name_reading": ''.join(reading_parts[1:]),
            }

    members = []
    links = soup.select('a[href*=profile]')
    logger.info(f"プロフィールリンク: {len(links)}件")

    for i, link in enumerate(links):
        raw_name = link.get_text(strip=True).replace('\u3000', ' ').strip()
        if not raw_name or len(raw_name) < 2:
            continue

        # 参院サイトは "通称名[本名]" または "よみがな[漢字名]" 形式で表示する場合がある
        # → ID・name は漢字本名（ブラケット内）に統一
        # → ブラケット前の表示名は alias_name として保存（通称名・公称名）
        bracket = re.search(r"\[(.+?)\]", raw_name)
        if bracket:
            name = bracket.group(1).strip()
            display = re.sub(r"\[.+?\]", "", raw_name).strip()
            # 通称名かよみがなかを判定：平仮名のみなら読み仮名として alias_name には入れない
            is_kana_only = bool(re.match(r"^[ぁ-んァ-ンー\s　]+$", display))
            alias_name = None if is_kana_only else display
            ndl_names = [name, display] if display else [name]
        else:
            name = re.sub(r"\s+", "", raw_name)
            alias_name = None
            ndl_names = [name]

        profile_path = link.get('href', '').split('/')[-1]
        profile_url = f"{SANGIIN_BASE}/profile/{profile_path}"
        detail = scrape_profile(profile_url)

        split = name_split_map.get(re.sub(r'\s+', '', name), {})
        members.append({
            "name":               name,
            "alias_name":         alias_name,
            "party":              detail["party"],
            "faction":            detail["faction"],
            "district":           detail["district"],
            "prefecture":         detail["district"],
            "house":              "参議院",
            "terms":              detail.get("terms"),
            "source_url":         profile_url,
            "ndl_names":          ndl_names,
            "election_type":      detail.get("election_type"),
            "last_name":          split.get("last_name"),
            "first_name":         split.get("first_name"),
            "last_name_reading":  split.get("last_name_reading"),
            "first_name_reading": split.get("first_name_reading"),
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
            name = cells[0].get_text(strip=False).replace('\u3000', ' ').strip()
            name = re.sub(r'君\s*$', '', name)  # 末尾の「君」のみ除去（名前中の「君」は保持）
            if not name or len(name) < 2 or '氏名' in name or '行' in name:
                continue

            # ふりがな列（cells[1]）から姓名を分割
            raw_reading = cells[1].get_text(strip=False) if len(cells) > 1 else ''
            name_parts    = _split_name_parts(name)
            reading_parts = _split_name_parts(raw_reading)
            if len(name_parts) >= 2 and len(reading_parts) >= 2:
                last_name          = name_parts[0]
                first_name         = ''.join(name_parts[1:])
                last_name_reading  = reading_parts[0]
                first_name_reading = ''.join(reading_parts[1:])
            else:
                last_name = first_name = last_name_reading = first_name_reading = None

            # nameはスペースを除去して格納
            name = re.sub(r'\s+', '', name)

            faction = cells[2].get_text(strip=True)
            party   = normalize_party(faction)
            district = cells[3].get_text(strip=True)
            terms_raw = cells[4].get_text(strip=True) if len(cells) > 4 else '0'
            terms = parse_terms(terms_raw)
            election_type = "比例" if "(比)" in district or "（比）" in district else "小選挙区"

            members.append({
                "name":               name,
                "party":              party,
                "faction":            faction,
                "district":           district,
                "prefecture":         district.replace('(比)', '').replace('（比）', '').rstrip('0123456789').strip(),
                "house":              "衆議院",
                "terms":              terms,
                "election_type":      election_type,
                "last_name":          last_name,
                "first_name":         first_name,
                "last_name_reading":  last_name_reading,
                "first_name_reading": first_name_reading,
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
            "id":                 make_member_id(m["house"], name),
            "name":               name,
            "alias_name":         m.get("alias_name"),
            "party":              m.get("party", "無所属"),
            "faction":            m.get("faction"),
            "house":              m["house"],
            "district":           m.get("district", "不明"),
            "prefecture":         m.get("prefecture", "不明"),
            "terms":              m.get("terms"),
            "source_url":         m.get("source_url"),
            "is_active":          True,
            "election_type":      m.get("election_type"),
            "last_name":          m.get("last_name"),
            "first_name":         m.get("first_name"),
            "last_name_reading":  m.get("last_name_reading"),
            "first_name_reading": m.get("first_name_reading"),
        })

    # 手動補正を適用
    for row in rows:
        if row["id"] in PARTY_OVERRIDES:
            original = row["party"]
            row["party"] = PARTY_OVERRIDES[row["id"]]
            logger.info(f"党籍補正: {row['name']} {original} → {row['party']}")

    if rows:
        batch_upsert("members", rows, on_conflict="id", label="register_members")
    logger.info(f"登録完了: {len(rows)}名")


def main():
    client = get_client()

    # 先にスクレイプして、取得成功した院だけリセット→登録する
    # （スクレイプ失敗時に is_active を壊さないため）
    shugiin = scrape_shugiin()
    time.sleep(2)
    sangiin = scrape_sangiin()

    if len(shugiin) >= 400:
        execute_with_retry(
            lambda: client.table("members").update({"is_active": False}).eq("house", "衆議院"),
            label="reset_shugiin",
        )
        register_members(shugiin)
    else:
        raise RuntimeError(
            f"衆院スクレイピング件数が異常 ({len(shugiin)}名、期待値 400名以上) — "
            "is_active をリセットしません。衆院サイトの構造変更の可能性があります。"
        )

    if len(sangiin) >= 200:
        execute_with_retry(
            lambda: client.table("members").update({"is_active": False}).eq("house", "参議院"),
            label="reset_sangiin",
        )
        register_members(sangiin)
    else:
        raise RuntimeError(
            f"参院スクレイピング件数が異常 ({len(sangiin)}名、期待値 200名以上) — "
            "is_active をリセットしません。参院サイトの構造変更の可能性があります。"
        )

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
