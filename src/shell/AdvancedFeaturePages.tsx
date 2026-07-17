"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useUI } from "../i18n/ui/useUI";

function RetiredAdvancedSurface() {
  const tt = useUI();
  const router = useRouter();
  useEffect(() => {
    router.replace("/");
  }, [router]);
  return (
    <main className="grid min-h-[50vh] place-items-center bg-[var(--surface,#fafaf9)] text-sm text-[var(--muted,#78716c)]">
      {tt("高级编辑已融入 App 的生成与库，正在返回工作台…")}
    </main>
  );
}

/** Compatibility export for consumer sites while their old route redirects. */
export function AdvancedFeatureCatalog() {
  return <RetiredAdvancedSurface />;
}

export interface AdvancedFeatureRouteProps {
  featureId?: string;
  siteId?: string;
  accent?: string;
}

/** Compatibility export for `/advanced/*`; no standalone editor is mounted. */
export function AdvancedFeatureRoute(
  _props: AdvancedFeatureRouteProps = {},
) {
  return <RetiredAdvancedSurface />;
}
