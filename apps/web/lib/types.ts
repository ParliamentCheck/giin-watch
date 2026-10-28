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
  faction: string | null;          // 現在の会派（公式の正式名）。前議員は信頼できる値がないため表示に使わない
  faction_short: string | null;    // 会派の公式の略称
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
// 参議院の記録上の表記は「投票なし」。「欠席」は旧データ（2026-10 以前の収集分）の値
export type VoteValue = "賛成" | "反対" | "棄権" | "投票なし" | "欠席";

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
// faction_vote_alignments テーブル（参院・会期ごと・会派ペア）
// 会派の賛否は投票結果ページの会派別票数で決める（同数・0票は対象外）
// ============================================================
export interface FactionVoteAlignment {
  house: "参議院";
  session_number: number;
  faction_a: string;
  faction_b: string;
  agree_count: number;
  total_count: number;
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
  members: MemberRef | null;
  /** 提出日の時点の会派（会派の記録から一意に定まる場合のみ。サーバー側で付与） */
  faction_at?: string | null;
}

/** 一覧などで議員名を表示するための最小限の情報 */
export interface MemberRef {
  name: string;
  alias_name: string | null;
  faction: string | null;
  is_active: boolean;
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
