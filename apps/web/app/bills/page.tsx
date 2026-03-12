import type { Metadata } from "next";
import BillsClient from "./BillsClient";

export const metadata: Metadata = {
  title: "議員立法",
  description: "衆議院・参議院に提出された議員立法（議員提出法律案）の一覧。提出者・提出日・審議状況を検索できます。",
  openGraph: {
    title: "議員立法 | はたらく議員",
    description: "衆議院・参議院に提出された議員立法の一覧。提出者・提出日・審議状況を検索できます。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/bills" },
};

export default function BillsPage() {
  return <BillsClient />;
}
