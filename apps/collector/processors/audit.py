"""
はたらく議員 — データ品質監査
ランダムに選んだ議員のデータをソース（NDL API・官邸）と照合し、不整合を検出する。

使い方:
  python apps/collector/processors/audit.py
  python apps/collector/processors/audit.py --sample 10
  python apps/collector/processors/audit.py --output /tmp/audit_report.md
"""

from __future__ import annotations

import argparse
import logging
import random
import re
import sys
import time
from datetime import date, timedelta
from urllib.parse import urlencode

import httpx
import requests
from bs4 import BeautifulSoup

from config import NDL_API_BASE, NDL_RATE_LIMIT_SEC
from db import get_client, execute_with_retry

logger = logging.getLogger("audit")

SAMPLE_SIZE = 5
CHECK_DAYS = 90
HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}


# ============================================================
# NDL API 発言数チェック
# ============================================================

def _ndl_speech_count(name: str, house: str, date_from: str, date_until: str) -> int:
    """NDL APIで指定議員・期間の発言件数を取得。エラー時は -1 を返す。"""
    params = {
        "speaker": name,
        "nameOfHouse": house,
        "from": date_from,
        "until": date_until,
        "recordPacking": "json",
        "maximumRecords": 1,
        "startRecord": 1,
    }
    url = f"{NDL_API_BASE}?{urlencode(params)}"
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        total = data.get("numberOfRecords", 0)
        return int(total) if str(total).isdigit() else 0
    except Exception as e:
        logger.warning("NDL API エラー (%s): %s", name, e)
        return -1


def check_speech_count(member: dict, client) -> dict | None:
    """
    直近90日の発言数をNDL APIとDBで比較する。
    NDLに発言があるのにDBが0件 = member_id紐付けの失敗を示す。
    """
    mid = member["id"]
    name = member["name"]
    house = member["house"]

    today = date.today()
    date_until = (today - timedelta(days=7)).isoformat()  # NDL遅延を考慮して直近7日は除外
    date_from = (today - timedelta(days=CHECK_DAYS)).isoformat()

    # DB側: is_procedural=false の発言数
    result = execute_with_retry(
        lambda: (
            client.table("speeches")
            .select("id", count="exact")
            .eq("member_id", mid)
            .eq("is_procedural", False)
            .gte("spoken_at", date_from)
            .lte("spoken_at", date_until)
        ),
        label=f"audit_speeches:{mid}",
    )
    db_count = result.count or 0

    # NDL API側 (procedural含む)
    ndl_count = _ndl_speech_count(name, house, date_from, date_until)
    time.sleep(NDL_RATE_LIMIT_SEC)

    if ndl_count < 0:
        return None  # APIエラーはスキップ

    # NDLに発言があるのにDBが0件は明確な問題
    if db_count == 0 and ndl_count > 10:
        return {
            "type": "発言データ未収集",
            "member": name,
            "detail": (
                f"NDL APIでは直近{CHECK_DAYS}日に{ndl_count}件の発言があるが、"
                f"DBには0件しかない。member_idの紐付け失敗またはデータ未収集の可能性。"
            ),
        }

    return None


# ============================================================
# 大臣職チェック
# ============================================================

def _scrape_kantei_names() -> set[str]:
    """官邸サイトから現在の閣僚・副大臣・政務官の名前セットを取得する。"""
    names: set[str] = set()
    try:
        resp = httpx.get("https://www.kantei.go.jp/", headers=HEADERS, timeout=30)
        match = re.search(r'/jp/(\d+[^/]*)/', resp.text)
        if not match:
            logger.warning("官邸: 内閣番号を取得できなかった")
            return names
        cabinet_num = match.group(1)

        for page in ["meibo/index.html", "meibo/fukudaijin.html", "meibo/seimukan.html"]:
            url = f"https://www.kantei.go.jp/jp/{cabinet_num}/{page}"
            try:
                r = httpx.get(url, headers=HEADERS, timeout=30)
                soup = BeautifulSoup(r.text, "html.parser")
                for line in soup.get_text().split("\n"):
                    line = line.strip()
                    if "名簿" in line:
                        continue
                    m = re.match(r'^(.+?)（([ぁ-んァ-ンー\s　]+)）$', line)
                    if m:
                        names.add(re.sub(r'\s+', '', m.group(1)))
            except Exception as e:
                logger.warning("官邸ページ取得失敗 (%s): %s", page, e)

    except Exception as e:
        logger.warning("官邸スクレイプ失敗: %s", e)

    return names


def check_all_cabinet_posts(client, kantei_names: set[str]) -> list[dict]:
    """
    DB で cabinet_post が設定されている全議員を官邸と照合する。
    退任しているのに DB に役職が残っている場合を検出する。
    """
    if not kantei_names:
        return []

    cabinet_members = execute_with_retry(
        lambda: (
            client.table("members")
            .select("id, name, cabinet_post")
            .not_.is_("cabinet_post", "null")
            .limit(100)
        ),
        label="audit_cabinet_members",
    ).data or []

    findings = []
    for m in cabinet_members:
        clean_name = re.sub(r'\s+', '', m["name"])
        if clean_name not in kantei_names:
            findings.append({
                "type": "大臣職データ不整合",
                "member": m["name"],
                "detail": (
                    f"DBに「{m['cabinet_post']}」が設定されているが官邸ページに名前がない。"
                    f"退任済みの可能性。cabinet_scraperを確認してください。"
                ),
            })

    return findings


# ============================================================
# 監査実行
# ============================================================

def run_audit(sample_size: int = SAMPLE_SIZE) -> list[dict]:
    client = get_client()

    # 現職議員をランダムサンプリング
    members = execute_with_retry(
        lambda: (
            client.table("members")
            .select("id, name, house, cabinet_post")
            .eq("is_active", True)
            .limit(2000)
        ),
        label="audit_fetch_members",
    ).data or []

    sample = random.sample(members, min(sample_size, len(members)))
    logger.info("監査対象 (%d名): %s", len(sample), [m["name"] for m in sample])

    findings: list[dict] = []

    # 発言数チェック（サンプル議員）
    for member in sample:
        logger.info("発言チェック: %s", member["name"])
        finding = check_speech_count(member, client)
        if finding:
            findings.append(finding)

    # 大臣職チェック（全閣僚）
    logger.info("大臣職チェック中...")
    kantei_names = _scrape_kantei_names()
    logger.info("官邸閣僚: %d名取得", len(kantei_names))
    findings.extend(check_all_cabinet_posts(client, kantei_names))

    return findings


# ============================================================
# レポート生成・出力
# ============================================================

def _build_report(findings: list[dict], sample_size: int) -> str:
    today = date.today().isoformat()
    lines = [
        f"## データ品質監査レポート",
        f"",
        f"**実施日**: {today}",
        f"**発言チェック人数**: {sample_size}名（ランダムサンプリング）",
        f"**検出件数**: {len(findings)}件",
        f"",
        f"### 検出された不整合",
        f"",
    ]
    for f in findings:
        lines.append(f"- **[{f['type']}]** {f['member']}")
        lines.append(f"  - {f['detail']}")
        lines.append(f"")
    lines += [
        f"---",
        f"*このIssueはデータ品質監査スクリプトによって自動作成されました。*",
        f"*調査・修正が完了したらCloseしてください。*",
    ]
    return "\n".join(lines)


def main(sample_size: int = SAMPLE_SIZE, output_path: str | None = None) -> None:
    findings = run_audit(sample_size)

    if findings:
        logger.warning("不整合を検出: %d件", len(findings))
        for f in findings:
            logger.warning("  [%s] %s: %s", f["type"], f["member"], f["detail"])

        if output_path:
            report = _build_report(findings, sample_size)
            with open(output_path, "w", encoding="utf-8") as fp:
                fp.write(report)
            logger.info("レポートを書き出し: %s", output_path)

        sys.exit(1)
    else:
        logger.info("✓ 不整合なし（発言チェック%d名・大臣職全員）", sample_size)
        sys.exit(0)


if __name__ == "__main__":
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    parser = argparse.ArgumentParser(description="データ品質監査")
    parser.add_argument("--sample", type=int, default=SAMPLE_SIZE, help="発言チェックの対象人数")
    parser.add_argument("--output", type=str, default=None, help="レポートをMarkdownファイルに書き出す")
    args = parser.parse_args()
    try:
        main(args.sample, args.output)
    except Exception:
        logger.exception("監査スクリプト失敗")
        sys.exit(1)
