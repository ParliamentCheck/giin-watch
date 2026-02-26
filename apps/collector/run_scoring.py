import os
import logging
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("SUPABASE_URL または SUPABASE_KEY が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # --- session_count / speech_count 再計算 ---
    logger.info('session_count / speech_count を再計算中...')
    all_members = client.table('members').select('id').execute()
    for mem in (all_members.data or []):
        mid = mem['id']
        speeches = client.table('speeches').select('spoken_at, committee').eq('member_id', mid).execute()
        rows = speeches.data or []
        speech_count = len(rows)
        sessions = set()
        for r in rows:
            sessions.add(f"{r['spoken_at']}___{r['committee']}")
        session_count = len(sessions)
        client.table('members').update({
            'speech_count': speech_count,
            'session_count': session_count,
        }).eq('id', mid).execute()
    logger.info(f'再計算完了: {len(all_members.data or [])}名')

    members = client.table("members").select("id").eq("is_active", True).execute()

    if not members.data:
        logger.info("議員データがまだ登録されていません。スキップします。")
        return

    for member in members.data:
        member_id = member["id"]

        # 発言回数
        speeches = client.table("speeches").select("id").eq("member_id", member_id).execute()
        speech_count = len(speeches.data)

        # 出席データ
        attendance = client.table("attendance").select("rate").eq("member_id", member_id).execute()
        attendance_rate = attendance.data[0]["rate"] if attendance.data else 0.5

        # スコア計算
        score = min(100, int(attendance_rate * 30 + min(speech_count, 60) / 60 * 30 + 20))

        client.table("activity_scores").upsert({
            "member_id": member_id,
            "score": score,
        }).execute()

        logger.info(f"{member_id}: スコア {score}")

    logger.info("スコア計算完了")

if __name__ == "__main__":
    main()