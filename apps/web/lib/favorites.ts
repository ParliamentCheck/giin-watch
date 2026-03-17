/**
 * はたらく議員 — My議員管理（ローカルストレージ）
 * サーバーには一切送信されません。
 */

const KEY = "favorite_members";
export const MAX_FAVORITES = 10;

export function getFavorites(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(KEY) || "[]");
  } catch {
    return [];
  }
}

export function addFavorite(id: string): { ok: boolean; reason?: string } {
  const current = getFavorites();
  if (current.includes(id)) return { ok: true };
  if (current.length >= MAX_FAVORITES) {
    return { ok: false, reason: `登録できるのは最大${MAX_FAVORITES}人までです` };
  }
  localStorage.setItem(KEY, JSON.stringify([...current, id]));
  return { ok: true };
}

export function removeFavorite(id: string): void {
  const current = getFavorites();
  localStorage.setItem(KEY, JSON.stringify(current.filter((v) => v !== id)));
}

export function isFavorite(id: string): boolean {
  return getFavorites().includes(id);
}

export function reorderFavorites(ids: string[]): void {
  localStorage.setItem(KEY, JSON.stringify(ids));
}

/** 登録済み議員IDをURLパラメータ文字列に変換 */
export function favoritesToShareUrl(): string {
  const ids = getFavorites();
  const params = new URLSearchParams({ ids: ids.join(",") });
  return `${window.location.origin}/favorites?${params.toString()}`;
}

/** URLパラメータから議員IDを読み込んでローカルストレージに保存 */
export function importFromUrl(search: string): number {
  const ids = new URLSearchParams(search).get("ids")?.split(",").filter(Boolean) ?? [];
  const toImport = ids.slice(0, MAX_FAVORITES);
  localStorage.setItem(KEY, JSON.stringify(toImport));
  return toImport.length;
}
