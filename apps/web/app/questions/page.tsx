import type { Metadata } from "next";
import { Suspense } from "react";
import { supabaseServer } from "../../lib/supabase-server";
import { getAllQuestionsWithMembers, getAllSangiinQuestionsWithMembers } from "../../lib/queries";
import type { QuestionListItem } from "../../lib/types";
import QuestionsClient from "./QuestionsClient";

export const revalidate = 3600;

// ── メタデータ ────────────────────────────────────────────────

export async function generateMetadata(): Promise<Metadata> {
  const [shuRes, sanRes] = await Promise.all([
    supabaseServer.from("questions").select("id", { count: "exact", head: true }),
    supabaseServer.from("sangiin_questions").select("id", { count: "exact", head: true }),
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

// ── ページ ────────────────────────────────────────────────���───

export default async function QuestionsPage() {
  const [shu, san] = await Promise.all([
    getAllQuestionsWithMembers(supabaseServer),
    getAllSangiinQuestionsWithMembers(supabaseServer),
  ]);

  const initialQuestions: QuestionListItem[] = [...shu, ...san];

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
