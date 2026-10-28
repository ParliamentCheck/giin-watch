"""
はたらく議員 — 参議院本会議投票結果スクレイパー
参議院サイトから各国会回次の投票結果を取得し、議員ごとの賛否を記録する。
衆議院は個人別投票記録が公開されていないため対象外。
"""

from __future__ import annotations

import argparse
import hashlib
import re
import time
import logging
import sys
import httpx
import requests
from bs4 import BeautifulSoup

from db import get_client, execute_with_retry, batch_upsert
from utils import build_name_to_id
from config import SESSION_MAX, NDL_HEADERS

logger = logging.getLogger("vote_scraper")
logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
SANGIIN_BASE = "https://www.sangiin.go.jp"

# バックフィル: 208回〜最新セッション（404は graceful skip）
BACKFILL_START_SESSION = 208


NDL_MEETING_LIST_API = "https://kokkai.ndl.go.jp/api/meeting_list"
_ndl_session_cache: dict[str, set[int] | None] = {}


def ndl_plenary_sessions(vote_date: str) -> set[int] | None:
    """国会会議録で、その日の参議院本会議の国会回次を返す。

    会議録が未公開（直近の会議）・取得失敗の場合は None（確認できない）。
    参院サイトには「第209回国会 2025年11月28日」のように回次を誤って掲載したページがあるため、
    国会会議録（公式記録）と照合して食い違うページは取り込まない。
    """
    if vote_date in _ndl_session_cache:
        return _ndl_session_cache[vote_date]
    params = {"nameOfHouse": "参議院", "nameOfMeeting": "本会議", "from": vote_date, "until": vote_date,
              "recordPacking": "json", "maximumRecords": 10}
    result: set[int] | None = None
    try:
        resp = requests.get(NDL_MEETING_LIST_API, params=params, headers=NDL_HEADERS, timeout=30)
        resp.raise_for_status()
        meetings = resp.json().get("meetingRecord", []) or []
        sessions = {int(m["session"]) for m in meetings if str(m.get("session", "")).isdigit()}
        result = sessions or None
    except Exception as exc:  # noqa: BLE001 — 確認できない場合は None
        logger.warning(f"  国会会議録で回次を確認できませんでした（{vote_date}）: {exc}")
    _ndl_session_cache[vote_date] = result
    return result


def normalize_name(name: str) -> str:
    name = name.replace("\u3000", " ").replace("\u3000", " ").strip()
    name = re.sub(r"\s+", " ", name)
    return name


def fetch_vote_index(session: int) -> list[dict]:
    url = f"{SANGIIN_BASE}/japanese/touhyoulist/{session}/vote_ind.htm"
    logger.info(f"Fetching vote index: {url}")
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=30)
        if resp.status_code == 404:
            logger.warning(f"Session {session}: vote index not found")
            return []
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning(f"Failed to fetch vote index session {session}: {e}")
        return []

    votes = []
    for a in soup.select("a[href]"):
        href = a.get("href", "")
        if re.search(rf"{session}-\d{{4}}-v\d{{3}}\.htm", href):
            text = a.get_text(strip=True)
            if href.startswith("http"):
                full_url = href
            elif href.startswith("/"):
                full_url = f"{SANGIIN_BASE}{href}"
            else:
                full_url = f"{SANGIIN_BASE}/japanese/touhyoulist/{session}/{href}"
            votes.append({
                "url": full_url,
                "title": text,
                "session": session,
            })

    logger.info(f"Session {session}: found {len(votes)} vote pages")
    return votes


def parse_vote_page(url: str, session: int, name_to_id: dict[str, str]) -> tuple[list[dict], list[dict]]:
    logger.info(f"  Parsing: {url}")
    try:
        resp = httpx.get(url, headers=HEADERS, timeout=30)
        resp.encoding = "utf-8"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception as e:
        logger.warning(f"  Failed to fetch {url}: {e}")
        return [], []

    # 案件名を取得
    bill_title = ""
    for dd in soup.select("dd"):
        text = dd.get_text(strip=True)
        if len(text) > 5 and "日程" in text:
            bill_title = re.sub(r"^日程第\S+\s*", "", text).strip()
            break
    if not bill_title:
        for dt in soup.find_all("dt"):
            if "案件名" in dt.get_text():
                dd = dt.find_next_sibling("dd")
                if dd:
                    bill_title = dd.get_text(strip=True)
                    break
    if not bill_title:
        h1 = soup.find("h1")
        if h1:
            bill_title = h1.get_text(strip=True)

    # 投票日を取得
    vote_date = None
    for h2 in soup.find_all("h2"):
        date_match = re.search(r"(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日", h2.get_text())
        if date_match:
            vote_date = f"{date_match.group(1)}-{int(date_match.group(2)):02d}-{int(date_match.group(3)):02d}"
            break

    if not bill_title:
        logger.warning(f"  Could not extract bill title from {url}")
        return [], []

    vote_key = url.rsplit("/", 1)[-1].removesuffix(".htm")  # 例: 221-0323-v008

    # 回次の照合（参院サイトの掲載誤りを取り込まない）
    if vote_date:
        ndl_sessions = ndl_plenary_sessions(vote_date)
        if ndl_sessions is not None and session not in ndl_sessions:
            logger.warning(
                f"  回次の不一致のため取り込みません: {url}（ページ: 第{session}回 {vote_date} / "
                f"国会会議録: 第{sorted(ndl_sessions)}回）"
            )
            return [], []

    # 議員ごとの賛否を取得
    # ページは会派ごとに区切られている:
    #   <h4 class="party">会派名( N名)</h4>
    #   <dl class="sanpilist"><dt>賛成票 X 反対票 Y</dt><dd><ul><li class="giin">…</li></ul></dd></dl>
    # 会派名・会派別票数は採決時点の公式記録として、そのまま保存する。
    records: list[dict] = []
    faction_totals: list[dict] = []
    unmatched: list[str] = []
    seen_ids: set[str] = set()

    def add_record(display_name: str, vote_value: str, faction: str | None) -> None:
        key = re.sub(r"[\s\u3000]+", "", display_name)
        member_id = name_to_id.get(key)
        if not member_id:
            unmatched.append(display_name)
            return
        # IDは「投票結果ページ＋議員」から作る（同じ会期に同名の案件が複数回採決されても衝突しない）
        raw_id = f"{vote_key}|{member_id}"
        vote_id = f"sv2-{hashlib.md5(raw_id.encode()).hexdigest()[:16]}"
        if vote_id in seen_ids:
            return
        seen_ids.add(vote_id)
        records.append({
            "id": vote_id,
            "member_id": member_id,
            "bill_title": bill_title,
            "vote_date": vote_date,
            "vote": vote_value,
            "session_number": session,
            "house": "参議院",
            "faction": faction,
            "vote_key": vote_key,
        })

    headings = soup.select("h4.party")
    for h4 in headings:
        heading = re.sub(r"\s+", " ", h4.get_text(strip=True))
        m = re.match(r"^(.*?)\(\s*(\d+)\s*名\)$", heading)
        faction = (m.group(1) if m else heading).strip()
        member_count = int(m.group(2)) if m else None
        dl = h4.find_next_sibling("dl")
        if dl is None:
            logger.warning(f"  会派「{faction}」の一覧が見つかりません: {url}")
            continue
        dt = dl.find("dt")
        tm = re.search(r"賛成票\s*(\d+)\s*反対票\s*(\d+)", dt.get_text(" ", strip=True)) if dt else None
        if tm:
            faction_totals.append({
                "vote_key": vote_key,
                "session_number": session,
                "vote_date": vote_date,
                "bill_title": bill_title,
                "faction_name": faction,
                "member_count": member_count,
                "yes_count": int(tm.group(1)),
                "no_count": int(tm.group(2)),
            })
        else:
            logger.warning(f"  会派「{faction}」の票数が読めません: {url}")
        for li in dl.select("li.giin"):
            names_el = li.select_one(".names")
            if names_el is None:
                continue
            name = names_el.get_text(strip=True)
            pros = li.select_one(".pros")
            cons = li.select_one(".cons")
            if li.select_one(".novote") is not None:
                vote_value = "投票なし"  # 原文の表記のまま（理由は記録されないため「欠席」と言い換えない）
            elif pros is not None and pros.get_text(strip=True) == "賛成":
                vote_value = "賛成"
            elif cons is not None and cons.get_text(strip=True) == "反対":
                vote_value = "反対"
            else:
                logger.warning(f"  賛否が判別できない行: {li.get_text(strip=True)} ({url})")
                continue
            add_record(name, vote_value, faction)

    if not headings:
        # 会派の区切りがない古い形式のページ：会派は記録しない（推測しない）
        for li in soup.select("li"):
            li_text = li.get_text(strip=True)
            if li_text.startswith("賛成"):
                add_record(li_text[2:], "賛成", None)
            elif li_text.startswith("反対"):
                add_record(li_text[2:], "反対", None)
            elif li_text.startswith("投票なし"):
                add_record(li_text[4:], "投票なし", None)

    if unmatched:
        logger.warning(f"  議員と照合できなかった名前 {len(unmatched)}件（記録しない）: {', '.join(unmatched[:10])}")
    logger.info(f"  Extracted {len(records)} records, {len(faction_totals)} faction totals: {bill_title[:50]}")
    return records, faction_totals


def get_name_map() -> dict[str, str]:
    """参議院議員（現職・前議員）の 本名・通称名・NDL名 → member_id。

    投票結果ページは通称名（例: 生稲 晃子）で載るため、本名から作るIDでは照合できない。
    名寄せは utils.build_name_to_id に一本化する。
    """
    client = get_client()
    result = execute_with_retry(
        lambda: client.table("members").select("id, name, alias_name, ndl_names").eq("house", "参議院").limit(2000),
        label="fetch_sangiin_members",
    )
    data = result.data or []
    logger.info(f"Found {len(data)} Sangiin members in DB")
    return build_name_to_id(data)


def collect_sessions(sessions: list[int], name_to_id: dict[str, str]) -> int:
    total_saved = 0
    for session in sessions:
        vote_pages = fetch_vote_index(session)
        if not vote_pages:
            continue

        for vp in vote_pages:
            records, faction_totals = parse_vote_page(vp["url"], session, name_to_id)
            if records:
                batch_upsert("votes", records, on_conflict="id", label=f"votes_s{session}")
                total_saved += len(records)
            if faction_totals:
                batch_upsert("vote_faction_totals", faction_totals,
                             on_conflict="vote_key,faction_name", label=f"vote_faction_totals_s{session}")
            time.sleep(1.0)

        time.sleep(2.0)

    return total_saved


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["daily", "backfill"], default="backfill",
                        help="daily=直近2会期 / backfill=全会期（デフォルト）")
    args = parser.parse_args()

    current_session = max(SESSION_MAX)

    if args.mode == "daily":
        # 直近2会期を対象にする（会期の切り替わり直後に前会期の最終日の採決を取りこぼさないため）
        sessions = sorted(SESSION_MAX)[-2:]
        logger.info(f"Daily mode: collecting sessions {sessions}")
    else:
        sessions = list(range(BACKFILL_START_SESSION, current_session + 1))
        logger.info(f"Backfill mode: collecting sessions {BACKFILL_START_SESSION}–{current_session}")

    name_to_id = get_name_map()

    total_saved = collect_sessions(sessions, name_to_id)
    logger.info(f"Vote collection complete. Saved {total_saved} records.")


if __name__ == "__main__":
    try:
        main()
    except Exception:
        logger.exception("Vote scraper failed")
        sys.exit(1)
