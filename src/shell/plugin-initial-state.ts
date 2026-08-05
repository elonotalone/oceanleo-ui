/**
 * 承载层这一侧的插件初始态入口 —— 「点开一枚按键之后，第一屏是什么」的查表与挂载。
 *
 * 换掉的是这条旧路：按键只带着 `artifactType` 派发，承载层再按载体类型反查出
 * 5 份通用空白模板之一（`blank-draft-items.ts`），于是全平台两千多枚按键在运行时
 * 只对应 5 份骨架，点地图、点台账、点换算器打开的都是同一份「输入 A / 输入 B」。
 * 现在派发的是**插件身份**（`pluginId`），第一屏由这枚插件自己的初始态给。
 *
 * **fail-closed**：查不到就返回 `null`，调用方不许退回通用模板，也不许猜一个
 * 回退编辑器。没有第一屏的插件就是不可用的插件——按键在生成期就不该发出来；
 * 万一漏过来，承载层 `ResultCanvas.startFeatureLaunch()` 会先问一次
 * `pluginInitialStateAvailable()`，把理由显示出来，而不是打开一份骨架。
 *
 * 分工：初始态本身（`plugin-initial-states/`，逐插件的第一屏与内置数据）不归本
 * 文件管；本文件只做三件事——查表、把初始态包成承载层认得的 `LibraryItem`、
 * 认出「手上这件东西是不是插件实例」。
 */

import type { LibraryItem, LibraryKind } from "./library-data";
import {
  PLUGIN_INITIAL_STATE_IDS,
  hasPluginInitialState,
  pluginInitialItemInput,
} from "./plugin-initial-states/index";

/**
 * 非编辑类插件的三个运行时内核（分类裁定见 `docs/specs/oceanleo-plugins-v1/`）。
 *
 * 21 个非编辑类插件共用这三个内核渲染。**内核不是插件**：`grid` 一身二任，它同时
 * 还是编辑类插件「表格编辑器」的内核；两者的入口规则与外壳不同，靠 `meta.plugin_id`
 * 区分，而不是靠内核名。
 */
export type PluginRuntimeId = "geo-map" | "grid" | "interactive-doc";

export const PLUGIN_RUNTIME_IDS: readonly PluginRuntimeId[] = Object.freeze([
  "geo-map",
  "grid",
  "interactive-doc",
]);

const PLUGIN_RUNTIME_SET = new Set<string>(PLUGIN_RUNTIME_IDS);

export function isPluginRuntimeId(value: unknown): value is PluginRuntimeId {
  return PLUGIN_RUNTIME_SET.has(String(value || ""));
}

/** 内核 → 卡片 viewer kind 与载体类型；路由层按这两个字段挂对应 route。 */
const RUNTIME_CARRIER: Readonly<
  Record<PluginRuntimeId, { kind: LibraryKind; contentType: string }>
> = Object.freeze({
  "geo-map": { kind: "geo_map", contentType: "geo_map" },
  grid: { kind: "sheet", contentType: "grid" },
  "interactive-doc": { kind: "interactive_doc", contentType: "interactive_doc" },
});

const RUNTIME_BY_CONTENT_TYPE: ReadonlyMap<string, PluginRuntimeId> = new Map(
  PLUGIN_RUNTIME_IDS.map((runtime) => [
    RUNTIME_CARRIER[runtime].contentType,
    runtime,
  ]),
);

/** 承载层认的最小初始态：一个内核、一个名字、一份第一屏的内容。 */
export interface PluginInitialStateInput {
  runtime: PluginRuntimeId;
  /** 用户可见的中文名（该插件自己的名字，不是内核名）。 */
  title: string;
  /**
   * 第一屏的工程字节，按内核各自的 schema：`geo-map` → `oceanleo.geo-map.v1`；
   * `interactive-doc` → `oceanleo.interactive-doc.v1`；`grid` 走 `meta.sheets`
   * 结构化表，通常不带内联字节。
   */
  content?: string;
  /** 会原样并进实例的 `meta`，例如 grid 的 `sheets`、地图的 `source_manifest`。 */
  meta?: Record<string, unknown>;
}

/** 插件 id 的形状：小写字母、数字与连字符，与 L3 族目录名同形。 */
const PLUGIN_ID_PATTERN = /^[a-z][a-z0-9-]{1,63}$/;

export function isPluginId(value: unknown): boolean {
  return PLUGIN_ID_PATTERN.test(String(value || "").trim());
}

export function normalizePluginId(value: unknown): string {
  const id = String(value || "").trim().toLowerCase();
  return PLUGIN_ID_PATTERN.test(id) ? id : "";
}

/** 今天真有第一屏的插件；入口层用它过滤按键。 */
export function pluginInitialStateIds(): readonly string[] {
  return Object.freeze(
    [...PLUGIN_INITIAL_STATE_IDS]
      .map((id) => normalizePluginId(id))
      .filter(Boolean)
      .sort(),
  );
}

/**
 * 这枚插件能不能打开。**查不到就是不可用**，不许退回通用模板。
 *
 * 产品侧调用方是 `ResultCanvas.startFeatureLaunch()`：生成期与构建期那两道闸都在
 * 发布之前，这一道是运行期的兜底。路由层不调它 —— 用户存下来的功能实例即使第一屏
 * 后来被撤掉也必须打得开，理由写在 `startFeatureLaunch()` 的注释里。
 */
export function pluginInitialStateAvailable(pluginId: unknown): boolean {
  const id = normalizePluginId(pluginId);
  return Boolean(id) && hasPluginInitialState(id);
}

/** 查表：把目录里那份初始态摊成承载层认的最小形状。查不到返回 `null`。 */
export function pluginInitialStateFor(
  pluginId: unknown,
): PluginInitialStateInput | null {
  const id = normalizePluginId(pluginId);
  if (!id) return null;
  const input = pluginInitialItemInput(id);
  if (!input) return null;
  const runtime = RUNTIME_BY_CONTENT_TYPE.get(String(input.contentType || ""));
  if (!runtime) return null;
  const title = String(input.title || "").trim();
  if (!title) return null;
  return {
    runtime,
    title,
    ...(input.content ? { content: input.content } : {}),
    ...(input.meta ? { meta: input.meta } : {}),
  };
}

export interface PluginInstanceOptions {
  siteId?: string;
  appId?: string;
  title?: string;
  /** 每次打开换一枚；右栏按它重挂一份干净实例。 */
  nonce?: string;
}

/**
 * 把一份初始态包成**插件实例**。它长得像一件素材（承载层与路由层只认
 * `LibraryItem`），但它不是素材：
 *   · 没有 `url` / `previewUrl` —— 插件永不可下载；
 *   · 不带 `draft` / `blank` 标记 —— 它不是空白草稿，别再被通用起手件那条
 *     旧路捡走；
 *   · 带 `meta.plugin_id`，路由与外壳层靠它认出「这是插件，不是素材」。
 */
export function pluginInstanceFromInitialState(
  pluginId: string,
  state: PluginInitialStateInput,
  options: PluginInstanceOptions = {},
): LibraryItem | null {
  const id = normalizePluginId(pluginId);
  if (!id || !isPluginRuntimeId(state?.runtime)) return null;
  const title = String(options.title || state.title || "").trim();
  if (!title) return null;
  const siteId = String(options.siteId || "").trim() || "oceanleo";
  const appId = String(options.appId || "").trim();
  const nonce = String(options.nonce || "").trim() || "1";
  const carrier = RUNTIME_CARRIER[state.runtime];
  const key = `plugin:${id}:${nonce}`;
  return {
    key,
    source: "creation",
    id: key,
    title,
    kind: carrier.kind,
    siteId,
    favorite: false,
    ...(state.content ? { content: state.content } : {}),
    meta: {
      ...(state.meta || {}),
      plugin_id: id,
      plugin_runtime: state.runtime,
      content_type: carrier.contentType,
      ...(appId ? { app_id: appId } : {}),
    },
  };
}

/** 查表 + 包实例。查不到初始态就返回 `null`，不许退回通用模板。 */
export function pluginInstanceLibraryItem(
  pluginId: unknown,
  options: PluginInstanceOptions = {},
): LibraryItem | null {
  const id = normalizePluginId(pluginId);
  if (!id) return null;
  const state = pluginInitialStateFor(id);
  return state ? pluginInstanceFromInitialState(id, state, options) : null;
}

/** 这件东西是不是一份插件实例；不是就返回空串。 */
export function pluginIdForItem(
  item: Pick<LibraryItem, "meta"> | null | undefined,
): string {
  return normalizePluginId(item?.meta?.plugin_id);
}

/**
 * 这一次保存的是**一件素材**，还是**一个功能里用户自己的数据**。
 *
 * 三个内核（`interactive-doc` / `grid` / `geo-map`）的保存守门人共用这一个判别，
 * 不各写一套：
 *
 * - `material`：用户在编辑器里改一件真素材。§8 完备判据、字节下限、最小行列数、
 *   署名、孪生判定全部照旧，**一个字都不放宽** —— 这些东西要进货架、要有份数与许可。
 * - `plugin-instance`：用户在一个功能里输入的数据（间隔排程里加的第一张卡、
 *   台账里记的第一笔账、地图上点的第一个标注）。这类数据**不是素材**：不进货架、
 *   没有份数、没有许可与上游。把货架判据套上去，后果是用户加完第一条就存不下去，
 *   其中「署名条目至少 1 条且要有许可证 URL」那条等于要用户给自己手打的记账表填许可证。
 *
 * 判据落在**保存的对象**上，不落在编辑器上：`grid` 内核既渲染台账这类功能，
 * 也编辑用户上传的 xlsx；`interactive-doc` 同理。
 */
export type PluginSaveTarget = "material" | "plugin-instance";

export function saveTargetForItem(
  item: Pick<LibraryItem, "meta"> | null | undefined,
): PluginSaveTarget {
  return pluginIdForItem(item) ? "plugin-instance" : "material";
}

/**
 * 插件实例的运行时内核。以 `meta.plugin_runtime` 为准，缺了就按载体类型认，
 * 再缺就回注册表现查 —— 认不出的一律返回 `null`（fail-closed）。
 */
export function pluginRuntimeForItem(
  item: Pick<LibraryItem, "meta"> | null | undefined,
): PluginRuntimeId | null {
  const pluginId = pluginIdForItem(item);
  if (!pluginId) return null;
  const declared = item?.meta?.plugin_runtime;
  if (isPluginRuntimeId(declared)) return declared;
  const contentType = String(item?.meta?.content_type || "");
  return (
    RUNTIME_BY_CONTENT_TYPE.get(contentType) ||
    pluginInitialStateFor(pluginId)?.runtime ||
    null
  );
}
