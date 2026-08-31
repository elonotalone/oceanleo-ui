"use client";

import { useEffect } from "react";
import { SkeletonCard, SkeletonLine } from "../../ui";
import { useUI } from "../../i18n/ui/useUI";

/** Skeleton layouts for route `loading.tsx` — shapes approximate real pages, not spinners. */
export type RouteSkeletonVariant =
  | "home"
  | "list"
  | "workspace"
  | "grid"
  | "settings";

export function RoutePageSkeleton({
  variant = "list",
}: {
  variant?: RouteSkeletonVariant;
}) {
  if (variant === "home") {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-6 py-10">
        <SkeletonLine className="h-8 w-48" />
        <SkeletonCard className="h-40" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "workspace") {
    return (
      <div className="flex h-[calc(100vh-4rem)] gap-4 px-6 py-6">
        <div className="w-64 shrink-0 space-y-2">
          {Array.from({ length: 5 }, (_, i) => (
            <SkeletonLine key={i} className="h-10" />
          ))}
        </div>
        <SkeletonCard className="min-h-0 flex-1" />
      </div>
    );
  }

  if (variant === "grid") {
    return (
      <div className="space-y-4 px-6 py-8">
        <SkeletonLine className="h-7 w-40" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonCard key={i} className="h-36" />
          ))}
        </div>
      </div>
    );
  }

  if (variant === "settings") {
    return (
      <div className="mx-auto max-w-2xl space-y-6 px-6 py-10">
        <SkeletonLine className="h-7 w-32" />
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2 rounded-xl border border-neutral-200 p-4">
            <SkeletonLine className="h-4 w-24" />
            <SkeletonLine className="h-10 w-full" />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-3 px-6 py-8">
      <SkeletonLine className="h-7 w-44" />
      {Array.from({ length: 8 }, (_, i) => (
        <SkeletonLine key={i} className="h-12" />
      ))}
    </div>
  );
}

/** Shared segment error UI for portal `error.tsx` boundaries. */
export function RouteSegmentError({
  error,
  reset,
  hint,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  hint?: string;
}) {
  const tt = useUI();
  useEffect(() => {
    console.error("[route] render error:", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 p-6 text-center">
        <h1 className="text-lg font-semibold text-neutral-900">
          {tt("页面暂时无法加载")}
        </h1>
        <p className="mt-2 text-sm text-neutral-600">
          {hint ?? tt("请稍后重试。")}
        </p>
        <button
          type="button"
          onClick={() => reset()}
          className="mt-5 inline-flex rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
        >
          {tt("重新加载")}
        </button>
      </div>
    </div>
  );
}
