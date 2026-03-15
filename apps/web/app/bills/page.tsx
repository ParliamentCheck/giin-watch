import type { Metadata } from "next";
import BillsClient from "./BillsClient";

export const metadata: Metadata = {
  title: "法案",
  description: "衆議院・参議院に提出された議員立法・閣法（内閣提出法案）の一覧。提出者・提出日・審議状況を検索できます。",
  openGraph: {
    title: "法案 | はたらく議員",
    description: "衆議院・参議院に提出された議員立法・閣法（内閣提出法案）の一覧。提出者・提出日・審議状況を検索できます。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/bills" },
};

export default function BillsPage() {
  return <BillsClient />;
}
