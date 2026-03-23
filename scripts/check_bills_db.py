"""DBのbillsテーブルの現状を確認する"""
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"

client = create_client(SUPABASE_URL, SUPABASE_KEY)

# 会期別・ステータス別の件数
resp = client.table("bills").select("session_number,status,bill_type").limit(5000).execute()
rows = resp.data or []

from collections import defaultdict
session_stats = defaultdict(lambda: defaultdict(int))
for r in rows:
    s = r["session_number"]
    st = r["status"] or "（空）"
    session_stats[s][st] += 1

TERMINAL = {"成立", "廃案", "未了", "撤回"}

print(f"総件数: {len(rows)}\n")
print(f"{'会期':<6} {'総数':<6} {'成立':<6} {'廃案':<6} {'未了':<6} {'撤回':<6} {'閉会中審査':<10} {'審議中':<8} {'空':<6}")
print("-" * 75)

for session in sorted(session_stats.keys()):
    st = session_stats[session]
    total = sum(st.values())
    print(f"{session:<6} {total:<6} {st.get('成立',0):<6} {st.get('廃案',0):<6} {st.get('未了',0):<6} {st.get('撤回',0):<6} {st.get('閉会中審査',0):<10} {st.get('審議中',0):<8} {st.get('（空）',0):<6}")

# 非終端の総計
non_terminal = [r for r in rows if r["status"] not in TERMINAL]
print(f"\n非終端（閉会中審査・審議中・空）の総計: {len(non_terminal)}件")
