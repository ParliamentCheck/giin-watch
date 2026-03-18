"""
はたらく議員 — ユーティリティ
名前正規化・政党正規化・議事進行判定など、複数スクリプトから呼ばれる関数群。
"""

from __future__ import annotations

import re
from datetime import date, timedelta

from config import (
    PARTY_MAP,
    PARTY_MAP_KEYS_SORTED,
    PROCEDURAL_ROLES,
    MIN_SPEECH_LENGTH,
    STOP_WORDS,
    STOP_WORD_SUFFIXES,
    KEYWORDS_STALE_DAYS,
)


# ============================================================
# 議員ID生成
# ============================================================
def make_member_id(house: str, name: str) -> str:
    """
    議員IDを生成する。
    スペースを全て除去して正規化する。
    """
    normalized = re.sub(r"\s+", "", name.strip())
    return f"{house}-{normalized}"


# ============================================================
# 政党名正規化
# ============================================================
def normalize_party(faction: str) -> str:
    """
    会派名（生データ）から正規化済み政党名を返す。
    PARTY_MAP のキーを長い順にマッチさせ、最初に一致したものを返す。
    どれにも一致しなければ「無所属」。
    """
    if not faction:
        return "無所属"
    for key in PARTY_MAP_KEYS_SORTED:
        if key in faction:
            return PARTY_MAP[key]
    return "無所属"


# ============================================================
# 議事進行発言の判定
# ============================================================
def is_procedural_speech(speech_text: str) -> bool:
    """
    発言テキストが議事進行（委員長・会長・議長の形式的発言）かどうかを判定する。

    判定ルール:
    1. 30文字以下 → True（相槌）
    2. 冒頭50文字内で「○」の後の最初の「　」までに委員長/会長/議長を含む → True
    """
    if not speech_text:
        return True
    if len(speech_text) <= MIN_SPEECH_LENGTH:
        return True

    head = speech_text[:50]
    # 「○氏名　」パターンから役職を抽出
    match = re.match(r"○([^　]+)", head)
    if match:
        speaker_part = match.group(1)
        for role in PROCEDURAL_ROLES:
            if role in speaker_part:
                return True
    return False


# ============================================================
# 当選回数パーサー
# ============================================================
def parse_terms(terms_raw: str) -> int | None:
    """
    当選回数の生テキストから整数を取得する。
    「6（参1）」→ 6、「当選 3 回」→ 3
    全角カッコにも対応。
    """
    if not terms_raw:
        return None
    # カッコ前の数字を取得
    before_paren = re.split(r"[（(]", str(terms_raw))[0]
    digits = re.search(r"(\d+)", before_paren)
    if digits:
        return int(digits.group(1))
    return None


# ============================================================
# ワードクラウド — フィルタリング
# ============================================================
def build_member_name_set(
    member_names: list[str],
    *,
    last_names: list[str] | None = None,
    first_names: list[str] | None = None,
) -> frozenset[str]:
    """
    全議員名から部分文字列検索用のセットを事前構築する。
    last_names / first_names を渡すと姓・名を個別にセットに追加する。
    フルネームではなく姓・名単位で照合することで偶発的部分文字列の誤除外を防ぐ。
    """
    result: set[str] = set()
    for name in member_names:
        clean = re.sub(r"\s+", "", name.strip())
        if clean:
            result.add(clean)
    for part_list in (last_names or [], first_names or []):
        for part in part_list:
            clean = re.sub(r"\s+", "", (part or "").strip())
            if len(clean) >= 2:
                result.add(clean)
    return frozenset(result)


def should_exclude_word(
    word: str,
    member_name: str = "",
    all_member_names: frozenset[str] | None = None,
) -> bool:
    """
    ワードクラウドから除外すべきか判定する。
    """
    if len(word) <= 1:
        return True
    if word in STOP_WORDS:
        return True
    for suffix in STOP_WORD_SUFFIXES:
        if word.endswith(suffix):
            return True
    # 議員自身の名前（部分文字列も除外）
    if member_name:
        clean = re.sub(r"\s+", "", member_name.strip())
        if len(word) >= 2 and word in clean:
            return True
    # 他の議員名（部分文字列も除外）
    if all_member_names:
        for name in all_member_names:
            if word in name:
                return True
    return False


def is_stale_keyword(last_seen_at: date | str | None) -> bool:
    """last_seen_at が KEYWORDS_STALE_DAYS 以上前なら True。"""
    if last_seen_at is None:
        return True
    if isinstance(last_seen_at, str):
        last_seen_at = date.fromisoformat(last_seen_at)
    return (date.today() - last_seen_at) > timedelta(days=KEYWORDS_STALE_DAYS)


# ============================================================
# テキスト正規化
# ============================================================
def normalize_whitespace(text: str) -> str:
    """連続する空白を全角スペース1つに正規化する。"""
    return re.sub(r"\s+", "\u3000", text.strip())


def clean_html(html: str) -> str:
    """簡易HTMLタグ除去。"""
    return re.sub(r"<[^>]+>", "", html).strip()
