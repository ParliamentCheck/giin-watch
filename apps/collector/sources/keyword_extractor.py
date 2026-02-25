import os
import json
import logging
from collections import Counter
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
    "大臣", "総理", "内閣", "省", "庁", "局", "課", "室",
    "資料", "報告", "説明", "発言", "趣旨", "御", "各", "当該",
    "一", "二", "三", "四", "五", "六", "七", "八", "九", "十",
    "今", "今日", "昨日", "来年", "今年", "先ほど", "ただいま",
}


def extract_keywords(texts: list[str]) -> list[dict]:
    try:
        from janome.tokenizer import Tokenizer
        t = Tokenizer()
    except ImportError:
        logger.error("janomeがインストールされていません: pip3 install janome")
        return []

    counter = Counter()
    combined = " ".join(texts)

    for token in t.tokenize(combined):
        pos = token.part_of_speech.split(",")
        # 名詞（一般）または名詞（固有名詞）のみ
        if pos[0] != "名詞":
            continue
        if pos[1] not in ("一般", "固有名詞"):
            continue
        word = token.surface.strip()
        if len(word) < 2:
            continue
        if word in STOP_WORDS:
            continue
        if word.isdigit():
            continue
        counter[word] += 1

    return [{"word": word, "count": count} for word, count in counter.most_common(50)]


def main():
    if not SUPABASE_URL or not SUPABASE_KEY:
        logger.error("環境変数が設定されていません")
        return

    client = create_client(SUPABASE_URL, SUPABASE_KEY)

    # 発言テキストがある議員を取得
    members = client.table("members").select("id, name").execute()
    logger.info(f"対象議員: {len(members.data)}名")

    updated = 0
    for m in members.data:
        # ページネーションで全発言テキストを取得
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

        if not texts:
            continue

        keywords = extract_keywords(texts)
        if not keywords:
            continue

        client.table("members").update({"keywords": keywords}).eq("id", m["id"]).execute()
        updated += 1
        logger.info(f"  ✓ {m['name']}: {len(keywords)}件のキーワード")

    logger.info(f"完了: {updated}名を更新")


if __name__ == "__main__":
    main()
