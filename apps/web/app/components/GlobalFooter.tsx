"use client";

import { useRouter } from "next/navigation";

export default function GlobalFooter() {
  const router = useRouter();

  const pages = [
    { label: "トップ",       path: "/" },
    { label: "議員一覧",     path: "/members" },
    { label: "ランキング",   path: "/ranking" },
    { label: "政党・会派",   path: "/parties" },
    { label: "委員会別",     path: "/committees" },
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

          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ color: "#94a3b8", fontWeight: 700, marginBottom: 10, fontSize: 12 }}>データについて</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, lineHeight: 1.8 }}>
              <span>
                本サイトのデータは衆議院・参議院・国立国会図書館の公開情報を自動収集したものです。運営者による手動での追加・修正・削除は一切行っていません。
              </span>
              <span>
                「政党・会派」は国会での所属会派を表示しています。選挙時の届出政党と異なる場合があります。
              </span>
              <span>
                会議録登録には1〜2週間のタイムラグがあります。最新・正確な情報は各公式サイトをご確認ください。
              </span>
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
