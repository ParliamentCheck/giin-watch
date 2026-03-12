import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../../lib/supabase-server";
import MemberDetailClient from "./MemberDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

async function getMember(memberId: string) {
  const { data } = await supabase
    .from("members")
    .select("name, party, house, district, cabinet_post")
    .eq("id", memberId)
    .single();
  return data;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const memberId = decodeURIComponent(id);
  const data = await getMember(memberId);
  if (!data) return { title: "議員詳細" };

  const parts = [data.party, data.house, data.district, data.cabinet_post].filter(Boolean);
  const description = `${data.name}（${parts.join("・")}）の国会活動データ。発言・質問主意書・議員立法・採決・委員会活動を可視化。`;
  const url = `https://www.hataraku-giin.com/members/${encodeURIComponent(memberId)}`;

  return {
    title: data.name,
    description,
    openGraph: { title: `${data.name} | はたらく議員`, description, url },
    twitter: { card: "summary", title: `${data.name} | はたらく議員`, description },
    alternates: { canonical: url },
  };
}

export default async function MemberDetailPage({ params }: Props) {
  const { id } = await params;
  const memberId = decodeURIComponent(id);
  const data = await getMember(memberId);

  const jsonLd = data ? {
    "@context": "https://schema.org",
    "@type": "Person",
    "name": data.name,
    "jobTitle": data.cabinet_post || (data.house === "衆議院" ? "衆議院議員" : "参議院議員"),
    "affiliation": { "@type": "Organization", "name": data.party },
    "url": `https://www.hataraku-giin.com/members/${encodeURIComponent(memberId)}`,
  } : null;

  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <MemberDetailClient />
    </>
  );
}
