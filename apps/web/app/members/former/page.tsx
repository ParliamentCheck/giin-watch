"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../../lib/supabase";

interface Member {
  id: string;
  name: string;
  party: string;
  faction: string | null;
  house: string;
  district: string;
  prefecture: string;
  terms: number | null;
  is_active: boolean;
  session_count: number | null;
  question_count: number | null;
  bill_count: number | null;
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
  "不明（前議員）": "#264848",
};

type SortKey = "name" | "session_count" | "question_count" | "bill_count" | "terms";

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: "name",           label: "名前順" },
  { value: "session_count",  label: "発言セッション数順" },
  { value: "question_count", label: "質問主意書数順" },
  { value: "bill_count",     label: "議員立法数順" },
  { value: "terms",          label: "当選回数順" },
];

function FormerMembersContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [inputValue, setInputValue] = useState("");
  const isComposing = useRef(false);
  useEffect(() => { document.title = "前議員一覧 | はたらく議員"; }, []);

  const search        = searchParams.get("q")     || "";
  const selectedHouse = searchParams.get("house") || "";
  const selectedParty = searchParams.get("party") || "";
  const sortKey       = (searchParams.get("sort") || "name") as SortKey;

  useEffect(() => {
    if (!isComposing.current) setInputValue(search);
  }, [search]);

  const updateUrl = (q: string, house: string, party: string, sort: string) => {
    const params = new URLSearchParams();
    if (q)     params.set("q",     q);
    if (house) params.set("house", house);
    if (party) params.set("party", party);
    if (sort && sort !== "name") params.set("sort", sort);
    const qs = params.toString();
    router.replace(qs ? `/members/former?${qs}` : "/members/former", { scroll: false });
  };

  useEffect(() => {
    async function fetchMembers() {
      const { data, error } = await supabase
        .from("members")
        .select("id, name, party, faction, house, district, prefecture, terms, is_active, session_count, question_count, bill_count")
        .eq("is_active", false)
        .limit(2000)
        .order("name");
      if (error) console.error(error);
      else setMembers(data || []);
      setLoading(false);
    }
    fetchMembers();
  }, []);

  const parties = Array.from(new Set(members.map((m) => m.party))).sort();

  const filtered = members.filter((m) => {
    if (search        && !m.name.includes(search) && !m.district.includes(search)) return false;
    if (selectedHouse && m.house !== selectedHouse) return false;
    if (selectedParty && m.party !== selectedParty) return false;
    return true;
  });

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === "name") return a.name.localeCompare(b.name, "ja");
    const av = (a[sortKey] as number | null) ?? -1;
    const bv = (b[sortKey] as number | null) ?? -1;
    return bv - av;
  });

  return (
    <div style={{ minHeight: "100vh", background: "#030d0d", color: "#dff0f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>

      <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 8 }}>前議員一覧</h1>
      <p style={{ color: "#4d7878", marginBottom: 24 }}>現在 {members.length}名の前議員データを収録</p>

      {/* フィルター・ソート */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        <input
          type="text"
          placeholder="議員名・選挙区で検索"
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            if (!isComposing.current) updateUrl(e.target.value, selectedHouse, selectedParty, sortKey);
          }}
          onCompositionStart={() => { isComposing.current = true; }}
          onCompositionEnd={(e) => {
            isComposing.current = false;
            updateUrl((e.target as HTMLInputElement).value, selectedHouse, selectedParty, sortKey);
          }}
          style={{ flex: 1, minWidth: 160, background: "#0d2828", border: "1px solid #163838",
            color: "#dff0f0", padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}
        />
        <select value={selectedHouse}
          onChange={(e) => updateUrl(search, e.target.value, selectedParty, sortKey)}
          style={{ background: "#0d2828", border: "1px solid #163838", color: "#dff0f0",
            padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}>
          <option value="">🏛 衆院・参院</option>
          <option value="衆議院">衆議院</option>
          <option value="参議院">参議院</option>
        </select>
        <select value={selectedParty}
          onChange={(e) => updateUrl(search, selectedHouse, e.target.value, sortKey)}
          style={{ background: "#0d2828", border: "1px solid #163838", color: "#dff0f0",
            padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}>
          <option value="">🗳 政党を選択</option>
          {parties.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
        <select value={sortKey}
          onChange={(e) => updateUrl(search, selectedHouse, selectedParty, e.target.value)}
          style={{ background: "#0d2828", border: "1px solid #163838", color: "#dff0f0",
            padding: "10px 14px", borderRadius: 10, fontSize: 14, outline: "none" }}>
          {SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {(search || selectedHouse || selectedParty || sortKey !== "name") && (
          <button onClick={() => updateUrl("", "", "", "name")}
            style={{ background: "#163838", border: "none", color: "#7ab8b8",
              padding: "10px 16px", borderRadius: 10, cursor: "pointer" }}>
            クリア
          </button>
        )}
      </div>

      <p style={{ color: "#264848", marginBottom: 12, fontSize: 14 }}>{sorted.length}名表示中</p>

      {loading ? (
        <div style={{ textAlign: "center", padding: 60, color: "#4d7878" }}>データ読み込み中...</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {sorted.map((m) => {
            const color = PARTY_COLORS[m.party] || "#7f8c8d";
            return (
              <div key={m.id}
                onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                style={{ background: "#071a1a", border: "1px solid #0d2828", borderRadius: 10,
                  padding: "12px 16px", cursor: "pointer", transition: "border-color 0.15s", opacity: 0.85 }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.opacity = "1"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "#0d2828"; e.currentTarget.style.opacity = "0.85"; }}>
                <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "6px 16px" }}>
                  {/* 名前 */}
                  <span style={{ fontWeight: 700, fontSize: 15, color: "#edfafa", minWidth: 90 }}>
                    {m.name}
                  </span>
                  {/* 政党バッジ */}
                  <span style={{ background: color + "22", color, border: `1px solid ${color}44`,
                    padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 700, whiteSpace: "nowrap" }}>
                    {m.party}
                  </span>
                  {/* 院・選挙区・期数 */}
                  <span style={{ color: "#4d7878", fontSize: 12, whiteSpace: "nowrap" }}>
                    元{m.house} · {m.district}{m.terms ? ` · ${m.terms}期` : ""}
                  </span>
                  {/* 活動指標 */}
                  <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 12,
                    color: "#7ab8b8", whiteSpace: "nowrap" }}>
                    <span>発言セッション：{(m.session_count ?? 0).toLocaleString()}</span>
                    <span>質問主意書：{m.question_count ?? 0}</span>
                    <span>議員立法：{m.bill_count ?? 0}</span>
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function FormerMembersPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", background: "#030d0d", color: "#4d7878",
          padding: "24px", textAlign: "center" }}>
          読み込み中...
        </div>
      }
    >
      <FormerMembersContent />
    </Suspense>
  );
}
