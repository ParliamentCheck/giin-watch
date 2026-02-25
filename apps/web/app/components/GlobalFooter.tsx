"use client";

import { useRouter } from "next/navigation";

export default function GlobalFooter() {
  const router = useRouter();

  return (
    <footer style={{
      background: "#0a0f1e",
      borderTop: "1px solid #1e293b",
      padding: "24px",
      color: "#475569",
      fontSize: 13,
    }}>
      <div style={{ maxWidth: 900, margin: "0 auto",
        display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <span>データソース: 国立国会図書館 / 衆議院 / 参議院 ｜ 毎日午前3時に自動更新</span>
        <span
          onClick={() => router.push("/disclaimer")}
          style={{ color: "#64748b", cursor: "pointer", textDecoration: "underline" }}
          onMouseEnter={(e) => { e.currentTarget.style.color = "#94a3b8"; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = "#64748b"; }}
        >
          免責事項・データについて
        </span>
      </div>
    </footer>
  );
}
