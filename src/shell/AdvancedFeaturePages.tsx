"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  getAppSession,
  type AppSession,
} from "../lib/app-session";
import {
  resolveDatabaseItem,
  type AssetItem,
  type DatabaseItemSource,
  type WorkItem,
} from "../lib/database";
import { useUI } from "../i18n/ui/useUI";
import { AdvancedContentWorkbench } from "./AdvancedContentWorkbench";
import {
  advancedItemFromSession,
  advancedSnapshotFromSession,
} from "./advanced-session";
import {
  ADVANCED_FEATURES,
  advancedFeatureById,
  advancedFeatureForItem,
  advancedFeatureHref,
  parseAdvancedLibraryReference,
  recalledAdvancedLibraryItem,
  type AdvancedFeatureDefinition,
} from "./advanced-features";
import {
  normalizeArtifact,
  normalizeWork,
  type LibraryArtifactRow,
  type LibraryItem,
} from "./library-data";
import {
  platformToEntry,
  type PlatformAsset,
} from "./MaterialLibrary";
import { assetAsWork, MyLibrary } from "./MyLibrary";

function inferredSiteId(explicit?: string): string {
  if (explicit) return explicit;
  if (typeof window === "undefined") return "oceanleo";
  const host = window.location.hostname.toLowerCase();
  if (host === "oceanleo.com" || host === "www.oceanleo.com") {
    return "oceanleo";
  }
  const subdomain = host.endsWith(".oceanleo.com")
    ? host.slice(0, -".oceanleo.com".length)
    : "";
  return subdomain || "oceanleo";
}

function resolvedLibraryItem(
  source: DatabaseItemSource,
  raw: Record<string, unknown>,
): LibraryItem | null {
  if (source === "work") {
    const work = raw as unknown as WorkItem;
    return normalizeWork({
      ...work,
      meta: { ...(work.meta || {}), library_table: "work" },
    });
  }
  if (source === "asset") {
    return normalizeWork(assetAsWork(raw as unknown as AssetItem));
  }
  if (source === "artifact") {
    return normalizeArtifact(raw as unknown as LibraryArtifactRow);
  }
  return platformToEntry(raw as unknown as PlatformAsset).libraryItem || null;
}

function FeatureCard({
  feature,
}: {
  feature: AdvancedFeatureDefinition;
}) {
  const tt = useUI();
  return (
    <Link
      href={advancedFeatureHref(feature)}
      className="group relative overflow-hidden rounded-2xl border border-stone-200 bg-white p-5 transition hover:-translate-y-1 hover:border-stone-300 hover:shadow-lg"
    >
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: feature.accent }}
      />
      <div
        className="grid h-11 w-11 place-items-center rounded-2xl text-sm font-bold"
        style={{
          background: `${feature.accent}14`,
          color: feature.accent,
        }}
      >
        {feature.title.slice(0, 1)}
      </div>
      <p className="mt-5 text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
        {feature.eyebrow}
      </p>
      <h2 className="mt-1 text-[17px] font-semibold text-stone-900">
        {tt(feature.title)}
      </h2>
      <p className="mt-2 min-h-10 text-[12px] leading-relaxed text-stone-500">
        {tt(feature.description)}
      </p>
      <div className="mt-5 flex items-center justify-between border-t border-stone-100 pt-3">
        <span className="text-[10px] text-stone-400">{feature.examples}</span>
        <span
          className="text-[12px] font-semibold transition group-hover:translate-x-1"
          style={{ color: feature.accent }}
        >
          {tt("打开")} →
        </span>
      </div>
    </Link>
  );
}

export function AdvancedFeatureCatalog() {
  const tt = useUI();
  return (
    <main className="min-h-screen bg-stone-50/70 px-5 py-8 sm:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-600">
          Advanced features
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-stone-950">
          {tt("高级功能")}
        </h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-7 text-stone-500">
          {tt("独立于普通 App 的专业编辑空间。选择功能后可上传文件，或从跨站我的库继续已有内容。")}
        </p>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {ADVANCED_FEATURES.map((feature) => (
            <FeatureCard key={feature.id} feature={feature} />
          ))}
        </div>
      </div>
    </main>
  );
}

export interface AdvancedFeatureRouteProps {
  featureId?: string;
  siteId?: string;
  accent?: string;
}

export function AdvancedFeatureRoute({
  featureId,
  siteId,
  accent,
}: AdvancedFeatureRouteProps = {}) {
  const tt = useUI();
  const params = useParams<{ feature?: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const feature = advancedFeatureById(featureId || params?.feature);
  const assetReference = searchParams.get("asset") || "";
  const requestedSessionId = searchParams.get("session") || "";
  const runtimeSiteId = inferredSiteId(siteId);
  const [item, setItem] = useState<LibraryItem | null>(null);
  const [session, setSession] = useState<AppSession | null>(null);
  const [loading, setLoading] = useState(
    Boolean(assetReference || requestedSessionId),
  );
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    setLoading(Boolean(assetReference || requestedSessionId));
    setError("");
    setItem(null);
    setSession(null);
    if (!feature || (!assetReference && !requestedSessionId)) {
      setLoading(false);
      return () => {
        alive = false;
      };
    }
    void (async () => {
      if (requestedSessionId) {
        const result = await getAppSession(requestedSessionId, "advanced");
        if (!alive) return;
        const restored = advancedItemFromSession(result.data);
        const snapshot = advancedSnapshotFromSession(result.data);
        if (!result.ok || !result.data || !restored || !snapshot) {
          setError(
            result.status === 401
              ? tt("登录后即可打开这条高级功能任务。")
              : result.error || tt("高级功能任务不存在或已经删除。"),
          );
          setLoading(false);
          return;
        }
        const restoredFeature = advancedFeatureById(snapshot.feature_id);
        if (!restoredFeature) {
          setError(tt("这条任务没有可恢复的高级功能。"));
          setLoading(false);
          return;
        }
        if (restoredFeature.id !== feature.id) {
          router.replace(
            advancedFeatureHref(restoredFeature, {
              sessionId: requestedSessionId,
            }),
          );
          return;
        }
        setSession(result.data);
        setItem(restored);
        setLoading(false);
        return;
      }

      const recalled = recalledAdvancedLibraryItem(assetReference);
      const reference = parseAdvancedLibraryReference(assetReference);
      if (!reference) {
        setError(tt("文件链接无效，请从我的库重新打开。"));
        setLoading(false);
        return;
      }
      let resolved = recalled;
      if (reference.source !== "local") {
        const result = await resolveDatabaseItem(
          reference.source,
          reference.id,
        );
        if (result.ok && result.data?.item) {
          resolved = resolvedLibraryItem(
            result.data.source,
            result.data.item,
          );
        } else if (!resolved) {
          setError(
            result.status === 401
              ? tt("登录后即可打开这个文件。")
              : result.error || tt("文件不存在或已经删除。"),
          );
        }
      }
      if (!alive) return;
      if (!resolved) {
        setError((current) => current || tt("无法恢复这个文件，请从我的库重新打开。"));
        setLoading(false);
        return;
      }
      const resolvedFeature = advancedFeatureForItem(resolved);
      if (!resolvedFeature) {
        setError(tt("这个文件目前没有可安全保存的高级编辑器。"));
        setLoading(false);
        return;
      }
      if (resolvedFeature.id !== feature.id) {
        router.replace(advancedFeatureHref(resolvedFeature, { item: resolved }));
        return;
      }
      setItem(resolved);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [
    assetReference,
    feature,
    requestedSessionId,
    router,
    tt,
  ]);

  const itemFilter = useMemo(
    () => (candidate: LibraryItem) =>
      advancedFeatureForItem(candidate)?.id === feature?.id,
    [feature?.id],
  );

  if (!feature) {
    return (
      <main className="grid min-h-screen place-items-center bg-stone-50 p-8 text-center">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">
            {tt("高级功能不存在")}
          </h1>
          <Link
            href="/advanced"
            className="mt-4 inline-block text-sm font-semibold text-sky-600"
          >
            ← {tt("返回高级功能")}
          </Link>
        </div>
      </main>
    );
  }

  if (item) {
    return (
      <AdvancedContentWorkbench
        item={item}
        siteId={session?.site_id || runtimeSiteId}
        accent={accent || feature.accent}
        sessionId={session?.id || null}
        initialSession={session}
        mode={session ? "history" : "workspace"}
        onClose={() => router.push("/advanced")}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col bg-stone-50/70">
      <header className="shrink-0 border-b border-stone-200 bg-white px-5 py-5 sm:px-8">
        <div className="mx-auto flex max-w-6xl items-center gap-4">
          <Link
            href="/advanced"
            className="grid h-9 w-9 place-items-center rounded-xl border border-stone-200 text-stone-500 transition hover:bg-stone-50"
            aria-label={tt("返回高级功能")}
          >
            ←
          </Link>
          <div
            className="h-10 w-1 rounded-full"
            style={{ background: feature.accent }}
          />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-stone-400">
              {feature.eyebrow}
            </p>
            <h1 className="truncate text-xl font-semibold text-stone-900">
              {tt(feature.title)}
            </h1>
          </div>
          <span className="hidden text-[11px] text-stone-400 sm:block">
            {feature.examples}
          </span>
        </div>
      </header>
      {error && (
        <div className="mx-auto mt-4 w-[calc(100%-2rem)] max-w-6xl rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12px] text-amber-700">
          {error}
        </div>
      )}
      {loading ? (
        <div className="grid min-h-[55vh] flex-1 place-items-center text-[13px] text-stone-400">
          {tt("正在打开高级功能…")}
        </div>
      ) : (
        <div className="mx-auto flex min-h-[620px] w-full max-w-6xl flex-1 p-4 sm:p-6">
          <div className="min-h-0 w-full overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <MyLibrary
              siteId={runtimeSiteId}
              accent={accent || feature.accent}
              itemFilter={itemFilter}
              onOpenItem={(nextItem) =>
                router.push(advancedFeatureHref(feature, { item: nextItem }))
              }
            />
          </div>
        </div>
      )}
    </main>
  );
}
