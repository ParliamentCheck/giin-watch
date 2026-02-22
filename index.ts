// packages/types/index.ts
// 全機能で共有する型定義。ここを起点にすべての型が派生する。

// ─── 基本エンティティ ───────────────────────────────────────

export type House = "衆議院" | "参議院";
export type VoteChoice = "賛成" | "反対" | "欠席" | "棄権";

export interface Member {
  id: string;
  name: string;               // 表示名
  nameReading: string;        // よみがな
  legalName: string | null;   // 戸籍上の氏名（通名使用の場合に別途記録）
  nationality: string | null; // 国籍（日本以外の場合のみ記録）
  party: string;
  house: House;
  district: string;           // 選挙区
  prefecture: string;
  terms: number;              // 当選回数
  age: number | null;
  photoUrl: string | null;
  isActive: boolean;
  updatedAt: string;          // ISO 8601
}

// ─── 活動データ ───────────────────────────────────────────

export interface Attendance {
  memberId: string;
  sessionNumber: number;      // 国会回次
  totalDays: number;
  attendedDays: number;
  absentDays: number;
  rate: number;               // 0.0 〜 1.0
}

export interface VoteRecord {
  memberId: string;
  billId: string;
  billName: string;
  sessionNumber: number;
  date: string;
  choice: VoteChoice;
  house: House;
}

export interface Speech {
  id: string;
  memberId: string;
  sessionNumber: number;
  committeeOrPlenary: string; // 委員会名 or "本会議"
  date: string;
  durationMinutes: number | null;
  summary: string | null;
  sourceUrl: string;
}

export interface Bill {
  id: string;
  name: string;
  sessionNumber: number;
  submittedDate: string;
  result: "可決" | "否決" | "審議中" | "廃案" | null;
  category: string | null;    // 分野タグ（税制・安保・福祉など）
}

// ─── 政治資金 ───────────────────────────────────────────────

export interface PoliticalFund {
  memberId: string;
  year: number;
  totalIncome: number;        // 収入合計（円）
  totalExpense: number;       // 支出合計（円）
  donationFromCompanies: number;
  donationFromIndividuals: number;
  sourceUrl: string | null;   // 収支報告書PDF URL
}

// ─── 党議拘束チェッカー ─────────────────────────────────────

export interface PartyWhipRecord {
  billId: string;
  billName: string;
  party: string;
  officialStance: VoteChoice | null;  // 党の公式方針
  stanceSource: string | null;        // 方針の出典URL
  stanceConfidence: "confirmed" | "inferred" | "unknown";
  // confirmed  = 党公式発表
  // inferred   = 幹事長コメント・報道から推定
  // unknown    = 方針不明
}

export interface WhipDeviation {
  memberId: string;
  memberName: string;
  party: string;
  billId: string;
  billName: string;
  partyStance: VoteChoice;
  actualVote: VoteChoice;
  date: string;
  stanceConfidence: PartyWhipRecord["stanceConfidence"];
}

// ─── スコア ──────────────────────────────────────────────────

export interface ActivityScore {
  memberId: string;
  score: number;              // 0 〜 100
  breakdown: {
    attendance: number;       // 出席率スコア（0〜30）
    speeches: number;         // 発言スコア（0〜30）
    questions: number;        // 質問主意書スコア（0〜15）
    bills: number;            // 議員立法スコア（0〜15）
    committee: number;        // 委員会参加スコア（0〜10）
  };
  calculatedAt: string;
}
