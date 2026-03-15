"use client";

export const PAGE_SIZE = 50;

interface Props {
  total: number;
  page: number;
  onPage: (p: number) => void;
  variant?: "top" | "bottom";
}

export default function Paginator({ total, page, onPage, variant = "top" }: Props) {
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) return null;

  const pages: (number | "…")[] = [];
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || Math.abs(i - page) <= 1) {
      pages.push(i);
    } else if (pages[pages.length - 1] !== "…") {
      pages.push("…");
    }
  }

  if (variant === "bottom") {
    return (
      <div style={{ display: "flex", justifyContent: "center", alignItems: "center",
        gap: 4, padding: "16px 0" }}>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          style={{
            minWidth: 32, minHeight: 32, padding: "0 8px",
            background: page === 1 ? "#f4f4f4" : "#ffffff",
            border: "1px solid #dddddd", borderRadius: 8,
            color: page === 1 ? "#cccccc" : "#333333",
            fontSize: 13, cursor: page === 1 ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          ‹
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`e${i}`} style={{ minWidth: 16, minHeight: 32,
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 12, color: "#aaaaaa" }}>…</span>
          ) : (
            <button key={p} onClick={() => onPage(p as number)}
              style={{
                minWidth: 32, minHeight: 32, padding: "0 4px",
                background: p === page ? "#1a1a1a" : "#ffffff",
                border: `1px solid ${p === page ? "#1a1a1a" : "#dddddd"}`,
                borderRadius: 8,
                color: p === page ? "#ffffff" : "#333333",
                fontSize: 12, fontWeight: p === page ? 700 : 400,
                cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onPage(page + 1)}
          disabled={page === totalPages}
          style={{
            minWidth: 32, minHeight: 32, padding: "0 8px",
            background: page === totalPages ? "#f4f4f4" : "#ffffff",
            border: "1px solid #dddddd", borderRadius: 8,
            color: page === totalPages ? "#cccccc" : "#333333",
            fontSize: 13, cursor: page === totalPages ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
          ›
        </button>
      </div>
    );
  }

  // variant="top": 右寄せ・最小スタイル
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 2, marginLeft: "auto" }}>
      <button onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{ background: "none", border: "none", cursor: page === 1 ? "default" : "pointer",
          color: page === 1 ? "#cccccc" : "#555555", fontSize: 13, padding: "0 4px" }}>
        ‹
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`e${i}`} style={{ fontSize: 12, color: "#aaaaaa", padding: "0 2px" }}>…</span>
        ) : (
          <button key={p} onClick={() => onPage(p as number)}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12,
              color: p === page ? "#1a1a1a" : "#888888",
              fontWeight: p === page ? 800 : 400, padding: "0 4px" }}>
            {p}
          </button>
        )
      )}
      <button onClick={() => onPage(page + 1)} disabled={page === totalPages}
        style={{ background: "none", border: "none", cursor: page === totalPages ? "default" : "pointer",
          color: page === totalPages ? "#cccccc" : "#555555", fontSize: 13, padding: "0 4px" }}>
        ›
      </button>
    </span>
  );
}
