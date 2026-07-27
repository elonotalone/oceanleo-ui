/**
 * Presentation-only helpers for the material library shelf: canonical links,
 * failure copy, per-level copy and the entry projections. Kept out of
 * `material-library-view.tsx` so that file stays under the 800-line cap.
 */

import { artifactIsVisible, type ArtifactContextRef, type ArtifactType } from "./artifact-contract";
import { isAdvancedEditableShelfItem } from "./advanced-features";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import {
  artifactEntry,
  libraryItemHasExactPrimaryContext,
  type MaterialItem,
  type MaterialLibraryLevel,
} from "./material-library-controller";
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
  fetchMore?: boolean;
  curatedType?: string;
  curatedSeriesId?: string;
  initialLevel?: MaterialLibraryLevel;
  lockLevel?: MaterialLibraryLevel;
  /**
   * Sections offered to the reader (合同 §0.6). Defaults to the two-level
   * 当前 App ｜ 更多素材 shelf every workbench surface already renders.
   */
  levels?: readonly MaterialLibraryLevel[];
  /**
   * Per-card 下载 (合同 §0.6). Defaults to on for browsing surfaces and off
   * once an editor host registers a primary material action, where the card's
   * job is to feed the canvas rather than to hand over a file.
   */
  cardDownload?: boolean;
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
}

export const MATERIAL_LEVEL_LABEL: Record<MaterialLibraryLevel, string> = {
  primary: "此 app",
  site: "本站素材",
  more: "更多素材",
};

export function materialLevelSearchPlaceholder(
  level: MaterialLibraryLevel,
): string {
  if (level === "primary") return "筛选当前 App 可编辑素材";
  if (level === "site") return "搜索本站素材";
  return "搜索可编辑模板";
}

export function materialLevelEmptyTitle(
  level: MaterialLibraryLevel,
): string {
  if (level === "primary") return "当前 App 暂无可编辑素材";
  if (level === "site") return "本站暂无可编辑素材";
  return "暂无可编辑模板";
}

export function materialLevelEmptyDescription(
  level: MaterialLibraryLevel,
  contextMissing: boolean,
): string {
  if (level === "primary") {
    return contextMissing
      ? "当前 App 暂未提供可用素材。"
      : "这里只显示当前 App 已绑定且可安全编辑的素材；可前往「更多素材」查找模板。";
  }
  if (level === "site") {
    return "这里只显示本站已登记的素材；可前往「更多素材」查看全平台模板。";
  }
  return "这里只显示可在高级编辑器中打开并保存的模板；可更换关键词或类型。";
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
