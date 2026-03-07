"""
はたらく議員 — member ID マイグレーション

参議院サイトの名前表示変更で生じた bracket 形式 ID を kanji 形式に統一する。

  変換例: "参議院-いんどう周作[犬童周作]" → "参議院-犬童周作"

対象テーブル:
  members           (PK: id を変更するため INSERT→UPDATE refs→DELETE)
  speeches          (member_id)
  questions         (member_id)
  sangiin_questions (member_id)
  committee_members (member_id)
  votes             (member_id)
  member_keywords   (member_id)
  bills             (submitter_ids: 配列)

使い方:
  python scripts/migrate_member_ids.py [--dry-run]
"""

from __future__ import annotations

import argparse
import logging
import re
import sys

sys.path.insert(0, "apps/collector")

from db import get_client, execute_with_retry, batch_upsert

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
logger = logging.getLogger("migrate_member_ids")

# member_id を持つ単純テーブル（列名は全て member_id）
SIMPLE_TABLES = [
    "speeches",
    "questions",
    "sangiin_questions",
    "committee_members",
    "votes",
    "member_keywords",
]


def extract_kanji(member_id: str) -> str | None:
    """
    bracket 形式 ID から kanji 名を抽出する。
    "参議院-いんどう周作[犬童周作]" → "犬童周作"
    bracket がなければ None（変換不要）。
    """
    m = re.search(r"\[(.+?)\]", member_id)
    if not m:
        return None
    house = member_id.split("-", 1)[0]
    kanji = m.group(1).strip()
    return f"{house}-{kanji}"


def fetch_all_members(client) -> list[dict]:
    result = execute_with_retry(
        lambda: client.table("members").select("*").limit(2000),
        label="fetch_members",
    )
    return result.data or []


def update_simple_table(client, table: str, old_id: str, new_id: str, dry_run: bool) -> int:
    """単純な member_id 列を持つテーブルを更新。更新件数を返す。"""
    if dry_run:
        result = execute_with_retry(
            lambda: client.table(table).select("id", count="exact", head=True).eq("member_id", old_id),
            label=f"count:{table}",
        )
        count = result.count or 0
        if count:
            logger.info("  [DRY] %s: %d 件更新予定", table, count)
        return count

    result = execute_with_retry(
        lambda: client.table(table).update({"member_id": new_id}).eq("member_id", old_id),
        label=f"upd:{table}:{old_id}",
    )
    updated = len(result.data) if result.data else 0
    if updated:
        logger.info("  %s: %d 件更新", table, updated)
    return updated


def update_bills(client, old_id: str, new_id: str, dry_run: bool) -> int:
    """bills.submitter_ids（配列）内の old_id を new_id に置換。"""
    result = execute_with_retry(
        lambda: client.table("bills").select("id, submitter_ids").contains("submitter_ids", [old_id]),
        label=f"bills_fetch:{old_id}",
    )
    rows = result.data or []
    if not rows:
        return 0

    if dry_run:
        logger.info("  [DRY] bills: %d 件更新予定", len(rows))
        return len(rows)

    count = 0
    for row in rows:
        new_ids = [new_id if x == old_id else x for x in (row["submitter_ids"] or [])]
        execute_with_retry(
            lambda rid=row["id"], ids=new_ids: (
                client.table("bills").update({"submitter_ids": ids}).eq("id", rid)
            ),
            label=f"bills_upd:{row['id']}",
        )
        count += 1
    logger.info("  bills: %d 件更新", count)
    return count


def migrate(dry_run: bool = False) -> None:
    client = get_client()
    members = fetch_all_members(client)
    logger.info("全議員: %d 名", len(members))

    # bracket 形式 ID を持つ議員を抽出
    targets = []
    for m in members:
        new_id = extract_kanji(m["id"])
        if new_id:
            targets.append((m, new_id))

    logger.info("変換対象: %d 名", len(targets))
    if not targets:
        logger.info("変換対象なし。終了。")
        return

    # 現在の ID セット（重複チェック用）
    current_ids = {m["id"] for m in members}

    for m, new_id in targets:
        old_id = m["id"]
        logger.info("変換: %s → %s", old_id, new_id)

        # 1. 新 ID の member 行を作成（既存がなければ）
        if new_id not in current_ids:
            new_row = {k: v for k, v in m.items()}
            new_row["id"] = new_id
            # name からも bracket を除去して kanji 名のみにする
            kanji_name = re.search(r"\[(.+?)\]", m.get("name", ""))
            if kanji_name:
                new_row["name"] = kanji_name.group(1).strip()
            if not dry_run:
                execute_with_retry(
                    lambda r=new_row: client.table("members").upsert(r, on_conflict="id"),
                    label=f"insert_new_member:{new_id}",
                )
                current_ids.add(new_id)
                logger.info("  members: 新行作成 %s", new_id)
            else:
                logger.info("  [DRY] members: 新行作成予定 %s", new_id)
        else:
            logger.info("  members: 新ID行は既存（スキップ）")

        # 2. 参照テーブルを更新
        for table in SIMPLE_TABLES:
            update_simple_table(client, table, old_id, new_id, dry_run)

        update_bills(client, old_id, new_id, dry_run)

        # 3. 旧 ID の member 行を削除
        if not dry_run:
            execute_with_retry(
                lambda oid=old_id: client.table("members").delete().eq("id", oid),
                label=f"del_old_member:{old_id}",
            )
            logger.info("  members: 旧行削除 %s", old_id)
        else:
            logger.info("  [DRY] members: 旧行削除予定 %s", old_id)

    logger.info("マイグレーション完了（dry_run=%s）", dry_run)


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--dry-run", action="store_true", help="実際には変更しない")
    args = parser.parse_args()

    try:
        migrate(dry_run=args.dry_run)
    except Exception:
        logger.exception("マイグレーション失敗")
        sys.exit(1)
