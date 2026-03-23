import type { MetadataRoute } from "next";
import { supabaseServer as supabase } from "../lib/supabase-server";

export const dynamic = "force-dynamic";

const BASE = "https://www.hataraku-giin.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: BASE,                     lastModified: now, changeFrequency: "daily",   priority: 1.0 },
    { url: `${BASE}/members`,        lastModified: now, changeFrequency: "daily",   priority: 0.9 },
    { url: `${BASE}/members/former`, lastModified: now, changeFrequency: "weekly",  priority: 0.6 },
    { url: `${BASE}/parties`,        lastModified: now, changeFrequency: "weekly",  priority: 0.8 },
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

  // 政党ページ
  const partiesRes = await supabase
    .from("members")
    .select("party")
    .eq("is_active", true)
    .limit(2000);
  const partySet = new Set<string>(
    (partiesRes.data || []).map((m: any) => m.party).filter(Boolean)
  );
  const partyRoutes: MetadataRoute.Sitemap = Array.from(partySet).map((party) => ({
    url: `${BASE}/parties/${encodeURIComponent(party)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.8,
  }));

  // 委員会ページ
  const committeeRes = await supabase
    .from("committee_members")
    .select("committee")
    .limit(2000);
  const committeeSet = new Set<string>(
    (committeeRes.data || []).map((c: any) => c.committee).filter(Boolean)
  );
  const committeeRoutes: MetadataRoute.Sitemap = Array.from(committeeSet).map((name) => ({
    url: `${BASE}/committees/${encodeURIComponent(name)}`,
    lastModified: now,
    changeFrequency: "weekly" as const,
    priority: 0.7,
  }));

  return [...staticRoutes, ...memberRoutes, ...partyRoutes, ...committeeRoutes];
}
