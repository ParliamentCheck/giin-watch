"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";

export default function FloatingMemberSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    router.push(`/members?q=${encodeURIComponent(q)}`);
    setOpen(false);
    setQuery("");
  }

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <form
        onSubmit={handleSubmit}
        className="flex items-center justify-end bg-neutral-900 rounded-full shadow-lg overflow-hidden transition-all duration-300 ease-in-out"
        style={{ width: open ? "260px" : "48px", height: "48px" }}
      >
        {/* 入力エリア（左側） */}
        <div
          className="flex items-center transition-all duration-300 ease-in-out overflow-hidden"
          style={{ width: open ? "calc(100% - 48px)" : "0px", opacity: open ? 1 : 0 }}
        >
          <input
            ref={inputRef}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="議員名を入力…"
            className="w-full text-sm text-white placeholder-neutral-400 bg-transparent outline-none pl-4 pr-1"
          />
        </div>

        {/* ボタン（右側・常時表示） */}
        <button
          type={open ? "submit" : "button"}
          onClick={open ? undefined : () => setOpen(true)}
          className="w-12 h-12 shrink-0 flex items-center justify-center text-white hover:text-neutral-300 transition-colors"
          aria-label="議員を検索"
        >
          {open ? (
            <span
              onClick={(e) => { e.preventDefault(); setOpen(false); setQuery(""); }}
              className="text-lg leading-none cursor-pointer"
            >×</span>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="7" />
              <line x1="16.5" y1="16.5" x2="22" y2="22" />
            </svg>
          )}
        </button>
      </form>
    </div>
  );
}
