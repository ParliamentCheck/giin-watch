/**
 * はたらく議員 — 共通クエリ関数
 *
 * 設計原則:
 * - 全ての Supabase クエリはこのファイルに集約する
 * - client 引数のデフォルトはブラウザ用 supabase
 * - サーバーコンポーネントからは supabaseServer を渡して使う
 * - members テーブルへのクエリは MEMBER_SELECT を使うこと
 * - members を JOIN する場合は MEMBER_JOIN_SELECT を使うこと
 */

import { supabase as defaultClient } from "./supabase";
import type {
  Member,
  Speech,
  SpeechExcerpt,
  Question,
  SangiinQuestion,
  Vote,
  Bill,
  Petition,
  SangiinPetition,
  MemberKeyword,
  PartyKeyword,
  CommitteeMember,
  QuestionListItem,
  PetitionListItem,
} from "./types";

// ============================================================
// クライアント型
// ============================================================

type Db = typeof defaultClient;

// ============================================================
// 定数
// ============================================================

/**
 * members テーブルの標準フィールドセット。
 * クライアントコンポーネントの members 直接クエリで使用する。
 */
export const MEMBER_SELECT =
  "id,name,alias_name,last_name,first_name,last_name_reading,first_name_reading,party,prev_party,faction,house,district,prefecture,is_active,cabinet_post,session_count,question_count,bill_count,petition_count,speech_count,terms" as const;

/**
 * 他テーブルから members を JOIN するときの埋め込みフィールドセット。
 * 使い方: .select(`..., members(${MEMBER_JOIN_SELECT})`)
 * alias_name と is_active を必ず含めることで渡し忘れを防ぐ。
 */
export const MEMBER_JOIN_SELECT = "id,name,alias_name,party,is_active" as const;

const DEFAULT_LIMIT = 2000;

// ============================================================
// Members
// ============================================================

/** 現職議員一覧を取得 */
export async function getActiveMembers(client: Db = defaultClient): Promise<Member[]> {
  const { data, error } = await client
    .from("members")
    .select("*")
    .eq("is_active", true)
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getActiveMembers: ${error.message}`);
  return (data ?? []) as Member[];
}

/** 前議員一覧を取得 */
export async function getFormerMembers(client: Db = defaultClient): Promise<Member[]> {
  const { data, error } = await client
    .from("members")
    .select("*")
    .eq("is_active", false)
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getFormerMembers: ${error.message}`);
  return (data ?? []) as Member[];
}

/** 全議員取得 */
export async function getAllMembers(client: Db = defaultClient): Promise<Member[]> {
  const { data, error } = await client
    .from("members")
    .select("*")
    .limit(DEFAULT_LIMIT);

  if (error) throw new Error(`getAllMembers: ${error.message}`);
  return (data ?? []) as Member[];
}

/** 議員単体取得 */
export async function getMemberById(id: string, client: Db = defaultClient): Promise<Member | null> {
  const { data, error } = await client
    .from("members")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return null;
  return data as Member;
}

/** 複数IDで議員取得 */
export async function getMembersByIds(ids: string[], client: Db = defaultClient): Promise<Member[]> {
  if (ids.length === 0) return [];
  const { data, error } = await client
    .from("members")
    .select("*")
    .in("id", ids);

  if (error) {
    console.warn("getMembersByIds:", error.message);
    return [];
  }
  return (data ?? []) as Member[];
}

/** 閣僚・副大臣・政務官一覧を取得 */
export async function getCabinetMembers(client: Db = defaultClient): Promise<Member[]> {
  const { data, error } = await client
    .from("members")
    .select("*")
    .eq("is_active", true)
    .not("cabinet_post", "is", null);

  if (error) throw new Error(`getCabinetMembers: ${error.message}`);
  return (data ?? []) as Member[];
}

/** レーダーチャート用グローバル最大値を取得 */
export async function getGlobalActivityMax(
  client: Db = defaultClient,
): Promise<{ session: number; question: number; bill: number; petition: number }> {
  const { data } = await client
    .from("members")
    .select("session_count,question_count,bill_count,petition_count")
    .limit(DEFAULT_LIMIT);

  const max = { session: 1, question: 1, bill: 1, petition: 1 };
  for (const m of data ?? []) {
    if ((m.session_count  ?? 0) > max.session)  max.session  = m.session_count;
    if ((m.question_count ?? 0) > max.question) max.question = m.question_count;
    if ((m.bill_count     ?? 0) > max.bill)     max.bill     = m.bill_count;
    if ((m.petition_count ?? 0) > max.petition) max.petition = m.petition_count;
  }
  return max;
}

// ============================================================
// Speeches
// ============================================================

/** 議員の発言一覧（議事進行を除外） */
export async function getSpeechesForMember(
  memberId: string,
  options?: { includeProceduralSpeech?: boolean; limit?: number },
  client: Db = defaultClient,
): Promise<Speech[]> {
  let query = client
    .from("speeches")
    .select("id, member_id, speaker_name, spoken_at, committee, session_number, source_url, is_procedural")
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

/** 議員の発言抜粋を取得 */
export async function getSpeechExcerptsForMember(
  memberId: string,
  client: Db = defaultClient,
): Promise<SpeechExcerpt[]> {
  const { data, error } = await client
    .from("speech_excerpts")
    .select("*")
    .eq("member_id", memberId)
    .order("spoken_at", { ascending: true })
    .limit(30);

  if (error) {
    console.warn("getSpeechExcerptsForMember:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Questions（衆議院）
// ============================================================

export async function getQuestionsForMember(memberId: string, client: Db = defaultClient): Promise<Question[]> {
  const { data, error } = await client
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
  memberId: string,
  client: Db = defaultClient,
): Promise<SangiinQuestion[]> {
  const { data, error } = await client
    .from("sangiin_questions")
    .select("*")
    .eq("member_id", memberId)
    .order("submitted_at", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.warn("getSangiinQuestionsForMember:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Votes
// ============================================================

export async function getVotesForMember(memberId: string, client: Db = defaultClient): Promise<Vote[]> {
  const { data, error } = await client
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

/** 採決の集計値（賛成・反対・欠席・合計）を DB の count:exact で取得 */
export async function getVoteStatsForMember(
  memberId: string,
  client: Db = defaultClient,
): Promise<{ total: number; yea: number; nay: number; absent: number }> {
  const [totalRes, yeaRes, nayRes, absentRes] = await Promise.allSettled([
    client.from("votes").select("id", { count: "exact", head: true }).eq("member_id", memberId),
    client.from("votes").select("id", { count: "exact", head: true }).eq("member_id", memberId).eq("vote", "賛成"),
    client.from("votes").select("id", { count: "exact", head: true }).eq("member_id", memberId).eq("vote", "反対"),
    client.from("votes").select("id", { count: "exact", head: true }).eq("member_id", memberId).eq("vote", "欠席"),
  ]);
  return {
    total:  totalRes.status  === "fulfilled" ? (totalRes.value.count  ?? 0) : 0,
    yea:    yeaRes.status    === "fulfilled" ? (yeaRes.value.count    ?? 0) : 0,
    nay:    nayRes.status    === "fulfilled" ? (nayRes.value.count    ?? 0) : 0,
    absent: absentRes.status === "fulfilled" ? (absentRes.value.count ?? 0) : 0,
  };
}

// ============================================================
// Bills
// ============================================================

export async function getBillsForMember(memberId: string, client: Db = defaultClient): Promise<Bill[]> {
  const { data, error } = await client
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
// Petitions（衆議院）
// ============================================================

export async function getPetitionsForMember(memberId: string, client: Db = defaultClient): Promise<Petition[]> {
  const { data, error } = await client
    .from("petitions")
    .select("*")
    .contains("introducer_ids", [memberId])
    .order("session", { ascending: false })
    .order("number", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.warn("getPetitionsForMember:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Sangiin Petitions（参議院）
// ============================================================

export async function getSangiinPetitionsForMember(
  memberId: string,
  client: Db = defaultClient,
): Promise<SangiinPetition[]> {
  const { data, error } = await client
    .from("sangiin_petitions")
    .select("*")
    .contains("introducer_ids", [memberId])
    .order("session", { ascending: false })
    .order("number", { ascending: false })
    .limit(DEFAULT_LIMIT);

  if (error) {
    console.warn("getSangiinPetitionsForMember:", error.message);
    return [];
  }
  return data ?? [];
}

// ============================================================
// Keywords
// ============================================================

export async function getMemberKeywords(memberId: string, client: Db = defaultClient): Promise<MemberKeyword[]> {
  const { data, error } = await client
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

export async function getPartyKeywords(party: string, client: Db = defaultClient): Promise<PartyKeyword[]> {
  const { data, error } = await client
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
  memberId: string,
  client: Db = defaultClient,
): Promise<CommitteeMember[]> {
  const { data, error } = await client
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

export async function getSiteSetting(key: string, client: Db = defaultClient): Promise<string | null> {
  const { data, error } = await client
    .from("site_settings")
    .select("value")
    .eq("key", key)
    .single();

  if (error || !data) return null;
  return data.value || null;
}

// ============================================================
// 統計
// ============================================================

export async function getDashboardStats(client: Db = defaultClient): Promise<{
  totalMembers: number;
  totalSpeeches: number;
  totalQuestions: number;
  partyBreakdown: { party: string; count: number }[];
}> {
  const members = await getActiveMembers(client);

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

// ============================================================
// トップページ専用クエリ
// （複合計算ロジックを含まない members クエリを集約）
// ============================================================

export async function getTopPageStats(client: Db = defaultClient): Promise<{
  total: number; shugiin: number; sangiin: number; parties: number;
  speeches: number; questions: number; bills: number; petitions: number;
}> {
  const [membersRes, shugiinCountRes, sangiinCountRes, questionRes, billsRes, petitionRes, sangiinPetitionRes] =
    await Promise.all([
      client.from("members").select("id, party, speech_count, question_count").eq("is_active", true).limit(2000),
      client.from("members").select("id", { count: "exact", head: true }).eq("is_active", true).eq("house", "衆議院"),
      client.from("members").select("id", { count: "exact", head: true }).eq("is_active", true).eq("house", "参議院"),
      client.from("questions").select("id", { count: "exact", head: true }),
      client.from("bills").select("id", { count: "exact", head: true }),
      client.from("petitions").select("id", { count: "exact", head: true }),
      client.from("sangiin_petitions").select("id", { count: "exact", head: true }),
    ]);

  const members = (membersRes.data || []) as { party: string; speech_count: number | null; question_count: number | null }[];
  const parties = new Set(members.map((m) => m.party)).size;
  const shugiin = shugiinCountRes.count ?? 0;
  const sangiin = sangiinCountRes.count ?? 0;
  const speeches = members.reduce((sum, m) => sum + (m.speech_count || 0), 0);
  const petitions = (petitionRes.count || 0) + (sangiinPetitionRes.count || 0);

  return {
    total: shugiin + sangiin, shugiin, sangiin, parties, speeches,
    questions: questionRes.count || 0, bills: billsRes.count || 0, petitions,
  };
}

export async function getPartyBreakdown(client: Db = defaultClient): Promise<
  { party: string; total: number; shugiin: number; sangiin: number }[]
> {
  const { data } = await client.from("members").select("party, house").eq("is_active", true).limit(2000);
  if (!data) return [];

  const map = new Map<string, { total: number; shugiin: number; sangiin: number }>();
  for (const m of data as { party: string; house: string }[]) {
    const cur = map.get(m.party) || { total: 0, shugiin: 0, sangiin: 0 };
    cur.total++;
    if (m.house === "衆議院") cur.shugiin++;
    else cur.sangiin++;
    map.set(m.party, cur);
  }

  return [...map.entries()]
    .map(([party, counts]) => ({ party, ...counts }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 8);
}

type RecentQuestionItem = {
  id: number; title: string; submitted_at: string; member_id: string;
  source_url: string | null; house: "衆" | "参";
  members: { name: string; alias_name: string | null; party: string; is_active: boolean } | null;
};

export async function getTopRecentQuestions(client: Db = defaultClient): Promise<RecentQuestionItem[]> {
  const [shuRes, sanRes] = await Promise.all([
    client.from("questions")
      .select("id, title, submitted_at, member_id, source_url, members(name, alias_name, party, is_active)")
      .order("session", { ascending: false }).order("number", { ascending: false }).limit(10),
    client.from("sangiin_questions")
      .select("id, title, submitted_at, member_id, url, members(name, alias_name, party, is_active)")
      .order("submitted_at", { ascending: false }).limit(10),
  ]);

  const shu = ((shuRes.data || []) as any[]).map((q) => ({ ...q, source_url: q.source_url, house: "衆" as const }));
  const san = ((sanRes.data || []) as any[]).map((q) => ({ ...q, source_url: q.url,        house: "参" as const }));

  return ([...shu, ...san] as RecentQuestionItem[])
    .sort((a, b) => (b.submitted_at || "").localeCompare(a.submitted_at || ""))
    .slice(0, 10);
}

type RecentPetitionItem = {
  id: number; session: number; number: number; title: string;
  committee_name: string | null; result: string | null; result_date: string | null;
  source_url: string | null; introducer_ids: string[]; introducer_names: string | null;
  house: "衆" | "参";
};
type PetitionMemberMap = Record<string, { name: string; party: string; is_active: boolean }>;

export async function getTopRecentPetitions(
  client: Db = defaultClient,
): Promise<{ petitions: RecentPetitionItem[]; memberMap: PetitionMemberMap }> {
  const SELECT = "id, session, number, title, committee_name, result, result_date, source_url, introducer_ids, introducer_names";
  const [shuRes, sanRes] = await Promise.all([
    client.from("petitions").select(SELECT)
      .order("session", { ascending: false }).order("number", { ascending: false }).limit(10),
    client.from("sangiin_petitions").select(SELECT)
      .order("session", { ascending: false }).order("number", { ascending: false }).limit(10),
  ]);

  const shu = ((shuRes.data || []) as any[]).map((p) => ({ ...p, house: "衆" as const }));
  const san = ((sanRes.data || []) as any[]).map((p) => ({ ...p, house: "参" as const }));

  const petitions = ([...shu, ...san] as RecentPetitionItem[])
    .sort((a, b) => {
      if (b.session !== a.session) return b.session - a.session;
      return b.number - a.number;
    })
    .slice(0, 10);

  const allIds = [...new Set(petitions.flatMap((p) => (p.introducer_ids as string[]) || []))];
  const memberMap: PetitionMemberMap = {};
  if (allIds.length > 0) {
    const { data: members } = await client.from("members")
      .select("id, name, alias_name, party, is_active").in("id", allIds).limit(500);
    for (const m of (members || []) as any[]) {
      const info = { name: m.name, party: m.party, is_active: m.is_active };
      memberMap[m.id] = info;
      if (m.alias_name) {
        const houseLabel = m.id.startsWith("衆議院") ? "衆議院" : "参議院";
        memberMap[`${houseLabel}-${m.alias_name.replace(/[\s\u3000]/g, "")}`] = info;
      }
    }
  }

  return { petitions, memberMap };
}

type CommitteeActivityItem = {
  date: string; committee: string; ndlUrl: string;
  members: { id: string; name: string; alias_name: string | null; party: string; is_active: boolean }[];
};

export async function getLatestCommitteeActivity(client: Db = defaultClient): Promise<CommitteeActivityItem[]> {
  const { data } = await client.from("speeches")
    .select("spoken_at, committee, member_id, source_url")
    .eq("is_procedural", false)
    .order("spoken_at", { ascending: false })
    .limit(500);

  if (!data || data.length === 0) return [];

  const groupMap = new Map<string, { date: string; committee: string; sourceUrl: string; memberIds: Set<string> }>();
  for (const s of data as { spoken_at: string | null; committee: string | null; member_id: string | null; source_url: string | null }[]) {
    const committee = s.committee?.trim();
    if (!s.spoken_at || !committee) continue;
    const key = `${s.spoken_at}__${committee}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, { date: s.spoken_at, committee, sourceUrl: s.source_url || "", memberIds: new Set() });
    }
    if (s.member_id) groupMap.get(key)!.memberIds.add(s.member_id);
  }

  const groups = [...groupMap.values()].slice(0, 8);
  const allIds = [...new Set(groups.flatMap((g) => [...g.memberIds]))];
  const memberMap = new Map<string, { name: string; alias_name: string | null; party: string; is_active: boolean }>();
  if (allIds.length > 0) {
    const { data: members } = await client.from("members")
      .select("id, name, alias_name, party, is_active").in("id", allIds).limit(500);
    for (const m of (members || []) as any[])
      memberMap.set(m.id, { name: m.name, alias_name: m.alias_name ?? null, party: m.party, is_active: m.is_active });
  }

  return groups.map((g) => ({
    date: g.date,
    committee: g.committee,
    members: [...g.memberIds].map((id) => ({
      id,
      name:      memberMap.get(id)?.name      || "",
      alias_name: memberMap.get(id)?.alias_name ?? null,
      party:     memberMap.get(id)?.party     || "",
      is_active: memberMap.get(id)?.is_active ?? true,
    })),
    ndlUrl: g.sourceUrl ? g.sourceUrl.replace(/\/\d+$/, "/0") : "",
  }));
}

// ============================================================
// リストページ全件取得（questions・petitions・bills）
// 各ページの page.tsx と *Client.tsx が共通で使う
// ============================================================

const BATCH = 1000;

export async function getAllQuestionsWithMembers(client: Db = defaultClient): Promise<QuestionListItem[]> {
  const all: QuestionListItem[] = [];
  let from = 0;
  while (true) {
    const { data } = await client.from("questions")
      .select("id,session,number,title,submitted_at,answered_at,source_url,member_id,members(name,alias_name,party,is_active)")
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) all.push({ ...(d as any), house: "衆" as const });
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

export async function getAllSangiinQuestionsWithMembers(client: Db = defaultClient): Promise<QuestionListItem[]> {
  const all: QuestionListItem[] = [];
  let from = 0;
  while (true) {
    const { data } = await client.from("sangiin_questions")
      .select("id,session,number,title,submitted_at,source_url,member_id,members(name,alias_name,party,is_active)")
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) all.push({ ...(d as any), house: "参" as const, answered_at: null });
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

export async function getAllPetitionRows(client: Db = defaultClient): Promise<PetitionListItem[]> {
  const SELECT = "id,session,number,title,committee_name,result,result_date,source_url,introducer_ids,introducer_names";
  const all: PetitionListItem[] = [];
  let from = 0;
  while (true) {
    const { data } = await client.from("petitions").select(SELECT).range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) all.push({ ...(d as any), house: "衆" as const });
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

export async function getAllSangiinPetitionRows(client: Db = defaultClient): Promise<PetitionListItem[]> {
  const SELECT = "id,session,number,title,committee_name,result,result_date,source_url,introducer_ids,introducer_names";
  const all: PetitionListItem[] = [];
  let from = 0;
  while (true) {
    const { data } = await client.from("sangiin_petitions").select(SELECT).range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) all.push({ ...(d as any), house: "参" as const });
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

/** 請願ページ用 memberMap（alias_name による別IDも登録） */
export async function getPetitionMemberMap(
  client: Db = defaultClient,
): Promise<Record<string, { name: string; alias_name: string | null; party: string; is_active: boolean }>> {
  const { data } = await client.from("members")
    .select("id, name, alias_name, party, is_active").limit(2000);
  const map: Record<string, { name: string; alias_name: string | null; party: string; is_active: boolean }> = {};
  for (const m of (data || []) as any[]) {
    const info = { name: m.name, alias_name: m.alias_name ?? null, party: m.party, is_active: m.is_active };
    map[m.id] = info;
    if (m.alias_name) {
      const houseLabel = m.id.startsWith("衆議院") ? "衆議院" : "参議院";
      map[`${houseLabel}-${m.alias_name.replace(/[\s\u3000]/g, "")}`] = info;
    }
  }
  return map;
}

/**
 * 質問主意書の月別推移（政党別）
 * minSession: 衆院質問のフィルター下限（例: CURRENT_SESSION - 4）
 * 衆院は session >= minSession、参院は提出日14ヶ月以内を取得し全件ページネーション
 */
export async function getMonthlyQuestionsTrend(
  minSession: number,
  client: Db = defaultClient,
): Promise<{ month: string; total: number; parties: { party: string; count: number }[] }[]> {
  const cutoffDate = new Date();
  cutoffDate.setMonth(cutoffDate.getMonth() - 14);
  const cutoffIso = cutoffDate.toISOString().slice(0, 10);

  type Row = { submitted_at: string; members: { party: string } | null };

  // 衆院：ページネーションで全件取得
  const shuData: Row[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data } = await client.from("questions")
      .select("submitted_at, members(party)")
      .gte("session", minSession)
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) shuData.push({ submitted_at: d.submitted_at as string, members: (d.members as any) ?? null });
    if (data.length < BATCH) break;
  }

  // 参院：ページネーションで全件取得
  const sanData: Row[] = [];
  for (let from = 0; ; from += BATCH) {
    const { data } = await client.from("sangiin_questions")
      .select("submitted_at, members(party)")
      .gte("submitted_at", cutoffIso)
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) sanData.push({ submitted_at: d.submitted_at as string, members: (d.members as any) ?? null });
    if (data.length < BATCH) break;
  }

  function shuToYearMonth(s: string): string | null {
    const m = s.match(/^令和\s*(\d+|元)年\s*(\d+)月/);
    if (!m) return null;
    const y = m[1] === "元" ? 2019 : 2018 + parseInt(m[1]);
    return `${y}-${parseInt(m[2]).toString().padStart(2, "0")}`;
  }
  function sanToYearMonth(s: string): string | null {
    const m = s.match(/^(\d{4})-(\d{2})/);
    return m ? `${m[1]}-${m[2]}` : null;
  }

  const monthMap: Record<string, Record<string, number>> = {};
  const partyTotal: Record<string, number> = {};

  for (const q of shuData) {
    const ym = shuToYearMonth(q.submitted_at);
    if (!ym) continue;
    const party = q.members?.party || "その他";
    if (!monthMap[ym]) monthMap[ym] = {};
    monthMap[ym][party] = (monthMap[ym][party] || 0) + 1;
    partyTotal[party] = (partyTotal[party] || 0) + 1;
  }
  for (const q of sanData) {
    const ym = sanToYearMonth(q.submitted_at);
    if (!ym) continue;
    const party = q.members?.party || "その他";
    if (!monthMap[ym]) monthMap[ym] = {};
    monthMap[ym][party] = (monthMap[ym][party] || 0) + 1;
    partyTotal[party] = (partyTotal[party] || 0) + 1;
  }

  const sortedParties = Object.entries(partyTotal)
    .sort((a, b) => b[1] - a[1])
    .map(([p]) => p);

  return Object.entries(monthMap)
    .sort(([a], [b]) => b.localeCompare(a))
    .slice(0, 12)
    .map(([month, partyMap]) => ({
      month,
      total: Object.values(partyMap).reduce((s, c) => s + c, 0),
      parties: sortedParties.filter((p) => partyMap[p]).map((p) => ({ party: p, count: partyMap[p] })),
    }));
}

/** 法案リストページ用（bill_type でフィルター） */
export async function getBillsByType(billType: string, client: Db = defaultClient): Promise<Bill[]> {
  const SELECT = "id,title,submitted_at,status,session_number,house,submitter_ids,submitter_extra_count,honbun_url,keika_url,bill_type,committee_san,vote_date_san,committee_shu,vote_date_shu";
  const { data, error } = await client.from("bills")
    .select(SELECT)
    .eq("bill_type", billType)
    .order("submitted_at", { ascending: false })
    .limit(1000);
  if (error) {
    console.warn("getBillsByType:", error.message);
    return [];
  }
  return (data ?? []) as Bill[];
}
