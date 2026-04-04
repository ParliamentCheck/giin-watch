import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import VotesClient from "./VotesClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "政党別採決一致率",
  description: "参議院本会議の採決記録をもとに、政党間の投票行動の一致率を集計したマトリックス。国会回次別のフィルタに対応。",
  openGraph: {
    title: "政党別採決一致率 | はたらく議員",
    description: "参議院本会議の採決記録をもとに、政党間の投票行動の一致率を集計したマトリックス。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/votes" },
};

export default async function VotesPage() {
  let allVotes: { member_id: string; vote: string; bill_title: string; vote_date: string; session_number: number }[] = [];
  let from = 0;
  const PAGE = 1000;
  while (true) {
    const { data } = await supabase
      .from("votes")
      .select("member_id,vote,bill_title,vote_date,session_number")
      .range(from, from + PAGE - 1);
    const batch = data || [];
    allVotes = allVotes.concat(batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  const { data: membersData } = await supabase.from("members").select("id,party").limit(2000);
  const memberPartyMap: Record<string, string> = {};
  for (const m of membersData || []) {
    memberPartyMap[m.id] = m.party || "無所属";
  }

  return <VotesClient initialRawVotes={allVotes} initialMemberPartyMap={memberPartyMap} />;
}
