"use client";

import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "トップ",       path: "/" },
  { label: "議員一覧",     path: "/members" },
  { label: "ランキング",   path: "/ranking" },
  { label: "政党・会派",   path: "/parties" },
  { label: "委員会別",     path: "/committees" },
];

export default function GlobalNav() {
  const router   = useRouter();
  const pathname = usePathname();

  return (
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "#0a0f1e",
      borderBottom: "1px solid #1e293b",
      height: 60,
      display: "flex", alignItems: "center",
      padding: "0 24px",
      gap: 8,
    }}>
      {/* ロゴ */}
      <div
        onClick={() => router.push("/")}
        style={{ fontWeight: 900, fontSize: 16, color: "#3b82f6",
          cursor: "pointer", marginRight: 24, letterSpacing: 1, flexShrink: 0 }}>
        🔍 議員ウォッチ
      </div>

      {/* ナビリンク */}
      <div style={{ display: "flex", gap: 4, flex: 1 }}>
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.path ||
            (item.path !== "/" && pathname.startsWith(item.path));
          return (
            <button
              key={item.path}
              onClick={() => router.push(item.path)}
              style={{
                background:   isActive ? "#1e293b" : "transparent",
                border:       "none",
                color:        isActive ? "#f1f5f9" : "#64748b",
                padding:      "8px 14px",
                borderRadius: 8,
                cursor:       "pointer",
                fontSize:     14,
                fontWeight:   isActive ? 700 : 400,
                transition:   "all 0.15s",
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.color = "#94a3b8";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.color = "#64748b";
              }}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
}
