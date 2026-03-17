import type { Metadata } from "next";
import FavoritesClient from "./FavoritesClient";

export const metadata: Metadata = {
  title: "My議員",
  description: "My議員に登録した議員の最新活動をまとめて確認。このデータはブラウザにのみ保存されます。",
  alternates: { canonical: "https://www.hataraku-giin.com/favorites" },
};

export default function FavoritesPage() {
  return <FavoritesClient />;
}
