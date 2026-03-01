/**
 * はたらく議員 — 共通クエリ関数
 * 全てのクエリに .limit(2000) を付与（Supabase デフォルト1000行制限対策）
 */

import { supabase } from "./supabase";
import type {
  Member,
  Speech,
  Question,
  SangiinQuestion,
  Vote,
  Bill,
  MemberKeyword,
  PartyKeyword,
  CommitteeMember,
  SiteSetting,
  ChangelogEntry,
  MemberDetail,
  PartyDetail,
} from "./types";

// ============================================================
// Supabase クライアント
// ============================================================


const DEFAULT_LIMIT = 2000;

// ============================================================
// Members
// ============================================================

/** 現職議員一覧を取得 */
export async function getActiveMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("is_active", true)
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getActiveMembers: ${error.message}`);
  return data ?? [];
}

/** 前議員一覧を取得 */
export async function getFormerMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("is_active", false)
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getFormerMembers: ${error.message}`);
  return data ?? [];
}

/** 全議員取得 */
export async function getAllMembers(): Promise<Member[]> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getAllMembers: ${error.message}`);
  return data ?? [];
}

/** 議員単体取得 */
export async function getMemberById(id: string): Promise<Member | null> {
  const { data, error } = await supabase
    .from("members")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data;
}

// ============================================================
// Speeches
// ============================================================

/** 議員の発言一覧（議事進行を除外） */
export async function getSpeechesForMember(
  memberId: string,
  options?: { includeProceduralSpeech?: boolean; limit?: number }
): Promise<Speech[]> {
  let query = supabase
    .from("speeches")
    .select("id, member_id, spoken_at, committee, session_number, house, url, is_procedural")
    .eq("member_id", memberId)
    .order("spoken_at", { ascending: false })
    .limit(options?.limit ?? DEFAULT_LIMIT);

  if (!options?.includeProceduralSpeech) {
    query = query.eq("is_procedural", false);
  }

  const { data, error } = await query;
  if (error) throw new Error(`getSpeechesForMember: ${error.message}`);
  return data ?? [];
}

// ============================================================
// Questions（衆議院）
// ============================================================

export async function getQuestionsForMember(memberId: string): Promise<Question[]> {
  const { data, error } = await supabase
    .from("questions")
    .select("*")
    .eq("member_id", memberId)
    .order("submitted_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getQuestionsForMember: ${error.message}`);
  return data ?? [];
}

// ============================================================
// Sangiin Questions（参議院）
// ============================================================

export async function getSangiinQuestionsForMember(
  memberId: string
): Promise<SangiinQuestion[]> {
  const { data, error } = await supabase
    .from("sangiin_questions")
    .select("*")
    .eq("member_id", memberId)
    .order("submitted_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    // テーブルが存在しない場合はエラーを握りつぶす
    console.warn("getSangiinQuestionsForMember:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Votes
// ============================================================

export async function getVotesForMember(memberId: string): Promise<Vote[]> {
  const { data, error } = await supabase
    .from("votes")
    .select("*")
    .eq("member_id", memberId)
    .order("vote_date", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.warn("getVotesForMember:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Bills
// ============================================================

export async function getBillsForMember(memberId: string): Promise<Bill[]> {
  const { data, error } = await supabase
    .from("bills")
    .select("*")
    .contains("submitter_ids", [memberId])
    .order("submitted_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.warn("getBillsForMember:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Keywords
// ============================================================

export async function getMemberKeywords(memberId: string): Promise<MemberKeyword[]> {
  const { data, error } = await supabase
    .from("member_keywords")
    .select("*")
    .eq("member_id", memberId)
    .order("count", { ascending: false })
    .limit(100);

  if (error) {
    console.warn("getMemberKeywords:", error.message);
    return [];
  }
  return data ?? [];
}

export async function getPartyKeywords(party: string): Promise<PartyKeyword[]> {
  const { data, error } = await supabase
    .from("party_keywords")
    .select("*")
    .eq("party", party)
    .order("count", { ascending: false })
    .limit(100);

  if (error) {
    console.warn("getPartyKeywords:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Committee Members
// ============================================================

export async function getCommitteesForMember(
  memberId: string
): Promise<CommitteeMember[]> {
  const { data, error } = await supabase
    .from("committee_members")
    .select("*")
    .eq("member_id", memberId)
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getCommitteesForMember: ${error.message}`);
  return data ?? [];
}

// ============================================================
// Site Settings
// ============================================================

export async function getSiteSetting(key: string): Promise<string | null> {
  const { data, error } = await supabase
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) return null;
  return data.value || null;
}

export async function isElectionSafeMode(): Promise<boolean> {
  const value = await getSiteSetting("election_safe_mode");
  return !!value;
}

export async function getMaintenanceBanner(): Promise<string | null> {
  return getSiteSetting("maintenance_banner");
}

// ============================================================
// Changelog
// ============================================================

export async function getChangelog(): Promise<ChangelogEntry[]> {
  const { data, error } = await supabase
    .from("changelog")
    .select("*")
    .order("date", { ascending: false })
    .limit(100);

  if (error) throw new Error(`getChangelog: ${error.message}`);
  return data ?? [];
}

// ============================================================
// 複合クエリ — 議員詳細
// ============================================================

export async function getMemberDetail(id: string): Promise<MemberDetail | null> {
  const member = await getMemberById(id);
  if (!member) return null;

  const [speeches, questions, sangiinQuestions, votes, bills, committees, keywords] =
    await Promise.all([
      getSpeechesForMember(id),
      getQuestionsForMember(id),
      getSangiinQuestionsForMember(id),
      getVotesForMember(id),
      getBillsForMember(id),
      getCommitteesForMember(id),
      getMemberKeywords(id),
    ]);

  return {
    ...member,
    speeches,
    questions,
    sangiin_questions: sangiinQuestions,
    votes,
    bills,
    committees,
    member_keywords: keywords,
  };
}

// ============================================================
// 複合クエリ — 政党詳細
// ============================================================

export async function getPartyDetail(party: string): Promise<PartyDetail | null> {
  const [members, keywords] = await Promise.all([
    (async () => {
      const { data, error } = await supabase
        .from("members")
        .select("*")
        .eq("party", party)
        .eq("is_active", true)
        .limit(DEFAULT_LIMIT);
      if (error) throw new Error(`getPartyMembers: ${error.message}`);
      return data ?? [];
    })(),
    getPartyKeywords(party),
  ]);

  if (members.length === 0) return null;

  return {
    party,
    member_count: members.length,
    members,
    keywords,
  };
}

// ============================================================
// 統計
// ============================================================

export async function getDashboardStats(): Promise<{
  totalMembers: number;
  totalSpeeches: number;
  totalQuestions: number;
  partyBreakdown: { party: string; count: number }[];
}> {
  const members = await getActiveMembers();

  const partyCount: Record<string, number> = {};
  let totalSpeeches = 0;
  let totalQuestions = 0;

  for (const m of members) {
    partyCount[m.party] = (partyCount[m.party] || 0) + 1;
    totalSpeeches += m.speech_count || 0;
    totalQuestions += m.question_count || 0;
  }

  const partyBreakdown = Object.entries(partyCount)
    .map(([party, count]) => ({ party, count }))
    .sort((a, b) => b.count - a.count);

  return {
    totalMembers: members.length,
    totalSpeeches,
    totalQuestions,
    partyBreakdown,
  };
}
