"""billsテーブルに実際に存在するステータス一覧と件数を確認する"""
from collections import Counter
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"

client = create_client(SUPABASE_URL, SUPABASE_KEY)

all_bills = []
offset = 0
while True:
    resp = client.table("bills").select("status").range(offset, offset + 999).execute()
    chunk = resp.data or []
    all_bills.extend(chunk)
    if len(chunk) < 1000:
        break
    offset += 1000

counter = Counter(b["status"] or "（空）" for b in all_bills)
print(f"総件数: {len(all_bills)}件\n")
print(f"{'ステータス':<25} {'件数'}")
print("-" * 35)
for status, count in counter.most_common():
    print(f"{status:<25} {count}")
