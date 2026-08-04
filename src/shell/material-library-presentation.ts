/**
 * Presentation-only helpers for the material library shelf: canonical links,
 * failure copy, per-level copy and the entry projections. Kept out of
 * `material-library-view.tsx` so that file stays under the 800-line cap.
 */

import type { ReactNode } from "react";
import { artifactIsVisible, type ArtifactContextRef, type ArtifactType } from "./artifact-contract";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import { isPlayableGameShelfEntry } from "./explore-artifact-class";
import type { ExploreClassDispatchInput } from "./explore-shelf-dispatch";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import {
  artifactEntry,
  libraryItemHasExactPrimaryContext,
  mergeMaterialEntries,
  type MaterialItem,
  type MaterialLibraryLevel,
} from "./material-library-controller";
import { isOfficialTemplateMaterialEntry } from "./material-library-template-source";
import type { SceneSelection } from "./material-scene-axis";
import type { WorkspaceLibraryEntry, WorkspaceLibraryProps } from "./WorkspaceLibrary";
import type { WorkbenchMaterialAction } from "./workbench-material-provider";
import type { WorkspaceActionEnvelope } from "./workspace-actions";

export const MATERIAL_LIBRARY_BASE = "https://asset.oceanleo.com/materials";

export interface MaterialLibraryProps {
  materials: MaterialItem[];
  accent?: string;
  emptyHint?: string;
  className?: string;
  onSeeAll?: () => void;
  seeAllHref?: string;
  hideSeeAll?: boolean;
  seeAllLabel?: string;
  featuredEntries?: WorkspaceLibraryEntry[];
  action?: WorkspaceActionEnvelope | null;
  taskId?: string | null;
  siteId?: string;
  appId?: string;
  contextId?: string;
  functionId?: string;
  fetchCurated?: boolean;
  fetchPrimary?: boolean;
  curatedType?: string;
  curatedSeriesId?: string;
  initialLevel?: MaterialLibraryLevel;
  lockLevel?: MaterialLibraryLevel;
  /**
   * Sections offered to the reader (合同 §0.6). Defaults to 当前 App ｜ 本站素材。
   */
  levels?: readonly MaterialLibraryLevel[];
  /**
   * 探索页的两类分派（可玩游戏 ｜ 游戏素材，本轮合同 §0 P1/P2）。
   *
   * **站点侧拿不到也不需要传**：它是共享包内部的呈现模式开关，探索页自己按
   * artifact 类型推导后交下来。抽屉与工作台面板不传，形状与今天逐字相同。
   */
  exploreClassDispatch?: ExploreClassDispatchInput | null;
  /**
   * 分区轴的受控取值（`null` 全部 / `""` 其它 / 场景词）。探索页把它同步进 `?scene=`；
   * 不传就由货架自己管。
   */
  scene?: SceneSelection;
  onSceneChange?: (scene: SceneSelection) => void;
  /** Multi-select type chips; overrides the single-value `curatedType`. */
  types?: readonly ArtifactType[];
  onTypesChange?: (types: ArtifactType[]) => void;
  onLevelChange?: (level: MaterialLibraryLevel) => void;
  registerRuntimeSource?: boolean;
  materialActions?: readonly WorkbenchMaterialAction[];
  onMaterialAction?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => Promise<{ ok: boolean; error?: string }> | { ok: boolean; error?: string };
  materialActionAvailable?: (
    action: WorkbenchMaterialAction,
    item: LibraryItem,
  ) => boolean;
  materialActionEvidence?: WorkspaceLibraryProps["materialActionEvidence"];
  primaryMaterialAction?: WorkbenchMaterialAction;
  draggableMaterials?: boolean;
  onMaterialDragStart?: (item: LibraryItem) => void;
  onMaterialDragEnd?: () => void;
  allowAdvancedOnSelect?: boolean;
  onOpenItem?: (item: LibraryItem) => void;
  /**
   * 空态下方的 CTA 插槽——让「这个 app 暂无可编辑素材」不再是一条死路，可以指回这个
   * app 自己的功能。**只是一个插槽**：既有空态文案（`materialLevelEmptyTitle` /
   * `materialLevelEmptyDescription`）的默认值一个字未改，不传就完全是今天的样子。
   */
  emptyCta?: ReactNode;
}

/**
 * 层级标签。刻意用 `Record<string, string>` 而不是 `Record<MaterialLibraryLevel, string>`：
 * `more` 已按 D1 整层下线，往后这个联合类型再增减成员时，呈现层不该成为阻塞点。
 * 查表一律走 `materialLevelLabel`。
 */
export const MATERIAL_LEVEL_LABEL: Record<string, string> = {
  primary: "此 app",
  site: "本站素材",
};

export function materialLevelLabel(level: MaterialLibraryLevel): string {
  return MATERIAL_LEVEL_LABEL[level] || "素材";
}

export function materialLevelSearchPlaceholder(
  level: MaterialLibraryLevel,
): string {
  return level === "primary" ? "筛选当前 App 可编辑素材" : "搜索本站素材";
}

export function materialLevelEmptyTitle(
  level: MaterialLibraryLevel,
): string {
  return level === "primary" ? "当前 App 暂无可编辑素材" : "本站暂无可编辑素材";
}

export function materialLevelEmptyDescription(
  level: MaterialLibraryLevel,
  contextMissing: boolean,
): string {
  if (level === "primary") {
    return contextMissing
      ? "当前 App 暂未提供可用素材。"
      : "这里只显示当前 App 已绑定且可安全编辑的素材。";
  }
  // D1 之后不再有「更多素材」可以指路：本站没有就是没有，不许把读者送去别站的货架。
  return "这里只显示本站已登记的素材；可换一个分区或关键词。";
}

/**
 * 货架空态那一屏到底说什么、给不给 CTA。
 *
 * 三条分支必须**成组**决定，这是上一轮踩过的坑：`emptyTitle` 有加载分支而
 * `emptyDescription` 没有，于是「正在加载素材…」下面跟着一句「暂无经授权的公共素材」。
 * CTA 同理 —— 加载骨架与失败文案下面挂一个「去新建」是把读者往错的方向推，所以只有
 * 「真的空着」这一支才带 CTA。
 */
export function materialShelfEmptyCopy(options: {
  loading: boolean;
  failed: boolean;
  failureCopy: { title: string; description: string };
  level: MaterialLibraryLevel;
  contextMissing: boolean;
  emptyHint?: string;
  cta?: unknown;
}): { title: string; description: string; showCta: boolean } {
  if (options.loading) {
    return {
      title: "正在加载素材…",
      description: "正在为你取回本站素材。",
      showCta: false,
    };
  }
  if (options.failed) {
    return {
      title: options.failureCopy.title,
      description: options.failureCopy.description,
      showCta: false,
    };
  }
  return {
    title: materialLevelEmptyTitle(options.level),
    description:
      options.emptyHint ||
      materialLevelEmptyDescription(options.level, options.contextMissing),
    showCta: Boolean(options.cta),
  };
}

export function materialLibraryHref(options: {
  query?: string;
  taxonomy?: ArtifactType | "";
  item?: LibraryItem;
}): string {
  const url = new URL(MATERIAL_LIBRARY_BASE);
  if (options.query?.trim()) url.searchParams.set("q", options.query.trim());
  if (options.taxonomy) {
    url.searchParams.set("taxonomy", options.taxonomy);
  }
  if (options.item && isDurableLibraryItem(options.item)) {
    url.searchParams.set("artifactId", options.item.artifactId);
    url.searchParams.set("revisionId", options.item.revisionId);
  }
  return url.toString();
}

export function safeCompleteLibraryHref(value: string | undefined): string {
  if (!value) return "";
  try {
    const url = new URL(value, MATERIAL_LIBRARY_BASE);
    return url.protocol === "https:" &&
      url.hostname === "asset.oceanleo.com" &&
      url.pathname === "/materials"
      ? url.toString()
      : "";
  } catch {
    return "";
  }
}

export function materialFailureCopy(
  status: number | undefined,
  _message: string,
): {
  title: string;
  description: string;
} {
  if (status === 401) {
    return {
      title: "登录后访问素材库",
      description: "登录后可查看当前 App 素材和可编辑模板。",
    };
  }
  if (status === 403) {
    return {
      title: "当前账号无权访问素材库",
      description: "当前账号无法查看这组素材。",
    };
  }
  if (status === 503) {
    return {
      title: "素材库服务暂时不可用",
      description: "服务端正在维护或过载，请稍后重试。",
    };
  }
  return {
    title: "素材暂时无法显示",
    description: "素材数据未通过安全检查，请重试。",
  };
}

export function isTrustedEditableMaterialEntry(
  entry: WorkspaceLibraryEntry,
): boolean {
  const item = entry.libraryItem;
  return Boolean(
    item &&
      isDurableLibraryItem(item) &&
      artifactIsVisible(item.artifact) &&
      isAdvancedEditableShelfItem(item),
  );
}

/**
 * 货架最终显示哪些卡。**三类**条目同场：
 *   · 用户可编辑的 durable artifact（`isTrustedEditableMaterialEntry`）；
 *   · 匿名可读的官方模板目录行 —— 过不了 durable 判定（目录端点不下发 revision
 *     身份），所以有自己那条窄例外，见 `isOfficialTemplateMaterialEntry`；
 *   · **可玩游戏**（`isPlayableGameShelfEntry`）—— 100 款 artifact 游戏在生产库里是
 *     `view_only`，前两条一条都不满足，于是过去直接不进货架（附录 2 §6 第一道过滤）。
 *
 * 第三类**不是**把游戏标成「可编辑」放进来的：它们照旧过不了
 * `isAdvancedEditableShelfItem`，编辑器派发对它们仍然 fail-closed。它们走的是
 * 「开玩」那条独立通路（`artifactPlayHref`），两条派发互不冒充。
 *
 * 本站层的归属 app 与分区**不在这里算**：那是 `material-scene-axis.ts` 的活
 * （D2/D3 要的是「按 artifact 去重后再挂归属 app」，不是逐条目贴标签）。
 */
export function materialShelfEntries(options: {
  level: MaterialLibraryLevel;
  siteKey?: string;
  deepLinked: readonly WorkspaceLibraryEntry[];
  officialTemplates: readonly WorkspaceLibraryEntry[];
  remote: readonly WorkspaceLibraryEntry[];
  exactLocal: readonly WorkspaceLibraryEntry[];
}): WorkspaceLibraryEntry[] {
  const groups = [
    options.deepLinked,
    options.officialTemplates,
    options.remote,
    ...(options.level === "primary" ? [options.exactLocal] : []),
  ];
  // `siteKey` 必须往下传：不传的话归属并集会把别站的绑定也收进来（W4 接口 §4.5）。
  return mergeMaterialEntries(groups, {
    siteKey: String(options.siteKey ?? "").trim(),
  }).filter(
    (entry) =>
      isTrustedEditableMaterialEntry(entry) ||
      isPlayableGameShelfEntry(entry) ||
      isOfficialTemplateMaterialEntry(entry),
  );
}

/**
 * 面板顶上到底报哪一条错。
 *
 * `useMaterialLibraryDeepLink` 只认 `artifact:<artifactId>:<revisionId>`，指向官方
 * 模板的深链（catalog key 或裸 artifactId）在它眼里一律是「缺少有效 identity」。
 * 目录里确实找到了那一份时，这条报错就是假的；目录还在路上时也别先报，否则正常
 * 路径会先闪一下红字。
 */
export function materialShelfFailure(
  options: {
    deepLinkError: string;
    deepLinkStatus?: number;
    error: string;
    errorStatus?: number;
  },
  templates: { deepLinkEntryId: string; loading: boolean },
): { error: string; status?: number } {
  const deepLinkError =
    templates.deepLinkEntryId || templates.loading
      ? ""
      : options.deepLinkError;
  return deepLinkError
    ? { error: deepLinkError, status: options.deepLinkStatus }
    : { error: options.error, status: options.errorStatus };
}

export function entriesFromRemoteResult(
  items: readonly LibraryItem[],
  level: MaterialLibraryLevel,
  context: ArtifactContextRef,
  query: string,
  taxonomy: ArtifactType | "",
): WorkspaceLibraryEntry[] {
  const scopedItems =
    level === "primary"
      ? items.filter((item) =>
          libraryItemHasExactPrimaryContext(item, context),
        )
      : items;
  return scopedItems.map((item) => ({
    ...artifactEntry(item, level !== "primary" && Boolean(query)),
    linkUrl: materialLibraryHref({
      query: level === "primary" ? "" : query,
      taxonomy,
      item,
    }),
  }));
}
