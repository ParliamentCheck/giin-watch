"""
一回限りのバックフィル: speech_excerpts を第210回国会（2022-10-03）以降の全期間で再収集する。

既存行は upsert で保持されるためサイトへの影響なし。
完了後、各議員の保持件数が EXCERPT_KEEP_COUNT（30件）に整理される。
"""

import sys
import os

# collector パッケージをパスに追加
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "apps", "collector"))

from sources.speeches import collect_speeches

if __name__ == "__main__":
    collect_speeches(date_from="2022-10-03", date_until=None)  # date_until=None → 今日まで
    print("バックフィル完了")
