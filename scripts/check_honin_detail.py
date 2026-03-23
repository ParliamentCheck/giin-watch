"""第208回の「本院議了」法案の詳細ページを取得して表示する"""
import requests
from bs4 import BeautifulSoup
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"
HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}

client = create_client(SUPABASE_URL, SUPABASE_KEY)

resp = client.table("bills").select("id,title,status,source_url").eq("session_number", 208).eq("status", "本院議了").execute()
bills = resp.data or []

for b in bills:
    print(f"\n{'='*80}")
    print(f"ID: {b['id']}")
    print(f"件名: {b['title'][:70]}")
    print(f"URL: {b['source_url']}")
    if not b["source_url"]:
        print("URLなし")
        continue
    try:
        r = requests.get(b["source_url"], headers=HEADERS, timeout=30)
        r.encoding = r.apparent_encoding or "shift_jis"
        soup = BeautifulSoup(r.text, "html.parser")
        # テーブルのth/tdペアを全部表示
        for th in soup.find_all("th"):
            td = th.find_next_sibling("td")
            if td:
                print(f"  {th.get_text(strip=True)}: {td.get_text(strip=True)[:80]}")
    except Exception as e:
        print(f"エラー: {e}")
