"""廃案ステータスの法案を確認する"""
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"

client = create_client(SUPABASE_URL, SUPABASE_KEY)

all_bills = []
offset = 0
while True:
    resp = client.table("bills").select("id,title,status,session_number,house,bill_type") \
        .range(offset, offset + 999).execute()
    chunk = resp.data or []
    all_bills.extend(chunk)
    if len(chunk) < 1000:
        break
    offset += 1000

haian = [b for b in all_bills if b["status"] == "廃案"]
print(f"廃案: {len(haian)}件\n")
for b in sorted(haian, key=lambda x: x["session_number"]):
    print(f"  第{b['session_number']}回  {b['id']:<30}  {b['title'][:60]}")
