"""
はたらく議員 — データ品質監査

ランダムに選んだ議員のデータを外部ソース・本番ページと照合し、不整合を検出する。
不整合が見つかった場合、collect.yml が GitHub Issue を自動作成する。

使い方:
  python apps/collector/processors/audit.py
  python apps/collector/processors/audit.py --sample 10
  python apps/collector/processors/audit.py --output /tmp/audit_report.md

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 検出できること
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. 発言データ未収集（NDL API 照合）
   - NDL APIで「直近90日に10件以上の発言がある」のにDBが0件の議員を検出
   - DB・NDLともに procedural 含む全発言数で比較（片側のみフィルタリングすると
     委員会委員長など議事進行発言のみの期間がある議員で誤検知が発生するため）
   - member_idの紐付け失敗、またはスクレイパーが止まっている場合に発火

2. 大臣職データ不整合（官邸サイト照合）
   - DBに cabinet_post が設定されているのに官邸ページにその議員の名前がない場合を検出
   - 大臣が退任したのにDBにデータが残っている場合に発火

3. ページ表示エラー（本番HTTP照合）
   - is_active=True の議員ページが404を返す場合を検出
   - IDのエンコードバグ・ルーティング壊れ・議員登録漏れなどに発火

4. 表示値不整合（本番ページ JSON-LD 照合）
   - 本番ページのSSR埋め込みJSON-LD（session_count / question_count /
     bill_count / petition_count）とDBの値が乖離している場合を検出
   - 判定条件: 絶対差 ≥ 5件 かつ 相対差 ≥ 20%（1時間キャッシュ遅延を許容）
   - キャッシュ未更新・フロントのクエリバグなどに発火

5. コレクター停止検出（最終収集日チェック）  ← R-1
   - speeches / questions の最新レコード日付が FRESHNESS_WARN_DAYS 以上前なら警告
   - DBに古いデータが残っていても、新規収集が止まっていれば検知できる

6. スクレイパーサイレント失敗検出（NULL率監視）  ← R-2
   - 直近30日の questions / sangiin_questions の submitted_at NULL率が
     NULL_RATE_WARN（30%）を超えたら警告
   - 公式サイトのHTML構造変更によるサイレント失敗を検知する
   - speeches の直近30日 member_id NULL率も同様に監視

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
■ 検出できないこと（設計上の限界）
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

- データの「多い・少ない」の正確な判断
    NDL比較は「0件 vs 10件以上」の極端な欠落のみ検出。
    本来100件あるべきが50件になっていても検知できない（正解値が不明なため）。

- 全議員の網羅的確認
    毎回 --sample 人数（デフォルト5名）のランダムサンプリング。
    特定の議員に問題があっても、選ばれなければ見落とす。

- クライアントサイドで描画されるデータ
    委員会所属数・採決数・発言一覧・キーワード（ワードクラウド）などは
    CSRのためHTMLに出力されず、HTTP取得では確認できない。

- scoring.py の計算正確性
    DBの session_count 等を正解値として扱うため、スコア計算バグは検出できない。

- 衆院の採決データ
    取得していないため検証対象外。
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import random
import re
import sys
import time
from datetime import date, timedelta
from urllib.parse import urlencode, quote

import httpx
import requests
from bs4 import BeautifulSoup

from config import NDL_API_BASE, NDL_HEADERS, NDL_RATE_LIMIT_SEC
from db import get_client, execute_with_retry

logger = logging.getLogger("audit")

SAMPLE_SIZE = 5
CHECK_DAYS = 90
HEADERS = {"User-Agent": "GiinWatch/1.0 (public interest research)"}

SITE_BASE_URL = os.environ.get("SITE_BASE_URL", "https://www.hataraku-giin.com")
DISPLAY_DIFF_ABS = 5    # これ以上の絶対差を報告
DISPLAY_DIFF_PCT = 0.20  # かつ相対差がこれ以上の場合のみ報告

FRESHNESS_WARN_DAYS = 14  # R-1: 最終収集からこの日数を超えたら警告
NULL_RATE_WARN = 0.30     # R-2: NULL率がこれ以上なら警告
NULL_CHECK_DAYS = 30      # R-2: NULL率チェックの対象期間（直近N日）
MEMBER_UNMATCHED_WARN = 0.02  # 国会議員の発言のうち議員と照合できない割合がこれ以上なら警告


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
        resp = requests.get(url, headers=NDL_HEADERS, timeout=30)
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

    NDL検索には ndl_names[0] を使う。member["name"] には全角スペースが
    入る場合があり、NDLの部分一致で別人の発言数が返ってしまうため。
    """
    mid = member["id"]
    house = member["house"]
    # ndl_names[0] が正式なNDL表記（スペースなし）。なければ name を使う
    ndl_names = member.get("ndl_names") or []
    name = ndl_names[0] if ndl_names else member["name"]

    today = date.today()
    date_until = (today - timedelta(days=7)).isoformat()  # NDL遅延を考慮して直近7日は除外
    date_from = (today - timedelta(days=CHECK_DAYS)).isoformat()

    # DB側: procedural含む全発言数（NDL APIと比較対象を合わせる）
    # is_procedural=False のみでカウントすると、委員会委員長など
    # 議事進行発言のみの期間がある議員で誤検知が発生するため
    result = execute_with_retry(
        lambda: (
            client.table("speeches")
            .select("id", count="exact")
            .eq("member_id", mid)
            .gte("spoken_at", date_from)
            .lte("spoken_at", date_until)
        ),
        label=f"audit_speeches:{mid}",
    )
    db_count = result.count or 0

    # NDL API側 (procedural含む全発言)
    ndl_count = _ndl_speech_count(name, house, date_from, date_until)
    time.sleep(NDL_RATE_LIMIT_SEC)

    if ndl_count < 0:
        return None  # APIエラーはスキップ

    # NDLに発言があるのにDBが0件は明確な問題
    if db_count == 0 and ndl_count > 10:
        return {
            "type": "発言データ未収集",
            "member": member["name"],
            "detail": (
                f"NDL APIでは直近{CHECK_DAYS}日に{ndl_count}件の発言があるが、"
                f"DBには0件しかない（NDL検索名: {name}）。"
                f"member_idの紐付け失敗またはデータ未収集の可能性。"
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
# 表示検証（DB値 vs 本番ページのJSON-LD）
# ============================================================

def _extract_json_ld(html: str) -> dict | None:
    """HTMLの<script type="application/ld+json">からJSONを抽出する。"""
    match = re.search(r'<script[^>]+type="application/ld\+json"[^>]*>(.*?)</script>', html, re.DOTALL)
    if not match:
        return None
    try:
        return json.loads(match.group(1))
    except Exception:
        return None


def check_member_display(member: dict) -> dict | None:
    """
    議員詳細ページのJSON-LD（SSRで埋め込まれる）とDB値を照合する。
    - ページが404を返す（is_active=True なのに存在しない）
    - 活動数（session_count / question_count / bill_count / petition_count）の乖離
    """
    mid = member["id"]
    name = member["name"]
    url = f"{SITE_BASE_URL}/members/{quote(mid, safe='')}"

    try:
        resp = httpx.get(url, headers=HEADERS, timeout=30, follow_redirects=True)
    except Exception as e:
        logger.warning("ページ取得失敗 (%s): %s", name, e)
        return None

    if resp.status_code == 404:
        return {
            "type": "ページ表示エラー",
            "member": name,
            "detail": (
                f"is_active=True なのに {url} が404を返す。"
                f"IDエンコード・ルーティング・メンバー登録を確認してください。"
            ),
        }

    if resp.status_code != 200:
        logger.warning("ページ取得失敗 (%s): HTTP %d", name, resp.status_code)
        return None

    ld = _extract_json_ld(resp.text)
    if not ld:
        logger.info("JSON-LD未検出 (%s): スキップ", name)
        return None

    desc = ld.get("description", "")
    checks = [
        ("発言セッション数", "session_count",  r"発言セッション数(\d+)回"),
        ("質問主意書",       "question_count", r"質問主意書(\d+)件"),
        ("議員立法",         "bill_count",     r"議員立法(\d+)件"),
        ("請願",             "petition_count", r"請願(\d+)件"),
    ]

    diffs = []
    for label, db_key, pattern in checks:
        m = re.search(pattern, desc)
        if not m:
            continue
        page_val = int(m.group(1))
        db_val = member.get(db_key) or 0
        diff = abs(page_val - db_val)
        if diff >= DISPLAY_DIFF_ABS and (db_val == 0 or diff / db_val >= DISPLAY_DIFF_PCT):
            diffs.append(f"{label}: DB={db_val}、ページ={page_val}（差{diff}）")

    if diffs:
        return {
            "type": "表示値不整合",
            "member": name,
            "detail": (
                f"本番ページのJSON-LD値がDBと乖離しています。"
                f"{'; '.join(diffs)}。キャッシュ更新遅延か表示バグの可能性。"
            ),
        }

    return None


# ============================================================
# R-1: コレクター停止検出
# ============================================================

def check_collector_freshness(client) -> list[dict]:
    """
    各テーブルの最新レコードの日付を確認し、収集が停止していないか検出する。
    DBに既存データが残っていてもコレクターが止まっていれば検知できる。
    """
    findings = []
    today = date.today()
    cutoff = (today - timedelta(days=FRESHNESS_WARN_DAYS)).isoformat()

    checks = [
        ("speeches",  "spoken_at",    "発言（speeches）"),
        ("questions", "submitted_at", "質問主意書（questions）"),
    ]

    for table, date_col, label in checks:
        try:
            result = execute_with_retry(
                lambda t=table, c=date_col: (
                    client.table(t)
                    .select(c)
                    .not_.is_(c, "null")
                    .order(c, desc=True)
                    .limit(1)
                ),
                label=f"audit_freshness:{table}",
            )
            rows = result.data or []
            if not rows:
                findings.append({
                    "type": "コレクター停止疑い",
                    "member": "（全体）",
                    "detail": f"{label} テーブルにレコードが存在しません。",
                })
                continue

            latest = rows[0][date_col][:10]  # date部分のみ
            if latest < cutoff:
                findings.append({
                    "type": "コレクター停止疑い",
                    "member": "（全体）",
                    "detail": (
                        f"{label} の最新レコード日付が {latest} であり、"
                        f"{FRESHNESS_WARN_DAYS}日以上前です。"
                        f"収集スクリプトが止まっている可能性があります。"
                    ),
                })
            else:
                logger.info("鮮度OK (%s): 最新=%s", table, latest)
        except Exception as e:
            logger.warning("鮮度チェック失敗 (%s): %s", table, e)

    return findings


# ============================================================
# 同姓同名の確認
# 現職議員と同じ名前の議員レコードが他にあり、config.HOMONYM_SPEAKER_GROUPS に設定がない場合に警告する。
# （設定がないと、会議録の発言をどちらの議員のものか区別できない）
# ============================================================
def check_homonyms(client) -> list[dict]:
    from config import HOMONYM_SPEAKER_GROUPS
    rows: list[dict] = []
    last_id = ""
    while True:
        batch = execute_with_retry(
            lambda lid=last_id: client.table("members").select("id, name, ndl_names, is_active")
                .gt("id", lid).order("id").limit(1000),
            label="audit_homonym_members",
        ).data or []
        rows.extend(batch)
        if len(batch) < 1000:
            break
        last_id = batch[-1]["id"]
    by_name: dict[str, list[dict]] = {}
    for m in rows:
        names = {re.sub(r"[\s\u3000]+", "", m.get("name") or "")}
        names |= {re.sub(r"[\s\u3000]+", "", n) for n in (m.get("ndl_names") or [])}
        names.discard("")
        for n in names:
            by_name.setdefault(n, [])
            if m not in by_name[n]:
                by_name[n].append(m)
    findings = []
    for name, ms in sorted(by_name.items()):
        if len(ms) < 2 or name in HOMONYM_SPEAKER_GROUPS or not any(m.get("is_active") for m in ms):
            continue
        findings.append({
            "type": "同姓同名",
            "member": name,
            "detail": (
                f"「{name}」に該当する議員レコードが複数あります（{', '.join(m['id'] for m in ms)}）。"
                f"同一人物か別人かを国会会議録で確認し、別人なら config.HOMONYM_SPEAKER_GROUPS に会派を登録してください。"
            ),
        })
    return findings


# ============================================================
# R-2: スクレイパーサイレント失敗検出（NULL率監視）
# ============================================================

def check_null_rates(client) -> list[dict]:
    """
    スクレイパーがサイレントに失敗している場合、直近データのNULL率が急増する。
    HTML構造変更による無音の失敗を検知する。
    """
    findings = []
    today = date.today()
    date_from = (today - timedelta(days=NULL_CHECK_DAYS)).isoformat()

    # questions / sangiin_questions の submitted_at NULL率（最新の会期の行で確認する。両テーブルに作成日時の列はない）
    for table, label in [
        ("questions",         "質問主意書（questions）"),
        ("sangiin_questions", "参院質問（sangiin_questions）"),
    ]:
        try:
            latest = execute_with_retry(
                lambda t=table: client.table(t).select("session").order("session", desc=True).limit(1),
                label=f"audit_latest_session:{table}",
            ).data or []
            if not latest:
                continue
            session = latest[0]["session"]
            total = execute_with_retry(
                lambda t=table, s=session: client.table(t).select("id", count="exact").eq("session", s).limit(0),
                label=f"audit_null_total:{table}",
            ).count or 0
            if total < 10:
                logger.info("NULL率チェックスキップ (%s 第%s回): レコード%d件（10件未満）", table, session, total)
                continue
            null_count = execute_with_retry(
                lambda t=table, s=session: client.table(t).select("id", count="exact")
                    .eq("session", s).is_("submitted_at", "null").limit(0),
                label=f"audit_null_count:{table}",
            ).count or 0
            null_rate = null_count / total
            logger.info("NULL率 (%s 第%s回): %d/%d = %.0f%%", table, session, null_count, total, null_rate * 100)
            if null_rate >= NULL_RATE_WARN:
                findings.append({
                    "type": "NULL率異常",
                    "member": "（全体）",
                    "detail": (
                        f"{label} 第{session}回国会の submitted_at NULL率が "
                        f"{null_rate:.0%}（{null_count}/{total}件）です。"
                        f"公式サイトのHTML構造変更によるサイレント失敗の可能性があります。"
                    ),
                })
        except Exception as e:
            logger.warning("NULL率チェック失敗 (%s): %s", table, e)

    # speeches の議員照合漏れ
    # 国会会議録で会派（speakerGroup）が記録されている＝国会議員の発言なのに、member_id が付いていない割合。
    # （以前は政府参考人など議員以外の発言も分母に含めていたため、常に約30%となり誤検知が続いていた）
    try:
        total = execute_with_retry(
            lambda: client.table("speeches").select("id", count="exact")
                .gte("spoken_at", date_from).not_.is_("speaker_group", "null").limit(0),
            label="audit_member_speeches_total",
        ).count or 0
        if total >= 10:
            unmatched = execute_with_retry(
                lambda: client.table("speeches").select("id", count="exact")
                    .gte("spoken_at", date_from).not_.is_("speaker_group", "null")
                    .is_("member_id", "null").limit(0),
                label="audit_member_speeches_unmatched",
            ).count or 0
            rate = unmatched / total
            logger.info("議員の発言の照合漏れ: %d/%d = %.1f%%", unmatched, total, rate * 100)
            if rate >= MEMBER_UNMATCHED_WARN:
                findings.append({
                    "type": "議員照合漏れ",
                    "member": "（全体）",
                    "detail": (
                        f"直近{NULL_CHECK_DAYS}日の国会議員の発言（会議録に会派の記載があるもの）のうち "
                        f"{rate:.1%}（{unmatched}/{total}件）が議員と照合できていません。"
                        f"議員名簿の更新漏れか、名寄せの不具合の可能性があります。"
                    ),
                })
    except Exception as e:
        logger.warning("speeches 照合漏れチェック失敗: %s", e)

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
            .select("id, name, house, cabinet_post, session_count, question_count, bill_count, petition_count, ndl_names")
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

    # 表示検証（サンプル議員のページをHTTP取得してJSON-LDと照合）
    logger.info("表示検証中（%d名）...", len(sample))
    for member in sample:
        logger.info("表示チェック: %s", member["name"])
        finding = check_member_display(member)
        if finding:
            findings.append(finding)
        time.sleep(1.0)  # サーバー負荷軽減

    # コレクター停止検出（R-1）
    logger.info("コレクター鮮度チェック中...")
    findings.extend(check_collector_freshness(client))

    # NULL率監視（R-2）
    logger.info("NULL率チェック中...")
    findings.extend(check_null_rates(client))

    # 同姓同名の確認（発言を別人に付けないため）
    logger.info("同姓同名チェック中...")
    findings.extend(check_homonyms(client))

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
        f"**サンプル人数**: {sample_size}名（ランダムサンプリング）",
        f"**チェック項目**: 発言数（NDL API）・大臣職（官邸）・表示値（本番ページJSON-LD）・コレクター鮮度・NULL率",
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
        logger.info("✓ 不整合なし（発言チェック%d名・大臣職全員・表示検証%d名・鮮度・NULL率）", sample_size, sample_size)
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
