import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";
import GlobalNav from "./components/GlobalNav";
import GlobalFooter from "./components/GlobalFooter";

const BASE_URL = "https://www.hataraku-giin.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: { default: "はたらく議員", template: "%s | はたらく議員" },
  description: "衆議院・参議院の全議員の発言・質問主意書・委員会活動・議員立法・採決をデータで可視化。毎日自動更新。",
  keywords: ["国会議員", "議員活動", "衆議院", "参議院", "質問主意書", "委員会", "議員立法", "採決", "政党", "国会"],
  applicationName: "はたらく議員",
  authors: [{ name: "はたらく議員" }],
  openGraph: {
    title: "はたらく議員 — 国会議員の活動を、データで見える化",
    description: "衆議院・参議院の全議員の発言・質問主意書・委員会活動・議員立法・採決をデータで可視化。毎日自動更新。",
    url: BASE_URL,
    siteName: "はたらく議員",
    type: "website",
    locale: "ja_JP",
    images: [{ url: "/og-image.svg", width: 1200, height: 630, alt: "はたらく議員" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "はたらく議員 — 国会議員の活動を、データで見える化",
    description: "衆議院・参議院の全議員の発言・質問主意書・委員会活動・議員立法・採決をデータで可視化。毎日自動更新。",
    images: ["/og-image.svg"],
  },
  alternates: {
    canonical: BASE_URL,
  },
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": `${BASE_URL}/#website`,
      "url": BASE_URL,
      "name": "はたらく議員",
      "description": "衆議院・参議院の全議員の発言・質問主意書・委員会活動・議員立法・採決をデータで可視化",
      "inLanguage": "ja",
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": `${BASE_URL}/members?q={search_term_string}`,
        },
        "query-input": "required name=search_term_string",
      },
    },
    {
      "@type": "Organization",
      "@id": `${BASE_URL}/#organization`,
      "name": "はたらく議員",
      "url": BASE_URL,
      "logo": {
        "@type": "ImageObject",
        "url": `${BASE_URL}/logo-main.svg`,
        "width": 200,
        "height": 60,
      },
      "description": "国会議員の活動をデータで見える化する情報サービス",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body style={{ margin: 0, padding: 0, background: "#f4f4f4" }}>
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
        <GlobalNav />
        <main style={{ minHeight: "calc(100vh - 60px - 120px)" }}>
          {children}
        </main>
        <GlobalFooter />
      </body>
    </html>
  );
}
