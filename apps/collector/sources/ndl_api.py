import os
import time
import logging
import httpx
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

NDL_SPEECH_API  = "https://kokkai.ndl.go.jp/api/speech"
NDL_MEETING_API = "https://kokkai.ndl.go.jp/api/meeting"

TARGET_SESSIONS = [219, 220, 221]


def normalize_name(name: str) -> str:
    """名前からスペースを除去して正規化する"""
    return name.replace(" ", "").replace("\u3000", "").strip()


def collect_speeches(member_name: str, house: str, session: int, member_id: str, client) -> int:
    """議員の発言データを収集する（完全一致フィルタリング）"""
    clean_name = normalize_name(member_name)
    start = 1
    total_saved = 0

    while True:
        params = {
            "speaker":        clean_name,
            "nameOfHouse":    house,
            "session":        session,
            "startRecord":    start,
            "maximumRecords": 100,
            "recordPacking":  "json",
        }
        try:
            resp = httpx.get(NDL_SPEECH_API, params=params, timeout=30)
            data = resp.json()
            all_records = data.get("speechRecord", [])
            total       = int(data.get("numberOfRecords", 0))

            if not all_records:
                break

            # 完全一致フィルタリング
            records = [r for r in all_records if normalize_name(r.get("speaker", "")) == clean_name]

            for r in records:
                client.table("speeches").upsert({
                    "id":             r.get("speechID"),
                    "member_id":      member_id,
                    "session_number": session,
                    "committee":      r.get("nameOfMeeting", ""),
                    "spoken_at":      r.get("date"),
                    "source_url":     r.get("speechURL", ""),
                    "speech_text":    r.get("speech", "")[:2000],
                }).execute()
                total_saved += 1

            if start + len(all_records) - 1 >= total:
                break
            start += 100
            time.sleep(1.2)

        except Exception as e:
            logger.error(f"エラー {member_name} session={session}: {e}")
            break

    return total_saved


def collect_committee_attendance(member_name: str, house: str, session: int, member_id: str, client) -> int:
    """議員の委員会出席データを収集する"""
    clean_name = normalize_name(member_name)
    params = {
        "speaker":        clean_name,
        "nameOfHouse":    house,
        "session":        session,
        "maximumRecords": 100,
        "recordPacking":  "json",
    }
    try:
        resp = httpx.get(NDL_MEETING_API, params=params, timeout=30)
        data = resp.json()
        records = data.get("meetingRecord", [])

        committees = set()
        for r in records:
            # 完全一致フィルタリング
            speakers = [s.get("speaker", "") for s in r.get("speechRecord", [])]
            if any(normalize_name(s) == clean_name for s in speakers):
                name = r.get("nameOfMeeting", "")
                if name:
                    committees.add(name)

        for committee in committees:
            client.table("attendance").upsert({
                "id":             f"{member_id}-{session}-{committee}",
                "member_id":      member_id,
                "session_number": session,
                "committee":      committee,
                "rate":           1.0,
            }).execute()

        time.sleep(1.2)
        return len(committees)

    except Exception as e:
        logger.error(f"委員会出席エラー {member_name}: {e}")
        return 0


def update_speech_count(member_id: str, client) -> int:
    """議員の発言回数集計を更新する"""
    result = client.table("speeches").select("id", count="exact").eq("member_id", member_id).execute()
    count = result.count or 0
    client.table("members").update({"speech_count": count}).eq("id", member_id).execute()
    return count


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)
    members = client.table("members").select("id, name, house").eq("is_active", True).execute()

    if not members.data:
        logger.info("議員データがまだ登録されていません")
        return

    logger.info(f"収集開始: {len(members.data)}名 × {len(TARGET_SESSIONS)}セッション")

    for member in members.data:
        name      = member["name"]
        member_id = member["id"]
        house     = member["house"]
        total_speeches = 0

        for session in TARGET_SESSIONS:
            speeches = collect_speeches(name, house, session, member_id, client)
            collect_committee_attendance(name, house, session, member_id, client)
            total_speeches += speeches

        count = update_speech_count(member_id, client)
        logger.info(f"{name}: 合計{count}件の発言を記録")

    logger.info("収集完了")


if __name__ == "__main__":
    main()