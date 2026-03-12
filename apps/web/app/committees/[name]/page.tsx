import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../../lib/supabase-server";
import CommitteeDetailClient from "./CommitteeDetailClient";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ name: string }> };

async function getCommitteeInfo(committeeName: string) {
  const { data } = await supabase
    .from("committee_members")
    .select("name, role")
    .eq("committee", committeeName)
    .limit(500);
  return data || [];
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const committeeName = decodeURIComponent(name);
  const members = await getCommitteeInfo(committeeName);
  const description = `${committeeName}の委員一覧（${members.length}名）。委員長・理事・所属議員、委員会審査の請願一覧。`;
  const url = `https://www.hataraku-giin.com/committees/${encodeURIComponent(committeeName)}`;

  return {
    title: committeeName,
    description,
    openGraph: { title: `${committeeName} | はたらく議員`, description, url },
    alternates: { canonical: url },
  };
}

export default async function CommitteeDetailPage({ params }: Props) {
  const { name } = await params;
  const committeeName = decodeURIComponent(name);
  const members = await getCommitteeInfo(committeeName);
  const chairs = members.filter((m: any) => m.role === "委員長" || m.role === "会長");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "GovernmentOrganization",
    "name": committeeName,
    "url": `https://www.hataraku-giin.com/committees/${encodeURIComponent(committeeName)}`,
    "memberOf": { "@type": "GovernmentOrganization", "name": "日本国国会" },
    ...(chairs.length > 0 && {
      "employee": chairs.map((c: any) => ({
        "@type": "Person",
        "name": c.name,
        "jobTitle": c.role,
      })),
    }),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <CommitteeDetailClient />
    </>
  );
}
