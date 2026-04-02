import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../../lib/supabase-server";
import MemberDetailClient from "./MemberDetailClient";

export const revalidate = 3600;

type Props = { params: Promise<{ id: string }> };

async function getMember(memberId: string) {
  const { data } = await supabase
    .from("members")
    .select("id, name, alias_name, last_name, first_name, last_name_reading, first_name_reading, party, faction, house, district, terms, is_active, session_count, question_count, bill_count, petition_count, cabinet_post, source_url")
    .eq("id", memberId)
    .single();
  return data;
}

async function getGlobalMax() {
  const { data } = await supabase
    .from("members")
    .select("session_count, question_count, bill_count, petition_count")
    .limit(2000);
  if (!data || data.length === 0) return { session: 1, question: 1, bill: 1, petition: 1 };
  let gm = { session: 1, question: 1, bill: 1, petition: 1 };
  for (const m of data) {
    if ((m.session_count  ?? 0) > gm.session)  gm.session  = m.session_count;
    if ((m.question_count ?? 0) > gm.question) gm.question = m.question_count;
    if ((m.bill_count     ?? 0) > gm.bill)     gm.bill     = m.bill_count;
    if ((m.petition_count ?? 0) > gm.petition) gm.petition = m.petition_count;
  }
  return gm;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const memberId = decodeURIComponent(id);
  const data = await getMember(memberId);
  if (!data) return { title: "議員詳細" };

  const isFormer = !data.is_active;
  const parts = [data.party, data.house, data.district, data.terms ? `${data.terms}期` : null, data.cabinet_post].filter(Boolean);
  const stats = [
    data.session_count  ? `発言セッション数${data.session_count}回`  : null,
    data.question_count ? `質問主意書${data.question_count}件`        : null,
    data.bill_count     ? `議員立法${data.bill_count}件`              : null,
  ].filter(Boolean).join("、");
  const displayName = (data as any).alias_name ?? data.name;
  const formerPrefix = isFormer ? "元" : "";
  const description = `${displayName}（${formerPrefix}${parts.join("・")}）の国会活動データ。${stats ? stats + "。" : ""}発言・質問主意書・議員立法・採決・委員会活動を可視化。`;
  const url = `https://www.hataraku-giin.com/members/${encodeURIComponent(memberId)}`;

  return {
    title: displayName,
    description,
    openGraph: { title: `${displayName} | はたらく議員`, description, url },
    twitter: { card: "summary_large_image", title: `${displayName} | はたらく議員`, description },
    alternates: { canonical: url },
  };
}

async function getInitialCounts(memberId: string) {
  const [cmRes, vRes] = await Promise.all([
    supabase.from("committee_members").select("id", { count: "exact", head: true }).eq("member_id", memberId),
    supabase.from("votes").select("id", { count: "exact", head: true }).eq("member_id", memberId),
  ]);
  return { committeeCount: cmRes.count ?? null, voteCount: vRes.count ?? null };
}

export default async function MemberDetailPage({ params }: Props) {
  const { id } = await params;
  const memberId = decodeURIComponent(id);
  const [member, globalMax, initialCounts] = await Promise.all([getMember(memberId), getGlobalMax(), getInitialCounts(memberId)]);

  const jsonLd = member ? {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": (member as any).alias_name ?? member.name,
    "jobTitle": member.is_active ? (member.cabinet_post || (member.house === "衆議院" ? "衆議院議員" : "参議院議員")) : `元${member.house === "衆議院" ? "衆議院議員" : "参議院議員"}`,
    "affiliation": { "@type": "Organization", "name": member.party },
    "url": `https://www.hataraku-giin.com/members/${encodeURIComponent(memberId)}`,
    "description": `${member.name}（${member.party}・${member.house}・${member.district}${member.terms ? `・${member.terms}期` : ""}）。発言セッション数${member.session_count ?? 0}回、質問主意書${member.question_count ?? 0}件、議員立法${member.bill_count ?? 0}件、請願${member.petition_count ?? 0}件。`,
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <MemberDetailClient initialMember={member as any} initialGlobalMax={globalMax} initialCommitteeCount={initialCounts.committeeCount} initialVoteCount={initialCounts.voteCount} />
    </>
  );
}
