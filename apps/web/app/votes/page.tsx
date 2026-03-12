import type { Metadata } from "next";
import VotesClient from "./VotesClient";

export const metadata: Metadata = {
  title: "政党別採決一致率",
  description: "参議院本会議の採決記録をもとに、政党間の投票行動の一致率を集計したマトリックス。国会回次別のフィルタに対応。",
  openGraph: {
    title: "政党別採決一致率 | はたらく議員",
    description: "参議院本会議の採決記録をもとに、政党間の投票行動の一致率を集計したマトリックス。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/votes" },
};

export default function VotesPage() {
  return <VotesClient />;
}
