/**
 * はたらく議員 — 会派の共通定義
 *
 * 表示・集計の単位は「会派」（衆参それぞれの公式の会派名）。政党名は使わない
 * （選挙結果だけは公式結果が政党名のため、選挙結果ページで政党名を使う）。
 * 設計書: claude/design_kaiha_v1.md
 */

export type House = "衆議院" | "参議院";

export interface FactionRow {
  house: House;
  name: string;            // 正式名（公式表記のまま）
  short_name: string | null;
  first_seen_on: string;
  last_seen_on: string;
  is_current: boolean;
}

export interface FactionHistoryRow {
  member_id: string;
  house: House;            // 議員レコードの院（ndl の各区間の院を表すものではない）
  faction_name: string;
  source: "roster" | "ndl";
  start_on: string;
  end_on: string | null;
  record_count: number | null;
}

// ============================================================
// URL
// ============================================================

export const HOUSE_SLUG: Record<House, string> = { "衆議院": "shugiin", "参議院": "sangiin" };
export const SLUG_HOUSE: Record<string, House> = { shugiin: "衆議院", sangiin: "参議院" };

export function factionPath(house: House, name: string): string {
  return `/factions/${HOUSE_SLUG[house]}/${encodeURIComponent(name)}`;
}

// ============================================================
// 色（会派の正式名ごと）。未定義の会派は中立色
// 色は識別のためだけに使い、良し悪しの意味は持たせない。
// ============================================================

const NEUTRAL = "#7f8c8d";

export const FACTION_COLORS: Record<string, string> = {
  "自由民主党・無所属の会":       "#c0392b",
  "中道":                         "#3498db",
  "立憲民主・無所属":             "#2980b9",
  "公明党":                       "#8e44ad",
  "日本維新の会":                 "#318e2c",
  "国民民主党・無所属クラブ":     "#d4a000",
  "国民民主党・新緑風会":         "#d4a000",
  "日本共産党":                   "#e74c3c",
  "いのちの党":                   "#e4007f",
  "社会民主党":                   "#795548",
  "参政党":                       "#ff6d00",
  "チームみらい":                 "#00acc1",
  "チームみらい・無所属の会":     "#00acc1",
  "日本保守党":                   "#607d8b",
  "沖縄の風":                     "#009688",
  "志士の会":                     "#5c6bc0",
  "無所属":                       NEUTRAL,
  "各派に属しない議員":           NEUTRAL,
};

export function factionColor(name: string | null | undefined): string {
  if (!name) return NEUTRAL;
  return FACTION_COLORS[name] ?? NEUTRAL;
}

/** 表示用の短い名前。公式の略称があれば略称、なければ正式名 */
export function factionLabel(name: string | null | undefined, short?: string | null): string {
  if (!name) return "—";
  if (short) return short;
  return name;
}

// ============================================================
// ある日付の時点の会派
// ============================================================

/**
 * 履歴から「ある日付の時点の会派」を返す関数を作る。
 *
 * 規則（推測で埋めない）:
 *   - 名簿ベース（roster）: 当サイトが名簿で確認した期間（start_on 〜 end_on、所属中は今日まで）に入る日
 *   - 会議録ベース（ndl）: その会派での最初の発言日 〜 最後の発言日 に入る日
 *     （前後の発言がともにその会派で記録されている期間）
 *   - 当てはまる区間がない、または異なる会派の区間が重なる日は null（会派を確定できない）
 */
export function buildFactionAt(rows: FactionHistoryRow[]): (memberId: string, date: string | null | undefined) => string | null {
  const byMember = new Map<string, FactionHistoryRow[]>();
  for (const r of rows) {
    const list = byMember.get(r.member_id);
    if (list) list.push(r);
    else byMember.set(r.member_id, [r]);
  }
  const today = new Date().toISOString().slice(0, 10);
  return (memberId, date) => {
    if (!date) return null;
    const d = date.slice(0, 10);
    const list = byMember.get(memberId);
    if (!list) return null;
    const hits = new Set<string>();
    for (const r of list) {
      const end = r.end_on ?? (r.source === "roster" ? today : r.start_on);
      if (r.start_on <= d && d <= end) hits.add(r.faction_name);
    }
    return hits.size === 1 ? [...hits][0] : null;
  };
}

// ============================================================
// 日付の正規化（衆院の質問主意書は「令和 8年 2月19日」のような和暦の文字列で保存されている）
// ============================================================

const ERA_BASE: Record<string, number> = { "令和": 2018, "平成": 1988, "昭和": 1925 };

/** "YYYY-MM-DD..." または和暦の文字列を "YYYY-MM-DD" にする。読めなければ null */
export function toIsoDate(s: string | null | undefined): string | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const w = s.match(/(令和|平成|昭和)\s*(\d+|元)\s*年\s*(\d+)\s*月\s*(\d+)\s*日/);
  if (!w) return null;
  const y = ERA_BASE[w[1]] + (w[2] === "元" ? 1 : parseInt(w[2], 10));
  return `${y}-${w[3].padStart(2, "0")}-${w[4].padStart(2, "0")}`;
}
