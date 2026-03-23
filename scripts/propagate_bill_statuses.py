"""
非終端ステータスの法案について、以降の会期に同一件名で終端ステータスの
法案が存在する場合、元のレコードのステータスを更新する。

デフォルトはドライラン（表示のみ・DB変更なし）。
--apply フラグを付けると実際にDBを更新する。

使い方:
  # ドライラン（何が変わるか確認）
  python3 scripts/propagate_bill_statuses.py

  # 実際に適用
  python3 scripts/propagate_bill_statuses.py --apply
"""

from __future__ import annotations

import sys
import argparse
from collections import defaultdict
from supabase import create_client

SUPABASE_URL = "https://yyqktchttzvbzigeiajx.supabase.co"
SUPABASE_KEY = "sb_publishable_TFl6ysPhOtUq3vede35sdQ_9b83lXhG"

TERMINAL_STATUSES = {"成立", "廃案", "未了", "撤回"}


def main(apply: bool) -> None:
    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 全法案をページネーションで全件取得
    all_bills = []
    page_size = 1000
    offset = 0
    while True:
        resp = client.table("bills").select("id,title,status,session_number") \
            .range(offset, offset + page_size - 1).execute()
        chunk = resp.data or []
        all_bills.extend(chunk)
        if len(chunk) < page_size:
            break
        offset += page_size
    print(f"総件数: {len(all_bills)}件")

    # 終端ステータスの法案: タイトル → [(session_number, status), ...]
    terminal_by_title: dict[str, list[tuple[int, str]]] = defaultdict(list)
    for b in all_bills:
        if b["status"] in TERMINAL_STATUSES:
            terminal_by_title[b["title"]].append((b["session_number"], b["status"]))

    # 非終端ステータスの法案（現在進行中の最新会期は除外しない — 古い会期のものだけ対象）
    # 現在進行中かどうかは「以降の会期に同一件名が存在するか」で判断するため全件対象にする
    non_terminal = [
        b for b in all_bills
        if b["status"] not in TERMINAL_STATUSES
    ]
    print(f"非終端法案: {len(non_terminal)}件\n")

    # 更新候補を算出
    updates: list[dict] = []
    for bill in non_terminal:
        title = bill["title"]
        session = bill["session_number"]

        # 同一件名で、より後の会期に終端ステータスがあるか
        later_terminal = [
            (s, st) for s, st in terminal_by_title.get(title, [])
            if s > session
        ]
        if not later_terminal:
            continue

        # 最も早い後続会期の終端ステータスを採用
        later_terminal.sort(key=lambda x: x[0])
        found_session, new_status = later_terminal[0]

        updates.append({
            "id":            bill["id"],
            "title":         title,
            "session":       session,
            "old_status":    bill["status"] or "（空）",
            "new_status":    new_status,
            "found_session": found_session,
        })

    if not updates:
        print("更新対象なし。")
        return

    print(f"{'会期':<6} {'ID':<28} {'変更前':<12} {'変更後':<8} {'根拠会期'}")
    print("-" * 90)
    for u in sorted(updates, key=lambda x: (x["session"], x["id"])):
        print(f"{u['session']:<6} {u['id']:<28} {u['old_status']:<12} {u['new_status']:<8} 第{u['found_session']}回")
        if len(u["title"]) > 0:
            print(f"       └ {u['title'][:70]}")

    print("-" * 90)
    print(f"\n更新対象: {len(updates)}件")

    if not apply:
        print("\n※ドライランのため変更は行っていません。適用する場合は --apply を付けて実行してください。")
        return

    # 実際に更新
    print("\nDBを更新中...")
    for u in updates:
        client.table("bills").update({"status": u["new_status"]}).eq("id", u["id"]).execute()
        print(f"  更新: {u['id']} {u['old_status']} → {u['new_status']}")

    print(f"\n完了: {len(updates)}件を更新しました。")


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--apply", action="store_true", help="実際にDBを更新する")
    args = parser.parse_args()
    main(apply=args.apply)
