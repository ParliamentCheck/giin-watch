"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";
import { HOUSE_COLORS } from "../../lib/houseColors";
import { toIsoDate } from "../../lib/factions";
import MemberChip from "../../components/MemberChip";

type MonthRow = { month: string; total: number; shugiin: number; sangiin: number };

type QuestionItem = {
  id: string;
  house: "衆" | "参";
  title: string;
  date: string | null;          // YYYY-MM-DD
  url: string | null;
  member_id: string | null;
  submitter: string | null;     // 議員データに照合できなかった提出者の名前（衆院のみ記録あり）
  member: { name: string; alias_name: string | null; faction: string | null; is_active: boolean } | null;
};

type MonthState = { status: "loading" } | { status: "error" } | { status: "done"; items: QuestionItem[] };

const MEMBER_COLS = "members(name, alias_name, faction, is_active)";

/** "YYYY-MM" → 衆院の提出日（和暦の文字列「令和 8年 2月19日」）の前方一致パターン */
function shugiinMonthPattern(month: string): string | null {
  const [y, m] = month.split("-").map(Number);
  const reiwa = y - 2018;
  if (!(reiwa >= 1) || !(m >= 1 && m <= 12)) return null;
  const yy = reiwa === 1 ? "元" : String(reiwa).padStart(2, " ");
  return `令和${yy}年${String(m).padStart(2, " ")}月%`;
}

async function fetchMonth(month: string): Promise<QuestionItem[]> {
  const [y, m] = month.split("-").map(Number);
  const start = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  const pattern = shugiinMonthPattern(month);

  const [shu, san] = await Promise.all([
    pattern
      ? supabase.from("questions")
          .select(`id, title, submitted_at, member_id, submitter, source_url, ${MEMBER_COLS}`)
          .like("submitted_at", pattern).limit(1000)
      : Promise.resolve({ data: [], error: null }),
    supabase.from("sangiin_questions")
      .select(`id, title, submitted_at, member_id, source_url, ${MEMBER_COLS}`)
      .gte("submitted_at", start).lt("submitted_at", next).limit(1000),
  ]);
  if (shu.error || san.error) throw new Error((shu.error ?? san.error)?.message);

  type Raw = { id: string; title: string; submitted_at: string | null; member_id: string | null; submitter?: string | null; source_url: string | null; members: QuestionItem["member"] };
  const toItem = (house: "衆" | "参") => (r: Raw): QuestionItem => ({
    id: `${house}-${r.id}`, house, title: r.title, date: toIsoDate(r.submitted_at),
    url: r.source_url, member_id: r.member_id, submitter: r.submitter ?? null, member: r.members ?? null,
  });
  return [
    ...((shu.data ?? []) as unknown as Raw[]).map(toItem("衆")),
    ...((san.data ?? []) as unknown as Raw[]).map(toItem("参")),
  ].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || a.house.localeCompare(b.house));
}

function HouseBadge({ house }: { house: "衆" | "参" }) {
  const color = house === "衆" ? HOUSE_COLORS["衆議院"] : HOUSE_COLORS["参議院"];
  return (
    <span className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded mt-0.5 text-neutral-700"
      style={{ background: `${color}1a`, border: `1px solid ${color}` }}>
      {house}
    </span>
  );
}

export default function MonthlyQuestions({ months }: { months: MonthRow[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [cache, setCache] = useState<Record<string, MonthState>>({});
  const max = Math.max(...months.map((m) => m.total), 1);

  const toggle = (month: string) => {
    if (open === month) { setOpen(null); return; }
    setOpen(month);
    const cur = cache[month];
    if (cur && cur.status !== "error") return;
    setCache((c) => ({ ...c, [month]: { status: "loading" } }));
    fetchMonth(month)
      .then((items) => setCache((c) => ({ ...c, [month]: { status: "done", items } })))
      .catch(() => setCache((c) => ({ ...c, [month]: { status: "error" } })));
  };

  return (
    <div className="bg-white border border-neutral-200 rounded-2xl px-4 sm:px-6 py-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-neutral-700 mb-3">
        <span className="flex items-center gap-1.5 whitespace-nowrap"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: HOUSE_COLORS["衆議院"] }} />衆議院</span>
        <span className="flex items-center gap-1.5 whitespace-nowrap"><span className="inline-block w-3 h-3 rounded-sm" style={{ background: HOUSE_COLORS["参議院"] }} />参議院</span>
        <span className="text-neutral-500 w-full sm:w-auto sm:ml-auto">月を選ぶと、その月の質問主意書の一覧を表示します</span>
      </div>
      <div className="space-y-1">
        {months.map((m) => {
          const isOpen = open === m.month;
          const state = cache[m.month];
          return (
            <div key={m.month}>
              <button type="button" onClick={() => m.total > 0 && toggle(m.month)} aria-expanded={m.total > 0 ? isOpen : undefined}
                disabled={m.total === 0}
                title={`${m.month}: 衆議院 ${m.shugiin}件・参議院 ${m.sangiin}件`}
                className={`w-full flex items-center gap-3 rounded-lg px-1.5 py-1 text-left transition-colors ${isOpen ? "bg-neutral-100" : m.total > 0 ? "hover:bg-neutral-50" : "cursor-default"}`}>
                <span className="whitespace-nowrap shrink-0 w-16 text-[11px] tabular-nums text-neutral-700 flex items-center gap-1">
                  <span className={`inline-block text-[10px] text-neutral-500 transition-transform ${isOpen ? "rotate-90" : ""} ${m.total === 0 ? "invisible" : ""}`}>›</span>
                  {m.month}
                </span>
                <div className="flex-1 h-3.5">
                  <div className="h-full flex gap-[2px]" style={{ width: `${(m.total / max) * 100}%` }}>
                    {m.shugiin > 0 && (
                      <div className="h-full rounded-[4px]" style={{ flexGrow: m.shugiin, background: HOUSE_COLORS["衆議院"] }} />
                    )}
                    {m.sangiin > 0 && (
                      <div className="h-full rounded-[4px]" style={{ flexGrow: m.sangiin, background: HOUSE_COLORS["参議院"] }} />
                    )}
                  </div>
                </div>
                <span className="text-[11px] text-neutral-700 tabular-nums w-[7.5rem] text-right shrink-0 whitespace-nowrap">
                  {m.total}<span className="text-neutral-500">（衆{m.shugiin}/参{m.sangiin}）</span>
                </span>
              </button>

              {isOpen && (
                <div className="mt-1 mb-3 ml-1 sm:ml-[4.75rem] border-l-2 border-neutral-200 pl-3">
                  {(!state || state.status === "loading") && (
                    <p className="text-xs text-neutral-500 py-2">読み込んでいます...</p>
                  )}
                  {state?.status === "error" && (
                    <p className="text-xs text-neutral-500 py-2">
                      一覧を取得できませんでした。
                      <button type="button" onClick={() => { setOpen(null); setTimeout(() => toggle(m.month), 0); }}
                        className="underline underline-offset-2 ml-1">再読み込み</button>
                    </p>
                  )}
                  {state?.status === "done" && state.items.length === 0 && (
                    <p className="text-xs text-neutral-500 py-2">この月の質問主意書はありません（0件）。</p>
                  )}
                  {state?.status === "done" && state.items.length > 0 && (
                    <ul className="divide-y divide-neutral-100">
                      {state.items.map((q) => (
                        <li key={q.id} className="py-2">
                          <div className="flex items-start gap-2">
                            <HouseBadge house={q.house} />
                            {q.url ? (
                              <a href={q.url} target="_blank" rel="noopener noreferrer"
                                className="text-[13px] text-neutral-800 hover:text-neutral-600 leading-snug underline underline-offset-2 decoration-neutral-300">
                                {q.title}<span className="ml-1 text-neutral-400 text-[11px]">↗</span>
                              </a>
                            ) : (
                              <span className="text-[13px] text-neutral-800 leading-snug">{q.title}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-1 pl-7 text-[11px] text-neutral-500 flex-wrap">
                            {q.member && q.member_id ? (
                              <MemberChip id={q.member_id} name={q.member.name} alias_name={q.member.alias_name}
                                faction={q.member.faction} is_active={q.member.is_active} />
                            ) : q.submitter ? (
                              <span className="text-neutral-600">{q.submitter}</span>
                            ) : null}
                            {q.date && <span className="tabular-nums">{q.date}</span>}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
