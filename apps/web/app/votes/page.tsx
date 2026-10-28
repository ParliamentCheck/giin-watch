import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import { fetchAllRows, getFactionVoteAlignments } from "../../lib/queries";
import type { FactionVoteAlignment } from "../../lib/types";
import VotesClient from "./VotesClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "会派別の採決一致",
  description: "参議院本会議の投票結果ページに記載された会派別の票数をもとに、会派の組み合わせごとに賛否が一致した採決の割合を国会の回次別に集計しています。",
  openGraph: {
    title: "会派別の採決一致 | はたらく議員",
    description: "参議院本会議の会派別の票数をもとに、会派の組み合わせごとの賛否の一致を国会の回次別に集計。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/votes" },
};

export default async function VotesPage() {
  let alignments: FactionVoteAlignment[] | null = null;
  const voteCounts: Record<number, number> = {};
  try {
    alignments = await getFactionVoteAlignments(supabase);
    // 会期ごとの採決件数（会派別の票数が記録されている採決）
    const keys = await fetchAllRows<{ vote_key: string; session_number: number }>(
      (from, to) => supabase.from("vote_faction_totals").select("vote_key,session_number")
        .order("vote_key").order("faction_name").range(from, to),
      "vote_faction_totals",
    );
    const seen = new Set<string>();
    for (const k of keys) {
      if (seen.has(k.vote_key)) continue;
      seen.add(k.vote_key);
      voteCounts[k.session_number] = (voteCounts[k.session_number] ?? 0) + 1;
    }
  } catch {
    alignments = null;
  }
  return <VotesClient alignments={alignments} voteCounts={voteCounts} />;
}
