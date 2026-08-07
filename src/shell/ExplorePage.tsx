"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useUI } from "../i18n/ui/useUI";
import {
  canonicalArtifactContextId,
  type ArtifactType,
} from "./artifact-contract";
import {
  EXPLORE_ARTIFACT_CLASS_ORDER,
  type ExploreArtifactClass,
} from "./explore-artifact-class";
import type { LibraryItem } from "./library-data";
import { MaterialLibrary } from "./MaterialLibrary";
import {
  materialTypesCsv,
  materialTypesFromCsv,
  type MaterialLibraryLevel,
} from "./material-library-controller";
import {
  EXPLORE_TITLE,
  MATERIAL_SCENE_OTHER_ID,
  exploreEmptyHint,
  exploreSubtitle,
  readSiteAppDirectory,
  subscribeSiteAppDirectories,
  type SceneSelection,
} from "./material-scene-axis";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkbenchMaterialActionAvailability } from "./workbench-material-registry";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

/** @deprecated 站点侧词表，零配置之后不再有任何取值被采纳。 */
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
  | "document";

/** @deprecated 站点自造的分类，零配置之后由站点 app 目录的 `scenes` 取代。 */
export interface ExploreCategory {
  key: string;
  label: string;
  subtab?: string;
}

/**
 * @deprecated 整份作废（`01-decisions.md` D6）。
 *
 * 站点不再声明类型、标题、副标题与空态文案：全部由共享包按**站点 app 目录**推导
 * （`registerSiteAppDirectory`）。字段保留只为让 36 个站不必锁步发布；传了会被忽略，
 * 并在 DOM 上打出 `data-explore-legacy-props`，由 W6 的跨站门禁判红。
 */
export interface ExploreConfig {
  type?: ExploreAssetType;
  types?: ExploreAssetType[];
  categories?: ExploreCategory[];
  title?: string;
  subtitle?: string;
  emptyHint?: string;
}

export interface ExplorePageProps {
  /** 唯一必填：`scripts/oceanleo-sites.tsv` 的站点 key。 */
  siteKey?: string;
  /** 可选 app 锚点；URL 的 `?app=` 优先。 */
  appId?: string;
  accent?: string;
  className?: string;
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
  /** @deprecated 零配置之后整份被忽略，见 `ExploreConfig`。 */
  config?: ExploreConfig;
  /** @deprecated `siteKey` 的旧拼写；仍然认，但记为漂移。 */
  siteId?: string;
}

const warnedMissingSiteKey = new Set<string>();
const warnedLegacyProps = new Set<string>();
const warnedMissingDirectory = new Set<string>();

export function resetExploreSiteKeyWarnings(): void {
  warnedMissingSiteKey.clear();
  warnedLegacyProps.clear();
  warnedMissingDirectory.clear();
}

/**
 * 本站素材 is only truthful when the page actually hands us a site key: without
 * one the controller cannot send `originSiteKey` and the shelf would serve a
 * whole-platform search under a 「本站素材」 heading.
 */
function reportMissingSiteKey(appId: string): void {
  const key = appId || "*";
  if (warnedMissingSiteKey.has(key)) return;
  warnedMissingSiteKey.add(key);
  if (typeof console === "undefined") return;
  console.error(
    "[ExplorePage] 缺少 siteKey：本站素材整层已停用。" +
      '请给 <ExplorePage siteKey="<sites.tsv 的站点 key>" /> 传值。',
  );
}

/** 站点还在传作废的 props：门禁要看得见，所以不是 dev-only 的软提示。 */
function reportLegacyProps(siteKey: string, props: readonly string[]): void {
  const key = `${siteKey}\u0000${props.join(",")}`;
  if (warnedLegacyProps.has(key) || props.length === 0) return;
  warnedLegacyProps.add(key);
  if (typeof console === "undefined") return;
  console.error(
    `[ExplorePage] ${siteKey || "(无 siteKey)"} 仍在传已作废的 props：` +
      `${props.join(" / ")}。零配置之后类型/分区/文案全部由站点 app 目录推导` +
      "（01-decisions.md D6），这些取值已被忽略，请从站点页面删除。",
  );
}

/** 站点没登记 app 目录：分区轴退化成只有「全部」，这是漂移不是正常态。 */
function reportMissingAppDirectory(siteKey: string): void {
  if (!siteKey || warnedMissingDirectory.has(siteKey)) return;
  warnedMissingDirectory.add(siteKey);
  if (typeof console === "undefined") return;
  console.error(
    `[ExplorePage] ${siteKey} 没有登记 app 目录：素材分区无法按工作台场景展开。` +
      "请在站点侧模块作用域调用 " +
      `registerSiteAppDirectory("${siteKey}", <本站 app-catalog 数组>)。`,
  );
}

function legacyPropNames(props: ExplorePageProps): string[] {
  const names: string[] = [];
  if (props.config && Object.keys(props.config).length > 0) names.push("config");
  if (props.siteId) names.push("siteId");
  return names;
}

const SCENE_QUERY_KEY = "scene";
/**
 * 两类分区的深链键（`?class=playable` / `?class=material`）。
 *
 * 存在的理由和 `?scene=` 一样：分类是读者选出来的视图，选完必须能把链接发给别人。
 * 缺省不写进 URL —— 缺省由共享包按「本站有没有可玩作品」推导，写死进 URL 会让
 * 一条老链接在站点长出可玩作品之后依然落在素材网格上。
 */
const CLASS_QUERY_KEY = "class";

function exploreClassFromQuery(value: string): ExploreArtifactClass | null {
  const candidate = value.trim() as ExploreArtifactClass;
  return EXPLORE_ARTIFACT_CLASS_ORDER.includes(candidate) ? candidate : null;
}

/**
 * 站内探索页。**零配置**：站点只交出 site key（外加可选的 app 锚点），
 * 分区、类型、文案全部由共享包按站点 app 目录推导（`01-decisions.md` D2/D6）。
 *
 *   /explore              → 按站点 app 目录的场景分区浏览本站素材
 *   /explore?app=<appId>  → 同一套分区，外加一个可清除的 app 锚点
 */
export function ExplorePage(props: ExplorePageProps) {
  const {
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
  } = props;
  const tt = useUI();
  const [action, setAction] = useState<WorkspaceActionEnvelope | null>(null);
  // `?app=` 由 `exploreAppHref(appId)` 产出（合同 §3.1）。站点不必自己解析 URL。
  const [anchoredApp, setAnchoredApp] = useState(appId);
  const [types, setTypes] = useState<ArtifactType[]>([]);
  const [scene, setScene] = useState<SceneSelection>(null);
  // `null` = 还没选过。缺省由 `defaultExploreClass()` 按有没有可玩作品定，不在这里猜。
  const [artifactClass, setArtifactClass] =
    useState<ExploreArtifactClass | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const artifactId = params.get("artifactId")?.trim() || "";
    const revisionId = params.get("revisionId")?.trim() || "";
    const query = params.get("q")?.trim() || "";
    const app = params.get("app")?.trim() || "";
    const urlScene = params.get(SCENE_QUERY_KEY)?.trim() || "";
    const urlClass = exploreClassFromQuery(params.get(CLASS_QUERY_KEY) || "");
    const urlTypes = materialTypesFromCsv(params.get("types") || "");
    if (app) setAnchoredApp(app);
    if (urlClass) setArtifactClass(urlClass);
    if (urlTypes.length > 0) setTypes(urlTypes);
    if (urlScene) {
      setScene(urlScene === MATERIAL_SCENE_OTHER_ID ? "" : urlScene);
    }
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

  const syncUrl = useCallback((key: string, value: string) => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    window.history.replaceState(null, "", url.toString());
  }, []);
  const syncTypesToUrl = useCallback(
    (next: ArtifactType[]) => {
      setTypes(next);
      syncUrl("types", materialTypesCsv(next));
    },
    [syncUrl],
  );
  const syncSceneToUrl = useCallback(
    (next: SceneSelection) => {
      setScene(next);
      syncUrl(
        SCENE_QUERY_KEY,
        next === null ? "" : next === "" ? MATERIAL_SCENE_OTHER_ID : next,
      );
    },
    [syncUrl],
  );

  const syncClassToUrl = useCallback(
    (next: ExploreArtifactClass) => {
      setArtifactClass(next);
      syncUrl(CLASS_QUERY_KEY, next);
    },
    [syncUrl],
  );
  const classDispatch = useMemo(
    () => ({
      artifactClass,
      onArtifactClassChange: syncClassToUrl,
    }),
    [artifactClass, syncClassToUrl],
  );

  const exploreAppId = anchoredApp.trim();
  const resolvedSiteKey = (siteKey || siteId).trim();
  const scopeReady = Boolean(resolvedSiteKey);
  const directory = useSyncExternalStore(
    subscribeSiteAppDirectories,
    () => readSiteAppDirectory(resolvedSiteKey),
    () => readSiteAppDirectory(resolvedSiteKey),
  );
  // 本站素材是探索页唯一的一层：「更多素材」按 D1 下线，「此 app」退化成一个可清除的
  // 锚点（分区轴负责分类，不再靠层级切换）。
  const levels = useMemo<MaterialLibraryLevel[]>(() => ["site"], []);
  const legacyProps = legacyPropNames(props);

  // 渲染期上报，不放 effect：这些页面是服务端渲染的，漂移必须在 SSR 日志里也点名。
  if (!scopeReady) reportMissingSiteKey(exploreAppId);
  if (legacyProps.length > 0) reportLegacyProps(resolvedSiteKey, legacyProps);
  if (scopeReady && !directory) reportMissingAppDirectory(resolvedSiteKey);

  const primaryAction = useMemo(
    () =>
      materialActions.includes("insert") ? "insert" : materialActions[0],
    [materialActions],
  );

  return (
    <main
      data-explore-shape="zero-config"
      data-explore-site-key={resolvedSiteKey}
      {...(legacyProps.length > 0
        ? { "data-explore-legacy-props": legacyProps.join(",") }
        : {})}
      {...(scopeReady && !directory
        ? { "data-explore-missing-app-directory": resolvedSiteKey }
        : {})}
      className={`mx-auto flex min-h-0 w-full max-w-6xl flex-col px-6 py-7 ${className}`}
    >
      <header className="mb-4 shrink-0">
        <h1 className="text-[22px] font-semibold tracking-tight text-[var(--fg,#171717)]">
          {tt(EXPLORE_TITLE)}
        </h1>
        <p className="mt-1 text-[13px] text-[var(--muted,#737373)]">
          {tt(exploreSubtitle(directory))}
        </p>
      </header>
      {/*
        缺 siteKey 是**接线错误**，不是空货架：D1 之后没有全平台那一层可退，照常渲染
        只会得到一屏别站素材顶着「本站素材」的招牌。所以这里 fail-closed —— 不挂货架，
        只留一条点名的错误（生产环境的 console.error 见 reportMissingSiteKey）。
      */}
      {!scopeReady ? (
        <section
          role="alert"
          data-explore-missing-site-key="true"
          className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-800"
        >
          {tt(
            "这个探索页没有拿到站点 key，本站素材已按 fail-closed 停用。" +
              "请给 <ExplorePage siteKey=… /> 传入 sites.tsv 里的站点 key。",
          )}
        </section>
      ) : (
      /*
        这层分区外壳**不带边框、不带底色**：卡片自己已经是卡片，外面再套一个
        `rounded-2xl border bg-card` 的大盒子，宽屏上就是操作员看到的那一大片空底板。
        外壳只保留布局职责（撑高、占满剩余高度、把内部滚动关在里面）。

        `data-explore-shelf-shell="plain"` 曾经只是一个标记：意图写在了 DOM 上，
        却没有接到货架自己的 `plain` 开关，所以底板照画。下面那个 `plain` 才是
        真开关，两者必须同时在场（台账 §A1）。
      */
      <section
        className="min-h-[20rem] flex-1 overflow-hidden"
        data-explore-shelf-shell="plain"
        aria-label={tt("授权公共素材库")}
      >
        <MaterialLibrary
          materials={[]}
          plain
          accent={accent}
          action={action}
          siteId={resolvedSiteKey}
          appId={exploreAppId}
          contextId={canonicalArtifactContextId(resolvedSiteKey, exploreAppId)}
          levels={levels}
          initialLevel="site"
          lockLevel="site"
          fetchPrimary={false}
          exploreClassDispatch={classDispatch}
          types={types}
          onTypesChange={syncTypesToUrl}
          scene={scene}
          onSceneChange={syncSceneToUrl}
          hideSeeAll
          emptyHint={exploreEmptyHint(scene, directory)}
          onOpenItem={onOpenItem}
          materialActions={materialActions}
          onMaterialAction={onMaterialAction}
          materialActionEvidence={materialActionEvidence}
          primaryMaterialAction={primaryAction}
          draggableMaterials={Boolean(primaryAction && onMaterialDragStart)}
          onMaterialDragStart={onMaterialDragStart}
          onMaterialDragEnd={onMaterialDragEnd}
        />
      </section>
      )}
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

/** @deprecated 旧站点分类词表的取值函数，零配置之后没有消费者。 */
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
