import os
import re
import logging
from collections import Counter
from datetime import datetime, timezone
from supabase import create_client

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

STOP_WORDS = {
    "委員長", "大臣", "質疑", "法案", "令和", "平成", "質問", "答弁",
    "法律", "会議", "本日", "我々", "政府", "参考人", "提出", "検討",
    "先生", "御指摘", "確認", "委員", "これら", "それら", "もの",
    "こと", "ため", "よう", "以上", "以下", "関係", "必要", "対応",
    "実施", "状況", "内容", "問題", "措置", "制度", "方針", "推進",
    "取組", "観点", "意味", "場合", "部分", "形", "方", "点", "等",
    "議員", "国会", "衆議院", "参議院", "委員会", "理事", "会長",
    "資料", "報告", "説明", "発言", "趣旨", "御", "各", "当該",
    "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
    "今", "今日", "昨日", "来年", "今年", "先ほど", "ただいま", "総理", "総理大臣", "内閣総理大臣",
}


def extract_keywords(texts: list, exclude_names: list = None) -> list:
    try:
        from janome.tokenizer import Tokenizer
        t = Tokenizer()
    except ImportError:
        logger.error("janomeがインストールされていません")
        return []

    counter = Counter()
    combined = " ".join(texts)
    for token in t.tokenize(combined):
        pos = token.part_of_speech.split(",")
        if pos[0] != "名詞":
            continue
        if pos[1] not in ("一般", "固有名詞"):
            continue
        word = token.surface.strip()
        if len(word) < 2 or word in STOP_WORDS or word.isdigit():
            continue
        if exclude_names and any(n in word or word in n for n in exclude_names):
            continue
        counter[word] += 1

    return [{"word": w, "count": c} for w, c in counter.most_common(50)]


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 全議員を取得
    members = client.table("members").select("id, name, keywords_updated_at").execute()
    logger.info(f"対象議員: {len(members.data)}名")

    updated = 0
    skipped = 0

    for m in members.data:
        keywords_updated_at = m.get("keywords_updated_at")

        # 最後のキーワード更新以降に新しい発言があるか確認
        query = client.table("speeches").select("id", count="exact") \
            .eq("member_id", m["id"]) \
            .not_.is_("speech_text", "null")

        if keywords_updated_at:
            query = query.gt("spoken_at", keywords_updated_at)

        new_speeches = query.execute()

        if keywords_updated_at and new_speeches.count == 0:
            skipped += 1
            continue

        # 全発言テキストを取得
        texts = []
        start = 0
        while True:
            result = client.table("speeches").select("speech_text") \
                .eq("member_id", m["id"]) \
                .not_.is_("speech_text", "null") \
                .range(start, start + 999).execute()
            if not result.data:
                break
            texts.extend(r["speech_text"] for r in result.data if r["speech_text"])
            if len(result.data) < 1000:
                break
            start += 1000

        # 質問主意書のタイトルも含める
        q_result = client.table('questions').select('title') \
            .eq('member_id', m['id']) \
            .not_.is_('title', 'null').execute()
        for q in (q_result.data or []):
            if q['title']:
                texts.append(q['title'])

        if not texts:
            client.table("members").update({
                "keywords": [],
                "keywords_updated_at": datetime.now(timezone.utc).isoformat(),
            }).eq("id", m["id"]).execute()
            continue

        name_parts = [p for p in m["name"].replace("　", " ").split() if len(p) >= 2]
        keywords = extract_keywords(texts, exclude_names=name_parts)
        client.table("members").update({
            "keywords": keywords,
            "keywords_updated_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", m["id"]).execute()
        updated += 1

        if updated % 10 == 0:
            logger.info(f"  {updated}名完了...")

    logger.info(f"完了: 更新{updated}名 / スキップ{skipped}名")


if __name__ == "__main__":
    main()
