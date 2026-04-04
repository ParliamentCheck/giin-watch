import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import PartiesClient from "./PartiesClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "政党・会派",
  description: "衆議院・参議院の政党・会派別データ。",
  alternates: { canonical: "https://www.hataraku-giin.com/parties" },
};

export default async function PartiesPage() {
  const { data } = await supabase
    .from("members")
    .select("party")
    .eq("is_active", true)
    .limit(2000);

  const partyMap: Record<string, number> = {};
  for (const m of data || []) {
    const p = (m.party as string) || "無所属";
    partyMap[p] = (partyMap[p] || 0) + 1;
  }
  const initialParties = Object.entries(partyMap)
    .map(([party, total]) => ({ party, total }))
    .sort((a, b) => b.total - a.total);

  return <PartiesClient initialParties={initialParties} />;
}
