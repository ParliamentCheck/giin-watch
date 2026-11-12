/**
 * 衆議院・参議院の識別色（グラフ・院のバッジ用）
 *
 * 院を見分けるためだけの色で、良し悪しの意味は持たせない。
 * 2色の組み合わせは色覚多様性のチェック（CVD・通常視覚の色差・白背景とのコントラスト）を通している。
 * 文字は色で塗らず、色は横に置く印（棒・点・枠）に使う。
 */
export const HOUSE_COLORS = {
  "衆議院": "#2a78d6",
  "参議院": "#eb6834",
} as const;

export function houseColor(house: string | null | undefined): string {
  if (house === "衆議院" || house === "衆") return HOUSE_COLORS["衆議院"];
  if (house === "参議院" || house === "参") return HOUSE_COLORS["参議院"];
  return "#7f8c8d";
}
