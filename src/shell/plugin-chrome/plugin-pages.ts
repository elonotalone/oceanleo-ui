// 插件「页面」契约（plugin-chrome-unification 波，父 agent 所有；子任务只读，
// 只有 W01 可按任务书扩展）。
//
// 产品规则（见 docs/architecture/oceanleo-plugin-chrome-pages-spec.md）：
//   第一行 = 全局行：返回 / 素材库 / 撤销重做 / 保存状态 / 下载 / 主题 / 关闭。13 件插件一个样。
//   第二行 = 页面行：「编辑」（成品页）永远第一；「专业编辑」是一个页面，不再是开关；
//            其余页面（Code / Database / …）由插件按需申报。
//   编辑栏（edit bar）只在 kind === "artifact" 的页面出现。
//   插件专属的编辑动作（重新计算 / 刷新预览 / 运行全部 / 选择 / 编辑 …）
//   一律不进第一行，进编辑栏的「文档段」。

import type { EditorMode } from "../hosted-editor";
import type { WorkbenchIconName } from "../AdvancedEditorIcon";

/** 成品页（编辑）：唯一一个显示编辑栏的页面。 */
export const ARTIFACT_PAGE_ID = "artifact";
/** 专业编辑页：等价于旧的 L3 `mode === "pro"`。 */
export const PRO_PAGE_ID = "pro";

/**
 * 只有这三件编辑器有「专业编辑」页：同一内核自带官方完整 UI，且跑在同一个实例上
 * （grid = Univer ribbon，pdf = EmbedPDF 官方 viewer，website = Puck 默认完整 UI）。
 * 其余编辑器只有一个模式。单一来源——不要在别处再列一遍。
 */
export const PRO_PAGE_EDITORS = Object.freeze([
  "grid",
  "pdf",
  "website",
] as const);

export function hasProPage(pluginId: string | null | undefined): boolean {
  return (
    !!pluginId && (PRO_PAGE_EDITORS as readonly string[]).includes(pluginId)
  );
}

export type PluginPageKind = "artifact" | "pro" | "aux";

export interface PluginPage {
  /** 稳定 id；`artifact` / `pro` 由宿主保留，插件自报的页面不得占用。 */
  id: string;
  /** 用户可见短标签（≤ 4 个汉字或 ≤ 10 个拉丁字母），走 tt()。 */
  label: string;
  kind: PluginPageKind;
  icon?: WorkbenchIconName;
  disabled?: boolean;
  /** 不可用时的人话原因，只进 title，不置灰隐藏。 */
  unavailableReason?: string;
}

/**
 * 插件向宿主申报自己的附加页面（aux）。宿主自己补 `artifact` 与 `pro`，
 * 插件不用、也不许申报这两页。
 */
export interface AdvancedEditorPagesAdapter {
  /** 附加页面，按顺序排在「编辑」「专业编辑」之后。缺省无。 */
  aux?: readonly PluginPage[];
  /** 插件当前认为激活的页（用于嵌入式编辑器回报）；缺省由宿主 store 决定。 */
  activePageId?: string;
  /** 宿主切页时通知插件（aux 页需要它切自己的视图；artifact/pro 走 mode）。 */
  onSelectPage?: (pageId: string) => void;
  /** 专业编辑页的标签覆盖。缺省「专业编辑」；不要写第三方产品名。 */
  proLabel?: string;
  /** 专业编辑页不可用的人话原因（缺省视为可用）。 */
  proUnavailableReason?: string;
}

export interface BuildPluginPagesOptions {
  /**
   * 编辑器 id。只有 `PRO_PAGE_EDITORS` 里的编辑器才会拿到「专业编辑」页；
   * 缺省 / 其他 id 一律只有「编辑」页（fail closed）。
   */
  pluginId?: string;
  proLabel?: string;
  proUnavailableReason?: string;
  aux?: readonly PluginPage[];
}

const RESERVED_PAGE_IDS: ReadonlySet<string> = new Set([
  ARTIFACT_PAGE_ID,
  PRO_PAGE_ID,
]);

/** 宿主用：把插件申报拼成完整、顺序固定的页面行。 */
export function buildPluginPages(
  options: BuildPluginPagesOptions = {},
): PluginPage[] {
  const aux = [...(options.aux ?? [])].filter(
    (page) => page.kind === "aux" && !RESERVED_PAGE_IDS.has(page.id),
  );
  return [
    { id: ARTIFACT_PAGE_ID, label: "编辑", kind: "artifact", icon: "preview" },
    ...(hasProPage(options.pluginId)
      ? [
          {
            id: PRO_PAGE_ID,
            label: options.proLabel ?? "专业编辑",
            kind: "pro" as const,
            icon: "settings" as const,
            ...(options.proUnavailableReason
              ? { unavailableReason: options.proUnavailableReason }
              : {}),
          },
        ]
      : []),
    ...aux,
  ];
}

/** 编辑栏可见性的唯一判据。 */
export function editBarVisibleOnPage(
  page: Pick<PluginPage, "kind"> | null | undefined,
): boolean {
  return page?.kind === "artifact";
}

/** 页面 → 旧 L3 模式；hosted 件的 `set-mode` 与 native 件的 `mode.setMode` 继续吃它。 */
export function pageToEditorMode(pageId: string | null | undefined): EditorMode {
  return pageId === PRO_PAGE_ID ? "pro" : "normal";
}

export function editorModeToPage(mode: EditorMode | null | undefined): string {
  return mode === "pro" ? PRO_PAGE_ID : ARTIFACT_PAGE_ID;
}

/**
 * 第一行（全局行）允许出现的槽位。除此之外任何按钮出现在第一行都是缺陷；
 * `tests/plugin-chrome-global-row-allowlist.test.mjs`（W01 建）读这张表。
 */
export const GLOBAL_ROW_SLOTS = Object.freeze([
  "back",
  "library",
  "history",
  "save-state",
  "download",
  "share",
  "favorite",
  "theme",
  "maximize",
  "close",
  "collab",
] as const);

export type GlobalRowSlot = (typeof GLOBAL_ROW_SLOTS)[number];
