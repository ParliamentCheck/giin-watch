import os
import time
import logging
import httpx
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
NDL_API_BASE = "https://kokkai.ndl.go.jp/api/speech"

def collect_speeches(member_name: str, session: int, member_id: str, client):
    params = {
        "speaker": member_name,
        "session": session,
        "maximumRecords": 100,
        "recordPacking": "json",
    }
    try:
        resp = httpx.get(NDL_API_BASE, params=params, timeout=30)
        data = resp.json()
        records = data.get("speechRecord", [])
        count = int(data.get("numberOfRecords", 0))
        logger.info(f"{member_name} 第{session}回国会: {count}件")

        for r in records:
            client.table("speeches").upsert({
                "id":             r.get("speechID"),
                "member_id":      member_id,
                "session_number": session,
                "committee":      r.get("nameOfMeeting", ""),
                "spoken_at":      r.get("date"),
                "source_url":     r.get("speechURL", ""),
            }).execute()

        time.sleep(1.2)
    except Exception as e:
        logger.error(f"エラー {member_name}: {e}")

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL または SUPABASE_KEY が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 収集対象議員をDBから取得
    members = client.table("members").select("id, name, house").eq("is_active", True).execute()

    if not members.data:
        logger.info("議員データがまだ登録されていません。スキップします。")
        return

    for member in members.data:
        collect_speeches(member["name"], 213, member["id"], client)

    logger.info("収集完了")

if __name__ == "__main__":
    main()