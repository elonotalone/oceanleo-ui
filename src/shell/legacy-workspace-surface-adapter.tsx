"use client";

import { isValidElement, type ReactNode } from "react";
import { MaterialLibrary, type MaterialItem } from "./MaterialLibrary";
import type { LibraryItem, LibraryKind } from "./library-data";
import type { WorkspaceLibraryEntry } from "./WorkspaceLibrary";
import {
  buildWorkspaceSurfaceModel,
  type WorkspaceSurfaceModel,
  type WorkspaceSurfaceRole,
  type WorkspaceSurfaceTab,
} from "./workspace-surface-model";
import {
  workspaceSlotForLegacyId,
  type WorkspaceSlotId,
} from "./workspace-actions";

export interface LegacyWorkspaceSurfaceHints {
  slot?: WorkspaceSlotId;
  kind?: LibraryKind;
  role?: WorkspaceSurfaceRole;
  primary?: boolean;
  displayLabel?: string;
  callbackId?: string | null;
  materials?: readonly MaterialItem[];
}

export interface LegacyWorkspaceSurfaceTab {
  id: string;
  label: string;
  content: ReactNode;
  libraryItem?: LibraryItem;
  entries?: WorkspaceLibraryEntry[];
  onDelete?: () => Promise<void> | void;
  /**
   * Typed callers should declare this. Omitted hints activate the compatibility
   * classifier below; no other workspace module may guess from labels or
   * component names.
   */
  surface?: LegacyWorkspaceSurfaceHints;
}

export type AdaptedWorkspaceSurfaceTab = WorkspaceSurfaceTab<
  ReactNode,
  LibraryItem,
  WorkspaceLibraryEntry,
  MaterialItem
>;

const PREVIEW_KIND_HINTS: Array<[RegExp, LibraryKind]> = [
  [
    /(?:(视频|video).*(工作流|workflow|时间线|timeline|剪辑)|(?:工作流|workflow|时间线|timeline|剪辑).*(视频|video))/i,
    "video_canvas",
  ],
  [/(ppt|幻灯|演示)/i, "ppt"],
  [/(excel|表格|sheet)/i, "sheet"],
  [/(网站|网页|website|web)/i, "website"],
  [/(图片|海报|image|poster)/i, "image"],
  [/(音频|音乐|audio|music)/i, "audio"],
  [/(3d|模型)/i, "threed"],
  [/(大纲|成稿|文档|word|document|draft|outline)/i, "document"],
  [/(画布|canvas|组织|节点)/i, "canvas"],
];

function legacyKind(tab: LegacyWorkspaceSurfaceTab): LibraryKind {
  const text = `${tab.id} ${tab.label}`;
  return PREVIEW_KIND_HINTS.find(([pattern]) => pattern.test(text))?.[1] ||
    "file";
}

function legacySlot(tab: LegacyWorkspaceSurfaceTab): WorkspaceSlotId {
  const label = tab.label.trim().toLowerCase();
  if (/灵感|靈感|模板|範本|template|inspiration/.test(label)) {
    return "template";
  }
  if (/素材库|素材庫|materials?/.test(label)) return "materials";
  if (/我的库|我的庫|文件库|檔案庫|my library/.test(label)) return "mine";
  if (
    /我的.*(?:库|庫|记录|記錄)|作品库|作品庫|项目|項目|历史记录|歷史記錄|会议库|會議庫|闪卡库|閃卡庫/.test(
      label,
    )
  ) {
    return "mine";
  }
  if (/云端浏览器|雲端瀏覽器|cloud browser/.test(label)) return "browser";
  return workspaceSlotForLegacyId(tab.id);
}

function componentName(node: ReactNode): string {
  if (!isValidElement(node)) return "";
  const type = node.type as { name?: string; displayName?: string } | string;
  return typeof type === "string" ? "" : type.displayName || type.name || "";
}

function genericMineTab(tab: LegacyWorkspaceSurfaceTab): boolean {
  const label = tab.label.trim();
  if (
    /^(?:file|files|file\s*library|library|database|mine|mylib|my\s*library)$/i.test(
      label,
    ) ||
    /^(?:文件库|檔案庫|我的库|我的庫)$/.test(label)
  ) {
    return true;
  }
  if (label) return false;
  return /^(?:file|files|filelibrary|library|database|mine|mylib|my_library)$/i.test(
    tab.id.trim(),
  );
}

function genericMaterialsTab(tab: LegacyWorkspaceSurfaceTab): boolean {
  const label = tab.label.trim();
  if (
    /^(?:material|materials|material\s*library)$/i.test(label) ||
    /^(?:素材|素材库|素材庫)$/.test(label)
  ) {
    return true;
  }
  if (label) return false;
  return /^(?:material|materials|material_library)$/i.test(tab.id.trim());
}

function legacyDisplayLabel(
  label: string,
  slot: WorkspaceSlotId,
): string {
  if (slot !== "template") return label;
  return label
    .replaceAll("模板", "灵感")
    .replaceAll("範本", "灵感")
    .replace(/\btemplates?\b/gi, "灵感");
}

function legacyMaterials(tab: LegacyWorkspaceSurfaceTab): MaterialItem[] {
  if (!isValidElement(tab.content) || tab.content.type !== MaterialLibrary) {
    return [];
  }
  const props = tab.content.props as { materials?: MaterialItem[] };
  return Array.isArray(props.materials) ? props.materials : [];
}

function legacyRole(
  tab: LegacyWorkspaceSurfaceTab,
  slot: WorkspaceSlotId,
  materials: readonly MaterialItem[],
): WorkspaceSurfaceRole {
  if (slot === "preview" && !tab.libraryItem && !tab.entries?.length) {
    return "panel";
  }
  if (
    (slot === "materials" &&
      (genericMaterialsTab(tab) || materials.length > 0)) ||
    (slot === "mine" &&
      (genericMineTab(tab) ||
        ["ArtifactLibrary", "FileLibrary", "MyLibrary"].includes(
          componentName(tab.content),
        )))
  ) {
    return "container";
  }
  return "entry";
}

export function adaptLegacyWorkspaceSurfaceTab(
  tab: LegacyWorkspaceSurfaceTab,
): AdaptedWorkspaceSurfaceTab {
  const slot = tab.surface?.slot || legacySlot(tab);
  const materials = tab.surface?.materials
    ? [...tab.surface.materials]
    : legacyMaterials(tab);
  return {
    id: tab.id,
    label: tab.label,
    displayLabel:
      tab.surface?.displayLabel || legacyDisplayLabel(tab.label, slot),
    slot,
    role: tab.surface?.role || legacyRole(tab, slot, materials),
    content: tab.content,
    libraryItem: tab.libraryItem,
    entries: tab.entries,
    materials,
    kind: tab.surface?.kind || tab.libraryItem?.kind || legacyKind(tab),
    primary:
      tab.surface?.primary ??
      (slot === "preview" &&
        /^(?:result|results|preview|artifact)$/i.test(tab.id)),
    callbackId:
      tab.surface?.callbackId !== undefined
        ? tab.surface.callbackId
        : tab.id === "__guide"
          ? null
          : tab.id,
    onDelete: tab.onDelete,
  };
}

export function adaptLegacyWorkspaceSurfaceTabs(
  tabs: readonly LegacyWorkspaceSurfaceTab[],
): WorkspaceSurfaceModel<AdaptedWorkspaceSurfaceTab> {
  return buildWorkspaceSurfaceModel(
    tabs.map(adaptLegacyWorkspaceSurfaceTab),
  );
}

export function legacyWorkspaceEntry(
  tab: AdaptedWorkspaceSurfaceTab,
  options: { material?: boolean } = {},
): WorkspaceLibraryEntry {
  const kind = tab.libraryItem?.kind || tab.kind || "file";
  const isResult = tab.primary === true;
  const isWorkflow =
    kind === "video_canvas" ||
    /workflow|工作流|流程/i.test(`${tab.id} ${tab.label}`);
  const title = /^(生成结果|结果)$/i.test(tab.label.trim())
    ? "生成"
    : tab.label || "生成";
  return {
    id: `${options.material ? "workflow" : "preview"}:${tab.id}`,
    title: tab.libraryItem?.title || title,
    description: options.material
      ? "当前应用已有页面 · 可直接打开查看"
      : isResult
        ? "本次任务生成结果"
        : "当前应用已有页面",
    category: options.material
      ? isWorkflow
        ? "应用工作流"
        : "应用页面"
      : isResult
        ? "生成"
        : isWorkflow
          ? "工作流"
          : "应用页面",
    keywords: [
      tab.id,
      tab.label,
      tab.libraryItem?.siteId || "",
      isWorkflow ? "工作流" : "",
    ].filter(Boolean),
    kind,
    thumbUrl: tab.libraryItem?.thumbUrl || tab.libraryItem?.previewUrl,
    libraryItem: tab.libraryItem,
    content: tab.libraryItem ? undefined : tab.content,
    externalUrl: tab.libraryItem?.url || tab.libraryItem?.previewUrl,
    onDelete: tab.onDelete,
  };
}
