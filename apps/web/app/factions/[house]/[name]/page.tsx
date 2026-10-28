import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { supabaseServer as supabase } from "../../../../lib/supabase-server";
import { MEMBER_SELECT } from "../../../../lib/queries";
import { SLUG_HOUSE, factionPath, type FactionRow, type House } from "../../../../lib/factions";
import type { CommitteeMember, FactionVoteAlignment, Member } from "../../../../lib/types";
import FactionDetailClient from "./FactionDetailClient";

export const revalidate = 3600;

type Props = { params: Promise<{ house: string; name: string }> };

function safeDecode(s: string): string {
  try { return decodeURIComponent(s); } catch { return s; }
}

const ROLE_FILTER = ["委員長", "理事", "会長", "副会長"];

const loadFaction = cache(async (houseSlug: string, rawName: string) => {
  const house = SLUG_HOUSE[houseSlug] as House | undefined;
  if (!house) return null;
  const name = safeDecode(rawName);

  const [membersRes, factionRes] = await Promise.all([
    supabase.from("members").select(MEMBER_SELECT)
      .eq("house", house).eq("faction", name).eq("is_active", true)
      .order("id").limit(1000),
    supabase.from("factions").select("*").eq("house", house).eq("name", name).maybeSingle(),
  ]);
  if (membersRes.error) throw new Error(`faction members: ${membersRes.error.message}`);
  const members = (membersRes.data ?? []) as Member[];
  const faction = (factionRes.data ?? null) as FactionRow | null;
  if (!faction && members.length === 0) return null;

  return { house, name, faction, members };
});

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { house: houseSlug, name: rawName } = await params;
  const data = await loadFaction(houseSlug, rawName);
  if (!data) return { title: "会派が見つかりません" };
  const url = `https://www.hataraku-giin.com${factionPath(data.house, data.name)}`;
  const description = `${data.house}の会派「${data.name}」に現在所属する議員${data.members.length}名の一覧と、委員長・理事、発言のキーワード${data.house === "参議院" ? "、会派別の採決一致" : ""}。`;
  return {
    title: `${data.name}（${data.house}）`,
    description,
    openGraph: { title: `${data.name}（${data.house}） | はたらく議員`, description, url },
    alternates: { canonical: url },
  };
}

export default async function FactionDetailPage({ params }: Props) {
  const { house: houseSlug, name: rawName } = await params;
  const data = await loadFaction(houseSlug, rawName);
  if (!data) notFound();
  const { house, name, faction, members } = data;
  const memberIds = members.map((m) => m.id);

  let roles: CommitteeMember[] = [];
  if (memberIds.length > 0) {
    const { data: roleRows } = await supabase.from("committee_members")
      .select("id,member_id,name,committee,role,house")
      .in("member_id", memberIds).in("role", ROLE_FILTER).limit(1000);
    roles = (roleRows ?? []) as CommitteeMember[];
  }

  let alignments: FactionVoteAlignment[] | null = [];
  if (house === "参議院") {
    const cols = "house,session_number,faction_a,faction_b,agree_count,total_count";
    const [a, b] = await Promise.all([
      supabase.from("faction_vote_alignments").select(cols).eq("house", "参議院").eq("faction_a", name).limit(1000),
      supabase.from("faction_vote_alignments").select(cols).eq("house", "参議院").eq("faction_b", name).limit(1000),
    ]);
    alignments = a.error || b.error ? null : ([...(a.data ?? []), ...(b.data ?? [])] as FactionVoteAlignment[]);
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    "name": name,
    "url": `https://www.hataraku-giin.com${factionPath(house, name)}`,
    "parentOrganization": { "@type": "GovernmentOrganization", "name": house },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <FactionDetailClient
        house={house}
        name={name}
        shortName={faction?.short_name ?? members.find((m) => m.faction_short)?.faction_short ?? null}
        isCurrent={faction?.is_current ?? members.length > 0}
        members={members}
        roles={roles}
        alignments={alignments}
      />
    </>
  );
}
