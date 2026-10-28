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
# 議員ID生成・名寄せ
# ============================================================
def make_member_id(house: str, name: str) -> str:
    """
    議員IDを生成する。
    スペースを全て除去して正規化する。
    """
    normalized = re.sub(r"\s+", "", name.strip())
    return f"{house}-{normalized}"


def build_name_to_id(members_data: list[dict]) -> dict[str, str]:
    """
    name・alias_name・ndl_names の全フィールドから
    正規化済み名前 → member_id のマップを構築する。

    全スクリプトの名寄せはこの関数を唯一の実装とする。
    名寄せロジックを修正する場合はここだけ直す。

    優先順位: name > alias_name > ndl_names（先勝ち）
    """
    name_to_id: dict[str, str] = {}
    for m in members_data:
        member_id = m["id"]
        # 本名
        norm = re.sub(r"[\s\u3000]+", "", (m.get("name") or ""))
        if norm and norm not in name_to_id:
            name_to_id[norm] = member_id
        # 通称名
        alias = re.sub(r"[\s\u3000]+", "", (m.get("alias_name") or ""))
        if alias and alias not in name_to_id:
            name_to_id[alias] = member_id
        # NDL名（読み仮名・旧姓等、配列）
        for ndl in (m.get("ndl_names") or []):
            ndl_norm = re.sub(r"[\s\u3000]+", "", ndl)
            if ndl_norm and ndl_norm not in name_to_id:
                name_to_id[ndl_norm] = member_id
    return name_to_id


class SpeakerResolver:
    """国会会議録の話者 → member_id。発言・会派履歴の名寄せはこのクラスに一本化する。

    規則（推測で別人に付けない）:
      1. 話者名（空白除去）に当たる議員が1人だけ → その議員（会議の院は問わない。
         大臣・発議者として他院の会議で発言した場合も本人の発言として扱う）
      2. 同姓同名の別人（config.HOMONYM_SPEAKER_GROUPS）→ 発言時点の会派で区別。当てはまらなければ付けない
      3. 同じ名前の議員レコードが複数（院を移った同一人物など）→ 会議の院と同じ院のレコード。無ければ付けない
      4. 名簿にない話者（議員以外・登録のない元議員）→ 付けない
    """

    def __init__(self, members: list[dict]):
        from config import HOMONYM_SPEAKER_GROUPS
        self.homonyms = HOMONYM_SPEAKER_GROUPS
        self.by_name: dict[str, list[dict]] = {}
        for m in members:
            names = {re.sub(r"[\s\u3000]+", "", m.get("name") or "")}
            names |= {re.sub(r"[\s\u3000]+", "", n) for n in (m.get("ndl_names") or [])}
            names.discard("")
            for n in names:
                lst = self.by_name.setdefault(n, [])
                if all(x["id"] != m["id"] for x in lst):
                    lst.append({"id": m["id"], "house": m.get("house") or ""})

    def resolve(self, speaker: str, meeting_house: str, speaker_group: str | None) -> str | None:
        name = re.sub(r"[\s\u3000]+", "", speaker or "")
        if name in self.homonyms:
            for member_id, groups in self.homonyms[name].items():
                if speaker_group and speaker_group in groups:
                    return member_id
            return None
        candidates = self.by_name.get(name) or []
        if len(candidates) == 1:
            return candidates[0]["id"]
        same_house = [c for c in candidates if c["house"] and c["house"] in (meeting_house or "")]
        if len(same_house) == 1:
            return same_house[0]["id"]
        return None

    def duplicate_names(self) -> list[str]:
        """同じ名前に複数の議員レコードがあり、同姓同名の設定がないもの（監査用）"""
        return sorted(n for n, lst in self.by_name.items() if len(lst) > 1 and n not in self.homonyms)


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
    last_name_readings: list[str] | None = None,
    first_name_readings: list[str] | None = None,
) -> frozenset[str]:
    """
    全議員名から部分文字列検索用のセットを事前構築する。
    姓・名・読み仮名（姓/名）を個別に登録することで偶発的部分文字列の誤除外を防ぐ。
    """
    result: set[str] = set()
    for name in member_names:
        clean = re.sub(r"\s+", "", name.strip())
        if clean:
            result.add(clean)
    for part_list in (last_names or [], first_names or [], last_name_readings or [], first_name_readings or []):
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
