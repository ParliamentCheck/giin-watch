/**
 * はたらく議員 — 型定義
 * Supabase の実テーブルスキーマと対応する TypeScript 型。
 * 各ページ・コンポーネントはここからインポートし、独自定義を持たない。
 */

// ============================================================
// members テーブル（全フィールド）
// ============================================================
export interface Member {
  id: string;
  name: string;
  alias_name: string | null;        // 通称名（表示優先）
  last_name: string | null;
  first_name: string | null;
  last_name_reading: string | null;
  first_name_reading: string | null;
  party: string;
  faction: string | null;
  house: "衆議院" | "参議院";
  district: string;
  prefecture: string | null;
  terms: number | null;
  is_active: boolean;
  cabinet_post: string | null;
  session_count: number | null;
  question_count: number | null;
  bill_count: number | null;
  petition_count: number | null;
  election_type: string | null;
  source_url: string | null;
  ndl_names: string[] | null;
  speech_count: number | null;   // 発言セッション数（speeches テーブルの集計値）
  prev_party: string | null;     // 直前の所属政党（中道改革連合等の表示で使用）
}

// ============================================================
// speeches テーブル
// ============================================================
export interface Speech {
  id: string;
  member_id: string | null;
  speaker_name: string | null;
  spoken_at: string | null;
  committee: string | null;
  session_number: number | null;
  source_url: string | null;
  is_procedural: boolean;
}

// ============================================================
// speech_excerpts テーブル
// ============================================================
export interface SpeechExcerpt {
  id: string;
  member_id: string;
  spoken_at: string | null;
  committee: string | null;
  session_number: number | null;
  source_url: string | null;
  excerpt: string;
  original_length: number;
}

// ============================================================
// questions テーブル（衆議院質問主意書）
// ============================================================
export interface Question {
  id: string;
  member_id: string | null;
  session: number;
  number: number | null;
  title: string;
  submitted_at: string | null;
  answered_at: string | null;
  source_url: string | null;
}

// ============================================================
// sangiin_questions テーブル（参議院質問主意書）
// ============================================================
export interface SangiinQuestion {
  id: string;
  member_id: string | null;
  session: number;
  number: number | null;
  title: string;
  submitted_at: string | null;
  answered_at: string | null;
  source_url: string | null;
}

// ============================================================
// votes テーブル
// ============================================================
export type VoteValue = "賛成" | "反対" | "棄権" | "欠席";

export interface Vote {
  id: string;
  member_id: string;
  bill_title: string;
  vote_date: string;
  vote: VoteValue;
  session_number: number;
}

// ============================================================
// bills テーブル
// ============================================================
export interface Bill {
  id: string;
  title: string;
  bill_type: string | null;
  submitter_ids: string[] | null;
  submitter_extra_count: number | null;
  submitted_at: string | null;
  session_number: number | null;
  status: string | null;
  house: string | null;
  honbun_url: string | null;
  keika_url: string | null;
  committee_san: string | null;
  vote_date_san: string | null;
  committee_shu: string | null;
  vote_date_shu: string | null;
}

// ============================================================
// petitions テーブル（衆議院請願）
// ============================================================
export interface Petition {
  id: string;
  session: number;
  number: number;
  title: string;
  committee_name: string | null;
  result: string | null;
  result_date: string | null;
  introducer_ids: string[] | null;
  introducer_names: string[] | null;
  source_url: string | null;
}

// ============================================================
// sangiin_petitions テーブル（参議院請願）
// ============================================================
export interface SangiinPetition {
  id: string;
  session: number;
  number: number;
  title: string;
  committee_name: string | null;
  result: string | null;
  result_date: string | null;
  introducer_ids: string[] | null;
  introducer_names: string[] | null;
  source_url: string | null;
}

// ============================================================
// committee_members テーブル
// ============================================================
export interface CommitteeMember {
  id: string;
  member_id: string;
  name: string;
  committee: string;
  role: string | null;
  house: string;
}

// ============================================================
// member_keywords テーブル
// ============================================================
export interface MemberKeyword {
  member_id: string;
  word: string;
  count: number;
}

// ============================================================
// party_keywords テーブル
// ============================================================
export interface PartyKeyword {
  party: string;
  word: string;
  count: number;
}

// ============================================================
// vote_alignment テーブル
// ============================================================
export interface VoteAlignment {
  party_a: string;
  party_b: string;
  align_rate: number;
  total_bills: number;
  session_number: number | null;
}

// ============================================================
// election_votes テーブル
// ============================================================
export interface ElectionVote {
  id: string;
  election_year: number;
  election_type: string;
  party: string;
  vote_count: number | null;
  vote_rate: number | null;
  seats: number | null;
  seat_rate: number | null;
}

// ============================================================
// リスト表示用（members JOIN 付き / house フラグ付き）
// 各リストページ・Client コンポーネントはここからインポートし、独自定義を持たない
// ============================================================

export interface QuestionListItem {
  id: string;
  session: number;
  number: number;
  title: string;
  submitted_at: string | null;
  answered_at: string | null;
  source_url: string | null;
  member_id: string | null;
  house: "衆" | "参";
  members: { name: string; alias_name: string | null; party: string; is_active: boolean } | null;
}

export interface PetitionListItem {
  id: string;
  session: number;
  number: number;
  title: string;
  committee_name: string | null;
  result: string | null;
  result_date: string | null;
  source_url: string | null;
  introducer_ids: string[] | null;
  introducer_names: string[] | null;
  house: "衆" | "参";
}

// ============================================================
// ソート関連（議員一覧・前議員一覧共通）
// ============================================================
export type MemberSortKey =
  | "name"
  | "session_count"
  | "question_count"
  | "bill_count"
  | "petition_count"
  | "terms";

export const MEMBER_SORT_OPTIONS: { value: MemberSortKey; label: string }[] = [
  { value: "name",           label: "名前順" },
  { value: "session_count",  label: "発言セッション数順" },
  { value: "question_count", label: "質問主意書数順" },
  { value: "bill_count",     label: "議員立法数順" },
  { value: "petition_count", label: "請願数順" },
  { value: "terms",          label: "当選回数順" },
];
