"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

export function usePagination(paramName = "page") {
  const searchParams = useSearchParams();
  const router      = useRouter();
  const pathname    = usePathname();

  const page = Number(searchParams.get(paramName) || "1");

  const setPage = (n: number) => {
    const p = new URLSearchParams(searchParams.toString());
    if (n > 1) p.set(paramName, String(n)); else p.delete(paramName);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  const clearPage = () => {
    const p = new URLSearchParams(searchParams.toString());
    p.delete(paramName);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  };

  return { page, setPage, clearPage };
}
