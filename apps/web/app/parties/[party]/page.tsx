import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../../lib/supabase-server";
import PartyDetailClient from "./PartyDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ party: string }> };

async function getPartyInfo(partyName: string) {
  const { data } = await supabase
    .from("members")
    .select("id")
    .eq("party", partyName)
    .eq("is_active", true)
    .limit(2000);
  return { memberCount: data?.length ?? 0 };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { party } = await params;
  const partyName = decodeURIComponent(party);
  const { memberCount } = await getPartyInfo(partyName);
  const description = `${partyName}の国会活動データ。所属議員${memberCount}名の発言・質問主意書・委員長・理事一覧、キーワード分析。`;
  const url = `https://www.hataraku-giin.com/parties/${encodeURIComponent(partyName)}`;

  return {
    title: partyName,
    description,
    openGraph: { title: `${partyName} | はたらく議員`, description, url },
    alternates: { canonical: url },
  };
}

export default async function PartyDetailPage({ params }: Props) {
  const { party } = await params;
  const partyName = decodeURIComponent(party);
  const { memberCount } = await getPartyInfo(partyName);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "PoliticalParty",
    "name": partyName,
    "url": `https://www.hataraku-giin.com/parties/${encodeURIComponent(partyName)}`,
    "numberOfEmployees": { "@type": "QuantitativeValue", "value": memberCount },
    "memberOf": { "@type": "GovernmentOrganization", "name": "日本国国会" },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PartyDetailClient />
    </>
  );
}
