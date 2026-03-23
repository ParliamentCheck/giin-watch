"""DBに残る非終端法案を会期別に表示する"""
from collections import defaultdict
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"
TERMINAL = {"成立", "廃案", "未了", "撤回"}

client = create_client(SUPABASE_URL, SUPABASE_KEY)

all_bills = []
offset = 0
while True:
    resp = client.table("bills").select("id,title,status,session_number,house") \
        .range(offset, offset + 999).execute()
    chunk = resp.data or []
    all_bills.extend(chunk)
    if len(chunk) < 1000:
        break
    offset += 1000

non_terminal = [b for b in all_bills if b["status"] not in TERMINAL]
by_session = defaultdict(list)
for b in non_terminal:
    by_session[b["session_number"]].append(b)

print(f"非終端法案 合計: {len(non_terminal)}件\n")
for session in sorted(by_session.keys()):
    bills = by_session[session]
    print(f"【第{session}回】{len(bills)}件")
    for b in bills:
        print(f"  {b['id']:<30} {b['status'] or '（空）':<15} {b['title'][:50]}")
    print()
