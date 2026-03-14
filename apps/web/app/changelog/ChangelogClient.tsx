import changelog from "../../lib/changelog";

export default function ChangelogClient() {
  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f4", color: "#1a1a1a",
      fontFamily: "'Hiragino Kaku Gothic ProN', sans-serif", padding: "24px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>

        <div className="card-xl" style={{ marginBottom: 16 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, margin: 0, color: "#111111" }}>📋 変更履歴</h1>
        </div>

        <div className="card-xl" style={{ fontSize: 13, color: "#888888", lineHeight: 2 }}>
          {changelog.map((entry, i) => (
            <div key={i} style={{
              paddingBottom: i < changelog.length - 1 ? 20 : 0,
              marginBottom: i < changelog.length - 1 ? 20 : 0,
              borderBottom: i < changelog.length - 1 ? "1px solid #e0e0e0" : "none",
            }}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: entry.description ? 6 : 0 }}>
                <span style={{ fontSize: 12, color: "#aaaaaa", flexShrink: 0 }}>{entry.date}</span>
                <span style={{ fontWeight: 700, color: "#1a1a1a" }}>{entry.title}</span>
              </div>
              {entry.description && (
                <p style={{ margin: 0, paddingLeft: 0, color: "#888888", lineHeight: 1.8 }}>
                  {entry.description}
                </p>
              )}
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
