// ============================================================================
// 双核 feature flag（W01，2026-09-03，editor-core-swap · `_COMMON.md` §10 第 3 条）
//
// 换核期间**旧核代码不删**：每件编辑器一个 flag，默认 `legacy`，路由层据此选
// 旧核或新核组件。该件验收绿之后，由**那一件的 owner** 翻 flag 并删除旧目录，
// journal 记删除行数（本波 KPI 是 `@oceanleo/ui` 行数下降，R11）。
//
// 为什么默认 `legacy` 而不是 `next`：31 个租户站共用这一个包，一次 `pnpm` 升级
// 就会把新核推给全部站点。默认旧核 = 换核出问题时用户侧零影响，翻 flag 是一个
// 显式动作、有人签字。反过来默认新核，「忘了关」和「决定要开」在代码上长得一样。
//
// ── 三条使用纪律 ────────────────────────────────────────────────────────────
//  1. **不要把 flag 判定写在组件里。** 在 `advanced-routes/XxxRoute.tsx` 顶层判一次，
//     然后 `dynamic()` 拉起两个之一。写在组件里等于两套核的模块图都进同一个 chunk，
//     `W01-deps.md` §4 那条「重内核只能出现在懒加载叶子里」就废了。
//  2. **不要新增第四个取值。** `legacy | next` 两档。要「灰度 10%」写在
//     `resolveEditorCore` 的 override 源里，不要在类型上开第三种状态。
//  3. **删除旧目录单独成一个 commit**，message 以 core-swap:delete 前缀开头
//     （§10 第 12 条；这里刻意不写方括号形态——Tailwind 的自动内容探测会把
//     注释里的方括号 token 编成一条真 CSS 规则，`_COMMON.md` §7b⑧ 实测 37 条）。
// ============================================================================

import type { PluginThemeId } from "./plugin-theme";

/**
 * 编辑器 id。与 `plugin-theme.ts` 的 `PluginThemeId` **同一个闭集**，不另立一张表：
 * 那张表已经是 13 件的单一事实源，再抄一份就会漂。
 */
export type EditorCoreId = PluginThemeId;

/** 用哪个核。`legacy` = 自研旧核，`next` = 本波接的成熟内核。 */
export type EditorCoreChoice = "legacy" | "next";

/**
 * 本波给每件编辑器换的内核（`00-dispatch-contract.md` §3 选型表）。
 * `null` = 本波不换核，只补 L3/L4（那几件的 flag 恒为 `legacy`，翻了也没有新核可去）。
 */
export interface EditorCoreSpec {
  /** 新核名字，写给人看的；`null` = 本波不换核。 */
  nextCore: string | null;
  /** 哪位 owner 负责翻这个 flag 并删旧目录。 */
  owner: string;
  /** 新核是 iframe 托管还是原生 React 组件。 */
  hosting: "native" | "hosted" | "none";
}

/**
 * 13 件的换核台账。**这张表不是配置，是台账**：它记录「谁在换什么核」，
 * V4 的行数台账与 V1 的逐件验收都从这里对齐。
 */
export const EDITOR_CORE_SPECS: Record<EditorCoreId, EditorCoreSpec> = {
  grid: { nextCore: "Univer Sheets", owner: "W03", hosting: "native" },
  image: { nextCore: "Fabric 6（图片·设计合并）", owner: "W04", hosting: "native" },
  "design-canvas": { nextCore: "Fabric 6（同上）", owner: "W05", hosting: "native" },
  pdf: { nextCore: "EmbedPDF", owner: "W06", hosting: "native" },
  deck: { nextCore: "PPTist", owner: "W07", hosting: "hosted" },
  richdoc: { nextCore: "Umo Editor", owner: "W08", hosting: "hosted" },
  "video-timeline": {
    nextCore: "designcombo/react-video-editor",
    owner: "W09",
    hosting: "native",
  },
  audio: { nextCore: "waveform-playlist + AudioMass", owner: "W10", hosting: "hosted" },
  threed: { nextCore: "three.js editor", owner: "W11", hosting: "hosted" },
  "chart-editor": { nextCore: "ECharts 6 + @antv/ava", owner: "W12", hosting: "native" },
  website: { nextCore: "Puck", owner: "W13", hosting: "native" },
  game: { nextCore: "microStudio", owner: "W14", hosting: "hosted" },
  // 视频画布走工作流那条线（W15 的 Langflow 是专业模式，画布本身保留 React Flow）。
  "video-canvas": { nextCore: null, owner: "W15", hosting: "none" },
};

/** 全部编辑器 id，顺序即上表顺序。 */
export const EDITOR_CORE_IDS = Object.keys(EDITOR_CORE_SPECS) as EditorCoreId[];

/** 默认档。**13 件全部 `legacy`**，`_COMMON.md` §10 第 3 条。 */
export const DEFAULT_EDITOR_CORE: EditorCoreChoice = "legacy";

function storageKey(editorId: EditorCoreId): string {
  return `oceanleo.editor-core.${editorId}`;
}

function parseChoice(value: string | null | undefined): EditorCoreChoice | null {
  return value === "legacy" || value === "next" ? value : null;
}

/**
 * 环境变量覆盖：`NEXT_PUBLIC_OCEANLEO_EDITOR_CORES="grid:next,pdf:next"`。
 *
 * 为什么是逗号串而不是一个变量一件：13 件就要 13 个 `NEXT_PUBLIC_*`，
 * 而 Next 的 `process.env` 在客户端是**构建期静态替换**的，动态拼 key 取不到值。
 * 一个变量、构建期一次解析，是这个约束下唯一能工作的形状。
 */
function envOverrides(): Partial<Record<EditorCoreId, EditorCoreChoice>> {
  const raw =
    typeof process !== "undefined"
      ? process.env?.NEXT_PUBLIC_OCEANLEO_EDITOR_CORES
      : undefined;
  if (!raw) return {};
  const out: Partial<Record<EditorCoreId, EditorCoreChoice>> = {};
  for (const pair of raw.split(",")) {
    const [id, choice] = pair.split(":").map((part) => part.trim());
    const parsed = parseChoice(choice);
    if (parsed && Object.prototype.hasOwnProperty.call(EDITOR_CORE_SPECS, id)) {
      out[id as EditorCoreId] = parsed;
    }
  }
  return out;
}

/**
 * 这件编辑器该用哪个核。
 *
 * 优先级：**显式入参 > 用户本地覆盖 > 环境变量 > `legacy`**。
 * 「显式入参最高」是为了让测试与路由能直接指定，不受宿主环境影响。
 *
 * 本波不换核的那几件（`nextCore === null`）**恒为 `legacy`**：
 * 没有新核可去，翻了 flag 只会渲染一个不存在的组件。这条在函数里兜住，
 * 而不是指望每个路由自己记得判——路由有 13 个，这里只有一处。
 */
export function resolveEditorCore(
  editorId: EditorCoreId,
  override?: EditorCoreChoice,
): EditorCoreChoice {
  if (!EDITOR_CORE_SPECS[editorId]?.nextCore) return "legacy";
  if (override) return override;
  if (typeof window !== "undefined") {
    try {
      const stored = parseChoice(
        window.localStorage.getItem(storageKey(editorId)),
      );
      if (stored) return stored;
    } catch {
      /* 私密模式等存储不可用时按默认档走，不抛。 */
    }
  }
  return envOverrides()[editorId] || DEFAULT_EDITOR_CORE;
}

/**
 * 本地翻 flag（开发/灰度用）。**不是**给终端用户的开关：
 * 用户面只有「专业模式」那一个（L0），换核对用户是不可见的实现细节。
 */
export function setEditorCoreOverride(
  editorId: EditorCoreId,
  choice: EditorCoreChoice | null,
): void {
  if (typeof window === "undefined") return;
  try {
    if (choice) {
      window.localStorage.setItem(storageKey(editorId), choice);
    } else {
      window.localStorage.removeItem(storageKey(editorId));
    }
  } catch {
    /* 同上，存储不可用不影响本次会话。 */
  }
}

/** 这件编辑器本波换不换核。给 V1/V4 的验收入口用。 */
export function editorSwapsCore(editorId: EditorCoreId): boolean {
  return Boolean(EDITOR_CORE_SPECS[editorId]?.nextCore);
}
