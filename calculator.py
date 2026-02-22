# packages/scoring/calculator.py
"""
活動スコア算出モジュール
各指標を独立した関数に分け、追加・変更が容易な構造にする。

スコア構成（合計100点）:
  出席率        30点
  発言回数      30点
  質問主意書    15点
  議員立法      15点
  委員会参加    10点
"""

from dataclasses import dataclass
from typing import Optional
import math


@dataclass
class MemberStats:
    member_id: str
    attendance_rate: float        # 0.0 〜 1.0
    speech_count: int             # 当該国会会期中
    written_question_count: int   # 質問主意書提出数
    sponsored_bills: int          # 議員立法提出数
    committee_rate: float         # 委員会出席率 0.0 〜 1.0


@dataclass
class ScoreBreakdown:
    attendance: int    # 0〜30
    speeches: int      # 0〜30
    questions: int     # 0〜15
    bills: int         # 0〜15
    committee: int     # 0〜10
    total: int         # 0〜100


# ─── 各指標のスコア算出 ────────────────────────────────────────
# 関数を追加するだけで新指標を組み込める

def score_attendance(rate: float) -> int:
    """出席率を0〜30点に変換。75%未満は急激に下がる。"""
    if rate >= 0.95:
        return 30
    elif rate >= 0.85:
        return int(20 + (rate - 0.85) / 0.10 * 10)
    elif rate >= 0.75:
        return int(10 + (rate - 0.75) / 0.10 * 10)
    else:
        # 75%未満はペナルティ
        return max(0, int(rate / 0.75 * 10))


def score_speeches(count: int) -> int:
    """発言回数を0〜30点に変換。対数スケールで逓増。"""
    if count <= 0:
        return 0
    # 60回で満点（平均的な活発議員の基準）
    raw = math.log(count + 1) / math.log(61) * 30
    return min(30, int(raw))


def score_written_questions(count: int) -> int:
    """質問主意書を0〜15点に変換。"""
    if count <= 0:
        return 0
    # 20件で満点
    return min(15, int(count / 20 * 15))


def score_sponsored_bills(count: int) -> int:
    """議員立法を0〜15点に変換。"""
    if count <= 0:
        return 0
    # 5件で満点
    return min(15, int(count / 5 * 15))


def score_committee(rate: float) -> int:
    """委員会出席率を0〜10点に変換。"""
    return min(10, int(rate * 10))


# ─── 統合スコア算出 ───────────────────────────────────────────

def calculate_score(stats: MemberStats) -> ScoreBreakdown:
    """
    MemberStats を受け取り、ScoreBreakdown を返す。
    DBへの保存やAPI返却はこの関数を使う。
    """
    attendance = score_attendance(stats.attendance_rate)
    speeches   = score_speeches(stats.speech_count)
    questions  = score_written_questions(stats.written_question_count)
    bills      = score_sponsored_bills(stats.sponsored_bills)
    committee  = score_committee(stats.committee_rate)

    return ScoreBreakdown(
        attendance=attendance,
        speeches=speeches,
        questions=questions,
        bills=bills,
        committee=committee,
        total=attendance + speeches + questions + bills + committee,
    )


# ─── スコアのラベル ───────────────────────────────────────────

def score_label(total: int) -> dict:
    """スコアに対応する表示ラベルと色を返す。"""
    if total >= 80:
        return {"label": "活発", "color": "#22c55e", "alert": False}
    elif total >= 60:
        return {"label": "普通", "color": "#f59e0b", "alert": False}
    elif total >= 40:
        return {"label": "低調", "color": "#f97316", "alert": True}
    else:
        return {"label": "不活発", "color": "#ef4444", "alert": True}


# ─── テスト用 ─────────────────────────────────────────────────
if __name__ == "__main__":
    test_cases = [
        MemberStats("A", 0.98, 120, 30, 5, 0.95),   # 活発な議員
        MemberStats("B", 0.72, 8,   1,  0, 0.60),   # 低活動議員
        MemberStats("C", 0.90, 45, 10,  2, 0.85),   # 中程度
    ]
    for s in test_cases:
        result = calculate_score(s)
        label = score_label(result.total)
        print(f"ID:{s.member_id} → 合計:{result.total}点 [{label['label']}]")
        print(f"  出席:{result.attendance} 発言:{result.speeches} "
              f"質問:{result.questions} 立法:{result.bills} 委員会:{result.committee}")
