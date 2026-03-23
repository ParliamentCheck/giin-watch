"""第208回の「本院議了」法案と同会期の参院レコードをタイトルで照合する"""
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"

client = create_client(SUPABASE_URL, SUPABASE_KEY)

resp = client.table("bills").select("id,title,status,session_number").eq("session_number", 208).execute()
bills_208 = resp.data or []

honin = [b for b in bills_208 if b["status"] == "本院議了"]
by_title = {b["title"]: b for b in bills_208}

print(f"第208回 本院議了: {len(honin)}件\n")
for b in honin:
    title = b["title"]
    same_session = [x for x in bills_208 if x["title"] == title and x["id"] != b["id"]]
    print(f"{b['id']} → {title[:60]}")
    if same_session:
        for x in same_session:
            print(f"  同会期マッチ: {x['id']} [{x['status']}]")
    else:
        print(f"  同会期マッチ: なし")
