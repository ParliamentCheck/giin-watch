"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, usePathname, useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";
import WordCloud from "../../components/WordCloud";
import ActivityRadar from "../../components/ActivityRadar";
import { isFavorite, addFavorite, removeFavorite } from "../../../lib/favorites";

interface Member {
  id: string;
  name: string;
  party: string;
  faction: string | null;
  house: string;
  district: string;
  terms: number | null;
  speech_count: number | null;
  session_count: number | null;
  question_count: number | null;
  bill_count: number | null;
  petition_count: number | null;
  cabinet_post: string | null;
  source_url: string | null;
  is_active: boolean;
  keywords: { word: string; count: number }[] | null;
}

interface Speech {
  id: string;
  committee: string;
  spoken_at: string;
  source_url: string;
}

interface Question {
  id: string;
  title: string;
  submitted_at: string;
  answered_at: string | null;
  source_url: string;
  session: number;
  number: number;
}

interface Vote {
  id: string;
  bill_title: string;
  vote_date: string | null;
  vote: string;
  session_number: number;
}

interface Bill {
  id: string;
  title: string;
  submitted_at: string | null;
  status: string | null;
  session_number: number;
  house: string;
  source_url: string | null;
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
}

interface CommitteeMember {
  id: string;
  committee: string;
  role: string;
}

interface SessionGroup {
  committee: string;
  spoken_at: string;
  speeches: Speech[];
}

const PARTY_COLORS: Record<string, string> = {
  "自民党":         "#c0392b",
  "立憲民主党":     "#2980b9",
  "中道改革連合":   "#3498db",
  "公明党":         "#8e44ad",
  "日本維新の会":   "#318e2c",
  "国民民主党":     "#fabe00",
  "共産党":         "#e74c3c",
  "れいわ新選組":   "#e4007f",
  "社民党":         "#795548",
  "参政党":         "#ff6d00",
  "チームみらい":   "#00bcd4",
  "日本保守党":     "#607d8b",
  "沖縄の風":       "#009688",
  "有志の会":       "#9c27b0",
  "無所属":         "#7f8c8d",
};

const ROLE_COLORS: Record<string, string> = {
  "委員長": "#333333",
  "理事":   "#333333",
  "委員":   "#555555",
  "会長":   "#333333",
  "副会長": "#333333",
};

function MemberDetailContent({ initialMember, initialGlobalMax, initialCommitteeCount, initialVoteCount }: {
  initialMember?: Member | null;
  initialGlobalMax?: { session: number; question: number; bill: number; petition: number };
  initialCommitteeCount?: number | null;
  initialVoteCount?: number | null;
}) {
  const params   = useParams();
  const router   = useRouter();
  const memberId = decodeURIComponent(params.id as string);

  const [member,     setMember]     = useState<Member | null>(initialMember ?? null);
  const [speeches,   setSpeeches]   = useState<Speech[]>([]);
  const [questions,  setQuestions]  = useState<Question[]>([]);
  const [committees, setCommittees] = useState<CommitteeMember[]>([]);
  const [votes,      setVotes]      = useState<Vote[]>([]);
  const [bills,      setBills]      = useState<Bill[]>([]);
  const [petitions,  setPetitions]  = useState<Petition[]>([]);
  const [keywords,   setKeywords]   = useState<{ word: string; count: number }[]>([]);
  const [globalMax,  setGlobalMax]  = useState(initialGlobalMax ?? { session: 1, question: 1, bill: 1, petition: 1 });
  useEffect(() => {
    if (member?.name) document.title = `${member.name} | はたらく議員`;
  }, [member]);
  const [loading,       setLoading]       = useState(!initialMember);
  const [clientLoaded,  setClientLoaded]  = useState(false);
  const searchParams = useSearchParams();
  const pathname     = usePathname();
  const tab          = searchParams.get("tab") ?? "committees";
  const setTab = (t: string) => {
    const p = new URLSearchParams(searchParams.toString());
    p.set("tab", t);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());
  const [fav,        setFav]        = useState(false);
  const [favMsg,     setFavMsg]     = useState("");
  const [copied,     setCopied]     = useState(false);

  useEffect(() => {
    async function fetchAll() {
      const results = await Promise.allSettled([
        initialMember
          ? Promise.resolve({ data: initialMember, error: null })
          : supabase.from("members").select("*").eq("id", memberId).single(),
        supabase.from("speeches").select("*").eq("member_id", memberId)
          .order("spoken_at", { ascending: false }).limit(200),
        supabase.from("questions").select("*").eq("member_id", memberId)
          .order("submitted_at", { ascending: false }).limit(20),
        supabase.from("sangiin_questions").select("*").eq("member_id", memberId)
          .order("submitted_at", { ascending: false }).limit(20),
        supabase.from("committee_members").select("*").eq("member_id", memberId),
        supabase.from("votes").select("id,bill_title,vote_date,vote,session_number")
          .eq("member_id", memberId).order("vote_date", { ascending: false }).limit(100),
        supabase.from("bills").select("id,title,submitted_at,status,session_number,house,submitter_ids,source_url")
          .contains("submitter_ids", [memberId]).limit(50),
        supabase.from("member_keywords").select("word,count")
          .eq("member_id", memberId).order("count", { ascending: false }).limit(50),
        supabase.from("petitions").select("id,session,number,title,committee_name,result,result_date,source_url")
          .contains("introducer_ids", [memberId]).order("session", { ascending: false }).limit(50),
        supabase.from("sangiin_petitions").select("id,session,number,title,committee_name,result,result_date,source_url")
          .contains("introducer_ids", [memberId]).order("session", { ascending: false }).limit(50),
      ]);

      const safe = (i: number) => results[i].status === "fulfilled" ? results[i].value.data : null;

      const memberData = safe(0);
      if (memberData) {
        setMember(memberData);
        setFav(isFavorite(memberId));

      }
      if (safe(1)) setSpeeches(safe(1));
      const shugiinQ = safe(2) || [];
      const sangiinQ = safe(3) || [];
      const allQuestions = [...shugiinQ, ...sangiinQ]
        .sort((a: any, b: any) => (b.submitted_at || "").localeCompare(a.submitted_at || ""));
      setQuestions(allQuestions);
      if (safe(4)) {
        // (committee, role) の組み合わせで重複排除
        const seen = new Set<string>();
        const deduped = (safe(4) as any[]).filter((c: any) => {
          const key = `${c.committee}__${c.role}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setCommittees(deduped);
      }
      if (safe(5)) setVotes(safe(5));
      if (safe(6)) setBills(safe(6));
      if (safe(7)) setKeywords(safe(7));
      const shugiinP = safe(8) || [];
      const sangiinP = safe(9) || [];
      const allPetitions = [...shugiinP, ...sangiinP]
        .sort((a: any, b: any) => {
          if (a.result_date && b.result_date) return b.result_date.localeCompare(a.result_date);
          if (a.result_date && !b.result_date) return -1;
          if (!a.result_date && b.result_date) return 1;
          if (b.session !== a.session) return b.session - a.session;
          return b.number - a.number;
        });
      setPetitions(allPetitions);

      // グローバルMAX取得（SSRで渡されていない場合のみ）
      if (!initialGlobalMax) {
        const gmRes = await supabase
          .from("members")
          .select("session_count,question_count,bill_count,petition_count")
          .limit(2000);
        if (gmRes.data && gmRes.data.length > 0) {
          let gm = { session: 1, question: 1, bill: 1, petition: 1 };
          for (const m of gmRes.data) {
            if ((m.session_count  ?? 0) > gm.session)  gm.session  = m.session_count;
            if ((m.question_count ?? 0) > gm.question) gm.question = m.question_count;
            if ((m.bill_count     ?? 0) > gm.bill)     gm.bill     = m.bill_count;
            if ((m.petition_count ?? 0) > gm.petition) gm.petition = m.petition_count;
          }
          setGlobalMax(gm);
        }
      }

      setLoading(false);
      setClientLoaded(true);
    }
    fetchAll();
  }, [memberId]);

  // 発言をセッション単位でグルーピング
  const sessionGroups: SessionGroup[] = [];
  const sessionMap: Record<string, SessionGroup> = {};
  for (const s of speeches) {
    const key = `${s.spoken_at}_${s.committee}`;
    if (!sessionMap[key]) {
      sessionMap[key] = { committee: s.committee, spoken_at: s.spoken_at, speeches: [] };
      sessionGroups.push(sessionMap[key]);
    }
    sessionMap[key].speeches.push(s);
  }

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  if (loading) return (
    <div className="loading-block" style={{ minHeight: "100vh" }}>
      <div className="loading-spinner" />
      <span>データを読み込んでいます...</span>
    </div>
  );

  if (!member) return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", display: "flex",
      alignItems: "center", justifyContent: "center", color: "#ef4444" }}>
      議員データが見つかりませんでした
    </div>
  );

  const color       = PARTY_COLORS[member.party] || "#7f8c8d";
  const showFaction = member.faction && member.faction !== member.party;

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* 戻るボタン */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <button onClick={() => router.back()} className="btn-back" style={{ marginBottom: 0 }}>
          ← 一覧に戻る
        </button>
        {member && (
          <button onClick={() => {
            const url = `https://www.hataraku-giin.com/members/${encodeURIComponent(memberId)}`;
            const prompt = `${member.name}（${member.party}・${member.house}・${member.district}）について詳しく教えてください。\n${url}`;
            navigator.clipboard.writeText(prompt).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            });
          }}
            className="btn-back"
            style={{ marginBottom: 0, fontSize: 12 }}>
            {copied ? "✓ コピーしました" : "プロンプト作成"}
          </button>
        )}
      </div>

      {/* ヘッダー */}
      <div className="card-xl" style={{ marginBottom: 20 }}>
        <div className="resp-stack" style={{ display: "flex", gap: 20, alignItems: "flex-start" }}>
          <div style={{ width: 72, height: 72, borderRadius: "50%", flexShrink: 0,
            background: "#e0e0e0", border: `3px solid ${color}`,
            display: "flex", alignItems: "center", justifyContent: "center", fontSize: 36 }}>
            👤
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#111111" }}>
                {member.name}
              </h1>
              <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                {favMsg && <span style={{ fontSize: 11, color: "#ef4444" }}>{favMsg}</span>}
                <button onClick={() => {
                  if (fav) {
                    removeFavorite(memberId);
                    setFav(false);
                    setFavMsg("");
                  } else {
                    const result = addFavorite(memberId);
                    if (result.ok) { setFav(true); setFavMsg(""); }
                    else { setFavMsg(result.reason || ""); }
                  }
                }}
                  className={`fav-btn${fav ? " active" : ""}`}
                  style={fav
                    ? { background: color, color: "#ffffff", borderColor: color }
                    : { borderColor: color, color: color }}>
                  {fav ? "⭐ 登録済み" : "☆ お気に入り登録"}
                </button>
              </div>
            </div>
            <div style={{ fontSize: 13, color: "#555555", marginBottom: 10 }}>
              {!member.is_active && (
                <span className="badge-inactive">
                  ⚠️ 前議員（現在は議員ではありません）
                </span>
              )}
              {member.house} · {member.district}
              {member.terms && (
                <><br />当選回数：{member.terms}期</>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span className="badge badge-party" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, "--party-color": color } as React.CSSProperties}>
                🗳 {member.party}
              </span>
              {showFaction && (
                <span className="badge badge-house" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12 }}>
                  🏛 会派: {member.faction}
                </span>
              )}
              {member.cabinet_post && (
                <span className="badge badge-cabinet" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12 }}>
                  👑 {member.cabinet_post}
                </span>
              )}
              {member.source_url && (
                <a href={member.source_url} target="_blank" rel="noopener noreferrer"
                  className="badge badge-house" style={{ padding: "3px 10px", borderRadius: 6, fontSize: 12, textDecoration: "none" }}>
                  📄 公式プロフィール
                </a>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 活動バランス + サマリー */}
      <div className="card" style={{ padding: "16px 20px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#333333", marginBottom: 2 }}>活動バランス</div>
        <div style={{ fontSize: 11, color: "#888888", marginBottom: 12, lineHeight: 1.6 }}>
          各活動の件数から活動の比重・傾向を図示しています。活動量の多さを示すものではありません。
          <a href="/faq#activity-radar" style={{ color: "#888888", marginLeft: 4 }}>算出方法はこちら ↗</a>
        </div>
        <div className="activity-balance-body" style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <div className="activity-balance-radar" style={{ width: 350, flexShrink: 0 }}>
            <ActivityRadar
              axes={[
                { key: "session",  label: "発言",       value: member.session_count  ?? 0, globalMax: globalMax.session  },
                { key: "petition", label: "請願",       value: member.petition_count ?? 0, globalMax: globalMax.petition },
                { key: "bill",     label: "議員立法",   value: member.bill_count     ?? 0, globalMax: globalMax.bill     },
                { key: "question", label: "質問主意書", value: member.question_count ?? 0, globalMax: globalMax.question },
              ]}
              color={PARTY_COLORS[member.party] || "#333333"}
            />
          </div>
          <div className="summary-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8, flex: 1 }}>
            {[
              { label: "委員会所属",     value: clientLoaded ? committees.length : (initialCommitteeCount ?? null), unit: "件" },
              { label: "発言セッション", value: member.session_count,                                                  unit: "回" },
              { label: "質問主意書",     value: member.question_count,                                                 unit: "件" },
              { label: "採決",           value: clientLoaded ? votes.length : (initialVoteCount ?? null),             unit: "件" },
              { label: "議員立法",       value: member.bill_count,                  unit: "件" },
              { label: "請願",           value: member.petition_count,              unit: "件" },
            ].map((item) => (
              <div key={item.label} style={{ background: `${color}15`, borderRadius: 8, padding: "10px 8px", textAlign: "center" }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#333333", marginBottom: 2 }}>
                  {item.value ?? "—"}
                  {item.value != null && <span style={{ fontSize: 11, color: "#555555", marginLeft: 3 }}>{item.unit}</span>}
                </div>
                <div style={{ fontSize: 10, color: "#888888" }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* カード注釈 */}
      <div style={{ fontSize: 11, color: "#888888", marginBottom: 16, padding: "0 4px" }}>
        ※ 当選回数は現在の所属院におけるものです。
      </div>

      {/* タブ */}
      <div className="tab-bar tab-bar-container" style={{ background: `${color}15`, borderColor: `${color}30`, "--tab-hover-bg": `${color}35` } as React.CSSProperties}>
        {[
          { id: "committees", label: "🏛 委員会" },
          { id: "speeches",   label: "💬 発言" },
          { id: "questions",  label: "📝 質問主意書" },
          { id: "votes",      label: "🗳 採決" },
          { id: "bills",      label: "📋 議員立法" },
          { id: "petitions",  label: "📜 請願" },
          { id: "keywords",   label: "☁️ キーワード" },
        ].map((t) => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`tab-pill${tab === t.id ? " active" : ""}`}
            style={{
              flex: 1, padding: "10px 0",
              ...(tab === t.id ? { background: color, color: "#ffffff" } : {}),
            }}
            onMouseEnter={(e) => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = `${color}35`; }}
            onMouseLeave={(e) => { if (tab !== t.id) (e.currentTarget as HTMLButtonElement).style.background = ""; }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 委員会所属タブ */}
      {tab === "committees" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            委員会所属（現在）
          </h3>
          {committees.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              委員会所属データがありません。
            </div>
          ) : (
            committees.map((c, i) => {
              const roleColor = ROLE_COLORS[c.role] || "#555555";
              return (
                <div key={c.id} style={{ padding: "14px 0",
                  borderBottom: i < committees.length - 1 ? "1px solid #e0e0e0" : "none",
                  display: "flex", alignItems: "center", gap: 12 }}>
                  <span className="badge badge-role">
                    {c.role}
                  </span>
                  <span style={{ fontSize: 14, color: "#1a1a1a" }}>{c.committee}</span>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 発言履歴タブ */}
      {tab === "speeches" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            発言履歴（セッション単位・最新順）
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            ※ 同日・同委員会の発言を1回として集計（第210回〜第221回国会の記録に基づく）。
          </p>
          {sessionGroups.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              発言データがまだありません。
            </div>
          ) : (
            sessionGroups.map((sg) => {
              const key      = `${sg.spoken_at}_${sg.committee}`;
              const isOpen   = expanded.has(key);
              return (
                <div key={key} style={{ borderBottom: "1px solid #e0e0e0", paddingBottom: 12, marginBottom: 12 }}>
                  <div
                    onClick={() => toggleExpand(key)}
                    style={{ display: "flex", justifyContent: "space-between",
                      alignItems: "center", cursor: "pointer", padding: "6px 0" }}>
                    <div>
                      <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a" }}>
                        {sg.committee}
                      </span>
                      <span style={{ fontSize: 12, color: "#888888", marginLeft: 12 }}>
                        {sg.spoken_at}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span className="badge-count">
                        {sg.speeches.length}件の発言
                      </span>
                      <span style={{ color: "#555555", fontSize: 12 }}>{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </div>
                  {isOpen && (
                    <div style={{ marginTop: 8, paddingLeft: 12,
                      borderLeft: "2px solid #e0e0e0" }}>
                      {sg.speeches.map((s, i) => (
                        <div key={s.id} style={{ padding: "8px 0",
                          borderBottom: i < sg.speeches.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                          <a href={s.source_url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                            📄 発言 #{i + 1} を見る ↗
                          </a>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* 請願タブ */}
      {tab === "petitions" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            紹介議員を務めた請願
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            ※ 第196回〜第221回国会の記録に基づく。
          </p>
          {petitions.length > 0 && (() => {
            const adopted    = petitions.filter(p => p.result?.split("\n")[0].trim().startsWith("採択")).length;
            const rejected   = petitions.filter(p => p.result?.split("\n")[0].trim() === "不採択").length;
            const pending    = petitions.filter(p => !p.result || p.result.trim() === "" || p.result.includes("審査未了")).length;
            return (
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                {[
                  { label: "採択",    count: adopted,  color: "#22c55e" },
                  { label: "不採択",  count: rejected, color: "#ef4444" },
                  { label: "審査未了", count: pending,  color: "#888888" },
                ].map(({ label, count, color }) => (
                  <div key={label} style={{ background: "#f4f4f4", borderRadius: 8, padding: "8px 16px", textAlign: "center", minWidth: 72 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color }}>{count}</div>
                    <div style={{ fontSize: 11, color: "#888888" }}>{label}</div>
                  </div>
                ))}
              </div>
            );
          })()}
          {petitions.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              請願の紹介議員記録がありません。
            </div>
          ) : (
            petitions.map((p, i) => {
              const resultClean = p.result?.split("\n")[0].trim() ?? null;
              const resultColor = resultClean?.startsWith("採択") ? "#22c55e"
                : resultClean === "不採択" ? "#ef4444" : "#555555";
              return (
                <div key={p.id} style={{ padding: "14px 0",
                  borderBottom: i < petitions.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between",
                    alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>
                      {p.title}
                    </span>
                    <span style={{ fontSize: 11, color: "#888888", flexShrink: 0 }}>
                      第{p.session}回 #{p.number}
                    </span>
                  </div>
                  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                    {p.committee_name && (
                      <span style={{ fontSize: 12, color: "#555555" }}>🏛 {p.committee_name}</span>
                    )}
                    {resultClean && (
                      <span className="badge badge-result" style={{ "--result-color": resultColor } as React.CSSProperties}>
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
                </div>
              );
            })
          )}
        </div>
      )}

      {/* キーワードタブ */}
      {tab === "keywords" && (
        <div style={{ padding: "16px 0" }}>
          <WordCloud keywords={keywords} width={600} height={320} />
          <p style={{ textAlign: "center", fontSize: 11, color: "#888888", marginTop: 8 }}>
            <a href="/faq#keywords" style={{ color: "#888888" }}>集計方法はこちら ↗</a>
          </p>
        </div>
      )}

      {/* 質問主意書タブ */}
      {tab === "questions" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            質問主意書（最新20件）
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            ※ 第196回〜第221回国会の記録に基づく。
          </p>
          {questions.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              質問主意書の提出記録がありません。
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.id} style={{ padding: "14px 0",
                borderBottom: i < questions.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between",
                  alignItems: "flex-start", gap: 12, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", flex: 1 }}>
                    {q.title}
                  </span>
                  <span style={{ fontSize: 11, color: "#888888", flexShrink: 0 }}>
                    第{q.session}回 #{q.number}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                  <span style={{ fontSize: 12, color: "#555555" }}>
                    提出: {q.submitted_at || "不明"}
                  </span>
                  {q.answered_at && (
                    <span style={{ fontSize: 12, color: "#555555" }}>
                      答弁: {q.answered_at}
                    </span>
                  )}
                  <a href={q.source_url} target="_blank" rel="noopener noreferrer"
                    style={{ fontSize: 12, color: "#333333", textDecoration: "none" }}>
                    📄 詳細を見る ↗
                  </a>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 採決記録タブ（参議院のみ） */}
      {tab === "votes" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            本会議採決記録（参議院・最新100件）
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            ※ 第208回〜第221回国会の記録に基づく（参議院のみ）。
          </p>
          {member.house !== "参議院" ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              衆議院は個人別の投票記録が公開されていないため、採決データは参議院議員のみ表示されます。
            </div>
          ) : votes.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              採決記録がありません。
            </div>
          ) : (() => {
            const yea        = votes.filter(v => v.vote === "賛成").length;
            const nay        = votes.filter(v => v.vote === "反対").length;
            const absent     = votes.filter(v => v.vote === "欠席").length;
            const absentRate = votes.length > 0 ? Math.round((absent / votes.length) * 100) : 0;
            return (
              <>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {[
                    { label: "賛成",   count: `${yea}`,        color: "#22c55e" },
                    { label: "反対",   count: `${nay}`,        color: "#ef4444" },
                    { label: "欠席",   count: `${absent}`,     color: "#888888" },
                    { label: "欠席率", count: `${absentRate}%`, color: absent > 0 ? "#f59e0b" : "#888888" },
                  ].map(({ label, count, color }) => (
                    <div key={label} style={{ background: "#f4f4f4", borderRadius: 8, padding: "8px 0", textAlign: "center", flex: 1 }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color }}>{count}</div>
                      <div style={{ fontSize: 11, color: "#888888" }}>{label}</div>
                    </div>
                  ))}
                </div>
                {votes.map((v, i) => {
                  const voteColor = v.vote === "賛成" ? "#22c55e" : v.vote === "反対" ? "#ef4444" : "#888888";
                  return (
                    <div key={v.id} style={{ padding: "12px 0",
                      borderBottom: i < votes.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                        <span style={{ fontSize: 13, color: "#1a1a1a", flex: 1 }}>
                          {v.bill_title}
                        </span>
                        <span className="badge badge-result" style={{ flexShrink: 0, "--result-color": voteColor } as React.CSSProperties}>
                          {v.vote}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: "#555555", marginTop: 4 }}>
                        {v.vote_date || "日付不明"} · 第{v.session_number}回国会
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      {/* 議員立法タブ */}
      {tab === "bills" && (
        <div className="card" style={{ padding: 20 }}>
          <h3 className="section-title">
            議員提出法案
          </h3>
          <p style={{ fontSize: 11, color: "#888888", marginBottom: 16 }}>
            ※ 第208回〜第221回国会の記録に基づく。
          </p>
          {bills.length === 0 ? (
            <div className="empty-state" style={{ padding: "20px 0" }}>
              議員提出法案の記録がありません。
            </div>
          ) : (
            bills.map((b, i) => (
              <div key={b.id} style={{ padding: "12px 0",
                borderBottom: i < bills.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>
                  {b.title}
                </div>
                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#555555", alignItems: "center" }}>
                  <span>{b.submitted_at || "日付不明"}</span>
                  <span>第{b.session_number}回国会</span>
                  {b.status && <span style={{ color: "#888888" }}>{b.status}</span>}
                  {b.source_url && (
                    <a href={b.source_url} target="_blank" rel="noopener noreferrer"
                      style={{ color: "#333333", textDecoration: "none" }}
                      onClick={(e) => e.stopPropagation()}>
                      📄 本文を見る ↗
                    </a>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default function MemberDetailClient({ initialMember, initialGlobalMax, initialCommitteeCount, initialVoteCount }: {
  initialMember?: Member | null;
  initialGlobalMax?: { session: number; question: number; bill: number; petition: number };
  initialCommitteeCount?: number | null;
  initialVoteCount?: number | null;
}) {
  return (
    <Suspense fallback={<div className="loading-block" style={{ minHeight: "100vh" }}><div className="loading-spinner" /></div>}>
      <MemberDetailContent initialMember={initialMember} initialGlobalMax={initialGlobalMax} initialCommitteeCount={initialCommitteeCount} initialVoteCount={initialVoteCount} />
    </Suspense>
  );
}
