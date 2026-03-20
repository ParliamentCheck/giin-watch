"""
はたらく議員 — 選挙得票数・当選人数収集

対象選挙:
  衆院 2026 (R8) / 2024 (R6)
  参院 2025 (R7) / 2022 (R4)

出典: 総務省公式 PDF/XLSX（001055922.pdf, 001027815.xlsx, 001027816.xlsx）

テーブル: election_votes
  id            text PK  ({party}-{election_type}-{year})
  party         text
  election_type text ("衆院" | "参院")
  election_year int
  smd_votes     bigint  小選挙区/選挙区 得票数
  pr_votes      bigint  比例代表 得票数
  smd_seats     int     小選挙区/選挙区 当選数
  pr_seats      int     比例代表 当選数
"""

from __future__ import annotations

import logging
import sys

from db import get_client, batch_upsert

logger = logging.getLogger("election_votes")

# ============================================================
# 得票数・当選人数 定数
# 出典: 総務省公式資料（PDF/XLSX）を手動で確認した値
# {party: (smd_votes, pr_votes, smd_seats, pr_seats)}
# ============================================================

# 衆院 2026 (R8)
# 得票数: 001055922.pdf p22（小選挙区）/ p24（比例）
# 議席数: 各メディア確定報道
SHUGIIN_2026: dict[str, tuple[int, int, int, int]] = {
    "自由民主党":             (27_710_493, 21_026_140, 248, 67),
    "中道改革連合":           (12_209_641, 10_438_802,   7, 42),
    "日本維新の会":           ( 3_742_160,  4_943_330,  20, 16),
    "国民民主党":             ( 4_243_282,  5_572_951,   8, 20),
    "参政党":                 ( 3_924_223,  4_260_620,   0, 15),
    "日本共産党":             ( 2_283_885,  2_519_811,   0,  4),
    "れいわ新選組":           (   255_496,  1_672_500,   0,  1),
    "チームみらい":           (   156_853,  3_813_750,   0, 11),
    "減税日本・ゆうこく連合": (   354_617,    814_874,   1,  0),
    "日本保守党":             (    97_753,  1_455_563,   0,  0),
    "社会民主党":             (   148_666,    728_602,   0,  0),
    "無所属":                 ( 1_253_346,          0,   5,  0),
}

# 参院 2025 (R7)
# 得票数: 001027815.xlsx（比例）/ 001027816.xlsx（選挙区）今回欄
SANGIIN_2025: dict[str, tuple[int, int, int, int]] = {
    "自由民主党":   (14_470_016, 12_808_306, 27, 12),
    "立憲民主党":   ( 9_119_655,  7_397_457, 14,  7),
    "参政党":       ( 9_264_284,  7_425_053,  7,  7),
    "国民民主党":   ( 7_180_653,  7_620_492, 10,  7),
    "公明党":       ( 3_175_790,  5_210_569,  4,  4),
    "日本維新の会": ( 3_451_834,  4_375_927,  3,  4),
    "れいわ新選組": ( 1_881_606,  3_879_914,  0,  3),
    "日本共産党":   ( 2_831_672,  2_864_738,  1,  2),
    "日本保守党":   (   652_266,  2_982_093,  0,  2),
    "チームみらい": (   956_674,  1_517_890,  0,  1),
    "社会民主党":   (   302_775,  1_217_823,  0,  1),
    "無所属":       ( 4_265_238,    289_222,  8,  0),  # 無所属連合(341,436票)と無所属(3,923,802票)を合算
}

# 参院 2022 (R4)
# 得票数: 同XLSX前回欄
SANGIIN_2022: dict[str, tuple[int, int, int, int]] = {
    "自由民主党":      (20_603_298, 18_256_245, 45, 18),
    "立憲民主党":      ( 8_154_330,  6_771_945,  9,  7),
    "日本維新の会":    ( 5_533_657,  7_845_995,  4,  8),
    "公明党":          ( 3_600_490,  6_181_431,  7,  6),
    "国民民主党":      ( 2_038_654,  3_159_625,  2,  3),
    "日本共産党":      ( 3_636_533,  3_618_342,  1,  3),
    "れいわ新選組":    (   989_716,  2_319_156,  1,  2),
    "参政党":          ( 2_018_214,  1_768_385,  1,  0),
    "社会民主党":      (   178_911,  1_258_501,  0,  1),
    "NHK党":           ( 1_106_508,  1_253_872,  0,  1),
    "無所属":          ( 4_285_360,          0,  5,  0),
}


# ============================================================
# メイン: DB upsert
# ============================================================

def collect_election_votes() -> None:
    logger.info("選挙得票データ収集開始")

    rows: list[dict] = []

    def add_rows(data: dict, election_type: str, election_year: int) -> None:
        for party, (smd_v, pr_v, smd_s, pr_s) in data.items():
            rows.append({
                "id":            f"{party}-{election_type}-{election_year}",
                "party":         party,
                "election_type": election_type,
                "election_year": election_year,
                "smd_votes":     smd_v or None,
                "pr_votes":      pr_v or None,
                "smd_seats":     smd_s,
                "pr_seats":      pr_s,
            })

    add_rows(SHUGIIN_2026, "衆院", 2026)
    add_rows(SANGIIN_2025, "参院", 2025)
    add_rows(SANGIIN_2022, "参院", 2022)

    logger.info("合計 %d 行を upsert", len(rows))
    batch_upsert("election_votes", rows, on_conflict="id", label="election_votes")
    logger.info("選挙得票データ収集完了")


if __name__ == "__main__":
    import argparse
    logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(name)s: %(message)s")
    collect_election_votes()
