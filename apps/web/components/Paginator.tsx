"use client";

export const PAGE_SIZE = 50;

interface Props {
  total: number;
  page: number;
  onPage: (p: number) => void;
}

export default function Paginator({ total, page, onPage }: Props) {
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

  return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 4, marginTop: 16, flexWrap: "wrap" }}>
      <button
        onClick={() => onPage(page - 1)} disabled={page === 1}
        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #dddddd",
          background: "none", cursor: page === 1 ? "default" : "pointer",
          color: page === 1 ? "#cccccc" : "#555555", fontSize: 13 }}>
        ‹
      </button>
      {pages.map((p, i) =>
        p === "…" ? (
          <span key={`ellipsis-${i}`} style={{ fontSize: 13, color: "#aaaaaa", padding: "0 4px" }}>…</span>
        ) : (
          <button key={p} onClick={() => onPage(p as number)}
            style={{ padding: "4px 10px", borderRadius: 6, fontSize: 13,
              border: p === page ? "1px solid #1a1a1a" : "1px solid #dddddd",
              background: p === page ? "#1a1a1a" : "none",
              color: p === page ? "#ffffff" : "#555555",
              cursor: "pointer", minWidth: 32 }}>
            {p}
          </button>
        )
      )}
      <button
        onClick={() => onPage(page + 1)} disabled={page === totalPages}
        style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid #dddddd",
          background: "none", cursor: page === totalPages ? "default" : "pointer",
          color: page === totalPages ? "#cccccc" : "#555555", fontSize: 13 }}>
        ›
      </button>
    </div>
  );
}
