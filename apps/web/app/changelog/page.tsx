import type { Metadata } from "next";
import ChangelogClient from "./ChangelogClient";

export const metadata: Metadata = {
  title: "更新履歴",
  description: "はたらく議員のデータ更新・機能追加の履歴。",
  openGraph: {
    title: "更新履歴 | はたらく議員",
    description: "はたらく議員のデータ更新・機能追加の履歴。",
  },
  alternates: { canonical: "https://www.hataraku-giin.com/changelog" },
};

export default function ChangelogPage() {
  return <ChangelogClient />;
}
