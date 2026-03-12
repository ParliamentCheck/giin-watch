"use client";

import { useRouter } from "next/navigation";

const FOOTER_LINKS = [
  { label: "サイトについて", path: "/about" },
  { label: "免責事項", path: "/disclaimer" },
  { label: "利用規約", path: "/terms" },
  { label: "変更履歴", path: "/changelog" },
  { label: "データ訂正申し立て", path: "https://docs.google.com/forms/d/e/1FAIpQLSfs3iOuviV2CV5BddBbG2rmPYQ4QVnRvEn8pm3j3rNpdPBlpg/viewform" },
  { label: "プライバシーポリシー", path: "/privacy" },
  { label: "お問い合わせ", path: "/contact" },
];

export default function GlobalFooter() {
  const router = useRouter();

  return (
    <footer style={{
      background: "#f8f8f8",
      borderTop: "1px solid #e0e0e0",
      padding: "24px",
      color: "#888888",
      fontSize: 13,
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        <div style={{
          display: "flex", justifyContent: "center",
          flexWrap: "wrap", gap: 8, marginBottom: 16,
        }}>
          {FOOTER_LINKS.map((link, i) => (
            <span key={link.path} style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {link.path.startsWith("http") ? (
                <a href={link.path} target="_blank" rel="noopener noreferrer"
                  className="footer-link"
                >{link.label}</a>
              ) : (
                <span
                  onClick={() => router.push(link.path)}
                  className="footer-link"
                >{link.label}</span>
              )}
              {i < FOOTER_LINKS.length - 1 && (
                <span style={{ color: "#c8c8c8" }}>|</span>
              )}
            </span>
          ))}
        </div>
        <div style={{ textAlign: "center", color: "#888888", fontSize: 12 }}>
          データソース: 国立国会図書館 / 衆議院 / 参議院 ｜ 収集期間: 2018年〜現在 ｜ 毎日午前3時に自動更新
        </div>
        <div style={{ textAlign: "center", color: "#c8c8c8", fontSize: 11, marginTop: 8 }}>
          © 2025 はたらく議員
        </div>
      </div>
    </footer>
  );
}
