import type { Metadata } from "next";
import PartiesClient from "./PartiesClient";

export const metadata: Metadata = {
  title: "政党・会派",
  description: "衆議院・参議院の政党・会派別データ。",
  alternates: { canonical: "https://www.hataraku-giin.com/parties" },
};

export default function PartiesPage() {
  return <PartiesClient />;
}
