"use client";

const SHOW_BANNER = false; // ← ここを true にすると表示される
const BANNER_TEXT = "現在データ更新中です。一部のデータが正しく表示されない場合があります。";

export default function MaintenanceBanner() {
  if (!SHOW_BANNER) return null;
  return (
    <div style={{
      background: "#f59e0b",
      color: "#1a1a1a",
      textAlign: "center",
      padding: "10px 16px",
      fontSize: 13,
      fontWeight: 700,
      position: "sticky",
      top: 0,
      zIndex: 1000,
    }}>
      ⚠️ {BANNER_TEXT}
    </div>
  );
}
