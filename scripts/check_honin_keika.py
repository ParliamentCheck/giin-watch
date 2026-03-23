"""
全会期（208〜221）のkaiji一覧ページから「本院議了」の法案を全件抽出し、
経過ページの実際の内容を表示する。
"""
import re
import time
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin

HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}
KAIJI_URL = "https://www.shugiin.go.jp/internet/itdb_gian.nsf/html/gian/kaiji{session}.htm"
SESSIONS = range(208, 222)


def fetch_soup(url, encoding="shift_jis"):
    resp = requests.get(url, headers=HEADERS, timeout=30)
    if resp.status_code != 200:
        return None
    resp.encoding = resp.apparent_encoding or encoding
    return BeautifulSoup(resp.text, "html.parser")


def find_section_table(soup, keyword):
    for tag in soup.find_all(["h2", "h3", "h4", "caption", "p", "td", "th"]):
        if keyword in tag.get_text():
            if tag.name == "caption":
                parent = tag.find_parent("table")
                if parent:
                    return parent
            for sib in tag.find_all_next():
                if sib.name == "table":
                    return sib
                if sib.name in ["h2", "h3", "h4"]:
                    break
    return None


for session in SESSIONS:
    url = KAIJI_URL.format(session=session)
    soup = fetch_soup(url)
    if not soup:
        continue

    for section in ["衆法"]:
        table = find_section_table(soup, section)
        if not table:
            continue
        for tr in table.find_all("tr"):
            tds = tr.find_all("td")
            if len(tds) < 4:
                continue
            num = tds[1].get_text(strip=True)
            if not re.fullmatch(r"\d+", num):
                continue
            status = tds[3].get_text(strip=True)
            if status != "本院議了":
                continue

            title = tds[2].get_text(strip=True)
            keika_url = None
            if len(tds) > 4:
                link = tds[4].find("a")
                if link and link.get("href"):
                    keika_url = urljoin(url, link["href"])

            print(f"\n{'='*80}")
            print(f"第{session}回 {section}第{num}号")
            print(f"件名: {title[:70]}")
            print(f"経過URL: {keika_url}")

            if not keika_url:
                print("経過URLなし")
                continue

            time.sleep(0.5)
            ksoup = fetch_soup(keika_url)
            if not ksoup:
                print("経過ページ取得失敗")
                continue

            # th/td パターン
            found = False
            for th in ksoup.find_all("th"):
                td = th.find_next_sibling("td")
                if td:
                    k = th.get_text(strip=True)
                    v = td.get_text(strip=True)[:100]
                    if v:
                        print(f"  [th/td] {k}: {v}")
                        found = True
            # dl/dt/dd パターン
            for dt in ksoup.find_all("dt"):
                dd = dt.find_next_sibling("dd")
                if dd:
                    k = dt.get_text(strip=True)
                    v = dd.get_text(strip=True)[:100]
                    if v:
                        print(f"  [dl] {k}: {v}")
                        found = True
            # 全テキスト（構造が分からない場合）
            if not found:
                text = ksoup.get_text(separator="\n", strip=True)
                for line in text.split("\n"):
                    line = line.strip()
                    if line and len(line) > 2:
                        print(f"  {line}")

    time.sleep(1)

print("\n完了")
