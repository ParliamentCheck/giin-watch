import type { Metadata } from "next";
import CabinetClient from "./CabinetClient";

export const metadata: Metadata = {
  title: "内閣一覧",
  description: "現在の閣僚・副大臣・政務官の一覧と所属政党。",
  openGraph: {
    title: "内閣一覧 | はたらく議員",
    description: "現在の閣僚・副大臣・政務官の一覧と所属政党。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/cabinet" },
};

export default function CabinetPage() {
  return <CabinetClient />;
}
