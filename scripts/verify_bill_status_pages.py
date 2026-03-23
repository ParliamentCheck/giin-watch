"""
第208回の非終端法案が、以降の会期（209〜221回）のkaiji/gian一覧ページに
再登場して成立・廃案等になっているかを確認する。

使い方:
  python3 /Volumes/ACASIS-SSD/Users/ssd/Desktop/giin-watch/scripts/verify_bill_status_pages.py
"""

from __future__ import annotations

import time
import re
import requests
from bs4 import BeautifulSoup
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
TERMINAL_STATUSES = {"成立", "廃案", "未了", "撤回"}

SHUGIIN_LIST_URL = "https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm"
SANGIIN_LIST_URL = "https://www.sangiin.go.jp/japanese/joho1/kousei/gian/{session}/gian.htm"

TARGET_SESSION = 208
CHECK_SESSIONS = list(range(209, 222))


def _find_section_table(soup, keyword):
    for tag in soup.find_all(["h2", "h3", "h4", "caption", "p", "td", "th"]):
        if keyword in tag.get_text():
            if tag.name == "caption":
                parent = tag.find_parent("table")
                if parent:
                    return parent
            for sibling in tag.find_all_next():
                if sibling.name == "table":
                    return sibling
                if sibling.name in ["h2", "h3", "h4"]:
                    break
    return None


def fetch_shugiin_bills(session: int) -> dict[str, str]:
    """kaiji一覧から {件名: ステータス} を返す（衆法・参法両方）"""
    url = SHUGIIN_LIST_URL.format(session=session)
    try:
        resp = requests.get(url, headers=HEADERS, timeout=30)
        if resp.status_code != 200:
            return {}
        resp.encoding = resp.apparent_encoding or "shift_jis"
        soup = BeautifulSoup(resp.text, "html.parser")
    except Exception:
        return {}

    result = {}
    for keyword in ["衆法", "参法"]:
        table = _find_section_table(soup, keyword)
        if not table:
            continue
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 4:
                continue
            title = tds[2].get_text(strip=True)
            status = tds[3].get_text(strip=True)
            if title:
                result[title] = status
    return result


def fetch_sangiin_bills(session: int) -> dict[str, str]:
    """gian一覧から {件名: ステータス} を返す"""
    # 参院のgianページにはステータス列がないため、衆院kaijiの参法列で代替
    return {}


def main():
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 第208回の非終端法案を全件取得
    resp = client.table("bills") \
        .select("id,title,status,house,bill_type") \
        .eq("session_number", TARGET_SESSION) \
        .not_.in_("status", list(TERMINAL_STATUSES)) \
        .execute()

    bills_208 = resp.data or []
    print(f"\n第{TARGET_SESSION}回 非終端法案: {len(bills_208)}件")
    print("以降の会期（209〜221）のkaiji一覧で同一件名が見つかるか確認します...\n")

    # 以降の会期の一覧を全部取得（件名→ステータスのマップ）
    later_bills: dict[int, dict[str, str]] = {}
    for session in CHECK_SESSIONS:
        print(f"  第{session}回 取得中...", end="", flush=True)
        bills = fetch_shugiin_bills(session)
        later_bills[session] = bills
        print(f" {len(bills)}件")
        time.sleep(1)

    print()
    print(f"{'208回の件名':<40} {'DBステータス':<15} {'発見回次':<8} {'ページステータス'}")
    print("-" * 100)

    found_count = 0
    not_found_count = 0

    for bill in bills_208:
        title = bill["title"]
        db_status = bill["status"] or ""
        found = False

        for session in CHECK_SESSIONS:
            if title in later_bills[session]:
                page_status = later_bills[session][title]
                print(f"{title[:38]:<40} {db_status:<15} 第{session}回    {page_status}")
                found = True
                found_count += 1
                break

        if not found:
            print(f"{title[:38]:<40} {db_status:<15} 見つからず")
            not_found_count += 1

    print("-" * 100)
    print(f"\n結果: 以降の会期で発見={found_count}件, 見つからず={not_found_count}件")
    print()
    print("→ 発見件数が多い場合: 会期をまたいだ追跡が必要（同一件名で別IDとして再登場している）")
    print("→ 見つからず多い場合: 会期をまたがず廃案になっている（または件名が変わっている）")


if __name__ == "__main__":
    main()
