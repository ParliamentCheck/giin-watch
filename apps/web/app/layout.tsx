import type { Metadata } from "next";
import "./globals.css";
import GlobalNav from "./components/GlobalNav";
import GlobalFooter from "./components/GlobalFooter";

export const metadata: Metadata = {
  title: "はたらく議員",
  description: "国会議員の活動を、データで見える化する",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body style={{ margin: 0, padding: 0, background: "#020817" }}>
        <GlobalNav />
        <main style={{ minHeight: "calc(100vh - 60px - 120px)" }}>
          {children}
        </main>
        <GlobalFooter />
      </body>
    </html>
  );
}