import type { Metadata } from "next";
import { Suspense } from "react";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import PetitionsClient, { type Petition } from "./PetitionsClient";

export const revalidate = 3600;

// ── サーバーサイドデータ取得 ────────────────────────────────────

async function fetchAllServer(table: string, house: "衆" | "参") {
  const BATCH = 1000;
  const all: Record<string, unknown>[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from(table)
      .select("id,session,number,title,committee_name,result,result_date,source_url,introducer_ids,introducer_names")
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) all.push({ ...d, house });
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

// ── メタデータ ────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const [shuRes, sanRes] = await Promise.all([
    supabase.from("petitions").select("id", { count: "exact", head: true }),
    supabase.from("sangiin_petitions").select("id", { count: "exact", head: true }),
  ]);
  const total = (shuRes.count ?? 0) + (sanRes.count ?? 0);
  const description = `衆院・参院の請願${total.toLocaleString()}件を収録。紹介議員・委員会・審査結果を一覧・検索できます（第196回〜第221回国会）。`;
  return {
    title: "請願",
    description,
    openGraph: { title: "請願 | はたらく議員", description },
    alternates: { canonical: "https://www.hataraku-giin.com/petitions" },
  };
}

// ── ページ ────────────────────────────────────────────────────

export default async function PetitionsPage() {
  const [shu, san, membersRes] = await Promise.all([
    fetchAllServer("petitions", "衆"),
    fetchAllServer("sangiin_petitions", "参"),
    supabase.from("members").select("id,name,party,is_active,alias_name").limit(2000),
  ]);

  const initialPetitions = [...shu, ...san] as Petition[];

  const initialMemberMap: Record<string, { name: string; party: string; is_active: boolean }> = {};
  for (const m of membersRes.data ?? []) {
    const info = { name: m.name, party: m.party, is_active: m.is_active };
    initialMemberMap[m.id] = info;
    // alias_name（通称名）でも引けるようにする
    if (m.alias_name) {
      const houseLabel = m.id.startsWith("衆議院") ? "衆議院" : "参議院";
      const aliasId = `${houseLabel}-${m.alias_name.replace(/[\s\u3000]/g, "")}`;
      initialMemberMap[aliasId] = info;
    }
  }

  // JSON-LD（ItemList: 直近20件）
  const recent = [...initialPetitions]
    .filter(p => p.source_url)
    .slice(0, 20);
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
