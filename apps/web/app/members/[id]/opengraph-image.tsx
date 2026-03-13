import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "議員詳細";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const PARTY_COLORS: Record<string, string> = {
  "自民党":       "#c0392b",
  "立憲民主党":   "#2980b9",
  "中道改革連合": "#3498db",
  "公明党":       "#8e44ad",
  "日本維新の会": "#318e2c",
  "国民民主党":   "#fabe00",
  "共産党":       "#e74c3c",
  "れいわ新選組": "#e4007f",
  "社民党":       "#795548",
  "参政党":       "#ff6d00",
  "チームみらい": "#00bcd4",
  "日本保守党":   "#607d8b",
  "沖縄の風":     "#009688",
  "有志の会":     "#9c27b0",
  "無所属":       "#7f8c8d",
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const memberId = decodeURIComponent(id);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_KEY || "";

  const res = await fetch(
    `${supabaseUrl}/rest/v1/members?id=eq.${encodeURIComponent(memberId)}&select=name,party,house,district,session_count,question_count,bill_count,petition_count,cabinet_post`,
    { headers: { apikey: supabaseKey } }
  );
  const [member] = await res.json();
  if (!member) return new Response("Not found", { status: 404 });

  const color = PARTY_COLORS[member.party] || "#7f8c8d";

  const stats = [
    { label: "発言セッション", value: (member.session_count ?? 0).toLocaleString(), unit: "回" },
    { label: "質問主意書",     value: member.question_count ?? 0,                    unit: "件" },
    { label: "議員立法",       value: member.bill_count ?? 0,                        unit: "件" },
    { label: "請願",           value: member.petition_count ?? 0,                    unit: "件" },
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: 1200, height: 630,
          background: "#f4f4f4",
          display: "flex",
          fontFamily: "sans-serif",
          position: "relative",
        }}
      >
        {/* 党色の縦帯 */}
        <div style={{ width: 16, background: color, flexShrink: 0 }} />

        {/* メインコンテンツ */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", padding: "60px 72px" }}>

          {/* 上部：名前・属性 */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16, marginBottom: 48 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <span style={{
                fontSize: 80, fontWeight: 800, color: "#111", letterSpacing: "-2px", lineHeight: 1,
              }}>
                {member.name}
              </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <span style={{
                background: color, color: "#fff",
                fontSize: 26, fontWeight: 700,
                padding: "6px 18px", borderRadius: 8,
              }}>
                {member.party}
              </span>
              <span style={{ fontSize: 28, color: "#555" }}>
                {member.house} · {member.district}
              </span>
              {member.cabinet_post && (
                <span style={{
                  background: "#f59e0b", color: "#fff",
                  fontSize: 24, fontWeight: 700,
                  padding: "6px 16px", borderRadius: 8,
                }}>
                  {member.cabinet_post}
                </span>
              )}
            </div>
          </div>

          {/* 統計グリッド */}
          <div style={{ display: "flex", gap: 24, flex: 1 }}>
            {stats.map((s) => (
              <div
                key={s.label}
                style={{
                  flex: 1,
                  background: "#fff",
                  borderRadius: 16,
                  border: `2px solid ${color}33`,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: "24px 16px",
                  gap: 8,
                }}
              >
                <div style={{ fontSize: 14, color: "#888", letterSpacing: "0.05em" }}>{s.label}</div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                  <span style={{ fontSize: 56, fontWeight: 800, color: "#111", lineHeight: 1 }}>{s.value}</span>
                  <span style={{ fontSize: 22, color: "#555" }}>{s.unit}</span>
                </div>
              </div>
            ))}
          </div>

          {/* フッター */}
          <div style={{
            marginTop: 32, display: "flex", justifyContent: "space-between", alignItems: "flex-end",
          }}>
            <span style={{ fontSize: 18, color: "#bbb" }}>
              ※ 公開国会記録に基づく（発言: 第210〜221回 / 質問主意書・請願: 第196〜221回 / 議員立法: 第208〜221回）
            </span>
            <span style={{ fontSize: 22, color: "#aaa", letterSpacing: "0.05em" }}>
              はたらく議員
            </span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 630 }
  );
}
