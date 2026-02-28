"""
はたらく議員 — DB接続・ヘルパー
Supabase クライアントのシングルトン管理、リトライ付きクエリ、バッチ upsert を提供する。
"""

from __future__ import annotations

import logging
import time
from typing import Any

from supabase import create_client, Client

from config import SUPABASE_URL, SUPABASE_KEY, UPSERT_BATCH_SIZE

logger = logging.getLogger(__name__)

# ============================================================
# Supabase クライアント（シングルトン）
# ============================================================
_client: Client | None = None


def get_client() -> Client:
    """Supabase クライアントを返す（初回のみ生成）。"""
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client


# ============================================================
# リトライ付きクエリ実行
# ============================================================
def execute_with_retry(
    query_fn,
    *,
    max_retries: int = 3,
    backoff_base: float = 2.0,
    label: str = "query",
) -> Any:
    """
    query_fn() を実行し、失敗時にエクスポネンシャルバックオフでリトライする。

    Parameters
    ----------
    query_fn : callable
        Supabase クエリを返す無引数関数（lambda 推奨）。
    max_retries : int
        最大リトライ回数。
    backoff_base : float
        バックオフの基数（秒）。
    label : str
        ログ用ラベル。

    Returns
    -------
    Any
        クエリの .execute() 結果。
    """
    last_err: Exception | None = None
    for attempt in range(1, max_retries + 1):
        try:
            result = query_fn().execute()
            return result
        except Exception as exc:
            last_err = exc
            wait = backoff_base ** attempt
            logger.warning(
                "[%s] attempt %d/%d failed: %s — retrying in %.1fs",
                label, attempt, max_retries, exc, wait,
            )
            time.sleep(wait)

    logger.error("[%s] all %d attempts failed", label, max_retries)
    raise last_err  # type: ignore[misc]


# ============================================================
# バッチ upsert
# ============================================================
def batch_upsert(
    table: str,
    rows: list[dict[str, Any]],
    *,
    on_conflict: str = "id",
    batch_size: int = UPSERT_BATCH_SIZE,
    label: str | None = None,
) -> int:
    """
    rows を batch_size ごとに分割して upsert する。
    dead tuple の蓄積を抑え、Supabase タイムアウトを回避する。

    Returns
    -------
    int
        upsert した行数の合計。
    """
    if not rows:
        return 0

    label = label or f"upsert:{table}"
    client = get_client()
    total = 0

    for i in range(0, len(rows), batch_size):
        chunk = rows[i : i + batch_size]
        execute_with_retry(
            lambda c=chunk: client.table(table).upsert(c, on_conflict=on_conflict),
            label=f"{label}[{i}:{i+len(chunk)}]",
        )
        total += len(chunk)
        logger.info("[%s] upserted %d / %d", label, total, len(rows))

    return total


# ============================================================
# 便利クエリ
# ============================================================
def fetch_all(
    table: str,
    *,
    select: str = "*",
    filters: dict[str, Any] | None = None,
    limit: int = 2000,
) -> list[dict[str, Any]]:
    """
    テーブルから全行取得（limit 付き）。
    filters は {column: value} の等価フィルタ。
    """
    client = get_client()
    q = client.table(table).select(select).limit(limit)
    if filters:
        for col, val in filters.items():
            q = q.eq(col, val)
    result = execute_with_retry(lambda: q, label=f"fetch:{table}")
    return result.data or []


def fetch_setting(key: str) -> str | None:
    """site_settings から値を取得する。"""
    client = get_client()
    result = execute_with_retry(
        lambda: client.table("site_settings").select("value").eq("key", key).single(),
        label=f"setting:{key}",
    )
    if result.data:
        return result.data.get("value") or None
    return None


def delete_rows(table: str, column: str, value: Any, *, label: str = "") -> None:
    """テーブルから条件に合う行を削除する。"""
    client = get_client()
    execute_with_retry(
        lambda: client.table(table).delete().eq(column, value),
        label=label or f"delete:{table}:{column}={value}",
    )
