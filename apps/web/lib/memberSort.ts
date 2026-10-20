// 議員の「名前順」は読み仮名（五十音）で並べる（PROJECT_SPEC 5.3：既定の並び順は氏名の五十音順）。
// 読み仮名が未登録の議員は漢字表記で比較するため、五十音の並びの後ろにまとまる。

type ReadingFields = {
  name: string;
  last_name_reading?: string | null;
  first_name_reading?: string | null;
};

const collator = new Intl.Collator("ja");

function readingOf(m: ReadingFields): string {
  const r = `${m.last_name_reading ?? ""}${m.first_name_reading ?? ""}`;
  return r || m.name;
}

export function compareMembersByReading(a: ReadingFields, b: ReadingFields): number {
  const ra = readingOf(a);
  const rb = readingOf(b);
  const hasA = ra !== a.name;
  const hasB = rb !== b.name;
  if (hasA !== hasB) return hasA ? -1 : 1; // 読み仮名ありを先に
  return collator.compare(ra, rb) || collator.compare(a.name, b.name);
}
