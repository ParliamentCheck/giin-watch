import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import GlobalNav from "./components/GlobalNav";
import MaintenanceBanner from "./components/MaintenanceBanner";
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
      <body style={{ margin: 0, padding: 0, background: "#020817" }}>
        <Script
          src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-1728847761086799"
          strategy="beforeInteractive"
          crossOrigin="anonymous"
        />
        <Script
          src="https://www.googletagmanager.com/gtag/js?id=G-1QJP14PKPF"
          strategy="afterInteractive"
        />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', 'G-1QJP14PKPF');
          `}
        </Script>
        <MaintenanceBanner />
        <div style={{
          background: "#0f172a",
          borderBottom: "1px solid #1e293b",
          padding: "10px 16px",
          fontSize: 11,
          color: "#64748b",
          lineHeight: 1.6,
          textAlign: "center",
        }}>
          当サイトは、国会会議録等の公開記録および公開情報から機械的に集計した一部指標を表示します。
          党務、地元活動、非公開の政策調整、非公開会議等、参照できない活動は含みません。
          当サイトの表示は、活動の良否・有無を判定するものではありません。
        </div>
        <GlobalNav />
        <main style={{ minHeight: "calc(100vh - 60px - 120px)" }}>
          {children}
        </main>
        <GlobalFooter />
      </body>
    </html>
  );
}
