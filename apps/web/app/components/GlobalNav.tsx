"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "議員一覧",     path: "/members" },
  { label: "内閣",         path: "/cabinet" },
  { label: "政党",         path: "/parties" },
  { label: "委員会",       path: "/committees" },
  { label: "法案",         path: "/bills" },
  { label: "質問主意書",   path: "/questions" },
  { label: "請願",         path: "/petitions" },
  { label: "採決",         path: "/votes" },
  { label: "前議員",       path: "/members/former" },
  { label: "⭐ My議員", path: "/favorites" },
];

export default function GlobalNav() {
  const router   = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const navigate = (path: string) => {
    router.push(path);
    setOpen(false);
  };

  return (
    <header className="global-header">
      <div style={{
        height: 60, display: "flex", alignItems: "center",
        padding: "0 16px", justifyContent: "space-between",
        maxWidth: 960, margin: "0 auto", width: "100%",
      }}>
        {/* ロゴ */}
        <div onClick={() => navigate("/")}
          style={{ cursor: "pointer", flexShrink: 0 }}>
          <img src="/logo-nav.svg" alt="はたらく議員" style={{ height: 28 }} />
        </div>

        {/* PC: ナビリンク */}
        <nav style={{ display: "flex", gap: 4, marginLeft: 24 }}
          className="hidden-mobile">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path ||
              (item.path !== "/" && item.path !== "/members" && pathname.startsWith(item.path));
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                style={{
                  background: isActive ? "#e0e0e0" : "transparent",
                  border: "none", color: isActive ? "#111111" : "#555555",
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                  fontSize: 14, fontWeight: isActive ? 700 : 400, transition: "all 0.15s",
                }}>
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* SP: ハンバーガー */}
        <button onClick={() => setOpen(!open)}
          className="show-mobile"
          style={{
            display: "none", background: "none", border: "none",
            color: "#888888", fontSize: 24, cursor: "pointer", padding: 8,
          }}>
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* SP: ドロワーメニュー */}
      {open && (
        <nav style={{
          background: "#f8f8f8", borderTop: "1px solid #e0e0e0",
          padding: "8px 0",
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path ||
              (item.path !== "/" && item.path !== "/members" && pathname.startsWith(item.path));
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: isActive ? "#e0e0e0" : "transparent",
                  border: "none", color: isActive ? "#111111" : "#888888",
                  padding: "12px 24px", cursor: "pointer",
                  fontSize: 15, fontWeight: isActive ? 700 : 400,
                }}>
                {item.label}
              </button>
            );
          })}
        </nav>
      )}
    </header>
  );
}
