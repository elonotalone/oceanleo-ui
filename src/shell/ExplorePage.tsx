"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  canonicalArtifactContextId,
  type ArtifactType,
} from "./artifact-contract";
import type { LibraryItem } from "./library-data";
import { MaterialLibrary } from "./MaterialLibrary";
import {
  materialTypesCsv,
  materialTypesFromCsv,
  type MaterialLibraryLevel,
} from "./material-library-controller";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkbenchMaterialActionAvailability } from "./workbench-material-registry";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

/** Compatibility vocabulary used by existing site Explore configs. */
export type ExploreAssetType =
  | "image"
  | "vector"
  | "video"
  | "audio"
  | "music"
  | "3d"
  | "ppt"
  | "sticker"
  | "font"
  | "chart"
  /**
   * Long-form deliverables (word / paper / novel / law / med / resume /
   * notebook …). Without it those sites had to mislabel documents as `image`,
   * or ride on `font`, which only maps to `document` by accident.
   */
  | "document";

export interface ExploreCategory {
  key: string;
  label: string;
  subtab?: string;
}

export interface ExploreConfig {
  /**
   * Legacy single default. Optional since `types` supersedes it; the 36 sites
   * that still pass only this keep working unchanged.
   */
  type?: ExploreAssetType;
  /**
   * Multi-select default for the type chips. Sites still on the single `type`
   * keep working unchanged; when both are absent the shelf shows every type.
   */
  types?: ExploreAssetType[];
  /**
   * Retained for source compatibility. Rich-v1 discovery uses the canonical
   * 13-type taxonomy; legacy marketing categories never grant visibility.
   */
  categories?: ExploreCategory[];
  title?: string;
  subtitle?: string;
  emptyHint?: string;
}

export interface ExplorePageProps {
  config: ExploreConfig;
  accent?: string;
  className?: string;
  /**
   * Canonical site key from `scripts/oceanleo-sites.tsv` (`image`, `word`, …).
   * 本站素材 cannot exist without it — see `siteId` for the legacy spelling.
   */
  siteKey?: string;
  /** @deprecated Legacy spelling of `siteKey`; still honoured. */
  siteId?: string;
  /** Anchors 此 app; `?app=` in the URL wins over this prop. */
  appId?: string;
  onOpenItem?: (item: LibraryItem) => void;
  materialActions?: readonly WorkbenchMaterialAction[];
  onMaterialAction?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  materialActionEvidence?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => WorkbenchMaterialActionAvailability;
  onMaterialDragStart?: (item: LibraryItem) => void;
  onMaterialDragEnd?: () => void;
}

const EXPLORE_ARTIFACT_TYPE: Record<ExploreAssetType, ArtifactType> = {
  image: "single_file_image",
  vector: "vector_image",
  video: "video",
  audio: "audio",
  music: "audio",
  "3d": "model_3d",
  ppt: "deck",
  sticker: "vector_image",
  font: "document",
  chart: "chart",
  document: "document",
};

function configuredTypes(config: ExploreConfig): ArtifactType[] {
  const requested = config.types?.length
    ? config.types
    : config.type
      ? [config.type]
      : [];
  const types = requested
    .map((value) => EXPLORE_ARTIFACT_TYPE[value])
    .filter(Boolean);
  return [...new Set(types)];
}

const warnedMissingSiteKey = new Set<string>();

/**
 * 本站素材 is only truthful when the page actually hands us a site key: without
 * one the controller cannot send `originSiteKey` and the shelf silently serves
 * a whole-platform search under a 「本站素材」 heading. A wrong label that never
 * complains is worse than a missing section, so the section is withheld and
 * the miswiring is reported instead.
 */
export function resetExploreSiteKeyWarnings(): void {
  warnedMissingSiteKey.clear();
}

function reportMissingSiteKey(appId: string): void {
  const key = appId || "*";
  if (warnedMissingSiteKey.has(key)) return;
  warnedMissingSiteKey.add(key);
  if (typeof console === "undefined") return;
  console.error(
    "[ExplorePage] 缺少 siteKey：本站素材/此 app 两层已停用，只保留「更多素材」。" +
      "请给 <ExplorePage siteKey=\"<sites.tsv 的站点 key>\" /> 传值" +
      "（合同 §0.6 / §8.2）。",
  );
}

/**
 * Site discovery is a thin presentation of the same rich-v1 public library the
 * workbench uses, scoped by 合同 §0.6:
 *
 *   /explore              → 本站素材 ｜ 更多素材
 *   /explore?app=<appId>  → 此 app ｜ 本站素材 ｜ 更多素材
 *
 * It never renders legacy raw asset URLs.
 */
export function ExplorePage({
  config,
  accent = "#4f46e5",
  className = "",
  siteKey = "",
  siteId = "",
  appId = "",
  onOpenItem,
  materialActions = [],
  onMaterialAction,
  materialActionEvidence,
  onMaterialDragStart,
  onMaterialDragEnd,
}: ExplorePageProps) {
  const tt = useUI();
  const [action, setAction] = useState<WorkspaceActionEnvelope | null>(null);
  // `?app=` is produced by `exploreAppHref(appId)` (合同 §3.1).
  const [anchoredApp, setAnchoredApp] = useState(appId);
  const [types, setTypes] = useState<ArtifactType[]>(() =>
    configuredTypes(config),
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const artifactId = params.get("artifactId")?.trim() || "";
    const revisionId = params.get("revisionId")?.trim() || "";
    const query = params.get("q")?.trim() || "";
    const app = params.get("app")?.trim() || "";
    const urlTypes = materialTypesFromCsv(params.get("types") || "");
    if (app) setAnchoredApp(app);
    if (urlTypes.length > 0) setTypes(urlTypes);
    setAction({
      nonce: `explore:${artifactId}:${revisionId}:${query}`,
      action: {
        version: 1,
        tab: "materials",
        query,
        itemId:
          artifactId && revisionId
            ? `artifact:${artifactId}:${revisionId}`
            : undefined,
      },
    });
  }, []);

  // Chip state survives a refresh; the app anchor stays whatever brought the
  // reader here.
  const syncTypesToUrl = useCallback((next: ArtifactType[]) => {
    setTypes(next);
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    const csv = materialTypesCsv(next);
    if (csv) url.searchParams.set("types", csv);
    else url.searchParams.delete("types");
    window.history.replaceState(null, "", url.toString());
  }, []);

  const exploreAppId = anchoredApp.trim();
  const resolvedSiteKey = (siteKey || siteId).trim();
  const scopeReady = Boolean(resolvedSiteKey);
  const levels = useMemo<MaterialLibraryLevel[]>(() => {
    if (!scopeReady) return ["more"];
    return exploreAppId ? ["primary", "site", "more"] : ["site", "more"];
  }, [exploreAppId, scopeReady]);
  const initialLevel: MaterialLibraryLevel = !scopeReady
    ? "more"
    : exploreAppId
      ? "primary"
      : "site";
  // Reported during render, not in an effect: these pages are server-rendered,
  // and a miswired site has to name itself in the SSR log too. The module-level
  // dedup keeps it to one line per app.
  if (!scopeReady) reportMissingSiteKey(exploreAppId);

  const primaryAction = useMemo(
    () =>
      materialActions.includes("insert")
        ? "insert"
        : materialActions[0],
    [materialActions],
  );

  return (
    <main
      className={`mx-auto flex min-h-0 w-full max-w-6xl flex-col px-6 py-7 ${className}`}
    >
      <header className="mb-4 shrink-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--fg,#171717)]">
          {tt(config.title || "探索 · 素材")}
        </h1>
        {config.subtitle && (
          <p className="mt-1 text-[13px] text-[var(--muted,#737373)]">
            {tt(config.subtitle)}
          </p>
        )}
        {!scopeReady &&
          typeof process !== "undefined" &&
          process.env.NODE_ENV !== "production" && (
            <p
              role="alert"
              data-explore-missing-site-key="true"
              className="mt-2 rounded-lg bg-amber-500/10 px-3 py-2 text-[12px] text-amber-700"
            >
              {tt(
                "开发提示：<ExplorePage> 没有拿到 siteKey，「本站素材」与「此 app」两层已停用。",
              )}
            </p>
          )}
      </header>
      <section
        className="min-h-[20rem] flex-1 overflow-hidden rounded-2xl border border-[var(--border,#e5e5e5)] bg-[var(--card,#fff)]"
        aria-label={tt("授权公共素材库")}
      >
        <MaterialLibrary
          materials={[]}
          accent={accent}
          action={action}
          siteId={resolvedSiteKey}
          appId={exploreAppId}
          contextId={canonicalArtifactContextId(
            resolvedSiteKey,
            exploreAppId,
          )}
          levels={levels}
          initialLevel={initialLevel}
          fetchPrimary={scopeReady && Boolean(exploreAppId)}
          fetchMore
          types={types}
          onTypesChange={syncTypesToUrl}
          hideSeeAll
          emptyHint={
            config.emptyHint ||
            "当前 taxonomy 暂无经授权的公共素材。"
          }
          onOpenItem={onOpenItem}
          materialActions={materialActions}
          onMaterialAction={onMaterialAction}
          materialActionEvidence={materialActionEvidence}
          primaryMaterialAction={primaryAction}
          draggableMaterials={Boolean(
            primaryAction && onMaterialDragStart,
          )}
          onMaterialDragStart={onMaterialDragStart}
          onMaterialDragEnd={onMaterialDragEnd}
        />
      </section>
    </main>
  );
}

const EXPLORE_CATEGORY_LABELS: Record<string, string> = {
  food: "美食",
  background: "背景",
  city: "城市",
  business: "商务",
  transport: "交通",
  abstract: "抽象",
  nature: "自然",
  travel: "旅行",
  tech: "科技",
  realestate: "房产",
  beauty: "美妆",
  wedding: "婚礼",
  ecommerce: "电商",
  festival: "节日",
  finance: "金融",
  medical: "医疗",
  pet: "宠物",
  fashion: "服饰",
  fitness: "健身",
  education: "教育",
  office: "办公",
  gaming: "电竞",
  music: "音乐现场",
  kids: "儿童",
  chart: "图表",
  icon: "icon 图标",
  "flat-illust": "扁平插画",
  symbol: "符号",
  shape: "形状",
  ornament: "装饰花纹",
  model: "3D 模型",
  hdri: "HDRI 环境",
  texture: "材质纹理",
  smoke: "烟雾",
  particles: "粒子",
  light: "光效",
  water: "水",
  clouds: "云朵",
  flowers: "花卉",
  emoji: "emoji 贴纸",
  hot: "热门",
  xhs: "小红书",
  guofeng: "国风水墨",
  "art-text": "艺术字",
};

export function exploreCategoryLabel(key: string): string {
  const normalized = (key || "").trim();
  if (EXPLORE_CATEGORY_LABELS[normalized]) {
    return EXPLORE_CATEGORY_LABELS[normalized];
  }
  const stripped = normalized.replace(/^(ind|bg|ph|vid|mus|sfx)-/, "");
  return EXPLORE_CATEGORY_LABELS[stripped] || stripped;
}

export function exploreEmptyIcon(): ReactNode {
  return (
    <svg
      className="h-10 w-10 text-neutral-300"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <circle cx="8.5" cy="9.5" r="1.8" />
      <path
        d="M4 17l5-5 4 4 3-3 4 4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
