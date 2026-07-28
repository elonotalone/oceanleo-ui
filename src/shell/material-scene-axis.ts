/**
 * 探索页的分区轴 = **站点 app 目录的场景词**（`01-decisions.md` D2）。
 *
 * 为什么不是 artifactType、也不是原始 appId：工作台的分区就是各站
 * `lib/app-catalog.ts` 里成品 app 的 `scenes[]`（word 站是 `WORD_SCENES`：
 * 学术教育 / 学生常用 / 机关单位 / 职场精选 / 商业分析 / 媒体文学，另有「其它」）。
 * 探索页与工作台看的必须是同一份分类，所以这里**只消费站点交上来的目录**，
 * 绝不在共享包里维护第二份分类表。
 *
 * 站点怎么把目录交上来：模块作用域调用 `registerSiteAppDirectory(siteKey, APPS)`
 * （形状见 `W3-interface-explore-props.md` §2）。**不是 useEffect**：SSR 与 CSR
 * 必须拿到同一份目录，否则首屏没有分区、hydration 之后才蹦出来。
 *
 * 本模块是纯逻辑（无 React、无 JSX），`material-library-view.tsx` 贴着 800 行硬顶，
 * 而分区轴的取值规则需要被 focused test 直接 import 断言。
 */

import type { ArtifactType } from "./artifact-contract";
import {
  materialArtifactDedupeKey,
  materialEntryAppAttributions,
  materialEntryAppForScope,
} from "./material-library-dedupe";
import type { WorkspaceLibraryEntry } from "./workspace-library-model";

/** 「全部」分区的 chip id（`null` 是它的选中态取值，见 `SceneSelection`）。 */
export const MATERIAL_SCENE_ALL_ID = "all";
/** 没有场景词的 app、以及解析不出归属 app 的素材，落在这一格。 */
export const MATERIAL_SCENE_OTHER_ID = "other";
/** 与工作台目录逐字一致的「其它」分区文案。 */
export const MATERIAL_SCENE_OTHER_LABEL = "其它";

/** `null` = 全部；`""` = 其它；其余是场景词本身。 */
export type SceneSelection = string | null;

/** 站点 catalog 里的 `GoalApp` 天然满足它；本模块只读这四个字段。 */
export interface SiteDirectoryAppInput {
  id: string;
  name?: string;
  scenes?: readonly string[];
  hiddenFromDirectory?: boolean;
}

export interface SiteDirectoryApp {
  appId: string;
  name: string;
  scenes: string[];
  /** 目录里的声明顺序。D3 的「主 app = position 最小」直接用它。 */
  position: number;
}

export interface SiteAppDirectory {
  siteKey: string;
  apps: SiteDirectoryApp[];
  /** 场景词，按目录里首次出现的顺序（与工作台 chips 同序）。 */
  scenes: string[];
  /** 目录里存在没有场景词的 app —— 「其它」分区因此恒常存在。 */
  hasUnscopedApps: boolean;
  /** 被排除的 agent 类 app（D2：它们没有独立素材）。 */
  excludedAgentAppIds: string[];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * agent 类 app 不进分区轴（D2）。判据刻意窄：
 * `agent` / `home-agent` 这两个平台既有 id、id 里独立的 `agent` 词元，
 * 以及场景词本身就是「智能体 / Agent」的那一类。站点想排除别的 app 用
 * `hiddenFromDirectory`，不要来扩这条规则。
 */
export function isAgentClassApp(app: SiteDirectoryAppInput): boolean {
  const id = text(app?.id).toLowerCase();
  if (!id) return false;
  if (id === "agent" || id === "home-agent") return true;
  if (/(^|[-_])agent([-_]|$)/.test(id)) return true;
  return (app?.scenes || []).some((scene) =>
    /^(智能体|agent)s?$/i.test(text(scene)),
  );
}

function normalizeDirectory(
  siteKey: string,
  apps: readonly SiteDirectoryAppInput[],
): SiteAppDirectory {
  const normalized: SiteDirectoryApp[] = [];
  const excludedAgentAppIds: string[] = [];
  const scenes: string[] = [];
  let hasUnscopedApps = false;
  let position = 0;
  for (const app of apps || []) {
    const appId = text(app?.id);
    if (!appId) continue;
    if (app?.hiddenFromDirectory === true) continue;
    if (isAgentClassApp(app)) {
      excludedAgentAppIds.push(appId);
      continue;
    }
    const appScenes = [
      ...new Set((app?.scenes || []).map(text).filter(Boolean)),
    ];
    if (appScenes.length === 0) hasUnscopedApps = true;
    for (const scene of appScenes) {
      if (!scenes.includes(scene)) scenes.push(scene);
    }
    normalized.push({
      appId,
      name: text(app?.name) || appId,
      scenes: appScenes,
      position: position++,
    });
  }
  return {
    siteKey: text(siteKey),
    apps: normalized,
    scenes,
    hasUnscopedApps,
    excludedAgentAppIds,
  };
}

// ── 站点 app 目录登记处 ──────────────────────────────────────────────────────
// 模块级 Map + 显式订阅。React 那一侧用 `useSyncExternalStore` 绑定，所以后到的
// 注册（客户端 layout 先于 explore 路由加载不成立的站）也能立刻反映到分区轴上。

const directories = new Map<string, SiteAppDirectory>();
const directoryListeners = new Set<() => void>();

function sameDirectory(a: SiteAppDirectory, b: SiteAppDirectory): boolean {
  if (a.apps.length !== b.apps.length) return false;
  if (a.scenes.join("\u0000") !== b.scenes.join("\u0000")) return false;
  return a.apps.every((app, index) => {
    const other = b.apps[index];
    return (
      app.appId === other.appId &&
      app.name === other.name &&
      app.scenes.join("\u0000") === other.scenes.join("\u0000")
    );
  });
}

/**
 * 站点把自己的 app 目录交给共享包。同一个 site key 重复注册时后者覆盖前者
 * （HMR / 多入口安全）；内容一致时**不触发订阅者重渲染**。
 */
export function registerSiteAppDirectory(
  siteKey: string,
  apps: readonly SiteDirectoryAppInput[],
): SiteAppDirectory {
  const next = normalizeDirectory(siteKey, apps);
  if (!next.siteKey) return next;
  const current = directories.get(next.siteKey);
  if (current && sameDirectory(current, next)) return current;
  directories.set(next.siteKey, next);
  for (const listener of [...directoryListeners]) listener();
  return next;
}

export function readSiteAppDirectory(
  siteKey: string,
): SiteAppDirectory | null {
  return directories.get(text(siteKey)) || null;
}

export function subscribeSiteAppDirectories(listener: () => void): () => void {
  directoryListeners.add(listener);
  return () => {
    directoryListeners.delete(listener);
  };
}

/** 测试与 HMR 用。产品代码不要调。 */
export function resetSiteAppDirectories(): void {
  directories.clear();
  for (const listener of [...directoryListeners]) listener();
}

// ── 一份素材的归属与分区 ─────────────────────────────────────────────────────

export interface MaterialSceneCard {
  /** 已经带上归属 app 后缀的条目，直接交给货架渲染。 */
  entry: WorkspaceLibraryEntry;
  /** 同一份 artifact 的去重键（D3：一个视图里只渲染一张卡）。 */
  artifactKey: string;
  /** 本视图下这张卡代表的归属 app（选中场景时是该场景下的那个 app）。 */
  appId: string;
  appName: string;
  /** 这份素材落在哪些分区；空数组 = 「其它」。 */
  scenes: string[];
  /** 全部归属 app 的 id，主 app 在前（详情浮层的多编辑入口用，W5 消费）。 */
  owningAppIds: string[];
}

export interface MaterialSceneChip {
  id: string;
  label: string;
  count: number;
}

/**
 * 这一条素材的 artifactType。durable 行自己带；官方模板目录行不是 durable artifact，
 * 类型只存在于 `meta.template_material_artifact_type`（`material-library-template-source`
 * 刻意不把它提升到条目上，见那里的注释）。次级类型 chips 要两类都数得到。
 */
export function materialEntryArtifactType(
  entry: WorkspaceLibraryEntry | undefined,
): ArtifactType | "" {
  const item = entry?.libraryItem;
  if (!item) return "";
  if (item.artifactType) return item.artifactType;
  const fromMeta = item.meta?.template_material_artifact_type;
  return typeof fromMeta === "string" && fromMeta.trim()
    ? (fromMeta.trim() as ArtifactType)
    : "";
}

/** 归属解析不出来的素材，卡片上标这四个字，而不是留白。 */
export const MATERIAL_SITE_APP_OTHER_LABEL = "其他素材";

/** 该 app 在站点目录里的名字；目录里没有就退回数据层给的 label，再退回 appId。 */
function appLabel(
  appId: string,
  fallback: string,
  directory: SiteAppDirectory | null,
): string {
  const id = text(appId);
  if (!id) return "";
  return (
    directory?.apps.find((app) => app.appId === id)?.name || text(fallback) || id
  );
}

function scenesOfApps(
  appIds: readonly string[],
  directory: SiteAppDirectory | null,
): string[] {
  if (!directory) return [];
  const out: string[] = [];
  for (const appId of appIds) {
    const app = directory.apps.find((candidate) => candidate.appId === appId);
    for (const scene of app?.scenes || []) {
      if (!out.includes(scene)) out.push(scene);
    }
  }
  return out;
}

/** 归属 app 名挂在标题后面（D3 §2）：`<素材标题> · <app 名>`。 */
export function sceneCardTitle(title: string, appName: string): string {
  const base = text(title);
  const app = text(appName);
  if (!app || !base || base.endsWith(` · ${app}`)) return base;
  return `${base} · ${app}`;
}

export interface MaterialSceneViewInput {
  entries: readonly WorkspaceLibraryEntry[];
  siteKey: string;
  directory: SiteAppDirectory | null;
  /** `null` = 全部；`""` = 其它；其余是场景词。 */
  scene: SceneSelection;
  /** `?app=` 锚点：只看这个 app 的素材。 */
  anchoredAppId?: string;
}

export interface MaterialSceneView {
  /** 分区 chips（「全部」恒在最前，「其它」恒在最后）。 */
  chips: MaterialSceneChip[];
  /** 当前分区下要渲染的卡（已按 artifact 去重、已挂归属 app 名）。 */
  cards: MaterialSceneCard[];
  /** 去重后本站一共多少份素材（与分区选择无关）。 */
  total: number;
  /** 货架上真实出现过的 artifactType，用来生成次级类型 chips。 */
  presentTypes: ArtifactType[];
}

/**
 * 分区轴的唯一取值入口：去重 → 归属 → 分区 → chips。
 *
 * 顺序是刻意的：**先按 artifact 去重再分区**，所以一份跨 app 素材在「全部」里只有
 * 一张卡（挂主 app 的名字），在它每个归属 app 所属的分区里也各只有一张卡（挂该分区
 * 那个 app 的名字）——这正是 D3 的两句话。
 */
export function materialSceneView(
  input: MaterialSceneViewInput,
): MaterialSceneView {
  const siteKey = text(input.siteKey);
  const directory = input.directory;
  const anchored = text(input.anchoredAppId);
  const scene = input.scene;
  // 该分区下有哪些 app —— `materialEntryAppForScope` 就是拿这个数组挑归属的（W4 §4.3）。
  const sceneAppIds = anchored
    ? [anchored]
    : scene !== null && scene !== ""
      ? (directory?.apps || [])
          .filter((app) => app.scenes.includes(scene))
          .map((app) => app.appId)
      : [];

  const presentTypes: ArtifactType[] = [];
  const seen = new Set<string>();
  const all: MaterialSceneCard[] = [];
  for (const entry of input.entries) {
    // 数据层已经按 artifact 归并过（W4 的 `mergeMaterialEntries`）。这里再去一次重是
    // 呈现层自己的兜底：任何一条没走归并的支流（深链、站点自备条目）也不许出两张卡。
    const artifactKey = materialArtifactDedupeKey(entry);
    if (!artifactKey || seen.has(artifactKey)) continue;
    seen.add(artifactKey);
    const attributions = materialEntryAppAttributions(entry, siteKey);
    const owningAppIds = attributions.map((app) => app.appId);
    const type = materialEntryArtifactType(entry);
    if (type && !presentTypes.includes(type)) presentTypes.push(type);
    const attributed = materialEntryAppForScope(entry, sceneAppIds, siteKey);
    const appId = attributed?.appId || "";
    all.push({
      entry,
      artifactKey,
      appId,
      appName: appId
        ? appLabel(appId, attributed?.label || "", directory)
        : MATERIAL_SITE_APP_OTHER_LABEL,
      scenes: scenesOfApps(owningAppIds, directory),
      owningAppIds,
    });
  }

  const chips: MaterialSceneChip[] = [
    { id: MATERIAL_SCENE_ALL_ID, label: "全部", count: all.length },
  ];
  for (const sceneWord of directory?.scenes || []) {
    chips.push({
      id: sceneWord,
      label: sceneWord,
      count: all.filter((card) => card.scenes.includes(sceneWord)).length,
    });
  }
  const otherCount = all.filter((card) => card.scenes.length === 0).length;
  if (directory && (directory.hasUnscopedApps || otherCount > 0)) {
    chips.push({
      id: MATERIAL_SCENE_OTHER_ID,
      label: MATERIAL_SCENE_OTHER_LABEL,
      count: otherCount,
    });
  }

  const cards = all
    .filter((card) => {
      if (anchored && !card.owningAppIds.includes(anchored)) return false;
      if (scene === null) return true;
      if (scene === "") return card.scenes.length === 0;
      return card.scenes.includes(scene);
    })
    .map((card) => ({
      ...card,
      entry: {
        ...card.entry,
        title: sceneCardTitle(card.entry.title, card.appName),
        category: card.appName || MATERIAL_SITE_APP_OTHER_LABEL,
        keywords: withKeywords(card.entry.keywords, [
          card.appId,
          ...card.scenes,
        ]),
      },
    }));

  return { chips, cards, total: all.length, presentTypes };
}

function withKeywords(
  current: string[] | undefined,
  extra: readonly string[],
): string[] {
  const out = [...(current || [])];
  for (const value of extra) {
    const keyword = text(value);
    if (keyword && !out.includes(keyword)) out.push(keyword);
  }
  return out;
}

// ── 零配置文案（D6：站点不再写 title / subtitle / emptyHint）────────────────

export const EXPLORE_TITLE = "探索 · 素材";

export function exploreSubtitle(directory: SiteAppDirectory | null): string {
  const count = directory?.apps.length || 0;
  if (count === 0) return "按工作台场景浏览本站素材。";
  return `按工作台场景浏览本站 ${count} 个 app 的素材。`;
}

/** settle 之后确实为空时才用得上；未 settle 时呈现层只画骨架（D5）。 */
export function exploreEmptyHint(
  scene: SceneSelection,
  directory: SiteAppDirectory | null,
): string {
  if (!directory) {
    return "本站还没有登记 app 目录，素材分区暂时无法按工作台场景展开。";
  }
  if (scene === null) return "本站还没有已登记的素材。";
  if (scene === "") {
    return `「${MATERIAL_SCENE_OTHER_LABEL}」分区下还没有素材。`;
  }
  return `「${scene}」分区下还没有素材。`;
}
