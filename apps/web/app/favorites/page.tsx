import type { Metadata } from "next";
import FavoritesClient from "./FavoritesClient";

export const metadata: Metadata = {
  title: "お気に入り議員",
  description: "お気に入りに登録した議員の最新活動をまとめて確認。このデータはブラウザにのみ保存されます。",
  alternates: { canonical: "https://www.hataraku-giin.com/favorites" },
};

export default function FavoritesPage() {
  return <FavoritesClient />;
}
