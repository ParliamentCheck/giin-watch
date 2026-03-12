import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/favorites", "/api/"],
      },
      {
        userAgent: "GPTBot",
        allow: "/",
        disallow: ["/favorites"],
      },
      {
        userAgent: "ClaudeBot",
        allow: "/",
        disallow: ["/favorites"],
      },
      {
        userAgent: "PerplexityBot",
        allow: "/",
        disallow: ["/favorites"],
      },
      {
        userAgent: "Googlebot",
        allow: "/",
      },
    ],
    sitemap: "https://www.hataraku-giin.com/sitemap.xml",
    host: "https://www.hataraku-giin.com",
  };
}
