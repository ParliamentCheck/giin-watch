import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import MembersClient from "./MembersClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "議員一覧",
  description: "衆議院・参議院の全現職議員一覧。政党・院・名前で絞り込み検索できます。発言数・質問主意書数で並び替え可能。",
  openGraph: {
    title: "議員一覧 | はたらく議員",
    description: "衆議院・参議院の全現職議員一覧。政党・院・名前で絞り込み検索できます。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/members" },
};

export default async function MembersPage() {
  const { data } = await supabase
    .from("members")
    .select("id, name, alias_name, last_name, first_name, last_name_reading, first_name_reading, party, faction, house, district, prefecture, terms, is_active, session_count, question_count, bill_count, petition_count")
    .eq("is_active", true)
    .limit(2000)
    .order("name");

  return <MembersClient initialMembers={data ?? []} />;
}
