"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { getAllPetitionRows, getAllSangiinPetitionRows, getPetitionMemberMap } from "../../lib/queries";
import type { PetitionListItem } from "../../lib/types";
import Paginator, { PAGE_SIZE } from "../../components/Paginator";
import { usePagination } from "../../hooks/usePagination";
import MemberChip from "../../components/MemberChip";
import { SESSION_RANGE_QUESTIONS } from "../../lib/constants";
import { ListNotices } from "../components/Notices";

type MemberInfo = { name: string; alias_name: string | null; faction: string | null; is_active: boolean };
type ResultFilter = "採択" | "不採択" | "審査未了";

function sortPetitions(petitions: PetitionListItem[]): PetitionListItem[] {
  return [...petitions].sort((a, b) => {
    if (a.session !== b.session) return b.session - a.session;
    return b.number - a.number;
  });
}

function classifyResult(result: string | null): ResultFilter {
  const r = result?.split("\n")[0].trim() ?? "";
  if (r.startsWith("採択")) return "採択";
  if (r === "不採択") return "不採択";
  return "審査未了";
}

interface Props {
  initialPetitions?: PetitionListItem[];
  initialMemberMap?: Record<string, MemberInfo>;
}

export default function PetitionsClient({ initialPetitions, initialMemberMap }: Props) {
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

  const [petitions, setPetitions] = useState<PetitionListItem[]>(initialPetitions ? sortPetitions(initialPetitions) : []);
  const [memberMap, setMemberMap] = useState<Record<string, MemberInfo>>(initialMemberMap ?? {});
  const [loading, setLoading] = useState(!initialPetitions);
  const [search, setSearch] = useState("");
  const [isComposing, setIsComposing] = useState(false);
  const [houseFilter, setHouseFilter] = useState<"全て" | "衆" | "参">("全て");
  const [resultFilter, setResultFilter] = useState<ResultFilter | "all">("all");
  const [sessionFilter, setSessionFilter] = useState<number | null>(null);

  useEffect(() => {
    if (initialPetitions) return;
    async function load() {
      const [shu, san, map] = await Promise.all([
        getAllPetitionRows(),
        getAllSangiinPetitionRows(),
        getPetitionMemberMap(),
      ]);
      setPetitions(sortPetitions([...shu, ...san]));
      setMemberMap(map);
      setLoading(false);
    }
    load();
  }, []);

  const sessions = useMemo(() =>
    [...new Set(petitions.map(p => p.session))].sort((a, b) => b - a),
    [petitions]
  );

  const filtered = petitions.filter((p) => {
    if (houseFilter !== "全て" && p.house !== houseFilter) return false;
    if (resultFilter !== "all" && classifyResult(p.result) !== resultFilter) return false;
    if (sessionFilter !== null && p.session !== sessionFilter) return false;
    if (search && !isComposing) {
      if (!p.title.toLowerCase().includes(search.toLowerCase())) return false;
    }
    return true;
  });

  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const adopted  = petitions.filter(p => classifyResult(p.result) === "採択").length;
  const rejected = petitions.filter(p => classifyResult(p.result) === "不採択").length;
  const pending  = petitions.filter(p => classifyResult(p.result) === "審査未了").length;

  // 統計: 請願ごとの紹介議員数
  // ※ 会派別の集計は行わない（請願の紹介日が記録になく、紹介時の会派を確定できないため。
  //    現在の会派で数えると過去の紹介を現在の所属に付け替えることになる）
  const { petitionIntroducerTop5 } = useMemo(() => {
    const petitionIntroducerTop5 = [...petitions]
      .filter(p => (p.introducer_ids?.length ?? 0) > 0)
      .sort((a, b) => (b.introducer_ids?.length ?? 0) - (a.introducer_ids?.length ?? 0))
      .slice(0, 5)
      .map(p => ({ id: p.id, title: p.title, session: p.session, number: p.number, house: p.house, source_url: p.source_url, count: p.introducer_ids?.length ?? 0 }));

    return { petitionIntroducerTop5 };
  }, [petitions]);

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px" }}>
      {/* タイトル */}
      <div className="card-xl" style={{ marginBottom: 16 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 0 }}>📜 請願</h1>
      </div>

      {/* タブ */}
      <div className="tab-bar-container" style={{ marginBottom: 16 }}>
        {([
          { id: "list"  as const, label: "📜 請願一覧" },
          { id: "stats" as const, label: "📊 統計" },
        ]).map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ flex: 1, padding: "10px 0" }}
            className={`tab-pill${tab === t.id ? " active" : ""}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 請願一覧タブ */}
      {tab === "list" && (
        <div className="card-xl">
          {/* 結果フィルター */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {([
              { label: "採択"    as const, count: adopted,  color: "#22c55e" },
              { label: "不採択"  as const, count: rejected, color: "#ef4444" },
              { label: "審査未了" as const, count: pending,  color: "#888888" },
            ]).map(({ label, count, color }) => {
              const isActive = resultFilter === label;
              return (
                <div key={label}
                  onClick={() => { setResultFilter(isActive ? "all" : label); setPage(1); }}
                  style={{
                    background: isActive ? color : "#f4f4f4", borderRadius: 8,
                    padding: "8px 20px", textAlign: "center", cursor: "pointer", flex: 1,
                  }}>
                  <div style={{ fontSize: 16, fontWeight: 800, color: isActive ? "#ffffff" : color }}>
                    {count.toLocaleString()}
                  </div>
                  <div style={{ fontSize: 11, color: isActive ? "#ffffff" : "#888888" }}>{label}</div>
                </div>
              );
            })}
          </div>

          {/* 院フィルター・検索 */}
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
              onCompositionEnd={() => { setIsComposing(false); }}
              style={{
                flex: 1, minWidth: 180, padding: "7px 12px", borderRadius: 8,
                border: "1px solid #e0e0e0", fontSize: 13, outline: "none",
              }}
            />
          </div>

          <div style={{ fontSize: 12, color: "#555555", marginBottom: 4 }}>
            {`※ ${SESSION_RANGE_QUESTIONS}（衆院・参院）の記録に基づく`}
          </div>
          <ListNotices sort={false} style={{ marginBottom: 12 }} />

          {loading ? (
            <div className="empty-state">読み込み中...</div>
          ) : filtered.length === 0 ? (
            <div className="empty-state">該当する請願がありません。</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 8, gap: 8, paddingBottom: 8, borderBottom: "1px solid #e0e0e0" }}>
                <span style={{ fontSize: 12, color: "#888888" }}>{filtered.length.toLocaleString()}件</span>
                <Paginator total={filtered.length} page={page} onPage={setPage} />
              </div>
              {paginated.map((p, i) => {
                const resultClean = p.result?.split("\n")[0].trim() ?? null;
                const resultColor = resultClean?.startsWith("採択") ? "#22c55e"
                  : resultClean === "不採択" ? "#ef4444" : "#888888";
                return (
                  <div key={p.id} style={{
                    padding: "14px 0",
                    borderBottom: i < paginated.length - 1 ? "1px solid #e0e0e0" : "none",
                  }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>
                        {p.title}
                      </span>
                      <span style={{ fontSize: 11, color: "#888888", flexShrink: 0, whiteSpace: "nowrap" }}>
                        {p.house}院 第{p.session}回 #{p.number}
                      </span>
                    </div>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      {p.committee_name && (
                        <span style={{ fontSize: 12, color: "#555555" }}>🏛 {p.committee_name}</span>
                      )}
                      {p.result_date && (
                        <span style={{ fontSize: 12, color: "#888888" }}>{p.result_date}</span>
                      )}
                      {resultClean && (
                        <span className="badge badge-result"
                          style={{ "--result-color": resultColor } as React.CSSProperties}>
                          {resultClean}
                        </span>
                      )}
                      {p.source_url && (
                        <a href={p.source_url} target="_blank" rel="noopener noreferrer"
                          style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                          📄 詳細を見る ↗
                        </a>
                      )}
                    </div>
                    {p.introducer_names && p.introducer_names.length > 0 && (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                        {p.introducer_names.map((name) => {
                          const houseLabel = p.house === "衆" ? "衆議院" : "参議院";
                          const memberId = `${houseLabel}-${name}`;
                          const member = memberMap[memberId];
                          if (member) {
                            return (
                              <MemberChip key={memberId} id={memberId} name={name}
                                alias_name={null} faction={member.faction} is_active={member.is_active} />
                            );
                          }
                          return (
                            <span key={name} style={{ fontSize: 12, color: "#888888",
                              background: "#e0e0e0", border: "1px solid #c8c8c8",
                              padding: "2px 8px", borderRadius: 4 }}>
                              {name}
                            </span>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              <Paginator total={filtered.length} page={page} onPage={setPage} variant="bottom" />
            </>
          )}
        </div>
      )}

      {/* 統計タブ */}
      {tab === "stats" && (
        <div className="card-xl">
          <div style={{ fontSize: 12, color: "#555555", marginBottom: 20 }}>
            {`※ ${SESSION_RANGE_QUESTIONS}（衆院・参院）の記録に基づく`}
          </div>

          {loading ? (
            <div className="empty-state">読み込み中...</div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>

              <p style={{ fontSize: 12, color: "#555555", marginBottom: 16, lineHeight: 1.7 }}>
                会派別の集計は行っていません。請願の紹介日が公式の記録になく、紹介時の会派を確定できないためです。
              </p>

              {/* 紹介議員の人数が多い請願（5件） */}
              <section style={{ paddingBottom: 32 }}>
                <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 4, color: "#1a1a1a" }}>
                  紹介議員の人数が多い請願（5件）
                </h2>
                <p style={{ fontSize: 12, color: "#555555", marginBottom: 16 }}>
                  {`紹介議員として記録されている人数（${SESSION_RANGE_QUESTIONS}）`}
                </p>
                {petitionIntroducerTop5.length === 0 ? (
                  <div className="empty-state">データがありません。</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {petitionIntroducerTop5.map(({ id, title, session, number, house, source_url, count }) => {
                      const pct = Math.round((count / petitionIntroducerTop5[0].count) * 100);
                      return (
                        <div key={id}>
                          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, alignItems: "flex-start", gap: 12 }}>
                            <span style={{ fontSize: 13, flex: 1 }}>
                              {source_url ? (
                                <a href={source_url} target="_blank" rel="noopener noreferrer"
                                  style={{ color: "#1a1a1a", textDecoration: "underline" }}>
                                  {title}
                                </a>
                              ) : title}
                            </span>
                            <span style={{ fontSize: 12, color: "#555555", flexShrink: 0, whiteSpace: "nowrap" }}>
                              {house}院 第{session}回 #{number} — {count}人
                            </span>
                          </div>
                          <div style={{ background: "#f0f0f0", borderRadius: 4, height: 8 }}>
                            <div style={{ width: `${pct}%`, background: "#555555", borderRadius: 4, height: 8 }} />
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
