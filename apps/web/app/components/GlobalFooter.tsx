"use client";

import { useRouter } from "next/navigation";

export default function GlobalFooter() {
  const router = useRouter();

  const pages = [
    { label: "トップ",         path: "/" },
    { label: "議員一覧",       path: "/members" },
    { label: "発言ランキング", path: "/ranking" },
    { label: "委員会別",       path: "/committees" },
  ];

  const sources = [
    { label: "国立国会図書館 会議録検索API", url: "https://kokkai.ndl.go.jp/" },
    { label: "衆議院公式サイト",             url: "https://www.shugiin.go.jp/" },
    { label: "参議院公式サイト",             url: "https://www.sangiin.go.jp/" },
  ];

  return (
    <footer style={{
      background: "#0a0f1e",
      borderTop: "1px solid #1e293b",
      padding: "32px 24px",
      color: "#475569",
      fontSize: 13,
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{ display: "flex", gap: 32, flexWrap: "wrap", marginBottom: 24 }}>

          <div>
            <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 10, fontSize: 12 }}>ページ</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {pages.map((item) => (
                <span
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  style={{ cursor: "pointer", color: "#64748b" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
                >
                  {item.label}
                </span>
              ))}
            </div>
          </div>

          <div>
            <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 10, fontSize: 12 }}>データソース</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {sources.map((item) => (
                <a
                  key={item.url}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: "#64748b", textDecoration: "none" }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#3b82f6"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
                >
                  {item.label} ↗
                </a>
              ))}
            </div>
          </div>

          <div>
            <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 10, fontSize: 12 }}>注意事項</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 300, lineHeight: 1.7 }}>
              <span>本サイトのデータは公的機関の公開情報を自動収集したものです。</span>
              <span>会議録登録には1〜2週間のタイムラグがあります。</span>
              <span>最新・正確な情報は各公式サイトをご確認ください。</span>
            </div>
          </div>
        </div>

        <div style={{ borderTop: "1px solid #1e293b", paddingTop: 16,
          display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <span>毎日午前3時に最新データを自動収集</span>
          <span>データソース: 国立国会図書館 / 衆議院 / 参議院</span>
        </div>
      </div>
    </footer>
  );
}
