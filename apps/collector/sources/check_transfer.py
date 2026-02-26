"""
鞍替え議員判定スクリプト
NDL APIで「現在と異なる院で"議員として"発言した記録」を確認し、prev_terms を更新する
大臣・副大臣等の答弁（speakerPosition有り）は除外する
"""
import os
import time
import logging
import httpx
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
NDL_SPEECH_API = "https://kokkai.ndl.go.jp/api/speech"

def check_other_house(name: str, current_house: str) -> bool:
    """NDL APIで現在と異なる院で議員として発言した記録があるか確認"""
    other_house = "衆議院" if current_house == "参議院" else "参議院"
    clean_name = name.replace(" ", "").replace("\u3000", "").strip()
    try:
        r = httpx.get(NDL_SPEECH_API, params={
            "speaker": clean_name,
            "nameOfHouse": other_house,
            "maximumRecords": 10,
            "recordPacking": "json",
        }, timeout=30)
        data = r.json()
        records = data.get("speechRecord", [])
        for rec in records:
            pos = rec.get("speakerPosition") or ""
            if not pos:
                return True
        return False
    except Exception as e:
        logger.warning(f"NDL API error for {name}: {e}")
        return False

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    result = client.table("members").select("id, name, house, terms, prev_terms").eq("is_active", True).execute()
    members = result.data or []
    logger.info(f"現職議員: {len(members)}名を判定開始")

    updated = 0
    for i, m in enumerate(members):
        current_prev = m.get("prev_terms") or 0

        has_other = check_other_house(m["name"], m["house"])

        if has_other and current_prev == 0:
            client.table("members").update({"prev_terms": 1}).eq("id", m["id"]).execute()
            logger.info(f"[{i+1}/{len(members)}] ★ 鞍替え検出: {m['name']} ({m['house']})")
            updated += 1
        elif not has_other and current_prev > 0:
            client.table("members").update({"prev_terms": 0}).eq("id", m["id"]).execute()
            logger.info(f"[{i+1}/{len(members)}] 解除: {m['name']}")
            updated += 1
        else:
            if (i + 1) % 50 == 0:
                logger.info(f"[{i+1}/{len(members)}] 処理中... ({updated}名更新)")

        time.sleep(0.5)

    logger.info(f"完了: {updated}名の prev_terms を更新")

if __name__ == "__main__":
    main()
