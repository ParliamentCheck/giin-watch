"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  getFavorites, removeFavorite, isFavorite,
  favoritesToShareUrl, importFromUrl, MAX_FAVORITES,
} from "../../lib/favorites";

interface Member {
  id: string;
  name: string;
  party: string;
  house: string;
  cabinet_post: string | null;
}

interface Activity {
  memberId: string;
  memberName: string;
  type: "speech" | "question" | "bill" | "vote";
  label: string;
  date: string;
  url: string | null;
  note?: string;
}

const PARTY_COLORS: Record<string, string> = {
  "自民党": "#c0392b", "立憲民主党": "#2980b9", "中道改革連合": "#3498db",
  "公明党": "#8e44ad", "日本維新の会": "#318e2c", "国民民主党": "#fabe00",
  "共産党": "#e74c3c", "れいわ新選組": "#e4007f", "社民党": "#795548",
  "参政党": "#ff6d00", "チームみらい": "#00bcd4", "日本保守党": "#607d8b",
  "沖縄の風": "#009688", "有志の会": "#9c27b0", "無所属": "#7f8c8d",
};

const TYPE_LABELS: Record<string, string> = {
  speech: "💬 発言", question: "📝 質問主意書", bill: "📋 議員立法", vote: "🗳 採決",
};

function FavoritesContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => { document.title = "お気に入り | はたらく議員"; }, []);

  const [memberIds, setMemberIds]   = useState<string[]>([]);
  const [members,   setMembers]     = useState<Member[]>([]);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading,   setLoading]     = useState(true);
  const [imported,  setImported]    = useState<number | null>(null);
  const [copied,    setCopied]      = useState(false);

  const reload = useCallback(() => {
    setMemberIds(getFavorites());
  }, []);

  // URLシェアからインポート
  useEffect(() => {
    const search = window.location.search;
    if (search.includes("ids=")) {
      const count = importFromUrl(search);
      setImported(count);
      window.history.replaceState({}, "", "/favorites");
    }
    reload();
  }, [reload]);

  // メンバー情報・活動データ取得
  useEffect(() => {
    if (memberIds.length === 0) {
      setMembers([]);
      setActivities([]);
      setLoading(false);
      return;
    }
    setLoading(true);

    async function fetchAll() {
      const [membersRes, speechRes, questionRes, sangiinQRes, billRes, voteRes] =
        await Promise.allSettled([
          supabase.from("members").select("id, name, party, house, cabinet_post")
            .in("id", memberIds),
          supabase.from("speeches")
            .select("member_id, spoken_at, committee, source_url")
            .in("member_id", memberIds)
            .eq("is_procedural", false)
            .order("spoken_at", { ascending: false })
            .limit(memberIds.length * 3),
          supabase.from("questions")
            .select("member_id, title, submitted_at, source_url")
            .in("member_id", memberIds)
            .order("submitted_at", { ascending: false })
            .limit(memberIds.length * 3),
          supabase.from("sangiin_questions")
            .select("member_id, title, submitted_at, url")
            .in("member_id", memberIds)
            .order("submitted_at", { ascending: false })
            .limit(memberIds.length * 3),
          supabase.from("bills")
            .select("submitter_ids, title, submitted_at, source_url")
            .containedBy("submitter_ids", memberIds)
            .order("submitted_at", { ascending: false })
            .limit(memberIds.length * 3),
          supabase.from("votes")
            .select("member_id, bill_title, vote_date, vote")
            .in("member_id", memberIds)
            .order("vote_date", { ascending: false })
            .limit(memberIds.length * 3),
        ]);

      const safe = (i: number) =>
        (allSettledResults[i] as PromiseFulfilledResult<any>)?.value?.data ?? [];
      const allSettledResults = [membersRes, speechRes, questionRes, sangiinQRes, billRes, voteRes];

      const memberData: Member[] = safe(0);
      const nameMap = Object.fromEntries(memberData.map((m) => [m.id, m.name]));

      // 活動を統合
      const acts: Activity[] = [];

      for (const s of safe(1)) {
        acts.push({
          memberId: s.member_id, memberName: nameMap[s.member_id] || "",
          type: "speech", label: s.committee || "委員会",
          date: s.spoken_at || "", url: s.source_url || null,
        });
      }
      for (const q of [...safe(2), ...safe(3)]) {
        acts.push({
          memberId: q.member_id, memberName: nameMap[q.member_id] || "",
          type: "question", label: q.title || "",
          date: q.submitted_at || "", url: q.source_url || q.url || null,
        });
      }
      for (const b of safe(4)) {
        const submitterId = (b.submitter_ids as string[]).find((id) => memberIds.includes(id));
        if (!submitterId) continue;
        acts.push({
          memberId: submitterId, memberName: nameMap[submitterId] || "",
          type: "bill", label: b.title || "",
          date: b.submitted_at || "", url: b.source_url || null,
        });
      }
      for (const v of safe(5)) {
        acts.push({
          memberId: v.member_id, memberName: nameMap[v.member_id] || "",
          type: "vote", label: v.bill_title || "",
          date: v.vote_date || "", url: null,
          note: `${v.vote}（参院のみ）`,
        });
      }

      // 日付降順・各議員3件ずつ上限
      const countPerMember: Record<string, number> = {};
      const filtered = acts
        .sort((a, b) => b.date.localeCompare(a.date))
        .filter((a) => {
          countPerMember[a.memberId] = (countPerMember[a.memberId] || 0) + 1;
          return countPerMember[a.memberId] <= 3;
        });

      // memberIds の順序を保持
      const ordered = memberIds
        .map((id) => memberData.find((m) => m.id === id))
        .filter(Boolean) as Member[];

      setMembers(ordered);
      setActivities(filtered);
      setLoading(false);
    }

    fetchAll();
  }, [memberIds]);

  const handleRemove = (id: string) => {
    removeFavorite(id);
    reload();
  };

  const handleShare = async () => {
    const url = favoritesToShareUrl();
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif",
      padding: "24px", maxWidth: 900, margin: "0 auto" }}>

      {/* ヘッダー */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        marginBottom: 24, flexWrap: "wrap", gap: 12 }}>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>⭐ お気に入り議員</h1>
        <div style={{ display: "flex", gap: 8 }}>
          {members.length > 0 && (
            <button onClick={handleShare}
              style={{ background: copied ? "#22c55e22" : "#111111",
                border: `1px solid ${copied ? "#22c55e" : "#c8c8c8"}`,
                color: copied ? "#22c55e" : "#555555",
                padding: "8px 14px", borderRadius: 8, cursor: "pointer", fontSize: 12 }}>
              {copied ? "✓ コピーしました" : "🔗 URLシェア"}
            </button>
          )}
        </div>
      </div>

      {/* インポート通知 */}
      {imported !== null && (
        <div style={{ background: "#22c55e22", border: "1px solid #22c55e44",
          color: "#22c55e", borderRadius: 10, padding: "12px 16px", marginBottom: 20, fontSize: 13 }}>
          {imported}人の議員をインポートしました
        </div>
      )}

      {/* 注意書き */}
      <div style={{ background: "#ffffff", border: "1px solid #e0e0e0",
        borderRadius: 10, padding: "12px 16px", marginBottom: 24, fontSize: 12, color: "#888888",
        lineHeight: 1.8 }}>
        ⚠️ お気に入りはこの端末・ブラウザにのみ保存されます。ブラウザのデータ消去・プライベートモードでは保存されません。他の端末・ブラウザとは同期されません。運営者にはデータは送信されません。
      </div>

      {memberIds.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 0", color: "#888888" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>⭐</div>
          <div style={{ fontSize: 15, marginBottom: 8 }}>お気に入り議員が登録されていません</div>
          <div style={{ fontSize: 13 }}>議員一覧・詳細ページの ⭐ ボタンから登録できます</div>
          <button onClick={() => router.push("/members")}
            style={{ marginTop: 24, background: "#e0e0e0", border: "1px solid #c8c8c8",
              color: "#888888", padding: "10px 24px", borderRadius: 8,
              cursor: "pointer", fontSize: 13 }}>
            議員一覧へ
          </button>
        </div>
      ) : loading ? (
        <div className="empty-state">
          データ読み込み中...
        </div>
      ) : (
        <>
          {/* 混合タイムライン */}
          <div className="card" style={{ padding: 20, marginBottom: 24 }}>
            <h2 className="section-title">
              最近の活動
            </h2>
            {activities.length === 0 ? (
              <div className="empty-state" style={{ padding: "20px 0" }}>
                活動データがありません
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                {activities.map((a, i) => (
                  <div key={i} style={{ padding: "12px 0",
                    borderBottom: i < activities.length - 1 ? "1px solid #e0e0e0" : "none" }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <span className="badge-count" style={{ flexShrink: 0, marginTop: 1 }}>
                        {TYPE_LABELS[a.type]}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center",
                          gap: 8, marginBottom: 3, flexWrap: "wrap" }}>
                          <span style={{ fontSize: 12, fontWeight: 700,
                            color: PARTY_COLORS[members.find(m => m.id === a.memberId)?.party || ""] || "#888888" }}>
                            {a.memberName}
                          </span>
                          <span style={{ fontSize: 11, color: "#888888" }}>{a.date}</span>
                        </div>
                        {a.url ? (
                          <a href={a.url} target="_blank" rel="noopener noreferrer"
                            style={{ fontSize: 13, color: "#1a1a1a", textDecoration: "none",
                              display: "block", overflow: "hidden", textOverflow: "ellipsis",
                              whiteSpace: "nowrap" }}
                            title={a.label}>
                            {a.label}
                          </a>
                        ) : (
                          <span style={{ fontSize: 13, color: "#1a1a1a",
                            display: "block", overflow: "hidden", textOverflow: "ellipsis",
                            whiteSpace: "nowrap" }} title={a.label}>
                            {a.label}
                          </span>
                        )}
                        {a.note && (
                          <span style={{ fontSize: 11, color: "#888888" }}>{a.note}</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 議員カード一覧 */}
          <h2 className="section-title">
            登録済み議員（{members.length}/{MAX_FAVORITES}）
          </h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {members.map((m) => {
              const color = PARTY_COLORS[m.party] || "#7f8c8d";
              return (
                <div key={m.id} className="card"
                  style={{ padding: "14px 16px", display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                      <span style={{ fontSize: 15, fontWeight: 700, color: "#111111" }}>
                        {m.name}
                      </span>
                      {m.cabinet_post && (
                        <span className="badge badge-cabinet">
                          {m.cabinet_post}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#555555", marginTop: 2 }}>
                      <span style={{ color }}>{m.party}</span>
                      <span style={{ marginLeft: 8 }}>{m.house}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                    <button onClick={() => router.push(`/members/${encodeURIComponent(m.id)}`)}
                      className="btn-sub">
                      詳細
                    </button>
                    <button onClick={() => handleRemove(m.id)}
                      className="btn-danger">
                      解除
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

export default function FavoritesPage() {
  return (
    <Suspense fallback={
      <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#555555",
        padding: "24px", textAlign: "center" }}>読み込み中...</div>
    }>
      <FavoritesContent />
    </Suspense>
  );
}
