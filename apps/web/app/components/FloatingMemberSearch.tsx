"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";

const DEMO_TEXT = "現職議員を入力";
const DEMO_DELAY = 600;      // 展開開始まで（ms）
const DEMO_TYPE_MS = 100;    // 1文字あたり（ms）
const DEMO_HOLD_MS = 900;    // 全文字表示後の保持（ms）
const DEMO_CLOSE_MS = 300;   // 消去後・閉じるまで（ms）

export default function FloatingMemberSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [demoText, setDemoText] = useState("");
  const [isDemo, setIsDemo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const timerRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // トップページのみデモアニメーション
  useEffect(() => {
    if (pathname !== "/") return;

    const timers = timerRef.current;

    const start = setTimeout(() => {
      setIsDemo(true);
      setOpen(true);

      // 展開アニメ(300ms)後すぐタイプ開始
      const TYPE_START = 300;
      [...DEMO_TEXT].forEach((_, i) => {
        const t = setTimeout(() => {
          setDemoText(DEMO_TEXT.slice(0, i + 1));
        }, TYPE_START + i * DEMO_TYPE_MS);
        timers.push(t);
      });

      // 全文字後に保持 → 消去 → 閉じる
      const totalType = TYPE_START + DEMO_TEXT.length * DEMO_TYPE_MS;
      const clear = setTimeout(() => {
        setDemoText("");
      }, totalType + DEMO_HOLD_MS);
      timers.push(clear);

      const close = setTimeout(() => {
        setOpen(false);
        setIsDemo(false);
      }, totalType + DEMO_HOLD_MS + DEMO_CLOSE_MS);
      timers.push(close);
    }, DEMO_DELAY);

    timers.push(start);
    return () => timers.forEach(clearTimeout);
  }, [pathname]);

  // ユーザー操作でデモをキャンセル
  function cancelDemo() {
    timerRef.current.forEach(clearTimeout);
    timerRef.current = [];
    setIsDemo(false);
    setDemoText("");
  }

  useEffect(() => {
    if (open && !isDemo) inputRef.current?.focus();
  }, [open, isDemo]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { cancelDemo(); setOpen(false); }
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

  function handleOpen() {
    cancelDemo();
    setOpen(true);
  }

  function handleClose(e: React.MouseEvent) {
    e.preventDefault();
    cancelDemo();
    setOpen(false);
    setQuery("");
  }

  // デモ中の表示文字列（inputのplaceholderとして表示）
  const displayPlaceholder = isDemo ? "" : "現職議員を入力…";
  const displayValue = isDemo ? demoText : query;

  return (
    <div className="fixed bottom-6 right-6 z-50 sm:bottom-6">
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
            value={displayValue}
            onChange={(e) => { if (!isDemo) setQuery(e.target.value); }}
            onFocus={() => { if (isDemo) cancelDemo(); }}
            placeholder={displayPlaceholder}
            readOnly={isDemo}
            className="w-full text-sm text-white placeholder-neutral-400 bg-transparent outline-none pl-4 pr-1"
          />
        </div>

        {/* ボタン（右側・常時表示） */}
        <button
          type={open && !isDemo ? "submit" : "button"}
          onClick={open ? undefined : handleOpen}
          className="w-12 h-12 shrink-0 flex items-center justify-center text-white hover:text-neutral-300 transition-colors"
          aria-label="議員を検索"
        >
          {open ? (
            <span onClick={handleClose} className="text-lg leading-none cursor-pointer">×</span>
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
