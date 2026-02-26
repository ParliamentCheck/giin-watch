import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import GlobalNav from "./components/GlobalNav";
import GlobalFooter from "./components/GlobalFooter";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.hataraku-giin.com"),
  title: "はたらく議員",
  description: "国会議員の活動を、データで見える化",
  openGraph: {
    title: "はたらく議員",
    description: "国会議員の活動を、データで見える化",
    url: "https://www.hataraku-giin.com",
    siteName: "はたらく議員",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "はたらく議員",
    description: "国会議員の活動を、データで見える化",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <Script
          async
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1728847761086799"
          crossOrigin="anonymous"
          strategy="afterInteractive"
        />
      </head>
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