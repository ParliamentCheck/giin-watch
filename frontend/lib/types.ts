/**
 * はたらく議員 — 型定義
 * Supabase テーブルスキーマと対応する TypeScript 型
 */

// ============================================================
// members テーブル
// ============================================================
export interface Member {
  id: string;
  name: string;
  party: string;
  faction: string | null;
  house: "衆議院" | "参議院";
  district: string | null;
  prefecture: string | null;
  terms: number | null;
  is_active: boolean;
  speech_count: number;
  session_count: number;
  question_count: number;
  keywords: KeywordEntry[] | null;
  keywords_updated_at: string | null;
  cabinet_post: string | null;
  source_url: string | null;
}

export interface KeywordEntry {
  word: string;
  count: number;
}

// ============================================================
// speeches テーブル
// ============================================================
export interface Speech {
  id: string;
  member_id: string;
  spoken_at: string | null;
  committee: string | null;
  session_number: number | null;
  house: string | null;
  url: string | null;
  is_procedural: boolean;
}

// ============================================================
// questions テーブル（衆議院質問主意書）
// ============================================================
export interface Question {
  id: string;
  member_id: string;
  session: number;
  title: string;
  submitted_at: string | null;
  url: string | null;
}

// ============================================================
// sangiin_questions テーブル（参議院質問主意書）
// ============================================================
export interface SangiinQuestion {
  id: string;
  member_id: string;
  session: number;
  title: string;
  submitted_at: string | null;
  url: string | null;
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
  house: string;
}

// ============================================================
// bills テーブル
// ============================================================
export interface Bill {
  id: string;
  title: string;
  submitter_ids: string[];
  submitted_at: string | null;
  session_number: number;
  status: string;
  house: string;
}

// ============================================================
// member_keywords テーブル
// ============================================================
export interface MemberKeyword {
  member_id: string;
  word: string;
  count: number;
  last_seen_at: string | null;
}

// ============================================================
// party_keywords テーブル
// ============================================================
export interface PartyKeyword {
  party: string;
  word: string;
  count: number;
  last_seen_at: string | null;
}

// ============================================================
// committee_members テーブル
// ============================================================
export interface CommitteeMember {
  id: number;
  member_id: string;
  name: string;
  committee: string;
  role: string | null;
  house: string;
}

// ============================================================
// site_settings テーブル
// ============================================================
export interface SiteSetting {
  key: string;
  value: string | null;
}

// ============================================================
// changelog テーブル
// ============================================================
export interface ChangelogEntry {
  id: number;
  date: string;
  description: string;
  created_at: string;
}

// ============================================================
// フロントエンド用のビュー型
// ============================================================

/** 活動データページ用の集約型 */
export interface MemberActivity extends Member {
  vote_count?: number;
  bill_count?: number;
}

/** 議員詳細ページで使う全データ */
export interface MemberDetail extends Member {
  speeches: Speech[];
  questions: Question[];
  sangiin_questions: SangiinQuestion[];
  votes: Vote[];
  bills: Bill[];
  committees: CommitteeMember[];
  member_keywords: MemberKeyword[];
}

/** 政党詳細ページ用 */
export interface PartyDetail {
  party: string;
  member_count: number;
  members: Member[];
  keywords: PartyKeyword[];
}

// ============================================================
// ソート関連
// ============================================================
export type SortField =
  | "name"
  | "speech_count"
  | "session_count"
  | "question_count"
  | "vote_count"
  | "bill_count";

export type SortDirection = "asc" | "desc";

export interface SortConfig {
  field: SortField;
  direction: SortDirection;
}
