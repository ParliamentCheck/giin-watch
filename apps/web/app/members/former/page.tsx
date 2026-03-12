import type { Metadata } from "next";
import FormerMembersClient from "./FormerMembersClient";

export const metadata: Metadata = {
  title: "元議員一覧",
  description: "過去に衆議院・参議院議員を務めた元議員の一覧。",
  openGraph: {
    title: "元議員一覧 | はたらく議員",
    description: "過去に衆議院・参議院議員を務めた元議員の一覧。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/members/former" },
};

export default function FormerMembersPage() {
  return <FormerMembersClient />;
}
