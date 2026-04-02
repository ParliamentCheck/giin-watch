import type { Metadata } from "next";
import { Suspense } from "react";
import { supabaseServer as supabase } from "../../lib/supabase-server";
import QuestionsClient, { type Question } from "./QuestionsClient";

export const revalidate = 3600;

// ── サーバーサイドデータ取得 ────────────────────────────────────

async function fetchShuServer(): Promise<Question[]> {
  const BATCH = 1000;
  const all: Question[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("questions")
      .select("id,session,number,title,submitted_at,answered_at,source_url,member_id,members(name,party,is_active)")
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) all.push({ ...(d as any), house: "衆" as const });
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

async function fetchSanServer(): Promise<Question[]> {
  const BATCH = 1000;
  const all: Question[] = [];
  let from = 0;
  while (true) {
    const { data } = await supabase
      .from("sangiin_questions")
      .select("id,session,number,title,submitted_at,source_url,member_id,members(name,party,is_active)")
      .range(from, from + BATCH - 1);
    if (!data || data.length === 0) break;
    for (const d of data) all.push({ ...(d as any), house: "参" as const, answered_at: null });
    if (data.length < BATCH) break;
    from += BATCH;
  }
  return all;
}

// ── メタデータ ────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const [shuRes, sanRes] = await Promise.all([
    supabase.from("questions").select("id", { count: "exact", head: true }),
    supabase.from("sangiin_questions").select("id", { count: "exact", head: true }),
  ]);
  const total = (shuRes.count ?? 0) + (sanRes.count ?? 0);
  const description = `衆院・参院の質問主意書${total.toLocaleString()}件を収録。提出議員・提出日・答弁日を一覧・検索できます（第196回〜第221回国会）。`;
  return {
    title: "質問主意書",
    description,
    openGraph: { title: "質問主意書 | はたらく議員", description },
    alternates: { canonical: "https://www.hataraku-giin.com/questions" },
  };
}

// ── ページ ────────────────────────────────────────────────────

export default async function QuestionsPage() {
  const [shu, san] = await Promise.all([
    fetchShuServer(),
    fetchSanServer(),
  ]);

  const initialQuestions = [...shu, ...san];

  // JSON-LD（直近20件）
  const recent = [...initialQuestions]
    .sort((a, b) => {
      if (a.session !== b.session) return b.session - a.session;
      return b.number - a.number;
    })
    .filter(q => q.source_url)
    .slice(0, 20);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "name": "質問主意書一覧 | はたらく議員",
    "description": "国会（衆院・参院）に提出された質問主意書の一覧。提出議員・提出日・答弁日を掲載。",
    "url": "https://www.hataraku-giin.com/questions",
    "numberOfItems": initialQuestions.length,
    "itemListElement": recent.map((q, i) => ({
      "@type": "ListItem",
      "position": i + 1,
      "name": q.title,
      "url": q.source_url,
    })),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <Suspense>
        <QuestionsClient initialQuestions={initialQuestions} />
      </Suspense>
    </>
  );
}
