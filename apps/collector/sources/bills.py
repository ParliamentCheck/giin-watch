"""
はたらく議員 — 法案スクレイパー

衆院kaiji一覧（208〜現在）から衆法・参法・閣法を全収集し、
honbun_url をキーに最新会期の1レコードに統合して bills テーブルに保存する。

データソース:
  衆院一覧: https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm
  各セクション: 衆法の一覧 / 参法の一覧 / 閣法の一覧

ステータス変換ルール:
  成立                  → 成立         （終端）
  参議院回付案（同意）    → 成立         （終端）
  撤回                  → 撤回         （終端）
  未了                  → 廃案         （終端: 会期で決まらず消滅）
  衆議院で閉会中審査      → 閉会中審査   （非終端: 次会期持越）
  参議院で閉会中審査      → 閉会中審査   （非終端: 次会期持越）
  衆議院で審議中          → 審議中       （非終端: 現会期中）
  参議院で審議中          → 審議中       （非終端: 現会期中）
  （空）                 → 審議中       （非終端: 現会期中）
  本院議了               → keikaページ確認
                           衆院結果=否決 → 廃案（終端）
                           衆院結果=可決 → 参院送り（参院レコードで追跡）

honbun_url による同一法案の統合:
  同一の honbun_url は同一法案。繰り越しのたびに会期番号が変わるが本文URLは不変。
  複数会期に存在する場合は最新会期のレコードのみ残す。
"""

from __future__ import annotations

import logging
import re
import sys
import time
from collections import defaultdict
from typing import Any
from urllib.parse import urljoin

import requests
from bs4 import BeautifulSoup

from db import batch_upsert, get_client, execute_with_retry
from utils import make_member_id, build_name_to_id

logger = logging.getLogger("bill_scraper")

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
KAIJI_URL = "https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm"
START_SESSION = 208

ERA_OFFSETS = {"令和": 2018, "平成": 1988, "昭和": 1925}

# kaijiページのステータス → 正規ステータス
STATUS_MAP: dict[str, str] = {
    "成立":                 "成立",
    "参議院回付案（同意）":   "成立",
    "撤回":                 "撤回",
    "未了":                 "廃案",
    "衆議院で閉会中審査":    "閉会中審査",
    "参議院で閉会中審査":    "閉会中審査",
    "衆議院で審議中":        "審議中",
    "参議院で審議中":        "審議中",
    "本院議了":              "本院議了",  # → keika確認が必要
    "":                     "審議中",
}

# kaijiセクション名 → (house, bill_type, id_prefix)
SECTION_META: dict[str, tuple[str, str, str]] = {
    "衆法の一覧": ("衆議院", "議員立法", "bill-shu"),
    "参法の一覧": ("参議院", "議員立法", "bill-san"),
    "閣法の一覧": ("参議院", "閣法",     "cabinet-san"),
}


# ============================================================
# 共通ヘルパー
# ============================================================

def _parse_jp_date(text: str) -> str | None:
    for era, offset in ERA_OFFSETS.items():
        m = re.search(rf"{era}\s*(\d+)年\s*(\d+)月\s*(\d+)日", text)
        if m:
            return f"{offset + int(m.group(1))}-{int(m.group(2)):02d}-{int(m.group(3)):02d}"
    return None


def _fetch(url: str, encoding: str = "shift_jis") -> BeautifulSoup | None:
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return None
        resp.encoding = resp.apparent_encoding or encoding
        return BeautifulSoup(resp.text, "html.parser")
    except requests.RequestException as exc:
        logger.warning("Fetch failed %s: %s", url, exc)
        return None


def _detect_current_session() -> int:
    """参議院法案一覧ページの存在確認で現在の国会回次を検出する。"""
    session = START_SESSION
    while True:
        url = f"https://www.sangiin.go.jp/japanese/joho1/kousei/gian/{session + 1}/gian.htm"
        try:
            r = requests.head(url, headers=HEADERS, timeout=10)
            if r.status_code == 200:
                session += 1
            else:
                break
        except requests.RequestException:
            break
    return session


# ============================================================
# kaijiページのスクレイプ
# ============================================================

def _scrape_kaiji(session: int) -> list[dict[str, Any]]:
    """
    指定会期のkaijiページから衆法・参法・閣法の全行を返す。
    各行: id, title, session_number, house, bill_type, raw_status,
          honbun_url, keika_url
    """
    url = KAIJI_URL.format(session=session)
    soup = _fetch(url)
    if soup is None:
        logger.warning("kaiji fetch failed: session %d", session)
        return []

    rows: list[dict[str, Any]] = []

    for caption in soup.find_all("caption"):
        caption_text = caption.get_text(strip=True)
        if caption_text not in SECTION_META:
            continue
        house, bill_type, id_prefix = SECTION_META[caption_text]
        table = caption.find_parent("table")
        if table is None:
            continue

        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 4:
                continue
            bill_num = tds[1].get_text(strip=True)
            if not re.fullmatch(r"\d+", bill_num):
                continue
            title = tds[2].get_text(strip=True)
            if not title:
                continue
            raw_status = tds[3].get_text(strip=True) if len(tds) > 3 else ""

            keika_url: str | None = None
            honbun_url: str | None = None
            if len(tds) > 4:
                a = tds[4].find("a")
                if a and a.get("href"):
                    keika_url = urljoin(url, a["href"])
            if len(tds) > 5:
                a = tds[5].find("a")
                if a and a.get("href"):
                    honbun_url = urljoin(url, a["href"])

            rows.append({
                "id":             f"{id_prefix}-{session}-{bill_num}",
                "title":          title,
                "session_number": session,
                "house":          house,
                "bill_type":      bill_type,
                "raw_status":     raw_status,
                "keika_url":      keika_url,
                "honbun_url":     honbun_url,
            })

    logger.info("kaiji session %d: %d rows", session, len(rows))
    return rows


# ============================================================
# keikaページから詳細取得（衆法）
# ============================================================

def _fetch_keika_detail(keika_url: str, name_to_id: dict[str, str] | None = None) -> dict[str, Any]:
    """
    衆院keikaページから提出者・提出日・衆院審議結果を取得する。

    ページには2種類の構造が混在する:
      1. KOMOKU/NAIYO属性付きtd（メタ情報テーブル）
      2. th/td隣接ペア（「議案提出者一覧」等の別テーブル）

    両方を走査して「議案提出者一覧」（全提出者名）を優先取得する。
    一覧がない場合は「議案提出者」（筆頭＋外N名）を使用。

    戻り値: {submitter_ids, submitter_extra_count, submitted_at, shu_result, is_committee_bill}
    is_committee_bill は提出者フィールドに「委員長」が含まれる場合 True。
    """
    result: dict[str, Any] = {
        "submitter_ids":         [],
        "submitter_extra_count": 0,
        "submitted_at":          None,
        "shu_result":            None,
        "is_committee_bill":     False,
    }
    soup = _fetch(keika_url)
    if soup is None:
        return result

    actual_house = "衆議院"
    primary_ids:   list[str] = []
    primary_extra: int = 0
    full_ids:      list[str] = []
    full_extra:    int = 0

    # パス1: KOMOKU/NAIYO属性付きtd（衆院keikaページの標準構造）
    komokus = soup.find_all("td", headers="KOMOKU")
    naiyos  = soup.find_all("td", headers="NAIYO")

    for k, v in zip(komokus, naiyos):
        ktext = k.get_text(strip=True)
        vtext = v.get_text(strip=True)

        if ktext == "議案種類":
            if "参法" in vtext:
                actual_house = "参議院"

        elif ktext in ("議案提出者", "提出者", "発議者"):
            if not primary_ids:
                if "委員長" in v.get_text():
                    result["is_committee_bill"] = True
                else:
                    primary_ids, primary_extra = _parse_submitters(v, actual_house, name_to_id)

        elif ktext == "議案提出者一覧":
            full_ids, full_extra = _parse_submitters(v, actual_house, name_to_id)

        elif "提出日" in ktext or "受理年月日" in ktext or "提出年月日" in ktext:
            if result["submitted_at"] is None and vtext:
                result["submitted_at"] = _parse_jp_date(vtext)

        elif "衆議院審議結果" in ktext or "衆議院審査結果" in ktext:
            if "否決" in vtext:
                result["shu_result"] = "否決"
            elif "可決" in vtext:
                result["shu_result"] = "可決"

    # パス2: th/td隣接ペア（「議案提出者一覧」が別テーブルに置かれている場合に対応）
    # パス1で取得できなかった項目を補完する
    for cell in soup.find_all(["th", "td"]):
        text = cell.get_text(strip=True)
        sibling = cell.find_next_sibling(["th", "td"])
        if sibling is None:
            continue
        sib_text = sibling.get_text(strip=True)

        if text == "議案種類" and not full_ids:
            actual_house = {"衆法": "衆議院", "参法": "参議院"}.get(sib_text, actual_house)

        elif text in ("議案提出者", "提出者", "発議者") and not primary_ids:
            primary_ids, primary_extra = _parse_submitters(sibling, actual_house, name_to_id)

        elif text == "議案提出者一覧" and not full_ids:
            full_ids, full_extra = _parse_submitters(sibling, actual_house, name_to_id)

        elif ("提出日" in text or "受理年月日" in text or "提出年月日" in text) and result["submitted_at"] is None:
            result["submitted_at"] = _parse_jp_date(sib_text)

        elif ("衆議院審議結果" in text or "衆議院審査結果" in text) and result["shu_result"] is None:
            if "否決" in sib_text:
                result["shu_result"] = "否決"
            elif "可決" in sib_text:
                result["shu_result"] = "可決"

    if full_ids:
        result["submitter_ids"]         = full_ids
        result["submitter_extra_count"] = full_extra
    else:
        result["submitter_ids"]         = primary_ids
        result["submitter_extra_count"] = primary_extra
    return result


# 漢数字→算用数字マップ
_KANJI_DIGIT = str.maketrans("〇一二三四五六七八九", "0123456789")

def _parse_submitters(cell, house: str, name_to_id: dict[str, str] | None = None) -> tuple[list[str], int]:
    """
    提出者セルから (member_id リスト, 外N名のN) を返す。
    「足立康史君外2名」→ (["衆議院-足立康史"], 2)
    name_to_id が渡された場合はDBルックアップで解決（alias_name・ndl_names対応）。
    """
    raw = cell.get_text()

    # 「外N名」を抽出してから除去
    extra_count = 0
    m = re.search(r"外([〇一二三四五六七八九十百千\d]+)名", raw)
    if m:
        num_str = m.group(1).translate(_KANJI_DIGIT)
        try:
            extra_count = int(num_str)
        except ValueError:
            extra_count = 0
    raw = re.sub(r"外[〇一二三四五六七八九十百千\d]+名", "", raw).strip()

    ids = []
    for part in re.split(r"[、,，；;]+", raw):
        name = re.sub(r"[君氏]$", "", part.strip())
        name = re.sub(r"\s+", "", name)
        if 2 <= len(name) <= 10:
            if name_to_id is not None:
                member_id = name_to_id.get(name) or make_member_id(house, name)
            else:
                member_id = make_member_id(house, name)
            ids.append(member_id)
    return ids, extra_count


# ============================================================
# ステータス解決
# ============================================================

def _resolve_status(row: dict[str, Any], name_to_id: dict[str, str] | None = None) -> tuple[str, dict[str, Any]]:
    """
    row の raw_status を正規ステータスに変換し、keikaページから詳細を取得する。
    閣法は提出者取得をスキップ（内閣提出のため個々の議員名なし）。
    戻り値: (status, detail_dict)
      detail_dict: submitter_ids, submitter_extra_count, submitted_at
    """
    raw = row["raw_status"]
    detail: dict[str, Any] = {
        "submitter_ids":         [],
        "submitter_extra_count": 0,
        "submitted_at":          None,
    }

    keika_url = row.get("keika_url")
    is_giin_rippo = row["bill_type"] == "議員立法"  # 衆法・参法（閣法は除く）

    # 本院議了: keikaで衆院審議結果を確認
    if raw == "本院議了":
        if keika_url:
            d = _fetch_keika_detail(keika_url, name_to_id)
            detail["submitter_ids"]         = d["submitter_ids"]
            detail["submitter_extra_count"] = d["submitter_extra_count"]
            detail["submitted_at"]          = d["submitted_at"]
            if d["shu_result"] == "否決":
                return "廃案", detail
            elif d["shu_result"] == "可決":
                # 参院に送られている。参法レコードで追跡するため衆法側はスキップ。
                return "_skip", detail
            else:
                logger.warning("本院議了 but no shu_result: %s", keika_url)
                return "廃案", detail
        return "廃案", detail

    # 議員立法（衆法・参法）: keikaから提出者・提出日を常に取得
    if is_giin_rippo and keika_url:
        d = _fetch_keika_detail(keika_url, name_to_id)
        detail["submitter_ids"]         = d["submitter_ids"]
        detail["submitter_extra_count"] = d["submitter_extra_count"]
        detail["submitted_at"]          = d["submitted_at"]
        if d["is_committee_bill"]:
            detail["bill_type"] = "委員会提出"

    return STATUS_MAP.get(raw, "審議中"), detail


# ============================================================
# メイン収集
# ============================================================

def collect_bills(daily: bool = False) -> None:
    """
    法案データを収集してDBに保存する。

    daily=True: 現在会期のみスクレイプし、非終端の既存レコードも再チェックする。
    daily=False: START_SESSION から現在会期まで全件収集する。
    """
    current_session = _detect_current_session()

    client = get_client()
    members_data = (
        execute_with_retry(
            lambda: client.table("members").select("id, name, alias_name, ndl_names").limit(2000),
            label="fetch_all_members",
        ).data or []
    )
    name_to_id = build_name_to_id(members_data)
    logger.info("議員名寄せマップ: %d件", len(name_to_id))

    if daily:
        sessions = [current_session]
        logger.info("日次モード: 第%d回国会", current_session)
    else:
        sessions = list(range(START_SESSION, current_session + 1))
        logger.info("全収集モード: 第%d〜%d回国会", START_SESSION, current_session)

    # --- 全会期をスクレイプ ---
    all_rows: list[dict[str, Any]] = []
    for session in sessions:
        all_rows.extend(_scrape_kaiji(session))
        time.sleep(1)

    # --- honbun_url でグループ化し最新会期のみ残す ---
    by_honbun: dict[str, list[dict[str, Any]]] = defaultdict(list)
    no_honbun: list[dict[str, Any]] = []
    for row in all_rows:
        if row["honbun_url"]:
            by_honbun[row["honbun_url"]].append(row)
        else:
            no_honbun.append(row)

    deduped: list[dict[str, Any]] = []
    for honbun_url, group in by_honbun.items():
        latest = max(group, key=lambda r: r["session_number"])
        deduped.append(latest)
    deduped.extend(no_honbun)

    logger.info("重複統合: %d行 → %d行", len(all_rows), len(deduped))

    # --- ステータス解決・詳細取得 ---
    to_upsert: list[dict[str, Any]] = []
    to_delete_ids: list[str] = []  # 古い会期の重複レコードID

    # 削除対象: 最新でないレコードのID
    for honbun_url, group in by_honbun.items():
        if len(group) > 1:
            latest = max(group, key=lambda r: r["session_number"])
            for row in group:
                if row["id"] != latest["id"]:
                    to_delete_ids.append(row["id"])

    for row in deduped:
        raw = row["raw_status"]
        logger.debug("Resolving %s [%s]", row["id"], raw)

        status, detail = _resolve_status(row, name_to_id)
        if status == "_skip":
            logger.info("Skip (参院送り): %s", row["id"])
            continue

        record = _make_record(
            row, status,
            detail["submitter_ids"],
            detail["submitter_extra_count"],
            detail["submitted_at"],
            bill_type=detail.get("bill_type"),
        )
        to_upsert.append(record)
        time.sleep(0.5)

    # --- 古い重複レコードを削除 ---
    if to_delete_ids:
        client = get_client()
        logger.info("古い重複レコード削除: %d件", len(to_delete_ids))
        for bill_id in to_delete_ids:
            client.table("bills").delete().eq("id", bill_id).execute()

    # --- IDで最終重複除去（同一IDが複数ある場合は最後のものを採用）---
    seen_ids: dict[str, dict[str, Any]] = {}
    for record in to_upsert:
        seen_ids[record["id"]] = record
    to_upsert = list(seen_ids.values())

    # --- upsert ---
    batch_upsert("bills", to_upsert, on_conflict="id", label="bills")
    logger.info("収集完了: %d件保存", len(to_upsert))


def backfill_submitters() -> None:
    """
    DBにある議員立法のうち提出者が1件以下のレコードに対してのみ
    keika ページを再フェッチし、submitter_ids / submitter_extra_count を UPDATE する。

    kaiji ページの再スクレイプは行わない。
    他フィールドを上書きしないよう upsert ではなく UPDATE を使用する。
    """
    client = get_client()
    members_data = (
        execute_with_retry(
            lambda: client.table("members").select("id, name, alias_name, ndl_names").limit(2000),
            label="fetch_all_members",
        ).data or []
    )
    name_to_id = build_name_to_id(members_data)

    res = client.table("bills") \
        .select("id, keika_url, submitter_ids") \
        .eq("bill_type", "議員立法") \
        .not_.is_("keika_url", "null") \
        .execute()

    # array_length フィルタは PostgREST では使えないため Python 側で絞り込む
    targets = [
        r for r in (res.data or [])
        if len(r.get("submitter_ids") or []) <= 1
    ]
    logger.info("提出者バックフィル対象: %d件", len(targets))

    updated = 0
    for r in targets:
        detail = _fetch_keika_detail(r["keika_url"], name_to_id)
        if detail["is_committee_bill"]:
            client.table("bills").update({
                "bill_type": "委員会提出",
            }).eq("id", r["id"]).execute()
            updated += 1
            logger.info("%s: 委員会提出に更新", r["id"])
        elif len(detail["submitter_ids"]) > 1:
            client.table("bills").update({
                "submitter_ids":         detail["submitter_ids"],
                "submitter_extra_count": detail["submitter_extra_count"],
            }).eq("id", r["id"]).execute()
            updated += 1
            logger.info(
                "%s: %d名取得",
                r["id"], len(detail["submitter_ids"]) + detail["submitter_extra_count"],
            )
        time.sleep(0.3)

    logger.info("提出者バックフィル完了: %d件更新", updated)


def _make_record(
    row: dict[str, Any],
    status: str,
    submitter_ids: list[str],
    submitter_extra_count: int,
    submitted_at: str | None,
    bill_type: str | None = None,
) -> dict[str, Any]:
    return {
        "id":                     row["id"],
        "title":                  row["title"],
        "session_number":         row["session_number"],
        "house":                  row["house"],
        "bill_type":              bill_type or row["bill_type"],
        "status":                 status,
        "submitter_ids":          submitter_ids,
        "submitter_extra_count":  submitter_extra_count,
        "submitted_at":           submitted_at,
        "honbun_url":             row["honbun_url"],
        "keika_url":              row["keika_url"],
    }


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    parser = argparse.ArgumentParser()
    parser.add_argument("--daily", action="store_true", help="現在会期のみ収集")
    args = parser.parse_args()
    try:
        collect_bills(daily=args.daily)
    except Exception:
        logger.exception("収集失敗")
        sys.exit(1)
