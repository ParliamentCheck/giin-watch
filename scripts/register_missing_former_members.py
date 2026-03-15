"""
bills / speeches に登場するが members テーブル未収録の前議員を一括登録するスクリプト。
あわせて:
  - 東徹: DBの院が衆→参に修正
  - 吉良よし子(=吉良佳子): ndl_names に追加 + bills の ID を修正

実行:
  cd apps/collector && python ../../scripts/register_missing_former_members.py
"""

import sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)) + "/../apps/collector")

from db import get_client, execute_with_retry, batch_upsert

# ------------------------------------------------------------------
# 登録データ
# party 不明な人は「不明（前議員）」
# house は bills の submitter_ids ID から確定
# ------------------------------------------------------------------
FORMER_MEMBERS = [
    # 参議院
    {"house": "参議院", "name": "井上哲士",   "party": "共産党"},
    {"house": "参議院", "name": "大塚耕平",   "party": "国民民主党"},
    {"house": "参議院", "name": "小沼巧",     "party": "立憲民主党"},
    {"house": "参議院", "name": "田村まみ",   "party": "国民民主党"},
    {"house": "参議院", "name": "石井章",     "party": "日本維新の会"},

    # 衆議院
    {"house": "衆議院", "name": "おおたけりえ", "party": "立憲民主党"},
    {"house": "衆議院", "name": "下野幸助",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "中島克仁",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "中川正春",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "亀井亜紀子", "party": "立憲民主党"},
    {"house": "衆議院", "name": "仙田晃宏",   "party": "不明（前議員）"},
    {"house": "衆議院", "name": "伴野豊",     "party": "立憲民主党"},
    {"house": "衆議院", "name": "円より子",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "北側一雄",   "party": "公明党"},
    {"house": "衆議院", "name": "古屋範子",   "party": "公明党"},
    {"house": "衆議院", "name": "吉川元",     "party": "立憲民主党"},
    {"house": "衆議院", "name": "吉田とも代", "party": "立憲民主党"},
    {"house": "衆議院", "name": "吉田統彦",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "吉田豊史",   "party": "日本維新の会"},
    {"house": "衆議院", "name": "坂本祐之輔", "party": "立憲民主党"},
    {"house": "衆議院", "name": "堀場幸子",   "party": "不明（前議員）"},
    {"house": "衆議院", "name": "塚田一郎",   "party": "自民党"},
    {"house": "衆議院", "name": "大塚小百合", "party": "不明（前議員）"},
    {"house": "衆議院", "name": "宮本岳志",   "party": "共産党"},
    {"house": "衆議院", "name": "寺田学",     "party": "立憲民主党"},
    {"house": "衆議院", "name": "小宮山泰子", "party": "国民民主党"},
    {"house": "衆議院", "name": "小野泰輔",   "party": "日本維新の会"},
    {"house": "衆議院", "name": "山登志浩",   "party": "立憲民主党"},  # 参院だが bills に衆院で登録されている
    {"house": "衆議院", "name": "山花郁夫",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "岡本あき子", "party": "立憲民主党"},
    {"house": "衆議院", "name": "岡田華子",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "岬麻紀",     "party": "日本維新の会"},
    {"house": "衆議院", "name": "岸田光広",   "party": "公明党"},
    {"house": "衆議院", "name": "川内博史",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "平岡秀夫",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "末次精一",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "本庄知史",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "松下玲子",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "枝野幸男",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "柚木道義",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "柴田勝之",   "party": "不明（前議員）"},
    {"house": "衆議院", "name": "森田俊和",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "武正公一",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "池田真紀",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "渡辺周",     "party": "立憲民主党"},
    {"house": "衆議院", "name": "湯原俊二",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "玄葉光一郎", "party": "立憲民主党"},
    {"house": "衆議院", "name": "石井智恵",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "福島伸享",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "福森和歌子", "party": "立憲民主党"},
    {"house": "衆議院", "name": "稲富修二",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "空本誠喜",   "party": "日本維新の会"},
    {"house": "衆議院", "name": "竹内千春",   "party": "不明（前議員）"},
    {"house": "衆議院", "name": "笠井亮",     "party": "共産党"},
    {"house": "衆議院", "name": "篠原孝",     "party": "立憲民主党"},
    {"house": "衆議院", "name": "篠原豪",     "party": "立憲民主党"},
    {"house": "衆議院", "name": "義家弘介",   "party": "自民党"},
    {"house": "衆議院", "name": "荒井優",     "party": "立憲民主党"},
    {"house": "衆議院", "name": "菊池大二郎", "party": "立憲民主党"},
    {"house": "衆議院", "name": "藤岡たかお", "party": "立憲民主党"},
    {"house": "衆議院", "name": "道下大樹",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "遠藤良太",   "party": "日本維新の会"},
    {"house": "衆議院", "name": "高橋千鶴子", "party": "共産党"},
    {"house": "衆議院", "name": "鳩山紀一郎", "party": "不明（前議員）"},
    {"house": "衆議院", "name": "黒岩宇洋",   "party": "立憲民主党"},
]

# speeches unmatched のうち bills にない確実な元議員
SPEECHES_ONLY_FORMER = [
    {"house": "衆議院", "name": "吉良州司",   "party": "立憲民主党"},
    {"house": "衆議院", "name": "馬淵澄夫",   "party": "立憲民主党"},
    {"house": "参議院", "name": "鰐淵洋子",   "party": "公明党"},
    {"house": "衆議院", "name": "藤巻健太",   "party": "日本維新の会"},
    {"house": "参議院", "name": "安藤じゅん子","party": "立憲民主党"},
    {"house": "衆議院", "name": "岡島一正",   "party": "立憲民主党"},
    {"house": "参議院", "name": "円より子",   "party": "立憲民主党"},  # bills は衆院だが参院が正
]


def main():
    client = get_client()

    # 1. 前議員を一括登録
    rows = []
    all_people = FORMER_MEMBERS + SPEECHES_ONLY_FORMER
    seen_ids = set()
    for m in all_people:
        member_id = f"{m['house']}-{m['name']}"
        if member_id in seen_ids:
            continue
        seen_ids.add(member_id)
        rows.append({
            "id":         member_id,
            "name":       m["name"],
            "house":      m["house"],
            "party":      m["party"],
            "faction":    m["party"],
            "district":   "不明",
            "prefecture": "不明",
            "is_active":  False,
            "ndl_names":  [m["name"]],
        })

    print(f"登録対象: {len(rows)} 名")
    batch_upsert("members", rows, on_conflict="id", label="register_former_members")
    print("✓ 前議員登録完了")

    # 2. speeches.member_id を更新（speaker_name で照合）
    print("\nspeechesのmember_id更新中...")
    updated = 0
    for row in rows:
        result = execute_with_retry(
            lambda r=row: client.table("speeches")
                .update({"member_id": r["id"]})
                .is_("member_id", "null")
                .eq("speaker_name", r["name"]),
            label=f"update_speeches_{row['name']}"
        )
        cnt = result.count or 0
        if cnt:
            print(f"  {row['name']}: {cnt}件更新")
            updated += cnt
    print(f"✓ speeches 更新: {updated}件")

    # 3. 東徹: 「参議院-東徹」を現職として登録（bills が参議院-東徹 を参照しているため）
    # 「衆議院-東徹」はFKがあるので変更せず、参議院IDを別途追加
    print("\n東徹(参議院)を登録...")
    execute_with_retry(
        lambda: client.table("members").upsert([{
            "id": "参議院-東徹",
            "name": "東徹",
            "house": "参議院",
            "party": "日本維新の会",
            "faction": "日本維新の会",
            "district": "不明",
            "prefecture": "不明",
            "is_active": True,
            "ndl_names": ["東徹"],
        }], on_conflict="id"),
        label="register_higashi_toru_sangiin"
    )
    print("✓ 参議院-東徹 登録完了")

    # 4. 吉良佳子の ndl_names に「吉良よし子」を追加
    print("\n吉良佳子のndl_names更新...")
    current = execute_with_retry(
        lambda: client.table("members").select("ndl_names").eq("id", "参議院-吉良佳子"),
        label="get_kira_ndlnames"
    )
    if current.data:
        existing = current.data[0].get("ndl_names") or []
        if "吉良よし子" not in existing:
            new_names = existing + ["吉良よし子"]
            execute_with_retry(
                lambda: client.table("members")
                    .update({"ndl_names": new_names})
                    .eq("id", "参議院-吉良佳子"),
                label="update_kira_ndlnames"
            )
            print("✓ 吉良佳子: ndl_names に「吉良よし子」追加")
        else:
            print("  吉良佳子: 既に「吉良よし子」あり")

    # 5. bills の「参議院-吉良よし子」を「参議院-吉良佳子」に修正
    print("\nbills の吉良よし子ID修正...")
    bills_result = execute_with_retry(
        lambda: client.table("bills").select("id,submitter_ids").limit(2000),
        label="fetch_bills_for_kira"
    )
    fix_count = 0
    for bill in (bills_result.data or []):
        sids = bill.get("submitter_ids") or []
        if "参議院-吉良よし子" in sids:
            new_sids = ["参議院-吉良佳子" if s == "参議院-吉良よし子" else s for s in sids]
            execute_with_retry(
                lambda b=bill, ns=new_sids: client.table("bills")
                    .update({"submitter_ids": ns})
                    .eq("id", b["id"]),
                label=f"fix_kira_bill_{bill['id']}"
            )
            fix_count += 1
    print(f"✓ bills 修正: {fix_count}件")

    print("\n=== 完了 ===")


if __name__ == "__main__":
    main()
