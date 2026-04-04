import type { Metadata } from "next";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import CabinetClient from "./CabinetClient";

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "内閣一覧",
  description: "現在の閣僚・副大臣・政務官の一覧と所属政党。",
  openGraph: {
    title: "内閣一覧 | はたらく議員",
    description: "現在の閣僚・副大臣・政務官の一覧と所属政党。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/cabinet" },
};

export default async function CabinetPage() {
  const { data } = await supabase
    .from("members")
    .select("id, name, party, house, district, cabinet_post")
    .eq("is_active", true)
    .not("cabinet_post", "is", null);

  return <CabinetClient initialMembers={data ?? []} />;
}
