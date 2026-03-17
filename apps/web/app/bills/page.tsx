import type { Metadata } from "next";
import { Suspense } from "react";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import BillsClient from "./BillsClient";

export const revalidate = 3600;

export async function generateMetadata(): Promise<Metadata> {
  const [memberRes, cabinetRes] = await Promise.all([
    supabase.from("bills").select("id", { count: "exact", head: true }).eq("bill_type", "議員立法"),
    supabase.from("bills").select("id", { count: "exact", head: true }).eq("bill_type", "閣法"),
  ]);
  const memberCount  = memberRes.count  ?? 0;
  const cabinetCount = cabinetRes.count ?? 0;
  const description = `議員立法${memberCount}件・閣法${cabinetCount}件を収録。提出者・提出日・審議状況・採決結果を一覧・検索できます。`;
  return {
    title: "法案",
    description,
    openGraph: { title: "法案 | はたらく議員", description },
    alternates: { canonical: "https://www.hataraku-giin.com/bills" },
  };
}

export default function BillsPage() {
  return (
    <Suspense>
      <BillsClient />
    </Suspense>
  );
}
