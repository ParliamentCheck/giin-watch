import type { Metadata } from "next";
import { Suspense } from "react";
import { supabaseServer } from "../../lib/supabase-server";
import { SESSION_RANGE_QUESTIONS } from "../../lib/constants";
import {
  getAllPetitionRows,
  getAllSangiinPetitionRows,
  getPetitionMemberMap,
} from "../../lib/queries";
import type { PetitionListItem } from "../../lib/types";
import PetitionsClient from "./PetitionsClient";

export const revalidate = 3600;

// ── メタデータ ────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const [shuRes, sanRes] = await Promise.all([
    supabaseServer.from("petitions").select("id", { count: "exact", head: true }),
    supabaseServer.from("sangiin_petitions").select("id", { count: "exact", head: true }),
  ]);
  const total = (shuRes.count ?? 0) + (sanRes.count ?? 0);
  const description = `衆院・参院の請願${total.toLocaleString()}件を収録。紹介議員・委員会・審査結果を一覧・検索できます（${SESSION_RANGE_QUESTIONS}）。`;
  return {
    title: "請願",
    description,
    openGraph: { title: "請願 | はたらく議員", description },
    alternates: { canonical: "https://www.hataraku-giin.com/petitions" },
  };
}

// ── ページ ────────────────────────────────────────────────────

export default async function PetitionsPage() {
  const [shu, san, initialMemberMap] = await Promise.all([
    getAllPetitionRows(supabaseServer),
    getAllSangiinPetitionRows(supabaseServer),
    getPetitionMemberMap(supabaseServer),
  ]);

  const initialPetitions: PetitionListItem[] = [...shu, ...san];

  // JSON-LD（ItemList: 直近20件）
  const recent = [...initialPetitions].filter(p => p.source_url).slice(0, 20);
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "請願一覧 | はたらく議員",
    "description": "国会（衆院・参院）に提出された請願の一覧。紹介議員・委員会・審査結果を掲載。",
    "url": "https://www.hataraku-giin.com/petitions",
    "numberOfItems": initialPetitions.length,
    "itemListElement": recent.map((p, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": p.title,
      "url": p.source_url,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense>
        <PetitionsClient
          initialPetitions={initialPetitions}
          initialMemberMap={initialMemberMap}
        />
      </Suspense>
    </>
  );
}
