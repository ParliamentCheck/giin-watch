import type { Metadata } from "next";
import { supabaseServer } from "../../lib/supabase-server";
import { getCabinetMembers } from "../../lib/queries";
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
  const members = await getCabinetMembers(supabaseServer);
  return <CabinetClient initialMembers={members} />;
}
