import type { Metadata } from "next";
import Script from "next/script";
import { Suspense } from "react";
import "./globals.css";
import GlobalNav from "./components/GlobalNav";
import GlobalFooter from "./components/GlobalFooter";
import FloatingMemberSearch from "./components/FloatingMemberSearch";
import Analytics from "@/components/Analytics";
import { ScopeNotice } from "./components/Notices";
import { SiteSettingsProvider } from "./components/SiteSettings";
import { supabaseServer } from "../lib/supabase-server";

// site_settings（選挙セーフモード・メンテナンスバナー）を全ページで1時間ごとに読み直す
export const revalidate = 3600;

type SiteSettingsRow = { key: string; value: string | null };

/**
 * site_settings を読む。
 * - election_safe_mode: 値が空でなければ ON。**読めない・行がない場合も ON**（フェイルセーフ）。
 * - maintenance_banner: 値が空でなければその文言をバナー表示。読めない場合は表示しない。
 */
async function loadSiteSettings(): Promise<{ electionSafeMode: boolean; maintenanceBanner: string }> {
  try {
    const { data, error } = await supabaseServer
      .from("site_settings")
      .select("key, value")
      .in("key", ["election_safe_mode", "maintenance_banner"]);
    if (error || !data) return { electionSafeMode: true, maintenanceBanner: "" };
    const rows = data as SiteSettingsRow[];
    const safe = rows.find((r) => r.key === "election_safe_mode");
    const banner = rows.find((r) => r.key === "maintenance_banner");
    return {
      electionSafeMode: safe ? (safe.value ?? "").trim() !== "" : true,
      maintenanceBanner: (banner?.value ?? "").trim(),
    };
  } catch {
    return { electionSafeMode: true, maintenanceBanner: "" };
  }
}

const BASE_URL = "https://www.hataraku-giin.com";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: { default: "はたらく議員", template: "%s | はたらく議員" },
  description: "衆議院・参議院の全議員の発言・質問主意書・委員会活動・議員立法・採決をデータで可視化。毎日自動更新。",
  keywords: ["国会議員", "議員活動", "衆議院", "参議院", "質問主意書", "委員会", "議員立法", "採決", "会派", "国会"],
  applicationName: "はたらく議員",
  authors: [{ name: "はたらく議員" }],
  openGraph: {
    title: "はたらく議員 — 国会議員の活動を、データで見える化",
    description: "衆議院・参議院の全議員の発言・質問主意書・委員会活動・議員立法・採決をデータで可視化。毎日自動更新。",
    url: BASE_URL,
    siteName: "はたらく議員",
    type: "website",
    locale: "ja_JP",
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "はたらく議員" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "はたらく議員 — 国会議員の活動を、データで見える化",
    description: "衆議院・参議院の全議員の発言・質問主意書・委員会活動・議員立法・採決をデータで可視化。毎日自動更新。",
    images: ["/og-image.png"],
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const settings = await loadSiteSettings();
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
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        <GlobalNav />
        {settings.maintenanceBanner && (
          <div
            role="status"
            style={{
              background: "#fff7e6",
              borderBottom: "1px solid #f0c36d",
              color: "#5c3d00",
              fontSize: 13,
              padding: "8px 16px",
              textAlign: "center",
            }}
          >
            {settings.maintenanceBanner}
          </div>
        )}
        <ScopeNotice />
        <SiteSettingsProvider value={{ electionSafeMode: settings.electionSafeMode }}>
          <main style={{ minHeight: "calc(100vh - 60px - 120px)" }}>
            {children}
          </main>
        </SiteSettingsProvider>
        <GlobalFooter />
        <FloatingMemberSearch />
      </body>
    </html>
  );
}
