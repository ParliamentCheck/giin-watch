"""
はたらく議員 — 委員会所属収集
衆議院・参議院の委員会所属データを収集し committee_members テーブルに保存する。
"""

from __future__ import annotations

import logging
import sys
import time

import httpx
from bs4 import BeautifulSoup

from db import get_client, execute_with_retry, batch_upsert

logger = logging.getLogger("committees")

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}


# ============================================================
# 衆議院 委員会
# ============================================================

SHUGIIN_BASE_URL = "https://www.shugiin.go.jp/Internet/itdb_iinkai.nsf/html/iinkai/"
SHUGIIN_LIST_URL = SHUGIIN_BASE_URL + "list.htm"


def _normalize_shu(name: str) -> str:
    return name.replace("　", " ").replace("君", "").replace("\u3000", " ").strip()


def _scrape_shugiin_list() -> list[dict]:
    resp = httpx.get(SHUGIIN_LIST_URL, headers=HEADERS, timeout=30)
    resp.encoding = "shift_jis"
    soup = BeautifulSoup(resp.text, "html.parser")
    return [
        {"name": link.get_text(strip=True), "url": SHUGIIN_BASE_URL + link.get("href", "")}
        for link in soup.select("a")
        if "iin_j" in link.get("href", "") and link.get_text(strip=True)
    ]


def _scrape_shugiin_members(committee_name: str, url: str) -> list[dict]:
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        return []
    resp.encoding = "shift_jis"
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(separator=" | ", strip=True)

    members = []
    parts = text.split(" | ")
    i = 0
    while i < len(parts):
        part = parts[i].strip()
        if part in ["委員長", "委員", "理事", "会長", "副会長"]:
            role = part
            if i + 1 < len(parts):
                name = _normalize_shu(parts[i + 1])
                if name and len(name) > 1 and "君" in parts[i + 1]:
                    members.append({"name": name, "role": role, "committee": committee_name})
            i += 4
        else:
            i += 1
    return members


def collect_shugiin_committees() -> None:
    client = get_client()
    logger.info("衆議院議員を取得中...")
    member_map: dict[str, str] = {
        _normalize_shu(m["name"]): m["id"]
        for m in (
            execute_with_retry(
                lambda: client.table("members").select("id, name").eq("house", "衆議院").limit(2000),
                label="fetch_shugiin_members",
            ).data or []
        )
    }
    logger.info("衆議院議員: %d名", len(member_map))

    committees = _scrape_shugiin_list()
    logger.info("%d件の委員会を発見", len(committees))

    all_rows: list[dict] = []
    for c in committees:
        logger.info("収集中: %s", c["name"])
        members = _scrape_shugiin_members(c["name"], c["url"])
        logger.info("  → %d名", len(members))
        for m in members:
            all_rows.append({
                "member_id": member_map.get(m["name"]),
                "name":      m["name"],
                "committee": m["committee"],
                "role":      m["role"],
                "house":     "衆議院",
            })
        time.sleep(1.0)

    if all_rows:
        batch_upsert("committee_members", all_rows, on_conflict="member_id,committee,role", label="shugiin_committee")
    logger.info("衆院委員会 完了: %d件", len(all_rows))


# ============================================================
# 参議院 委員会
# ============================================================

SANGIIN_INDEX_URL = "https://www.sangiin.go.jp/japanese/kon_kokkaijyoho/index.html"
SANGIIN_BASE_URL  = "https://www.sangiin.go.jp/japanese/joho1/kousei/konkokkai/current/list/"

SANGIIN_EXCLUDE = {
    "参議院審議中継", "今国会情報", "氏名", "ライブラリー", "議案情報", "会議録情報",
    "請願", "質問主意書", "参議院公報", "議員情報", "English", "キッズページ",
    "国際関係", "調査室作成資料", "トップ", "利用案内", "著作権", "免責事項",
}


def _normalize_san(name: str) -> str:
    return name.replace("　", " ").replace("\u3000", " ").replace("＜正字＞", "").strip()


def _get_sangiin_urls() -> list[str]:
    resp = httpx.get(SANGIIN_INDEX_URL, headers=HEADERS, timeout=30)
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    seen: set[str] = set()
    urls: list[str] = []
    for link in soup.select("a"):
        href = link.get("href", "")
        if "list/l0" in href:
            filename = href.split("/")[-1]
            if filename not in seen:
                seen.add(filename)
                urls.append(SANGIIN_BASE_URL + filename)
    return urls


def _scrape_sangiin_committee(url: str) -> tuple[str, list[dict]]:
    resp = httpx.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        return "", []
    resp.encoding = "utf-8"
    soup = BeautifulSoup(resp.text, "html.parser")
    text = soup.get_text(separator=" | ", strip=True)

    committee_name = ""
    for line in text.split(" | "):
        if "委員会" in line or "調査会" in line or "審査会" in line:
            name = line.replace("参議院", "").strip()
            if 2 < len(name) < 20:
                committee_name = name
                break

    members: list[dict] = []
    parts = text.split(" | ")
    i = 0
    while i < len(parts):
        part = parts[i].strip()
        if part in ["委員長", "理事", "会長", "副会長"]:
            role = part
            if i + 1 < len(parts):
                name = _normalize_san(parts[i + 1])
                if name and 2 <= len(name) <= 12 and "（" not in name and name not in SANGIIN_EXCLUDE:
                    members.append({"name": name, "role": role})
            i += 3
        elif (
            2 <= len(part) <= 12
            and "（" not in part
            and i + 1 < len(parts)
            and parts[i + 1].strip().startswith("（")
            and part not in SANGIIN_EXCLUDE
        ):
            members.append({"name": _normalize_san(part), "role": "委員"})
            i += 2
        else:
            i += 1

    return committee_name, members


def collect_sangiin_committees() -> None:
    client = get_client()
    logger.info("参議院議員を取得中...")
    member_map: dict[str, str] = {}
    for m in (
        execute_with_retry(
            lambda: client.table("members").select("id, name").eq("house", "参議院").limit(2000),
            label="fetch_sangiin_members",
        ).data or []
    ):
        key = m["name"].replace(" ", "").replace("　", "").strip()
        member_map[key] = m["id"]
    logger.info("参議院議員: %d名", len(member_map))

    urls = _get_sangiin_urls()
    logger.info("%d件の委員会を発見", len(urls))

    all_rows: list[dict] = []
    for url in urls:
        committee_name, members = _scrape_sangiin_committee(url)
        if committee_name:
            committee_name = committee_name.replace("委員名簿：", "").replace("委員名簿", "").strip()
        if not committee_name or not members:
            logger.warning("スキップ: %s", url)
            time.sleep(0.5)
            continue
        logger.info("%s: %d名", committee_name, len(members))
        for m in members:
            key = m["name"].replace(" ", "").replace("　", "").strip()
            all_rows.append({
                "member_id": member_map.get(key),
                "name":      m["name"],
                "committee": committee_name,
                "role":      m["role"],
                "house":     "参議院",
            })
        time.sleep(1.0)

    if all_rows:
        batch_upsert("committee_members", all_rows, on_conflict="member_id,committee,role", label="sangiin_committee")
    logger.info("参院委員会 完了: %d件", len(all_rows))


def main() -> None:
    collect_shugiin_committees()
    collect_sangiin_committees()


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Committee collection failed")
        sys.exit(1)
