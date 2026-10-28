"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabase";
import Paginator, { PAGE_SIZE } from "../../../../components/Paginator";
import WordCloud from "../../../components/WordCloud";
import { usePagination } from "../../../../hooks/usePagination";
import { compareMembersByReading } from "../../../../lib/memberSort";
import { factionColor, factionPath, type House } from "../../../../lib/factions";
import { SESSION_RANGE_QUESTIONS, SESSION_RANGE_SPEECHES, SESSION_RANGE_BILLS } from "../../../../lib/constants";
import type { CommitteeMember, FactionVoteAlignment, Member } from "../../../../lib/types";
import { ListNotices } from "../../../components/Notices";
import { useElectionSafeMode } from "../../../components/SiteSettings";

type Props = {
  house: House;
  name: string;
  shortName: string | null;
  isCurrent: boolean;
  members: Member[];
  roles: CommitteeMember[];
  alignments: FactionVoteAlignment[] | null;
};

type TabId = "members" | "committees" | "keywords" | "breakdown" | "votes";

const SORTS = [
  { value: "name",           label: "名前順" },
  { value: "session_count",  label: "発言順" },
  { value: "question_count", label: "質問主意書順" },
  { value: "bill_count",     label: "議員立法順" },
  { value: "petition_count", label: "請願順" },
  { value: "terms",          label: "当選回数順" },
] as const;

async function fetchKeywordsBatched(memberIds: string[]): Promise<{ word: string; count: number }[]> {
  const BATCH = 50;
  const wordMap: Record<string, number> = {};
  for (let i = 0; i < memberIds.length; i += BATCH) {
    const batch = memberIds.slice(i, i + BATCH);
    const res = await supabase.from("member_keywords").select("word, count")
      .in("member_id", batch).order("count", { ascending: false }).limit(1000);
    if (res.error) throw new Error(res.error.message);
    for (const k of res.data || []) wordMap[k.word] = (wordMap[k.word] || 0) + k.count;
  }
  return Object.entries(wordMap).map(([word, count]) => ({ word, count }))
    .sort((a, b) => b.count - a.count).slice(0, 50);
}

function FactionDetailContent({ house, name, shortName, isCurrent, members, roles, alignments }: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const color = factionColor(name);

  const tabs: { id: TabId; label: string }[] = [
    { id: "members",    label: `👤 所属議員 (${members.length})` },
    { id: "committees", label: `🏛 委員長・理事 (${roles.length})` },
    { id: "keywords",   label: "☁️ キーワード" },
    { id: "breakdown",  label: "📊 内訳" },
    ...(house === "参議院" ? [{ id: "votes" as const, label: "🗳 採決の一致" }] : []),
  ];
  const requestedTab = searchParams.get("tab") as TabId | null;
  const tab: TabId = tabs.some((t) => t.id === requestedTab) ? (requestedTab as TabId) : "members";
  const setTab = (t: TabId) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    p.delete("page");
    router.replace(`${window.location.pathname}?${p.toString()}`, { scroll: false });
  };

  // 既定は氏名の五十音順（PROJECT_SPEC 5.3）。選挙セーフモード中は並び替えをURLに載せない
  const safeMode = useElectionSafeMode();
  const [safeSort, setSafeSort] = useState("name");
  const sortBy = safeMode ? safeSort : (searchParams.get("sort") ?? "name");
  const [showCabinet, setShowCabinet] = useState(false);
  const { page, setPage, clearPage } = usePagination();
  const setSortBy = (s: string) => {
    if (safeMode) {
      setSafeSort(s);
      clearPage();
    } else {
      // 並び替えとページのリセットを1回の遷移で行う（2回に分けると先の変更が上書きされる）
      const p = new URLSearchParams(searchParams.toString());
      p.set("sort", s);
      p.delete("page");
      router.replace(`${window.location.pathname}?${p.toString()}`, { scroll: false });
    }
  };

  // キーワード（タブを開いたときに取得）
  const [keywords, setKeywords] = useState<{ word: string; count: number }[] | null>(null);
  const [kwError, setKwError] = useState(false);
  useEffect(() => {
    if (tab !== "keywords" || keywords !== null || members.length === 0) return;
    fetchKeywordsBatched(members.map((m) => m.id))
      .then(setKeywords)
      .catch(() => setKwError(true));
  }, [tab, keywords, members]);

  // 件数で並べるときは閣僚等を初期非表示（PROJECT_SPEC 5.3）
  const cabinetHideApplies = sortBy !== "name";
  const hiddenCabinetCount = cabinetHideApplies && !showCabinet ? members.filter((m) => m.cabinet_post).length : 0;
  const listMembers = hiddenCabinetCount > 0 ? members.filter((m) => !m.cabinet_post) : members;
  const sorted = [...listMembers].sort((a, b) => {
    if (sortBy === "session_count")  return (b.session_count  || 0) - (a.session_count  || 0) || compareMembersByReading(a, b);
    if (sortBy === "question_count") return (b.question_count || 0) - (a.question_count || 0) || compareMembersByReading(a, b);
    if (sortBy === "bill_count")     return (b.bill_count     || 0) - (a.bill_count     || 0) || compareMembersByReading(a, b);
    if (sortBy === "petition_count") return (b.petition_count || 0) - (a.petition_count || 0) || compareMembersByReading(a, b);
    if (sortBy === "terms")          return (b.terms          || 0) - (a.terms          || 0) || compareMembersByReading(a, b);
    return compareMembersByReading(a, b);
  });

  const totals = {
    session:  members.reduce((s, m) => s + (m.session_count  || 0), 0),
    question: members.reduce((s, m) => s + (m.question_count || 0), 0),
    bill:     members.reduce((s, m) => s + (m.bill_count     || 0), 0),
    petition: members.reduce((s, m) => s + (m.petition_count || 0), 0),
  };

  const memberById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);
  const chairList = roles.filter((r) => r.role === "委員長" || r.role === "会長")
    .sort((a, b) => a.committee.localeCompare(b.committee, "ja"));
  const execList  = roles.filter((r) => r.role === "理事" || r.role === "副会長")
    .sort((a, b) => a.committee.localeCompare(b.committee, "ja"));

  // 採決の一致（参院・回次ごと）
  const alignSessions = useMemo(
    () => [...new Set((alignments ?? []).map((a) => a.session_number))].sort((a, b) => b - a),
    [alignments],
  );
  const [alignSession, setAlignSession] = useState<number | null>(null);
  const shownSession = alignSession ?? alignSessions[0] ?? null;
  const alignRows = (alignments ?? [])
    .filter((a) => a.session_number === shownSession)
    .map((a) => ({ other: a.faction_a === name ? a.faction_b : a.faction_a, agree: a.agree_count, total: a.total_count }))
    .sort((a, b) => a.other.localeCompare(b.other, "ja"));

  const breakdownRows = house === "衆議院"
    ? [{ label: "小選挙区", count: members.filter((m) => m.election_type === "小選挙区").length },
       { label: "比例",     count: members.filter((m) => m.election_type === "比例").length }]
    : [{ label: "選挙区",   count: members.filter((m) => m.election_type === "選挙区").length },
       { label: "比例",     count: members.filter((m) => m.election_type === "比例").length }];
  const unknownElection = members.length - breakdownRows.reduce((s, r) => s + r.count, 0);
  const termsBuckets = [
    { label: "1期",     count: members.filter((m) => (m.terms || 0) === 1).length },
    { label: "2〜3期",  count: members.filter((m) => (m.terms || 0) >= 2 && (m.terms || 0) <= 3).length },
    { label: "4〜6期",  count: members.filter((m) => (m.terms || 0) >= 4 && (m.terms || 0) <= 6).length },
    { label: "7期以上", count: members.filter((m) => (m.terms || 0) >= 7).length },
    { label: "不明",    count: members.filter((m) => !m.terms).length },
  ].filter((b) => b.count > 0);

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a", padding: "24px", maxWidth: 960, margin: "0 auto" }}>
      <Link href="/factions" className="btn-back" style={{ display: "inline-block", marginBottom: 16, textDecoration: "none" }}>
        ← 会派一覧に戻る
      </Link>

      {/* ヘッダー */}
      <div className="card-xl" style={{ borderLeft: `6px solid ${color}`, padding: "20px 24px", marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: "#555555", marginBottom: 4 }}>{house}の会派</div>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 900, color: "#1a1a1a" }}>{name}</h1>
        {shortName && shortName !== name && (
          <div style={{ fontSize: 13, color: "#555555", marginTop: 4 }}>略称: {shortName}</div>
        )}
        {!isCurrent && (
          <p style={{ fontSize: 13, color: "#555555", margin: "8px 0 0" }}>
            この会派は現在の公式の会派一覧に載っていません。
          </p>
        )}
      </div>

      {/* 件数の合計 */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: 8 }}>
          {[
            { label: "所属議員",       value: members.length,  unit: "名" },
            { label: "発言セッション", value: totals.session,  unit: "回" },
            { label: "質問主意書",     value: totals.question, unit: "件" },
            { label: "議員立法",       value: totals.bill,     unit: "件" },
            { label: "請願",           value: totals.petition, unit: "件" },
          ].map((item) => (
            <div key={item.label} style={{ background: "#f4f4f4", borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#333333" }}>
                {item.value.toLocaleString()}<span style={{ fontSize: 11, color: "#555555", marginLeft: 3 }}>{item.unit}</span>
              </div>
              <div style={{ fontSize: 11, color: "#555555" }}>{item.label}</div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: "#555555", margin: "10px 0 0", lineHeight: 1.7 }}>
          ※ 現在この会派に所属している議員の件数の合計です。<strong>この会派に所属する前の活動（別の会派での活動）も含みます。</strong>
          会派としての活動量を表すものではありません。
          集計期間：発言 {SESSION_RANGE_SPEECHES} ／ 議員立法 {SESSION_RANGE_BILLS} ／ 質問主意書・請願 {SESSION_RANGE_QUESTIONS}。
        </p>
      </div>

      {/* タブ */}
      <div className="tab-bar tab-bar-container" style={{ flexWrap: "wrap" }}>
        {tabs.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-pill${tab === t.id ? " active" : ""}`}
            style={{ flex: 1, minWidth: 120, padding: "10px 0" }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "members" && (
        <div className="card" style={{ padding: 20 }}>
          {members.length === 0 ? (
            <div className="empty-state">現在この会派に所属する議員は、当サイトの議員データにはいません（0名）。</div>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <span style={{ fontSize: 13, color: "#555555" }}>{sorted.length}名</span>
                <Paginator total={sorted.length} page={page} onPage={setPage} variant="top" />
              </div>
              <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
                {SORTS.map((s) => (
                  <button key={s.value} onClick={() => setSortBy(s.value)}
                    aria-pressed={sortBy === s.value}
                    style={{ background: sortBy === s.value ? "#1a1a1a" : "#e0e0e0",
                      border: "1px solid #c8c8c8", color: sortBy === s.value ? "#ffffff" : "#333333",
                      padding: "6px 12px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
                    {s.label}
                  </button>
                ))}
              </div>
              <ListNotices style={{ marginBottom: 8 }} />
              {cabinetHideApplies && (hiddenCabinetCount > 0 || showCabinet) && (
                <div style={{ marginBottom: 12, fontSize: 12, color: "#555555" }}>
                  {showCabinet
                    ? "閣僚等（大臣・副大臣・政務官等）を表示しています。"
                    : `閣僚等（大臣・副大臣・政務官等）${hiddenCabinetCount}名を非表示にしています。`}
                  <button onClick={() => setShowCabinet((v) => !v)}
                    style={{ marginLeft: 8, fontSize: 12, color: "#333333", background: "none", border: "none", cursor: "pointer", textDecoration: "underline", padding: 0 }}>
                    {showCabinet ? "非表示にする" : "表示する"}
                  </button>
                </div>
              )}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((m) => (
                  <Link key={m.id} href={`/members/${encodeURIComponent(m.id)}`} className="card card-hover"
                    style={{ padding: "12px 16px", textDecoration: "none", color: "#1a1a1a" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 12px" }}>
                      <span style={{ fontWeight: 700, fontSize: 14, color: "#111111", minWidth: 80 }}>{m.alias_name ?? m.name}</span>
                      <span style={{ fontSize: 12, color: "#555555" }}>{m.district}{m.terms ? ` · ${m.terms}期` : ""}{m.cabinet_post ? ` · ${m.cabinet_post}` : ""}</span>
                      <div className="member-row-stats" style={{ display: "flex", gap: 12, fontSize: 12, color: "#555555", marginLeft: "auto" }}>
                        <span>発言 {m.session_count  || 0}</span>
                        <span>質問 {m.question_count || 0}</span>
                        <span>立法 {m.bill_count     || 0}</span>
                        <span>請願 {m.petition_count || 0}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <Paginator total={sorted.length} page={page} onPage={setPage} variant="bottom" />
            </>
          )}
        </div>
      )}

      {tab === "committees" && (
        <div className="card" style={{ padding: 20 }}>
          {[{ title: "委員長・会長", list: chairList }, { title: "理事・副会長", list: execList }].map(({ title, list }) =>
            list.length > 0 && (
              <div key={title} style={{ marginBottom: 20 }}>
                <h3 className="section-title">{title}（{list.length}名）</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {list.map((r) => {
                    const m = memberById.get(r.member_id);
                    return (
                      <div key={`${r.member_id}-${r.committee}-${r.role}`} className="member-row">
                        <span className="badge badge-role">{r.role}</span>
                        <div style={{ flex: 1 }}>
                          <Link href={`/members/${encodeURIComponent(r.member_id)}`} style={{ fontWeight: 600, fontSize: 14, color: "#111111" }}>
                            {m?.alias_name ?? m?.name ?? r.name}
                          </Link>
                          <div style={{ fontSize: 12, color: "#555555" }}>{r.committee}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          {roles.length === 0 && <div className="empty-state" style={{ padding: "20px 0" }}>委員長・理事等の記録はありません（0件）。</div>}
          <p style={{ fontSize: 11, color: "#555555", margin: "8px 0 0" }}>委員会の役職は、当サイトが最後に取得した時点の委員名簿によります。</p>
        </div>
      )}

      {tab === "keywords" && (
        <div className="card" style={{ padding: 24 }}>
          <h3 className="section-title">現在の所属議員の発言のキーワード</h3>
          <p style={{ fontSize: 12, color: "#555555", margin: "0 0 12px", lineHeight: 1.7 }}>
            現在この会派に所属している議員の発言から作成しています。この会派に所属する前の発言も含みます。
          </p>
          {kwError ? (
            <div className="empty-state">キーワードを取得できませんでした。</div>
          ) : keywords === null && members.length > 0 ? (
            <div className="empty-state" style={{ padding: "60px 0" }}>キーワードを集計中...</div>
          ) : (
            <>
              <WordCloud keywords={keywords ?? []} width={800} height={400} />
              <p style={{ textAlign: "center", fontSize: 11, color: "#555555", marginTop: 8 }}>
                <a href="/faq#wordcloud" style={{ color: "#555555" }}>集計方法はこちら ↗</a>
              </p>
            </>
          )}
        </div>
      )}

      {tab === "breakdown" && (
        <div className="card" style={{ padding: 24 }}>
          <h3 className="section-title">選出の方法</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 8, marginBottom: 20 }}>
            {[...breakdownRows, ...(unknownElection > 0 ? [{ label: "不明", count: unknownElection }] : [])].map((b) => (
              <div key={b.label} style={{ background: "#f4f4f4", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#333333" }}>{b.count}<span style={{ fontSize: 12, color: "#555555", marginLeft: 3 }}>名</span></div>
                <div style={{ fontSize: 12, color: "#555555" }}>{b.label}</div>
              </div>
            ))}
          </div>
          <h3 className="section-title">当選回数</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(110px, 1fr))", gap: 8 }}>
            {termsBuckets.map((b) => (
              <div key={b.label} style={{ background: "#f4f4f4", borderRadius: 10, padding: "10px 6px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#333333" }}>{b.count}<span style={{ fontSize: 12, color: "#555555", marginLeft: 3 }}>名</span></div>
                <div style={{ fontSize: 12, color: "#555555" }}>{b.label}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: "#555555", margin: "12px 0 0" }}>当選回数は{house}の名簿の記載によります。</p>
        </div>
      )}

      {tab === "votes" && house === "参議院" && (
        <div className="card" style={{ padding: 24 }}>
          <h3 className="section-title">ほかの会派との採決の一致（参議院本会議）</h3>
          <p style={{ fontSize: 12, color: "#555555", margin: "0 0 12px", lineHeight: 1.7 }}>
            投票結果ページに記載された会派別の票数をもとに、この会派とほかの会派の賛否が一致した採決の件数です。会派は採決の時点のものです。
            賛成と反対が同数の場合、票がない場合は対象外です。並び順は会派名の順です。
          </p>
          {alignments === null ? (
            <div className="empty-state">採決のデータを取得できませんでした。</div>
          ) : alignSessions.length === 0 ? (
            <div className="empty-state">この会派名で記録された採決はありません（0件）。</div>
          ) : (
            <>
              {alignSessions.length > 1 && (
                <select value={shownSession ?? ""} onChange={(e) => setAlignSession(Number(e.target.value))}
                  className="input-field" aria-label="国会の回次" style={{ minWidth: 160, marginBottom: 12 }}>
                  {alignSessions.map((s) => <option key={s} value={s}>第{s}回国会</option>)}
                </select>
              )}
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid #e0e0e0", color: "#555555", fontSize: 12 }}>
                    <th scope="col" style={{ textAlign: "left", padding: "6px 4px" }}>会派</th>
                    <th scope="col" style={{ textAlign: "right", padding: "6px 4px" }}>一致した採決 / 対象の採決</th>
                    <th scope="col" style={{ textAlign: "right", padding: "6px 4px" }}>割合</th>
                  </tr>
                </thead>
                <tbody>
                  {alignRows.map((r) => (
                    <tr key={r.other} style={{ borderBottom: "1px solid #eeeeee" }}>
                      <td style={{ padding: "6px 4px" }}>
                        <Link href={factionPath("参議院", r.other)} style={{ color: "#1a1a1a", borderLeft: `3px solid ${factionColor(r.other)}`, paddingLeft: 6 }}>{r.other}</Link>
                      </td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.agree} / {r.total}</td>
                      <td style={{ padding: "6px 4px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.total > 0 ? `${Math.round(r.agree / r.total * 100)}%` : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p style={{ fontSize: 12, color: "#555555", margin: "12px 0 0" }}>
                <Link href={`/votes?session=${shownSession}`} style={{ color: "#333333" }}>第{shownSession}回国会の全会派の組み合わせを見る →</Link>
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function FactionDetailClient(props: Props) {
  return (
    <Suspense fallback={
      <div className="loading-block" style={{ minHeight: "100vh" }}>
        <div className="loading-spinner" />
        <span>データを読み込んでいます...</span>
      </div>
    }>
      <FactionDetailContent {...props} />
    </Suspense>
  );
}
