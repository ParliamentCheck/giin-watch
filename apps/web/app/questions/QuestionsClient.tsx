"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { getAllQuestionsWithMembers, getAllSangiinQuestionsWithMembers } from "../../lib/queries";
import type { QuestionListItem } from "../../lib/types";
import Paginator, { PAGE_SIZE } from "../../components/Paginator";
import { usePagination } from "../../hooks/usePagination";
import MemberChip from "../../components/MemberChip";
import { partyColor } from "../../lib/partyColors";
import { SESSION_RANGE_QUESTIONS } from "../../lib/constants";

function sortQuestions(questions: QuestionListItem[]): QuestionListItem[] {
  return [...questions].sort((a, b) => {
    if (a.session !== b.session) return b.session - a.session;
    return b.number - a.number;
  });
}

interface Props {
  initialQuestions?: QuestionListItem[];
}

export default function QuestionsClient({ initialQuestions }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { page, setPage } = usePagination();

  const tab = (searchParams.get("tab") ?? "list") as "list" | "stats";
  const setTab = (t: "list" | "stats") => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    p.delete("page");
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const [questions, setQuestions] = useState<QuestionListItem[]>(
    initialQuestions ? sortQuestions(initialQuestions) : []
  );
  const [loading, setLoading] = useState(!initialQuestions);
  const [search, setSearch] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [houseFilter, setHouseFilter] = useState<"全て" | "衆" | "参">("全て");
  const [sessionFilter, setSessionFilter] = useState<number | null>(null);

  useEffect(() => {
    if (initialQuestions) return;
    async function load() {
      const [shu, san] = await Promise.all([
        getAllQuestionsWithMembers(),
        getAllSangiinQuestionsWithMembers(),
      ]);
      setQuestions(sortQuestions([...shu, ...san]));
      setLoading(false);
    }
    load();
  }, []);

  const sessions = useMemo(() =>
    [...new Set(questions.map(q => q.session))].sort((a, b) => b - a),
    [questions]
  );

  const filtered = questions.filter((q) => {
    if (houseFilter !== "全て" && q.house !== houseFilter) return false;
    if (sessionFilter !== null && q.session !== sessionFilter) return false;
    if (search && !isComposing) {
      if (!q.title.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // 統計: 政党別件数・議員別件数
  const { partyTop, memberTop } = useMemo(() => {
    const partyCounts: Record<string, number> = {};
    const memberCounts: Record<string, { name: string; alias_name: string | null; party: string; is_active: boolean; count: number }> = {};

    for (const q of questions) {
      const party = q.members?.party;
      if (party) partyCounts[party] = (partyCounts[party] ?? 0) + 1;

      if (q.member_id && q.members) {
        if (!memberCounts[q.member_id]) {
          memberCounts[q.member_id] = { name: q.members.name, alias_name: q.members.alias_name, party: q.members.party, is_active: q.members.is_active, count: 0 };
        }
        memberCounts[q.member_id].count++;
      }
    }

    const partyTop = Object.entries(partyCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([party, count]) => ({ party, count }));

    const memberTop = Object.entries(memberCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, 10)
      .map(([id, info]) => ({ id, ...info }));

    return { partyTop, memberTop };
  }, [questions]);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      {/* タイトル */}
      <div className="card-xl" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 0 }}>📝 質問主意書</h1>
      </div>

      {/* タブ */}
      <div className="tab-bar-container" style={{ marginBottom: 16 }}>
        {([
          { id: "list"  as const, label: "📝 一覧" },
          { id: "stats" as const, label: "📊 統計" },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "10px 0" }}
            className={`tab-pill${tab === t.id ? " active" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 一覧タブ */}
      {tab === "list" && (
        <div className="card-xl">
          {/* フィルター */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
            <div style={{ display: "flex", gap: 4 }}>
              {(["全て", "衆", "参"] as const).map((h) => (
                <button key={h}
                  onClick={() => { setHouseFilter(h); setPage(1); }}
                  className={`filter-btn${houseFilter === h ? " active" : ""}`}>
                  {h === "全て" ? "全て" : `${h}院`}
                </button>
              ))}
            </div>
            <select
              value={sessionFilter ?? ""}
              onChange={(e) => { setSessionFilter(e.target.value ? Number(e.target.value) : null); setPage(1); }}
              style={{
                padding: "7px 10px", borderRadius: 8, border: "1px solid #e0e0e0",
                fontSize: 13, background: "#fff", cursor: "pointer", outline: "none",
              }}
            >
              <option value="">全会期</option>
              {sessions.map(s => (
                <option key={s} value={s}>第{s}回国会</option>
              ))}
            </select>
            <input
              type="text" placeholder="タイトルで検索..." value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              onCompositionStart={() => setIsComposing(true)}
              onCompositionEnd={() => setIsComposing(false)}
              style={{
                flex: 1, minWidth: 180, padding: "7px 12px", borderRadius: 8,
                border: "1px solid #e0e0e0", fontSize: 13, outline: "none",
              }}
            />
          </div>

          <div style={{ fontSize: 10, color: "#aaaaaa", marginBottom: 12 }}>
            {`※ ${SESSION_RANGE_QUESTIONS}（衆院・参院）の記録に基づく`}
          </div>

          {loading ? (
            <div className="empty-state">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">該当する質問主意書がありません。</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8, paddingBottom: 8, borderBottom: "1px solid #e0e0e0" }}>
                <span style={{ fontSize: 12, color: "#888888" }}>{filtered.length.toLocaleString()}件</span>
                <Paginator total={filtered.length} page={page} onPage={setPage} />
              </div>
              {paginated.map((q, i) => (
                <div key={q.id} style={{
                  padding: "14px 0",
                  borderBottom: i < paginated.length - 1 ? "1px solid #e0e0e0" : "none",
                }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>
                      {q.source_url ? (
                        <a href={q.source_url} target="_blank" rel="noopener noreferrer"
                          style={{ color: "#1a1a1a", textDecoration: "underline", textDecorationColor: "#cccccc" }}>
                          {q.title}
                        </a>
                      ) : q.title}
                    </span>
                    <span style={{ fontSize: 11, color: "#888888", flexShrink: 0, whiteSpace: "nowrap" }}>
                      {q.house}院 第{q.session}回 #{q.number}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {q.member_id && q.members && (
                      <MemberChip
                        id={q.member_id}
                        name={q.members.name}
                        alias_name={q.members.alias_name}
                        party={q.members.party}
                        is_active={q.members.is_active}
                      />
                    )}
                    {q.submitted_at && (
                      <span style={{ fontSize: 12, color: "#888888" }}>提出: {q.submitted_at}</span>
                    )}
                    {q.answered_at && (
                      <span style={{ fontSize: 12, color: "#888888" }}>答弁: {q.answered_at}</span>
                    )}
                  </div>
                </div>
              ))}
              <Paginator total={filtered.length} page={page} onPage={setPage} variant="bottom" />
            </>
          )}
        </div>
      )}

      {/* 統計タブ */}
      {tab === "stats" && (
        <div className="card-xl">
          <div style={{ fontSize: 10, color: "#aaaaaa", marginBottom: 20 }}>
            {`※ ${SESSION_RANGE_QUESTIONS}（衆院・参院）の記録に基づく`}
          </div>

          {loading ? (
            <div className="empty-state">読み込み中...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

              {/* 政党別件数 TOP5 */}
              <section style={{ paddingBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1a1a1a" }}>
                  提出件数が多い政党 TOP5
                </h2>
                <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
                  衆院・参院合計
                </p>
                {partyTop.length === 0 ? (
                  <div className="empty-state">データがありません。</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {partyTop.map(({ party, count }, i) => {
                      const color = partyColor(party);
                      const pct = Math.round((count / partyTop[0].count) * 100);
                      return (
                        <div key={party}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                            <span style={{ fontSize: 13, fontWeight: 600, color }}>{i + 1}. {party}</span>
                            <span style={{ fontSize: 13, color: "#555555" }}>{count.toLocaleString()}件</span>
                          </div>
                          <div style={{ background: "#f0f0f0", borderRadius: 4, height: 8 }}>
                            <div style={{ width: `${pct}%`, background: color, borderRadius: 4, height: 8 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* 議員別件数 TOP10 */}
              <section style={{ paddingTop: 32, borderTop: "1px solid #e0e0e0" }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1a1a1a" }}>
                  提出件数が多い議員 TOP10
                </h2>
                <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
                  {`衆院・参院合計（${SESSION_RANGE_QUESTIONS}）`}
                </p>
                {memberTop.length === 0 ? (
                  <div className="empty-state">データがありません。</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {memberTop.map(({ id, name, alias_name, party, is_active, count }, i) => {
                      const color = partyColor(party);
                      const pct = Math.round((count / memberTop[0].count) * 100);
                      return (
                        <div key={id}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "center", gap: 8 }}>
                            <span style={{ fontSize: 12, color: "#aaaaaa", width: 20, textAlign: "right", flexShrink: 0 }}>{i + 1}.</span>
                            <span style={{ flex: 1 }}>
                              <MemberChip id={id} name={name} alias_name={alias_name} party={party} is_active={is_active} />
                            </span>
                            <span style={{ fontSize: 13, color: "#555555", flexShrink: 0 }}>{count.toLocaleString()}件</span>
                          </div>
                          <div style={{ background: "#f0f0f0", borderRadius: 4, height: 6, marginLeft: 28 }}>
                            <div style={{ width: `${pct}%`, background: color, borderRadius: 4, height: 6 }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>

            </div>
          )}
        </div>
      )}
    </main>
  );
}
