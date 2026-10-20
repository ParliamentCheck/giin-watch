import re
import time
import logging
from datetime import date

import httpx
from bs4 import BeautifulSoup

# 共通モジュールからインポート
from config import PARTY_MAP, PARTY_MAP_KEYS_SORTED
from db import get_client, execute_with_retry, batch_upsert
from utils import make_member_id, parse_terms

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
SANGIIN_BASE = "https://www.sangiin.go.jp/japanese/joho1/kousei/giin"
SHUGIIN_BASE = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/syu/"
# 会派の正式名と略称の公式一覧
SHUGIIN_KAIHA_URL = "https://www.shugiin.go.jp/internet/itdb_annai.nsf/html/statics/shiryo/kaiha_m.htm"
SANGIIN_KAIHA_URL = SANGIIN_BASE + "/kaiha/kaiha{session}.htm"
# 衆院の議員名簿では会派に属さない議員の略称が「無」、会派一覧では正式名「無所属」・略称空欄
SHUGIIN_NO_FACTION_SHORT = "無"
SHUGIIN_NO_FACTION_NAME = "無所属"

# 衆議院公式サイトの会派登録と実際の党籍が異なる議員の手動補正
# 理由: 会派結成に必要な人数（5名以上）を満たさない少数政党は
#       衆議院サイト上で「無所属」扱いになるため
PARTY_OVERRIDES: dict[str, str] = {
    "衆議院-河村たかし": "減税日本・ゆうこく連合",  # 小選挙区当選、会派未満のため無所属登録
    "衆議院-山本ジョージ": "いのちの党",             # 比例当選、会派未満のため無所属登録（れいわ新選組は2026年8月に「いのちの党」へ党名変更）
}
# ※ 会派への移行（設計書 claude/design_kaiha_v1.md）の F4 で party 列ごと廃止予定。


def _decode(resp: httpx.Response) -> str:
    """衆院は Shift_JIS（拡張文字のため cp932 で読む）、参院は UTF-8。"""
    for enc in ("utf-8", "cp932"):
        try:
            return resp.content.decode(enc)
        except UnicodeDecodeError:
            continue
    return resp.content.decode("cp932", errors="replace")


def fetch_shugiin_factions() -> list[tuple[str, str]]:
    """衆院の会派一覧から (正式名, 略称) を返す。取得できない場合は例外（推測で埋めない）。"""
    resp = httpx.get(SHUGIIN_KAIHA_URL, headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(_decode(resp), "html.parser")
    rows: list[tuple[str, str]] = []
    for tr in soup.select("table tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if len(cells) != 3 or not re.search(r"\d", cells[2]):
            continue
        name, short = cells[0], cells[1]
        if name in ("計", "欠員"):
            continue
        rows.append((name, short))
    if len(rows) < 3:
        raise RuntimeError(f"衆院の会派一覧を読めませんでした（{len(rows)}件）。ページ構造の変更の可能性があります。")
    return rows


def fetch_sangiin_factions(session: int) -> list[tuple[str, str]]:
    """参院の会派名一覧から (正式名, 略称) を返す。取得できない場合は例外。"""
    resp = httpx.get(SANGIIN_KAIHA_URL.format(session=session), headers=HEADERS, timeout=30)
    resp.raise_for_status()
    soup = BeautifulSoup(_decode(resp), "html.parser")
    rows: list[tuple[str, str]] = []
    for tr in soup.select("table tr"):
        cells = [td.get_text(" ", strip=True) for td in tr.find_all("td")]
        if len(cells) != 2 or not cells[0]:
            continue
        rows.append((cells[0], cells[1]))
    if len(rows) < 3:
        raise RuntimeError(f"参院の会派名一覧を読めませんでした（{len(rows)}件）。ページ構造の変更の可能性があります。")
    return rows


def party_for(faction: str) -> str:
    """移行期間中の party 列の値。

    既知の会派は従来どおり政党名に変換する。PARTY_MAP に当てはまらない会派は
    「無所属」に落とさず会派名をそのまま入れる（会派表示への移行方針に合わせ、誤った所属表示を避ける）。
    """
    if not faction:
        return "無所属"
    for key in PARTY_MAP_KEYS_SORTED:
        if key in faction:
            return PARTY_MAP[key]
    return faction


def parse_sangiin_district(text: str) -> tuple[str, str]:
    """参院プロフィールの「選挙区・比例区／当選年／当選回数／任期満了 | 通常選挙／選挙区（福岡県）選出／…」から
    (選挙区, 選挙の種別) を返す。読めない場合は ("不明", "")。
    """
    if "選挙区・比例区" not in text:
        return "不明", ""
    after = text.split("選挙区・比例区", 1)[1]
    value = after.split("|", 1)[1] if "|" in after else after
    for part in value.split("／"):
        part = part.strip()
        if not part.endswith("選出"):
            continue
        if "比例代表" in part:
            return "比例代表", "比例"
        m = re.search(r"選挙区（(.+?)）", part)
        if m:
            return m.group(1), "選挙区"
    return "不明", ""


def scrape_profile(profile_url: str) -> dict:
    """参院議員のプロフィールから会派・選挙区・当選回数を読む。

    取得に失敗した場合は既定値（無所属など）で埋めず例外にする。
    （一時的なエラーで所属が「無所属」に上書きされるのを防ぐ。議員一覧の取得は
    is_active のリセットより前に行うため、例外で止まっても既存のデータは壊れない）
    """
    last_error: Exception | None = None
    for attempt in range(3):
        try:
            resp = httpx.get(profile_url, headers=HEADERS, timeout=20)
            resp.raise_for_status()
            soup = BeautifulSoup(_decode(resp), 'html.parser')
            text = soup.get_text(separator=' | ', strip=True)
            if '所属会派 |' not in text:
                raise ValueError("所属会派の欄が見つかりません")
            # 会派（公式表記のまま保存）
            faction = text.split('所属会派 |')[1].split('|')[0].strip()
            district, election_type = parse_sangiin_district(text)
            terms = None
            m = re.search(r"当選\s*(\d+)\s*回", text)
            if m:
                terms = int(m.group(1))
            return {"party": party_for(faction), "faction": faction, "district": district,
                    "terms": terms, "election_type": election_type}
        except Exception as e:  # noqa: BLE001 — 再試行してから呼び出し元へ伝える
            last_error = e
            logger.warning(f"プロフィール取得エラー（{attempt + 1}/3） {profile_url}: {e}")
            time.sleep(3 * (attempt + 1))
    raise RuntimeError(f"参院プロフィールを取得できませんでした: {profile_url}: {last_error}")


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


def scrape_sangiin() -> tuple[list[dict], list[tuple[str, str]]]:
    logger.info("参議院議員一覧を取得中...")
    current_session = get_current_sangiin_session()
    logger.info("参議院 現在の国会回次: 第%d回", current_session)
    factions = fetch_sangiin_factions(current_session)
    formal_to_short = {name: short for name, short in factions}
    logger.info("参議院 会派: %s", ", ".join(f"{n}（{s}）" for n, s in factions))
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
            "faction_short":      formal_to_short.get(detail["faction"]),
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

        if detail["faction"] not in formal_to_short:
            logger.warning(f"会派名一覧にない会派: {name} / {detail['faction']}")
        logger.info(f"[{i+1}/{len(links)}] {name} / {detail['faction']} / {detail['party']} / {detail['district']}")
        time.sleep(1.0)

    return members, factions


def scrape_shugiin() -> tuple[list[dict], list[tuple[str, str]]]:
    logger.info("衆議院議員一覧を取得中...")
    factions = fetch_shugiin_factions()
    short_to_formal = {short: name for name, short in factions if short}
    short_to_formal[SHUGIIN_NO_FACTION_SHORT] = SHUGIIN_NO_FACTION_NAME
    logger.info("衆議院 会派: %s", ", ".join(f"{n}（{s or '略称なし'}）" for n, s in factions))
    members = []

    for i in range(1, 11):
        url = SHUGIIN_BASE + f'{i}giin.htm'
        resp = httpx.get(url, headers=HEADERS, timeout=30)
        soup = BeautifulSoup(_decode(resp), 'html.parser')  # Shift_JIS の拡張文字（髙・﨑など）のため cp932 で読む

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

            faction_short = cells[2].get_text(strip=True)
            faction = short_to_formal.get(faction_short)
            if faction is None:
                # 会派一覧にない略称：推測せず略称のまま保存し、警告を出す
                logger.warning(f"会派一覧にない略称: {name} / {faction_short}")
                faction = faction_short
            party   = party_for(faction)
            district = cells[3].get_text(strip=True)
            terms_raw = cells[4].get_text(strip=True) if len(cells) > 4 else '0'
            terms = parse_terms(terms_raw)
            election_type = "比例" if "(比)" in district or "（比）" in district else "小選挙区"

            members.append({
                "name":               name,
                "party":              party,
                "faction":            faction,
                "faction_short":      faction_short if faction_short != SHUGIIN_NO_FACTION_SHORT else None,
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
    return members, factions


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
            "faction_short":      m.get("faction_short"),
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
    return rows


def sync_factions(house: str, factions: list[tuple[str, str]]) -> None:
    """会派マスタを公式一覧に合わせる。first_seen_on は新規登録時のみ（既定値）入る。"""
    client = get_client()
    today = date.today().isoformat()
    rows = [{"house": house, "name": name, "short_name": short or None,
             "last_seen_on": today, "is_current": True} for name, short in factions]
    if house == "衆議院" and not any(n == SHUGIIN_NO_FACTION_NAME for n, _ in factions):
        rows.append({"house": house, "name": SHUGIIN_NO_FACTION_NAME, "short_name": None,
                     "last_seen_on": today, "is_current": True})
    batch_upsert("factions", rows, on_conflict="house,name", label=f"factions_{house}")
    current = [r["name"] for r in rows]
    existing = execute_with_retry(
        lambda: client.table("factions").select("name").eq("house", house).eq("is_current", True),
        label=f"fetch_factions_{house}",
    ).data or []
    for r in existing:
        if r["name"] not in current:
            execute_with_retry(
                lambda n=r["name"]: client.table("factions").update({"is_current": False})
                .eq("house", house).eq("name", n),
                label=f"retire_faction_{house}",
            )
            logger.info(f"会派一覧から外れた会派: {house} / {r['name']}")


def record_faction_changes(house: str, rows: list[dict]) -> None:
    """名簿上の会派の変化を member_faction_history（source='roster'）に記録する。

    start_on / end_on は「当サイトが名簿で変化を確認した日」。初回は確認できた日から始まる。
    """
    client = get_client()
    today = date.today().isoformat()
    open_rows = execute_with_retry(
        lambda: client.table("member_faction_history")
        .select("id, member_id, faction_name")
        .eq("house", house).eq("source", "roster").is_("end_on", "null")
        .limit(2000),
        label=f"fetch_open_roster_{house}",
    ).data or []
    open_by_member = {r["member_id"]: r for r in open_rows}
    current = {r["id"]: r.get("faction") for r in rows if r.get("faction")}

    to_close: list[int] = []
    to_insert: list[dict] = []
    for member_id, faction in current.items():
        prev = open_by_member.get(member_id)
        if prev and prev["faction_name"] == faction:
            continue
        if prev:
            to_close.append(prev["id"])
        to_insert.append({"member_id": member_id, "house": house, "faction_name": faction,
                          "source": "roster", "start_on": today})
    # 名簿から外れた議員（任期満了・辞職等）は所属期間を閉じる
    for member_id, prev in open_by_member.items():
        if member_id not in current:
            to_close.append(prev["id"])

    for row_id in to_close:
        execute_with_retry(
            lambda rid=row_id: client.table("member_faction_history").update({"end_on": today}).eq("id", rid),
            label="close_roster_history",
        )
    if to_insert:
        batch_upsert("member_faction_history", to_insert,
                     on_conflict="member_id,house,faction_name,source,start_on", label=f"roster_history_{house}")
    logger.info(f"{house} 会派履歴: 新規・変更 {len(to_insert)}件 / 終了 {len(to_close)}件")


def main():
    client = get_client()

    # 先にスクレイプして、取得成功した院だけリセット→登録する
    # （スクレイプ失敗時に is_active を壊さないため）
    shugiin, shugiin_factions = scrape_shugiin()
    time.sleep(2)
    sangiin, sangiin_factions = scrape_sangiin()

    if len(shugiin) >= 400:
        execute_with_retry(
            lambda: client.table("members").update({"is_active": False}).eq("house", "衆議院"),
            label="reset_shugiin",
        )
        shugiin_rows = register_members(shugiin)
        sync_factions("衆議院", shugiin_factions)
        record_faction_changes("衆議院", shugiin_rows)
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
        sangiin_rows = register_members(sangiin)
        sync_factions("参議院", sangiin_factions)
        record_faction_changes("参議院", sangiin_rows)
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
