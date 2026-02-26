import os
import time
import logging
import httpx
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

NDL_MEETING_API = "https://kokkai.ndl.go.jp/api/meeting"
NDL_SPEECH_API  = "https://kokkai.ndl.go.jp/api/speech"

DATE_FROM = "2017-10-22"
DATE_UNTIL = "2026-02-28"

COMMITTEES = [
    "本会議",
    "予算委員会", "内閣委員会", "総務委員会", "法務委員会",
    "外務委員会", "財務金融委員会", "文部科学委員会", "厚生労働委員会",
    "農林水産委員会", "経済産業委員会", "国土交通委員会", "環境委員会",
    "安全保障委員会", "国家基本政策委員会", "決算行政監視委員会",
    "議院運営委員会", "懲罰委員会",
    "災害対策特別委員会", "政治改革に関する特別委員会",
    "沖縄及び北方問題に関する特別委員会", "北朝鮮による拉致問題等に関する特別委員会",
    "消費者問題に関する特別委員会", "東日本大震災復興及び原子力問題調査特別委員会",
    "地域活性化・こども政策・デジタル社会形成に関する特別委員会",
    "外交防衛委員会", "財政金融委員会", "行政監視委員会",
    "農林水産・食料問題に関する特別委員会",
]


def build_member_map(client) -> dict:
    result = client.table("members").select("id, name").execute()
    member_map = {}
    for m in result.data:
        key = m["name"].replace(" ", "").replace("　", "").strip()
        member_map[key] = m["id"]
        if "[" in m["name"]:
            short = m["name"].split("[")[0]
            key2 = short.replace(" ", "").replace("　", "").strip()
            member_map[key2] = m["id"]
            real = m["name"].split("[")[1].rstrip("]")
            key3 = real.replace(" ", "").replace("　", "").strip()
            member_map[key3] = m["id"]
    logger.info(f"議員マップ: {len(member_map)}名")
    return member_map


def get_meetings_for_committee(committee: str) -> list:
    meetings = []
    start = 1
    while True:
        params = {
            "nameOfMeeting":  committee,
            "from":           DATE_FROM,
            "until":          DATE_UNTIL,
            "startRecord":    start,
            "maximumRecords": 10,
            "recordPacking":  "json",
        }
        try:
            resp = httpx.get(NDL_MEETING_API, params=params, timeout=30)
            if resp.status_code != 200:
                logger.error(f"API error {resp.status_code}: {committee}")
                break
            data = resp.json()
            records = data.get("meetingRecord", [])
            total   = int(data.get("numberOfRecords", 0))
            for r in records:
                meetings.append({
                    "id":      r.get("issueID"),
                    "name":    r.get("nameOfMeeting", ""),
                    "date":    r.get("date", ""),
                    "house":   r.get("nameOfHouse", ""),
                    "session": int(r.get("session", 0)),
                })
            if start + len(records) - 1 >= total:
                break
            start += 10
            time.sleep(1.0)
        except Exception as e:
            logger.error(f"\u4f1a\u8b70\u53d6\u5f97\u30a8\u30e9\u30fc {committee}: {e}")
            break
    return meetings


def get_speeches_for_meeting(issue_id: str) -> list:
    speeches = []
    start = 1
    while True:
        params = {
            "issueID":        issue_id,
            "startRecord":    start,
            "maximumRecords": 100,
            "recordPacking":  "json",
        }
        try:
            resp = httpx.get(NDL_SPEECH_API, params=params, timeout=30)
            if resp.status_code != 200:
                break
            data = resp.json()
            records = data.get("speechRecord", [])
            total   = int(data.get("numberOfRecords", 0))
            for r in records:
                speaker = r.get("speaker", "")
                if not speaker or speaker == "\u4f1a\u8b70\u9332\u60c5\u5831":
                    continue
                speeches.append({
                    "id":      r.get("speechID"),
                    "speaker": speaker,
                    "text":    (r.get("speech", "") or "")[:2000],
                    "url":     r.get("speechURL", ""),
                })
            if start + len(records) - 1 >= total:
                break
            start += 100
            time.sleep(0.8)
        except Exception as e:
            logger.error(f"\u767a\u8a00\u53d6\u5f97\u30a8\u30e9\u30fc {issue_id}: {e}")
            break
    return speeches


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("\u74b0\u5883\u5909\u6570\u304c\u8a2d\u5b9a\u3055\u308c\u3066\u3044\u307e\u305b\u3093")
        return

    client     = create_client(SUPABASE_URL, SUPABASE_KEY)
    member_map = build_member_map(client)

    total_speeches = 0
    total_meetings = 0

    for committee in COMMITTEES:
        meetings = get_meetings_for_committee(committee)
        logger.info(f"{committee}: {len(meetings)}\u4ef6\u306e\u4f1a\u8b70")

        for meeting in meetings:
            issue_id = meeting["id"]
            if not issue_id:
                continue

            speeches = get_speeches_for_meeting(issue_id)
            rows = []
            for s in speeches:
                key = s["speaker"].replace(" ", "").replace("\u3000", "").strip()
                member_id = member_map.get(key)
                rows.append({
                    "id":             s["id"],
                    "member_id":      member_id,
                    "session_number": meeting["session"],
                    "committee":      meeting["name"],
                    "spoken_at":      meeting["date"],
                    "source_url":     s["url"],
                    "speech_text":    s["text"],
                })

            if rows:
                client.table("speeches").upsert(rows).execute()
                total_speeches += len(rows)

            total_meetings += 1
            logger.info(f"  [{meeting['house']}] {meeting['name']} {meeting['date']}: {len(speeches)}\u4ef6 (\u7d2f\u8a08{total_speeches}\u4ef6)")
            time.sleep(0.5)

    logger.info("speech_count \u3092\u96c6\u8a08\u4e2d...")
    members = client.table("members").select("id").execute()
    for m in members.data:
        result = client.table("speeches").select("id", count="exact").eq("member_id", m["id"]).execute()
        count = result.count or 0
        if count > 0:
            client.table("members").update({"speech_count": count}).eq("id", m["id"]).execute()

    logger.info(f"\u5b8c\u4e86: \u4f1a\u8b70{total_meetings}\u4ef6 \u767a\u8a00{total_speeches}\u4ef6")


if __name__ == "__main__":
    main()
