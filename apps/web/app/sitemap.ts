import type { MetadataRoute } from "next";
import { supabaseServer as supabase } from "../lib/supabase-server";
import { factionPath } from "../lib/factions";

export const dynamic = "force-dynamic";

const BASE = "https://www.hataraku-giin.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE,                     lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE}/members`,        lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE}/members/former`, lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${BASE}/factions`,       lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/elections`,      lastModified: now, changeFrequency: "monthly", priority: 0.5 },
    { url: `${BASE}/committees`,     lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
    { url: `${BASE}/bills`,          lastModified: now, changeFrequency: "daily",   priority: 0.7 },
    { url: `${BASE}/votes`,          lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE}/cabinet`,        lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE}/petitions`,      lastModified: now, changeFrequency: "weekly",  priority: 0.7 },
    { url: `${BASE}/about`,          lastModified: now, changeFrequency: "monthly", priority: 0.4 },
    { url: `${BASE}/contact`,        lastModified: now, changeFrequency: "monthly", priority: 0.3 },
    { url: `${BASE}/changelog`,      lastModified: now, changeFrequency: "weekly",  priority: 0.4 },
    { url: `${BASE}/terms`,          lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${BASE}/privacy`,        lastModified: now, changeFrequency: "monthly", priority: 0.2 },
    { url: `${BASE}/disclaimer`,     lastModified: now, changeFrequency: "monthly", priority: 0.2 },
  ];

  // 現職議員ページ
  const membersRes = await supabase
    .from("members")
    .select("id")
    .eq("is_active", true)
    .limit(2000);
  const memberRoutes: MetadataRoute.Sitemap = (membersRes.data || []).map((m) => ({
    url: `${BASE}/members/${encodeURIComponent(m.id)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // 会派ページ（公式の会派一覧に載っている現在の会派）
  const factionsRes = await supabase
    .from("factions")
    .select("house,name")
    .eq("is_current", true)
    .limit(1000);
  const factionRoutes: MetadataRoute.Sitemap = (factionsRes.data || []).map((f: { house: "衆議院" | "参議院"; name: string }) => ({
    url: `${BASE}${factionPath(f.house, f.name)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // 委員会ページ
  const [cmRes1, cmRes2] = await Promise.all([
    supabase.from("committee_members").select("committee").range(0, 999),
    supabase.from("committee_members").select("committee").range(1000, 1999),
  ]);
  const committeeSet = new Set<string>(
    [...(cmRes1.data ?? []), ...(cmRes2.data ?? [])].map((c: any) => c.committee).filter(Boolean)
  );
  const committeeRoutes: MetadataRoute.Sitemap = Array.from(committeeSet).map((name) => ({
    url: `${BASE}/committees/${encodeURIComponent(name)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...memberRoutes, ...factionRoutes, ...committeeRoutes];
}
