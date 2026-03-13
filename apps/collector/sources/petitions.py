"""
はたらく議員 — 請願収集
衆議院・参議院の請願データを収集する。

  衆議院 → petitions テーブル
  参議院 → sangiin_petitions テーブル
"""

from __future__ import annotations

import logging
import re
import sys
import time
from typing import Optional

import requests
from bs4 import BeautifulSoup

from db import get_client, execute_with_retry, batch_upsert
from utils import make_member_id

logger = logging.getLogger("petitions")

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}

ERA_BASE: dict[str, int] = {"令和": 2018, "平成": 1988, "昭和": 1925}

SHUGIIN_SEIGAN_BASE = "https://www.shugiin.go.jp/internet/itdb_seigan.nsf/html/seigan/"
SANGIIN_SEIGAN_BASE = "https://www.sangiin.go.jp/japanese/joho1/kousei/seigan"

# 既知のセッション範囲
SHUGIIN_PETITION_SESSIONS = list(range(196, 222))
SANGIIN_PETITION_SESSIONS = list(range(196, 222))


# ============================================================
# 共通ユーティリティ
# ============================================================

def _parse_japanese_date(text: str) -> Optional[str]:
    """「令和8年3月6日」→「2026-03-06」"""
    match = re.search(r"(令和|平成|昭和)(\d+)年(\d{1,2})月(\d{1,2})日", text)
    if not match:
        return None
    era, year, month, day = match.groups()
    ad_year = ERA_BASE[era] + int(year)
    return f"{ad_year}-{int(month):02d}-{int(day):02d}"


# ============================================================
# 衆議院 請願
# ============================================================

def _normalize_shugiin_name(raw: str) -> str:
    """「受理番号 1264号  新垣　邦男君」→「新垣邦男」"""
    raw = re.sub(r"受理番号\s*\d+号\s*", "", raw)
    raw = re.sub(r"(君|さん)\s*$", "", raw.strip())
    return re.sub(r"[\s\u3000]+", "", raw)


def _get_shugiin_sessions() -> list[int]:
    sessions = SHUGIIN_PETITION_SESSIONS.copy()
    next_sess = max(sessions) + 1
    consecutive_missing = 0
    while consecutive_missing < 2:
        url = f"{SHUGIIN_SEIGAN_BASE}{next_sess}_l.htm"
        try:
            resp = requests.head(url, headers=HEADERS, timeout=10)
            if resp.status_code == 200:
                sessions.append(next_sess)
                consecutive_missing = 0
                logger.info("新セッション発見(衆院): 第%d回", next_sess)
            else:
                consecutive_missing += 1
        except requests.RequestException:
            consecutive_missing += 1
        next_sess += 1
    return sessions


def _scrape_shugiin_list(session: int) -> list[dict]:
    """{number, committee_name} のリストを返す。"""
    url = f"{SHUGIIN_SEIGAN_BASE}{session}_l.htm"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code != 200:
            return []
        resp.encoding = "shift_jis"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning("衆院請願一覧取得失敗 session=%d: %s", session, e)
        return []

    items = []
    for table in soup.find_all("table"):
        caption = table.find("caption")
        committee = caption.get_text(strip=True).replace("の一覧", "").strip() if caption else ""
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if not tds:
                continue
            link = tds[0].find("a")
            if not link:
                continue
            num_match = re.search(r"(\d+)", link.get_text(strip=True))
            if not num_match:
                continue
            items.append({"number": int(num_match.group(1)), "committee_name": committee})

    logger.info("衆院 第%d回: 請願 %d件", session, len(items))
    return items


def _scrape_shugiin_detail(session: int, number: int) -> Optional[dict]:
    """詳細ページからタイトル・結果・紹介議員一覧を取得する。"""
    url = f"{SHUGIIN_SEIGAN_BASE}{session}{number:04d}.htm"
    try:
        resp = requests.get(url, headers=HEADERS, timeout=20)
        if resp.status_code != 200:
            return None
        resp.encoding = "shift_jis"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning("衆院請願詳細取得失敗 session=%d number=%d: %s", session, number, e)
        return None

    # テーブルの key→value 抽出
    fields: dict[str, any] = {}
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) >= 2:
            key = tds[0].get_text(strip=True)
            fields[key] = tds[1]

    title_cell = fields.get("請願件名")
    if not title_cell:
        return None
    title = title_cell.get_text(strip=True)
    if not title:
        return None

    # 付託委員会（詳細ページの値が正確）
    committee_cell = fields.get("付託委員会")
    committee_name = committee_cell.get_text(strip=True) if committee_cell else None

    # 結果（「審査未了」「審査未了　令和5年6月21日」等）
    result_cell = fields.get("結果／年月日")
    result_text = result_cell.get_text(strip=True) if result_cell else ""
    result_date = _parse_japanese_date(result_text)
    result = re.sub(r"(令和|平成|昭和)\d+年\d+月\d+日.*$", "", result_text).strip() or None

    # 紹介議員一覧
    intro_cell = fields.get("紹介議員一覧")
    introducer_names: list[str] = []
    if intro_cell:
        for line in intro_cell.get_text(separator="\n").split("\n"):
            name = _normalize_shugiin_name(line.strip())
            if len(name) >= 2:
                introducer_names.append(name)

    return {
        "title":            title,
        "committee_name":   committee_name,
        "result":           result,
        "result_date":      result_date,
        "introducer_names": introducer_names,
        "source_url":       url,
    }


def collect_shugiin_petitions(full: bool = False) -> None:
    """
    full=False（日次）: 直近2セッションのみ対象。
    full=True（バックフィル）: 全セッションを再収集。
    """
    client = get_client()
    members_data = execute_with_retry(
        lambda: client.table("members").select("id").eq("house", "衆議院").limit(2000),
        label="fetch_shugiin_members",
    ).data or []
    member_ids_set = {m["id"] for m in members_data}

    sessions = _get_shugiin_sessions()
    if not full:
        sessions = sessions[-2:]
        logger.info("日次モード: 衆院セッション %s のみ対象", sessions)

    total_saved = 0
    for session in sessions:
        items = _scrape_shugiin_list(session)
        if not items:
            time.sleep(1)
            continue

        records = []
        for item in items:
            detail = _scrape_shugiin_detail(session, item["number"])
            if not detail:
                time.sleep(0.5)
                continue

            introducer_ids = [
                make_member_id("衆議院", n)
                for n in detail["introducer_names"]
                if make_member_id("衆議院", n) in member_ids_set
            ]

            records.append({
                "id":               f"shugi-{session}-{item['number']}",
                "session":          session,
                "number":           item["number"],
                "title":            detail["title"],
                "committee_name":   detail["committee_name"] or item["committee_name"],
                "result":           detail["result"],
                "result_date":      detail["result_date"],
                "introducer_ids":   introducer_ids or None,
                "introducer_names": detail["introducer_names"] or None,
                "source_url":       detail["source_url"],
            })
            time.sleep(0.5)

        if records:
            # 同一セッション内で同じIDが重複する場合は後勝ちで1件にまとめる
            deduped = {r["id"]: r for r in records}
            if len(deduped) < len(records):
                logger.warning("衆院請願: 重複ID %d件を除去 (session=%d)", len(records) - len(deduped), session)
            batch_upsert("petitions", list(deduped.values()), on_conflict="id", label=f"petitions:shugi:{session}")
            total_saved += len(deduped)
        logger.info("衆院 第%d回: %d件保存", session, len(records))

    logger.info("衆院請願 収集完了: 合計%d件", total_saved)


# ============================================================
# 参議院 請願
# ============================================================

def _get_sangiin_sessions() -> list[int]:
    sessions = SANGIIN_PETITION_SESSIONS.copy()
    next_sess = max(sessions) + 1
    consecutive_missing = 0
    while consecutive_missing < 2:
        url = f"{SANGIIN_SEIGAN_BASE}/{next_sess}/seigan.htm"
        try:
            resp = requests.head(url, timeout=10)
            if resp.status_code == 200:
                sessions.append(next_sess)
                consecutive_missing = 0
                logger.info("新セッション発見(参院): 第%d回", next_sess)
            else:
                consecutive_missing += 1
        except requests.RequestException:
            consecutive_missing += 1
        next_sess += 1
    return sessions


def _scrape_sangiin_list(session: int) -> list[dict]:
    """{number, title, futaku_url} のリストを返す。"""
    url = f"{SANGIIN_SEIGAN_BASE}/{session}/seigan.htm"
    try:
        resp = requests.get(url, timeout=20)
        if resp.status_code != 200:
            return []
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning("参院請願一覧取得失敗 session=%d: %s", session, e)
        return []

    items = []
    seen_numbers = set()
    for tr in soup.find_all("tr"):
        tds = tr.find_all("td")
        if len(tds) < 3:
            continue
        num_match = re.search(r"(\d+)", tds[0].get_text(strip=True))
        if not num_match:
            continue
        number = int(num_match.group(1))
        # yousiリンクが存在する行のみ対象（付託済み請願のみ・未付託は除外）
        yousi_link = tds[1].find("a")
        if not yousi_link or not yousi_link.get("href"):
            continue
        yousi_href = yousi_link["href"]
        yousi_url = yousi_href if yousi_href.startswith("http") else f"{SANGIIN_SEIGAN_BASE}/{session}/{yousi_href.lstrip('./')}"
        title = tds[1].get_text(strip=True)
        futaku_link = tds[2].find("a")
        if not futaku_link or not futaku_link.get("href"):
            continue
        href = futaku_link["href"]
        if href.startswith("http"):
            futaku_url = href
        else:
            clean = href.lstrip("./")
            futaku_url = f"{SANGIIN_SEIGAN_BASE}/{session}/{clean}"
        if number in seen_numbers:
            continue
        seen_numbers.add(number)
        items.append({"number": number, "title": title, "futaku_url": futaku_url, "yousi_url": yousi_url})

    logger.info("参院 第%d回: 請願 %d件", session, len(items))
    return items


def _scrape_sangiin_futaku(futaku_url: str) -> Optional[dict]:
    """futakuページから委員会名・結果・紹介議員リストを取得する。"""
    try:
        resp = requests.get(futaku_url, timeout=20)
        if resp.status_code != 200:
            return None
        resp.encoding = resp.apparent_encoding or "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning("参院futaku取得失敗 %s: %s", futaku_url, e)
        return None

    # 委員会名: 「委員会」「審査会」を含む短いテキスト要素を探す
    committee_name = ""
    for tag in soup.find_all(["h1", "h2", "h3", "h4", "caption", "strong", "b"]):
        text = tag.get_text(strip=True)
        if ("委員会" in text or "審査会" in text) and len(text) < 40:
            committee_name = text
            break
    if not committee_name:
        for line in soup.get_text().split("\n"):
            line = line.strip()
            if line and ("委員会" in line or "審査会" in line) and len(line) < 40:
                committee_name = line
                break

    # 紹介議員テーブルをパース
    # 列: 受理番号 | 紹介議員 | 会派 | 受理年月日 | 付託年月日 | 結果
    introducer_names: list[str] = []
    result: Optional[str] = None
    result_date: Optional[str] = None

    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True) for th in table.find_all("th")]
        if "紹介議員" not in headers:
            continue
        name_idx   = headers.index("紹介議員")
        result_idx = headers.index("結果")       if "結果"      in headers else -1
        date_idx   = headers.index("付託年月日") if "付託年月日" in headers else -1

        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) <= name_idx:
                continue
            name = re.sub(r"[\s\u3000]+", "", tds[name_idx].get_text(strip=True))
            if len(name) >= 2:
                introducer_names.append(name)
            if result_idx >= 0 and result is None and len(tds) > result_idx:
                r = tds[result_idx].get_text(strip=True)
                if r:
                    result = r
            if date_idx >= 0 and result_date is None and len(tds) > date_idx:
                result_date = _parse_japanese_date(tds[date_idx].get_text(strip=True))
        break  # 最初の紹介議員テーブルのみ

    return {
        "committee_name":   committee_name,
        "result":           result,
        "result_date":      result_date,
        "introducer_names": introducer_names,
    }


def collect_sangiin_petitions(full: bool = False) -> None:
    """
    full=False（日次）: 直近2セッションのみ対象。
    full=True（バックフィル）: 全セッションを再収集。
    """
    client = get_client()
    members_data = execute_with_retry(
        lambda: client.table("members").select("id").eq("house", "参議院").limit(2000),
        label="fetch_sangiin_members",
    ).data or []
    member_ids_set = {m["id"] for m in members_data}

    sessions = _get_sangiin_sessions()
    if not full:
        sessions = sessions[-2:]
        logger.info("日次モード: 参院セッション %s のみ対象", sessions)

    total_saved = 0
    for session in sessions:
        items = _scrape_sangiin_list(session)
        if not items:
            time.sleep(1)
            continue

        records = []
        for item in items:
            futaku = _scrape_sangiin_futaku(item["futaku_url"])
            if not futaku:
                time.sleep(0.5)
                continue

            introducer_ids = [
                make_member_id("参議院", n)
                for n in futaku["introducer_names"]
                if make_member_id("参議院", n) in member_ids_set
            ]

            records.append({
                "id":               f"sangi-{session}-{item['number']}",
                "session":          session,
                "number":           item["number"],
                "title":            item["title"],
                "committee_name":   futaku["committee_name"],
                "result":           futaku["result"],
                "result_date":      futaku["result_date"],
                "introducer_ids":   introducer_ids or None,
                "introducer_names": futaku["introducer_names"] or None,
                "source_url":       item["yousi_url"],
            })
            time.sleep(0.5)

        if records:
            # 同一セッション内で同じIDが重複する場合は後勝ちで1件にまとめる
            deduped = {r["id"]: r for r in records}
            if len(deduped) < len(records):
                logger.warning("参院請願: 重複ID %d件を除去 (session=%d)", len(records) - len(deduped), session)
            batch_upsert("sangiin_petitions", list(deduped.values()), on_conflict="id", label=f"petitions:sangi:{session}")
            total_saved += len(records)

            # yousiリンクなしで登録された旧レコードのsource_urlをNULLに修正
            valid_ids = set(deduped.keys())
            existing = execute_with_retry(
                lambda: client.table("sangiin_petitions")
                    .select("id")
                    .eq("session", session)
                    .not_.is_("source_url", "null"),
                label=f"fetch_existing_sangi:{session}",
            ).data or []
            stale_ids = [r["id"] for r in existing if r["id"] not in valid_ids]
            if stale_ids:
                for sid in stale_ids:
                    execute_with_retry(
                        lambda sid=sid: client.table("sangiin_petitions")
                            .update({"source_url": None})
                            .eq("id", sid),
                        label=f"null_source_url:{sid}",
                    )
                logger.info("参院 第%d回: source_url無効 %d件をNULLに修正", session, len(stale_ids))

        logger.info("参院 第%d回: %d件保存", session, len(records))

    logger.info("参院請願 収集完了: 合計%d件", total_saved)


def main() -> None:
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--full", action="store_true", help="全セッションを再収集（バックフィル用）")
    args = parser.parse_args()
    collect_shugiin_petitions(full=args.full)
    collect_sangiin_petitions(full=args.full)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Petition collection failed")
        sys.exit(1)
