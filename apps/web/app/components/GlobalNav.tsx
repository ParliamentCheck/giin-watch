"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

const NAV_ITEMS = [
  { label: "トップ",       path: "/" },
  { label: "議員一覧",     path: "/members" },
  { label: "内閣",         path: "/cabinet" },
  { label: "政党・会派",   path: "/parties" },
  { label: "委員会別",     path: "/committees" },
  { label: "議員立法",     path: "/bills" },
  { label: "採決",         path: "/votes" },
  { label: "前議員",       path: "/members/former" },
  { label: "⭐ お気に入り", path: "/favorites" },
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
    <nav style={{
      position: "sticky", top: 0, zIndex: 100,
      background: "#0f0f0f",
      borderBottom: "1px solid #1e1e1e",
    }}>
      <div style={{
        height: 60, display: "flex", alignItems: "center",
        padding: "0 16px", justifyContent: "space-between",
      }}>
        {/* ロゴ */}
        <div onClick={() => navigate("/")}
          style={{ cursor: "pointer", flexShrink: 0 }}>
          <img src="/logo-nav.svg" alt="はたらく議員" style={{ height: 28 }} />
        </div>

        {/* PC: ナビリンク */}
        <div style={{ display: "flex", gap: 4, flex: 1, marginLeft: 24 }}
          className="hidden-mobile">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path ||
              (item.path !== "/" && item.path !== "/members" && pathname.startsWith(item.path));
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                style={{
                  background: isActive ? "#1e1e1e" : "transparent",
                  border: "none", color: isActive ? "#f0f0f0" : "#777777",
                  padding: "8px 14px", borderRadius: 8, cursor: "pointer",
                  fontSize: 14, fontWeight: isActive ? 700 : 400, transition: "all 0.15s",
                }}>
                {item.label}
              </button>
            );
          })}
        </div>

        {/* SP: ハンバーガー */}
        <button onClick={() => setOpen(!open)}
          className="show-mobile"
          style={{
            display: "none", background: "none", border: "none",
            color: "#999999", fontSize: 24, cursor: "pointer", padding: 8,
          }}>
          {open ? "✕" : "☰"}
        </button>
      </div>

      {/* SP: ドロワーメニュー */}
      {open && (
        <div style={{
          background: "#0f0f0f", borderTop: "1px solid #1e1e1e",
          padding: "8px 0",
        }}>
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.path ||
              (item.path !== "/" && item.path !== "/members" && pathname.startsWith(item.path));
            return (
              <button key={item.path} onClick={() => navigate(item.path)}
                style={{
                  display: "block", width: "100%", textAlign: "left",
                  background: isActive ? "#1e1e1e" : "transparent",
                  border: "none", color: isActive ? "#f0f0f0" : "#999999",
                  padding: "12px 24px", cursor: "pointer",
                  fontSize: 15, fontWeight: isActive ? 700 : 400,
                }}>
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </nav>
  );
}
