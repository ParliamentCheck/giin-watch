# apps/collector/sources/party_whip.py
"""
党議拘束チェッカー — データ収集モジュール

【課題と現実的な対処方針】
党の「公式賛否方針」は日本では一元的な公開データが存在しない。
以下の3段階の信頼度でデータを収集・管理する。

  confirmed  = 党公式サイト・プレスリリースから取得（最も信頼性高）
  inferred   = 幹事長・党首コメントの報道から推定
  unknown    = 方針不明（この状態の法案は党議拘束表示をしない）

【データ取得元】（優先度順）
  1. 各党公式サイトの「政策・活動」ページ
  2. 衆議院・参議院の会派別投票結果（同一会派の投票パターンから推定）
  3. 手動入力によるメンテナンス（重要法案のみ）
"""

import logging
import time
from typing import Optional
import httpx
from bs4 import BeautifulSoup

logger = logging.getLogger(__name__)

# ─── 党公式サイトURL（要定期メンテナンス）─────────────────────
PARTY_SITES = {
    "自民党":         "https://www.jimin.jp/activity/",
    "立憲民主党":     "https://cdp-japan.jp/news/",
    "公明党":         "https://www.komei.or.jp/news/",
    "日本維新の会":   "https://o-ishin.jp/news/",
    "国民民主党":     "https://new-kokumin.jp/news/",
    "共産党":         "https://www.jcp.or.jp/",
    "れいわ新選組":   "https://reiwa-shinsengumi.com/news/",
    "社民党":         "https://sdp.or.jp/news/",
}


def infer_party_stance_from_voting_pattern(
    bill_id: str,
    party: str,
    votes: list[dict],
) -> Optional[str]:
    """
    同一会派議員の投票パターンから党方針を推定する。
    全議員の80%以上が同じ投票をした場合、それを党方針と推定。

    Args:
        bill_id:  法案ID
        party:    政党名
        votes:    [{member_id, party, choice}, ...] の投票リスト

    Returns:
        推定される党方針 ("賛成" | "反対" | None)
        ※ 判定不能な場合は None を返す
    """
    party_votes = [v["choice"] for v in votes if v["party"] == party]

    if len(party_votes) < 3:
        # サンプルが少なすぎる場合は推定しない
        return None

    for choice in ["賛成", "反対"]:
        ratio = party_votes.count(choice) / len(party_votes)
        if ratio >= 0.80:
            return choice

    return None  # 判定不能（党内で割れている）


def find_deviations(
    bill_id: str,
    bill_name: str,
    party_stance: str,
    party: str,
    stance_confidence: str,
    votes: list[dict],
) -> list[dict]:
    """
    党方針と異なる投票をした議員を抽出する。

    「欠席」は離反として扱わない（体調・慶弔等の理由があるため）。
    「棄権」は明示的な離反として扱う。

    Returns:
        [{member_id, member_name, party, actual_vote, ...}, ...]
    """
    deviations = []

    for vote in votes:
        if vote["party"] != party:
            continue
        if vote["choice"] == "欠席":
            # 欠席は離反扱いしない
            continue
        if vote["choice"] != party_stance:
            deviations.append({
                "member_id":         vote["member_id"],
                "member_name":       vote["member_name"],
                "party":             party,
                "bill_id":           bill_id,
                "bill_name":         bill_name,
                "party_stance":      party_stance,
                "actual_vote":       vote["choice"],
                "stance_confidence": stance_confidence,
            })

    return deviations


# ─── スクレイピング（自民党の例）──────────────────────────────
# 各党サイトの構造が変わった際にこの関数だけ修正すればよい

def scrape_ldp_statements(keyword: str) -> list[dict]:
    """
    自民党公式サイトからキーワードに関連する声明を取得する。
    構造変更に備えてエラー時は空リストを返す（サイレントフェイル）。
    """
    try:
        resp = httpx.get(
            PARTY_SITES["自民党"],
            params={"s": keyword},
            timeout=20,
            headers={"User-Agent": "GiinWatch/1.0 (public interest)"}
        )
        resp.raise_for_status()
        soup = BeautifulSoup(resp.text, "html.parser")

        results = []
        # ※ セレクタは実際のサイト構造に合わせて調整が必要
        for item in soup.select(".news-item"):
            results.append({
                "title":  item.select_one(".title").get_text(strip=True),
                "date":   item.select_one(".date").get_text(strip=True),
                "url":    item.select_one("a")["href"],
            })
        return results

    except Exception as e:
        logger.warning(f"自民党サイトスクレイピング失敗: {e}")
        return []
