/**
 * 政党の与野党ステータス履歴
 * - from/to は "YYYY-MM-DD" 形式
 * - to が undefined の場合は現在も継続中
 * - 政治状況が変化した際はここを手動更新する
 */

interface StatusEntry {
  status: string;   // "与党（連立）" | "野党" | "閣外協力" など
  from: string;     // YYYY-MM-DD
  to?: string;      // YYYY-MM-DD（未設定 = 現在も継続）
  note?: string;    // AIコンテキストに渡す補足情報
}

const PARTY_STATUS_HISTORY: Record<string, StatusEntry[]> = {
  "自民党": [
    { status: "与党", from: "1955-11-15", note: "結党以来ほぼ継続（一時期を除く）" },
  ],
  "公明党": [
    { status: "与党（連立）", from: "1999-10-05" },
    {
      status: "野党",
      from: "2025-10-10",
      to: "2026-01-15",
      note: "高市早苗総裁誕生後、自民との約26年間の連立を離脱",
    },
    {
      status: "中道改革連合に合流",
      from: "2026-01-16",
      note: "斉藤鉄夫代表のもと衆院議員のほぼ全員が離党し中道改革連合を結成。参院議員・地方組織は存続中。公明党単独の衆院議員はほぼ存在しない。",
    },
  ],
  "立憲民主党": [
    { status: "野党", from: "2017-10-02" },
    {
      status: "野党（分党状態）",
      from: "2026-01-16",
      note: "野田佳彦代表（当時）が公明党と合流し中道改革連合を結成。衆院議員の多数が離党・合流（左派の一部は残留）。参院議員・地方組織は立憲として存続中。衆院での所属議員数は大幅に減少している。",
    },
  ],
  "中道改革連合": [
    {
      status: "野党",
      from: "2026-01-16",
      note: "2026年1月16日、公明党（ほぼ全員）と立憲民主党（多数、左派の一部除く）の衆院議員が合流して結成。共同代表は野田佳彦・斉藤鉄夫。高市政権（自民＋維新）の右傾化への中道的対抗軸として発足。ただし2026年2月の衆院選では大敗し、現在（2026年3月）は再建途上。",
    },
  ],
  "日本維新の会": [
    { status: "野党", from: "2015-11-01" },
    {
      status: "与党（閣外協力）",
      from: "2025-10-20",
      note: "閣僚を出さず政策協力の形で与党入り。公明党が連立離脱した後の穴を埋める形で自民党を支援。",
    },
  ],
  "国民民主党": [
    { status: "野党", from: "2018-05-07" },
  ],
  "共産党": [
    { status: "野党", from: "1945-10-10" },
  ],
  "れいわ新選組": [
    { status: "野党", from: "2019-04-01" },
  ],
  "社民党": [
    { status: "野党", from: "1996-01-19" },
  ],
  "参政党": [
    { status: "野党", from: "2020-04-01" },
  ],
  "チームみらい": [
    { status: "野党", from: "2024-01-01" },
  ],
  "日本保守党": [
    { status: "野党", from: "2023-09-01" },
  ],
  "有志の会": [
    { status: "野党", from: "2021-10-01" },
  ],
  "減税日本・ゆうこく連合": [
    {
      status: "野党",
      from: "2021-04-01",
      note: "河村たかし（元名古屋市長）が率いる減税日本と、ゆうこく連合が統一会派を結成。衆院では河村たかし1名のみ（会派結成に必要な5名未満のため衆議院公式登録は無所属）。",
    },
  ],
};

/**
 * 指定日時点でのステータスを返す。
 * 未登録の場合は null。
 */
export function getPartyStatus(party: string, asOf: Date = new Date()): StatusEntry | null {
  const history = PARTY_STATUS_HISTORY[party];
  if (!history) return null;

  const dateStr = asOf.toISOString().slice(0, 10);

  for (let i = history.length - 1; i >= 0; i--) {
    const entry = history[i];
    if (entry.from <= dateStr && (entry.to === undefined || entry.to >= dateStr)) {
      return entry;
    }
  }
  return null;
}
