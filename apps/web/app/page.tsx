"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";

interface Stats {
  total: number;
  shugiin: number;
  sangiin: number;
  parties: number;
  speeches: number;
}

export default function TopPage() {
  const router = useRouter();
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    async function fetchStats() {
      const [totalRes, shugiinRes, sangiinRes, speechRes] = await Promise.all([
        supabase.from("members").select("id", { count: "exact" }).eq("is_active", true),
        supabase.from("members").select("id", { count: "exact" }).eq("house", "衆議院").eq("is_active", true),
        supabase.from("members").select("id", { count: "exact" }).eq("house", "参議院").eq("is_active", true),
        supabase.from("speeches").select("id", { count: "exact" }),
      ]);

      const partiesRes = await supabase.from("members").select("party").eq("is_active", true);
      const parties = new Set((partiesRes.data || []).map((m) => m.party)).size;

      setStats({
        total:    totalRes.count    || 0,
        shugiin:  shugiinRes.count  || 0,
        sangiin:  sangiinRes.count  || 0,
        parties,
        speeches: speechRes.count   || 0,
      });
    }
    fetchStats();
  }, []);

  return (
    <div style={{ minHeight: "100vh", background: "#020817", color: "#e2e8f0",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif" }}>

      {/* ヒーローセクション */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "80px 24px 48px" }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
          <h1 style={{ fontSize: 42, fontWeight: 900, margin: "0 0 16px",
            background: "linear-gradient(135deg, #3b82f6, #8b5cf6)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            議員ウォッチ
          </h1>
          <p style={{ fontSize: 18, color: "#94a3b8", margin: "0 0 8px" }}>
            国会議員の活動を、データで見える化する
          </p>
          <p style={{ fontSize: 14, color: "#475569" }}>
            衆議院・参議院 全議員の発言・活動を収集・公開しています
          </p>
        </div>

        {/* 統計カード */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
          gap: 16, marginBottom: 60 }}>
          {[
            { label: "収録議員数", value: stats?.total, unit: "名" },
            { label: "衆議院議員", value: stats?.shugiin, unit: "名" },
            { label: "参議院議員", value: stats?.sangiin, unit: "名" },
            { label: "政党・会派数", value: stats?.parties, unit: "党" },
            { label: "収録発言数", value: stats?.speeches, unit: "件" },
          ].map((item) => (
            <div key={item.label} style={{ background: "#0f172a", border: "1px solid #1e293b",
              borderRadius: 12, padding: "20px 16px", textAlign: "center" }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: "#3b82f6", marginBottom: 4 }}>
                {item.value !== undefined ? item.value.toLocaleString() : "—"}
                <span style={{ fontSize: 14, color: "#64748b", marginLeft: 4 }}>{item.unit}</span>
              </div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{item.label}</div>
            </div>
          ))}
        </div>

        {/* メインナビゲーション */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 16 }}>
          {[
            {
              icon: "👤",
              title: "議員一覧",
              desc: "全議員を政党・院・選挙区で絞り込み検索できます",
              path: "/members",
              color: "#3b82f6",
            },
            {
              icon: "📊",
              title: "発言ランキング",
              desc: "国会での発言回数が多い議員をランキング表示します",
              path: "/ranking",
              color: "#8b5cf6",
            },
            {
              icon: "🏛",
              title: "委員会別",
              desc: "委員会ごとに所属議員と活動状況を確認できます",
              path: "/committees",
              color: "#06b6d4",
            },
          ].map((item) => (
            <div key={item.path}
              onClick={() => router.push(item.path)}
              style={{ background: "#0f172a", border: "1px solid #1e293b",
                borderRadius: 16, padding: 24, cursor: "pointer", transition: "all 0.2s" }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = item.color;
                e.currentTarget.style.transform = "translateY(-2px)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = "#1e293b";
                e.currentTarget.style.transform = "translateY(0)";
              }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: "#f1f5f9", marginBottom: 8 }}>
                {item.title}
              </div>
              <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6 }}>
                {item.desc}
              </div>
            </div>
          ))}
        </div>

        {/* 免責事項 */}
        <div style={{ marginTop: 80, background: "#0f172a", border: "1px solid #1e293b",
          borderRadius: 16, padding: 28 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginBottom: 16,
            textTransform: "uppercase", letterSpacing: 1 }}>
            ⚠️ データの正確性について
          </h3>
          <div style={{ fontSize: 13, color: "#64748b", lineHeight: 1.8 }}>
            <p style={{ marginBottom: 12 }}>
              本サイトのデータは以下の公的機関の公開情報を自動収集・整理したものです。
              情報の正確性には最大限配慮していますが、以下の点にご注意ください。
            </p>
            <ul style={{ paddingLeft: 20, marginBottom: 16 }}>
              <li style={{ marginBottom: 8 }}>
                <strong style={{ color: "#94a3b8" }}>会派と政党の違い：</strong>
                議員の所属表記は国会内の「会派」を元にしており、実際の政党と異なる場合があります。
                例えば複数政党が合流した会派名がそのまま表示されることがあります。
              </li>
              <li style={{ marginBottom: 8 }}>
                <strong style={{ color: "#94a3b8" }}>発言データのタイムラグ：</strong>
                国会図書館の会議録データは審議から登録まで1〜2週間程度のタイムラグがあります。
                直近の発言は反映されていない場合があります。
              </li>
              <li style={{ marginBottom: 8 }}>
                <strong style={{ color: "#94a3b8" }}>議員情報の更新：</strong>
                離党・入党・議員辞職等の変更が即時反映されない場合があります。
                毎日自動更新していますが、最新情報は各公式サイトをご確認ください。
              </li>
              <li>
                <strong style={{ color: "#94a3b8" }}>データの欠損：</strong>
                発言記録がない議員は、実際に発言していない場合と、
                データが取得できていない場合の両方があります。
              </li>
            </ul>
            <p style={{ marginBottom: 4 }}>
              <strong style={{ color: "#94a3b8" }}>データソース：</strong>
            </p>
            <ul style={{ paddingLeft: 20, marginBottom: 12 }}>
              <li>
                <a href="https://kokkai.ndl.go.jp/" target="_blank" rel="noopener noreferrer"
                  style={{ color: "#3b82f6" }}>
                  国立国会図書館「国会会議録検索システム」API
                </a>
                — 発言記録・委員会出席
              </li>
              <li>
                <a href="https://www.shugiin.go.jp/" target="_blank" rel="noopener noreferrer"
                  style={{ color: "#3b82f6" }}>
                  衆議院公式サイト
                </a>
                — 衆議院議員情報
              </li>
              <li>
                <a href="https://www.sangiin.go.jp/" target="_blank" rel="noopener noreferrer"
                  style={{ color: "#3b82f6" }}>
                  参議院公式サイト
                </a>
                — 参議院議員情報
              </li>
            </ul>
            <p style={{ color: "#475569" }}>
              誤りや改善点を発見された場合は、GitHubのIssueでご報告いただけると幸いです。
            </p>
          </div>
        </div>

        {/* フッター */}
        <div style={{ textAlign: "center", marginTop: 32, color: "#334155", fontSize: 13, paddingBottom: 40 }}>
          <p>毎日午前3時に最新データを自動収集しています</p>
        </div>
      </div>
    </div>
  );
}