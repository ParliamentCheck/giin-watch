"""
元議員登録スクリプト
former_members_review.md で「元議員」と判定された人物を
members テーブルに is_active=False で登録し、
speeches テーブルの speaker_name と照合して member_id を更新する。
"""

import logging
import sys

from db import get_client, execute_with_retry, batch_upsert
from utils import make_member_id

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ============================================================
# 登録対象リスト
# ============================================================
FORMER_MEMBERS = [
    # --- 確定：元議員 ---
    {"name": "枝野幸男",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "川内博史",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "馬淵澄夫",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "黒岩宇洋",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "稲富修二",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "玄葉光一郎", "house": "衆議院", "party": "立憲民主党"},
    {"name": "道下大樹",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "伴野豊",     "house": "衆議院", "party": "立憲民主党"},
    {"name": "亀井亜紀子", "house": "衆議院", "party": "立憲民主党"},
    {"name": "吉良州司",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "柚木道義",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "中島克仁",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "岡島一正",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "福島伸享",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "藤巻健太",   "house": "衆議院", "party": "日本維新の会"},
    {"name": "岡本あき子", "house": "衆議院", "party": "立憲民主党"},
    {"name": "池田真紀",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "小宮山泰子", "house": "衆議院", "party": "国民民主党"},
    {"name": "山花郁夫",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "寺田学",     "house": "衆議院", "party": "立憲民主党"},
    {"name": "安藤じゅん子", "house": "参議院", "party": "立憲民主党",
     "ndl_names_extra": ["安藤じゅん子", "安藤じゅん子"]},
    {"name": "鰐淵洋子",   "house": "参議院", "party": "公明党"},
    {"name": "円より子",   "house": "衆議院", "party": "国民民主党"},
    {"name": "山登志浩",   "house": "衆議院", "party": "立憲民主党"},

    # --- 要確認リスト から元議員 ---
    {"name": "本庄知史",   "house": "衆議院", "party": "中道改革連合"},
    {"name": "岡田悟",     "house": "衆議院", "party": "中道改革連合"},
    {"name": "川原田英世", "house": "衆議院", "party": "中道改革連合"},
    {"name": "原田和広",   "house": "衆議院", "party": "中道改革連合"},
    {"name": "岡田華子",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "藤岡たかお", "house": "衆議院", "party": "立憲民主党"},
    {"name": "下野幸助",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "松下玲子",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "東克哉",     "house": "衆議院", "party": "立憲民主党"},
    {"name": "森田俊和",   "house": "衆議院", "party": "立憲民主党"},
    {"name": "山口良治",   "house": "衆議院", "party": "公明党"},
    {"name": "石井智恵",   "house": "衆議院", "party": "国民民主党"},

    # --- 3件以下 から元議員 ---
    {"name": "鳩山紀一郎", "house": "衆議院", "party": "国民民主党"},
]


def build_rows() -> list[dict]:
    rows = []
    for m in FORMER_MEMBERS:
        name = m["name"]
        house = m["house"]
        member_id = make_member_id(house, name)

        # ndl_names: スペースなし＋スペースあり（名前にひらがなが含まれる場合）
        ndl_names = list(dict.fromkeys([name]))  # 重複排除しつつ順序保持
        if "ndl_names_extra" in m:
            for n in m["ndl_names_extra"]:
                if n not in ndl_names:
                    ndl_names.append(n)

        rows.append({
            "id":           member_id,
            "name":         name,
            "party":        m["party"],
            "house":        house,
            "district":     "不明",
            "prefecture":   "不明",
            "is_active":    False,
            "ndl_names":    ndl_names,
        })
    return rows


def register(dry_run: bool = False) -> None:
    client = get_client()
    rows = build_rows()

    # 同IDの重複チェック
    existing_ids = {
        r["id"]
        for r in execute_with_retry(
            lambda: client.table("members").select("id").in_("id", [r["id"] for r in rows]),
            label="check_existing",
        ).data
    }

    # 院違い現職との重複チェック（参院→衆院移籍など）
    target_names = [r["name"] for r in rows]
    active_members = execute_with_retry(
        lambda: client.table("members").select("id,name,house").eq("is_active", True),
        label="check_active",
    ).data
    active_by_name: dict[str, list[dict]] = {}
    for m in active_members:
        key = m["name"].replace(" ", "").replace("\u3000", "")
        active_by_name.setdefault(key, []).append(m)

    cross_house_skip: set[str] = set()
    for r in rows:
        name_key = r["name"].replace(" ", "").replace("\u3000", "")
        for active in active_by_name.get(name_key, []):
            if active["house"] != r["house"]:
                logger.warning(
                    "  [skip/cross-house] %s — 現職が別院に存在: %s",
                    r["id"], active["id"],
                )
                cross_house_skip.add(r["id"])

    new_rows = [r for r in rows if r["id"] not in existing_ids and r["id"] not in cross_house_skip]
    dup_rows = [r for r in rows if r["id"] in existing_ids]

    logger.info("登録対象: %d件 / 既存スキップ: %d件 / 院違い現職スキップ: %d件",
                len(new_rows), len(dup_rows), len(cross_house_skip))
    for r in dup_rows:
        logger.info("  [skip/exists] %s", r["id"])

    if dry_run:
        logger.info("[dry-run] 実際には登録しません")
        for r in new_rows:
            logger.info("  [would insert] %s  %s  %s", r["id"], r["party"], r["ndl_names"])
        return

    if new_rows:
        batch_upsert("members", new_rows, on_conflict="id", label="former_members")
        logger.info("members 登録完了: %d件", len(new_rows))
    else:
        logger.info("新規登録なし")


def link_speeches(dry_run: bool = False) -> None:
    """speeches テーブルの speaker_name と照合して member_id を更新する。"""
    client = get_client()
    rows = build_rows()

    updated_total = 0
    for m in rows:
        member_id = m["id"]
        for ndl_name in m["ndl_names"]:
            if dry_run:
                logger.info("  [would link] %s → %s", ndl_name, member_id)
                continue

            # member_id が未設定の発言を更新（件数はレスポンスで確認）
            result = execute_with_retry(
                lambda n=ndl_name, mid=member_id: client.table("speeches")
                    .update({"member_id": mid})
                    .eq("speaker_name", n)
                    .is_("member_id", "null"),
                label=f"link_speeches:{ndl_name}",
            )
            count = len(result.data) if result.data else 0
            if count > 0:
                logger.info("  %s (%s): %d件を紐付け", ndl_name, member_id, count)
            updated_total += count

    logger.info("speeches 紐付け完了: 合計%d件", updated_total)


def main() -> None:
    dry_run = "--dry-run" in sys.argv
    if dry_run:
        logger.info("=== DRY RUN モード ===")

    logger.info("--- Step 1: members テーブルへの登録 ---")
    register(dry_run=dry_run)

    logger.info("--- Step 2: speeches テーブルの member_id 更新 ---")
    link_speeches(dry_run=dry_run)


if __name__ == "__main__":
    main()
