"use client";

import { useState } from "react";
import Link from "next/link";

interface Question {
  id: string;
  title: string;
  submitted_at: string | null;
  member_id: string;
  source_url: string | null;
  house: "衆" | "参";
  members: { name: string; party: string } | null;
}

interface CommitteeActivity {
  date: string;
  committee: string;
  members: { id: string; name: string }[];
  ndlUrl: string;
}

interface Petition {
  id: string;
  session: number;
  number: number;
  title: string;
  committee_name: string | null;
  result: string | null;
  result_date: string | null;
  source_url: string | null;
  house: "衆" | "参";
  introducer_names: string[] | null;
}

interface Props {
  recentQuestions: Question[];
  committeeActivities: CommitteeActivity[];
  recentPetitions: Petition[];
}

export default function ActivityTabs({ recentQuestions, committeeActivities, recentPetitions }: Props) {
  const [tab, setTab] = useState<"questions" | "committee" | "petitions">("questions");

  const tabs = [
    { id: "questions" as const,  label: "📝 最新の質問主意書" },
    { id: "committee" as const,  label: "🏛 直近の委員会活動" },
    { id: "petitions" as const,  label: "📜 最新の請願" },
  ];

  return (
    <section className="mb-16">
      {/* タブバー */}
      <div className="flex gap-1 mb-4 bg-white/60 border border-neutral-200 rounded-xl p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
              tab === t.id
                ? "bg-neutral-900 text-white"
                : "text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* 質問主意書 */}
      {tab === "questions" && (
        <div className="space-y-2">
          {recentQuestions.length === 0 ? (
            <p className="text-sm text-neutral-500 py-8 text-center">データがありません</p>
          ) : recentQuestions.map((q) => (
            <div key={q.id}
              className="bg-white/40 border border-neutral-200 rounded-xl px-4 py-3">
              <div className="flex items-start gap-2 mb-1.5">
                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${
                  q.house === "衆" ? "bg-neutral-200/60 text-neutral-500" : "bg-neutral-200/60 text-neutral-500"
                }`}>{q.house}</span>
                {q.source_url ? (
                  <a href={q.source_url} target="_blank" rel="noopener noreferrer"
                    className="text-sm text-neutral-800 hover:text-neutral-600 leading-snug transition-colors line-clamp-2 underline underline-offset-2 decoration-neutral-400">
                    {q.title}
                    <span className="inline-block ml-1 text-neutral-400 text-[11px] no-underline">↗</span>
                  </a>
                ) : (
                  <span className="text-sm text-neutral-500 leading-snug line-clamp-2">{q.title}</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-neutral-500 pl-6">
                <Link href={`/members/${encodeURIComponent(q.member_id)}`}
                  className="hover:text-neutral-500 transition-colors">
                  {q.members?.name}
                </Link>
                <span className="text-neutral-600">·</span>
                <span>{q.members?.party}</span>
                <span className="text-neutral-600">·</span>
                <span className="tabular-nums">{q.submitted_at}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 委員会活動 */}
      {tab === "committee" && (
        <div className="space-y-2">
          {committeeActivities.length === 0 ? (
            <p className="text-sm text-neutral-500 py-8 text-center">データがありません</p>
          ) : committeeActivities.map((c) => (
            <a key={`${c.date}-${c.committee}`} href={c.ndlUrl || undefined}
              target="_blank" rel="noopener noreferrer"
              className="block bg-white/40 border border-neutral-200 rounded-xl px-4 py-3 hover:border-neutral-300 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="text-sm font-semibold text-neutral-900">{c.committee}</div>
                <span className="text-xs text-neutral-500 tabular-nums shrink-0 ml-2">{c.date}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {c.members.slice(0, 8).map((m) => (
                  <span key={m.id}
                    className="text-xs text-neutral-700 bg-neutral-100/60 px-2 py-0.5 rounded">
                    {m.name}
                  </span>
                ))}
                {c.members.length > 8 && (
                  <span className="text-xs text-neutral-400 px-2 py-0.5">他{c.members.length - 8}名</span>
                )}
              </div>
            </a>
          ))}
          <p className="text-[11px] text-neutral-400 mt-2">
            ※ 国会会議録システムへの反映には1〜2週間かかる場合があります
          </p>
        </div>
      )}

      {/* 請願 */}
      {tab === "petitions" && (
        <div className="space-y-2">
          {recentPetitions.length === 0 ? (
            <p className="text-sm text-neutral-500 py-8 text-center">データがありません</p>
          ) : recentPetitions.map((p) => {
            const resultColor = p.result === "採択" ? "#22c55e"
              : p.result === "不採択" ? "#ef4444" : "#555555";
            return (
              <div key={p.id}
                className="bg-white/40 border border-neutral-200 rounded-xl px-4 py-3">
                <div className="flex items-start gap-2 mb-1.5">
                  <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 ${
                    p.house === "衆" ? "bg-neutral-200/60 text-neutral-500" : "bg-neutral-200/60 text-neutral-500"
                  }`}>{p.house}</span>
                  {p.source_url ? (
                    <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                      className="text-sm text-neutral-800 hover:text-neutral-600 leading-snug transition-colors line-clamp-2 underline underline-offset-2 decoration-neutral-400">
                      {p.title}
                      <span className="inline-block ml-1 text-neutral-400 text-[11px] no-underline">↗</span>
                    </a>
                  ) : (
                    <span className="text-sm text-neutral-500 leading-snug line-clamp-2">{p.title}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-neutral-500 pl-6 flex-wrap">
                  <span>第{p.session}回 #{p.number}</span>
                  {p.committee_name && (
                    <>
                      <span className="text-neutral-600">·</span>
                      <span>{p.committee_name}</span>
                    </>
                  )}
                  {p.result && (
                    <>
                      <span className="text-neutral-600">·</span>
                      <span style={{ color: resultColor, fontWeight: 700 }}>{p.result}</span>
                    </>
                  )}
                  {p.result_date && (
                    <>
                      <span className="text-neutral-600">·</span>
                      <span className="tabular-nums">{p.result_date}</span>
                    </>
                  )}
                </div>
                {p.introducer_names && p.introducer_names.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5 pl-6">
                    {p.introducer_names.map((name) => (
                      <span key={name}
                        className="text-[11px] text-neutral-700 bg-neutral-100/60 px-1.5 py-0.5 rounded">
                        {name}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
