import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import CommitteesClient from "./CommitteesClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "委員会一覧",
  description: "衆議院・参議院の常任委員会・特別委員会の一覧。委員長・理事・所属議員を確認できます。",
  openGraph: {
    title: "委員会一覧 | はたらく議員",
    description: "衆議院・参議院の常任委員会・特別委員会の一覧。委員長・理事・所属議員を確認できます。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/committees" },
};

export default async function CommitteesPage() {
  const { data } = await supabase
    .from("committee_members")
    .select("committee, house")
    .limit(2000);

  return <CommitteesClient initialRaw={data ?? []} />;
}
