"use client";

// 浮窗 Bay 视图右上角「展开」：去本站 `/bay` 页，带上当前看的那一条。
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { buildBaySearch } from "./bay-links";
import { bayStateSnapshot } from "./bay-state";

export function bayPageHref(): string {
  const { current } = bayStateSnapshot();
  return `/bay${buildBaySearch("", current.kind === "feed" ? null : current)}`;
}

export function useBayExpand(): () => void {
  const router = useRouter();
  return useCallback(() => {
    router.push(bayPageHref());
  }, [router]);
}
