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
  const chair = members.find((m: any) => m.role === "委員長" || m.role === "会長");
  const description = chair
    ? `${committeeName}（${chair.role}：${chair.name}、委員${members.length}名）。委員長・理事・所属議員の一覧と委員会審査の請願を掲載。`
    : `${committeeName}の委員一覧（${members.length}名）。委員長・理事・所属議員と委員会審査の請願を掲載。`;
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
