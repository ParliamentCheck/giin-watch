"""
内閣閣僚・副大臣・大臣政務官の役職データ自動取得
首相官邸サイトから動的にURLを取得し、議員DBに紐付ける
"""
import re
import logging
import httpx
from bs4 import BeautifulSoup

# 共通モジュールからインポート
from db import get_client, execute_with_retry

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

KANTEI_BASE = "https://www.kantei.go.jp"
HEADERS = {"User-Agent": "Mozilla/5.0"}

# 官邸サイトのひらがな・異表記 → DB表記のエイリアス
NAME_ALIASES: dict[str, str] = {
    "牧野たかお": "牧野京夫",
    "友納理緒": "土肥理緒",  # 公称名→戸籍名（参議院登録名）
}

# 旧字→新字マッピング（必要に応じて追加）
KANJI_MAP = {
    "邉": "辺", "邊": "辺", "齋": "斎", "齊": "斎",
    "髙": "高", "﨑": "崎", "國": "国", "櫻": "桜",
    "澤": "沢", "濱": "浜", "廣": "広", "壽": "寿",
    "實": "実", "惠": "恵", "藏": "蔵", "鷗": "鴎",
}


def normalize_name(name: str) -> str:
    """名前を正規化（スペース除去、旧字→新字変換）"""
    name = name.replace(" ", "").replace("\u3000", "").strip()
    for old, new in KANJI_MAP.items():
        name = name.replace(old, new)
    return name


def find_cabinet_url():
    """官邸トップから現在の内閣ディレクトリ名を動的に取得"""
    r = httpx.get(KANTEI_BASE + "/", headers=HEADERS, timeout=30, follow_redirects=True)
    soup = BeautifulSoup(r.text, "html.parser")
    candidates = set()
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        m = re.search(r"/jp/(\d+[^/]*)/", href)
        if m:
            candidates.add(m.group(1))
    if not candidates:
        return None
    best = max(candidates, key=lambda x: int(re.match(r"(\d+)", x).group(1)))
    return best


def scrape_meibo(cabinet_num: str) -> list[dict]:
    """閣僚・副大臣・政務官の名簿を取得"""
    pages = {
        "index.html": "大臣",
        "fukudaijin.html": "副大臣",
        "seimukan.html": "大臣政務官",
    }
    results = []

    for page, category in pages.items():
        url = f"{KANTEI_BASE}/jp/{cabinet_num}/meibo/{page}"
        logger.info(f"取得中: {url}")
        try:
            r = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
            r.encoding = "utf-8"
            soup = BeautifulSoup(r.text, "html.parser")
        except Exception as e:
            logger.error(f"ページ取得エラー {url}: {e}")
            continue

        # <li> ごとにパース：「役職（3スペース以上）姓 名（ふりがな）」
        for li in soup.find_all("li"):
            li_text = li.get_text()
            parts = re.split(r"\s{3,}", li_text.strip())
            if len(parts) < 2:
                continue
            role_part = parts[0].strip()
            if not re.search(r"大臣|長官|補佐官|政務官", role_part):
                continue
            name_match = None
            for part in parts[1:]:
                m = re.match(r"([^\s　（]{1,8})\s+([^\s　（]{1,8})\s*（([ぁ-んァ-ンー\s　]+)）", part.strip())
                if m:
                    name_match = m
                    break
            if not name_match:
                continue
            name = name_match.group(1) + name_match.group(2)
            results.append({"name": name, "post": role_part, "category": category})
            logger.info(f"  {role_part}: {name}")

    return results


def build_member_map(client) -> dict:
    """議員名 → member_id のマッピングを構築（name・alias_name 両方を登録）"""
    result = execute_with_retry(
        lambda: client.table("members").select("id, name, alias_name").eq("is_active", True).limit(2000),
        label="fetch_members_for_cabinet",
    )
    member_map = {}
    for m in result.data:
        norm = normalize_name(m["name"])
        member_map[norm] = m["id"]
        # alias_name（通称名）も検索対象に追加
        if m.get("alias_name"):
            member_map[normalize_name(m["alias_name"])] = m["id"]
        # 旧形式 "通称名[本名]" を name に入れていた場合の後方互換
        if "[" in m["name"]:
            real = m["name"].split("[")[1].rstrip("]")
            member_map[normalize_name(real)] = m["id"]
            short = m["name"].split("[")[0]
            member_map[normalize_name(short)] = m["id"]
    return member_map


def main():
    client = get_client()

    # 内閣番号を動的取得
    cabinet_num = find_cabinet_url()
    if not cabinet_num:
        logger.error("内閣番号を取得できませんでした")
        return
    logger.info(f"内閣番号: {cabinet_num}")

    # 名簿スクレイピング
    posts = scrape_meibo(cabinet_num)
    logger.info(f"取得した役職数: {len(posts)}")
    if len(posts) < 10:
        raise RuntimeError(
            f"スクレイピング件数が異常に少ない ({len(posts)}件) — "
            "官邸サイトの構造変更の可能性があります。cabinet_scraper.py を確認してください。"
        )

    # 議員マップ構築
    member_map = build_member_map(client)
    logger.info(f"議員マップ: {len(member_map)}名")

    # まず全議員のcabinet_postをクリア
    execute_with_retry(
        lambda: client.table("members").update({"cabinet_post": None}).neq("cabinet_post", "dummy_never_match"),
        label="clear_cabinet_post",
    )

    # マッチングして更新
    matched = 0
    unmatched = []
    for p in posts:
        norm = normalize_name(NAME_ALIASES.get(p["name"], p["name"]))
        member_id = member_map.get(norm)
        if member_id:
            execute_with_retry(
                lambda mid=member_id, post=p["post"]: client.table("members").update({"cabinet_post": post}).eq("id", mid),
                label=f"update_cabinet:{member_id}",
            )
            matched += 1
        else:
            unmatched.append(f"{p['post']}: {p['name']}")
            logger.warning(f"マッチング失敗: {p['post']} - {p['name']}")

    logger.info(f"完了: マッチ{matched}名 / 未マッチ{len(unmatched)}名")
    if unmatched:
        logger.warning(f"未マッチ一覧:\n" + "\n".join(unmatched))
    if matched < 5:
        raise RuntimeError(
            f"議員名マッチング件数が異常に少ない ({matched}名) — "
            "議員データとの不整合またはスクレイピング異常の可能性があります。"
        )


if __name__ == "__main__":
    main()
