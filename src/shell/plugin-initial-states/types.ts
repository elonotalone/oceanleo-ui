/**
 * 插件初始态 —— 一个插件被打开、而用户还没输入任何东西时，右栏第一屏上到底有什么。
 *
 * 今天全平台的按键共用五份通用空白起手件（`blank-draft-items.ts`），所以点地图和点
 * 换算器落到的是同一份「输入 A / 输入 B / 比例」。这个目录按插件逐个给出真正的第一屏：
 * 地图给真实底图，台账给列头，间隔排程给空队列加 SM-2 参数。
 *
 * 三条约定：
 *
 * 1. **零数据就是零数据。** 初始态里不预置任何示例内容 —— 没有示例卡片、没有示例分录、
 *    没有示例标注。第一屏给的是**结构**（列头、参数、底图、公式），结构是插件自己的，
 *    不是别人的内容。
 * 2. **查不到就返回空。** `pluginInitialState()` 对没做过初始态的插件返回 `null`，
 *    调用方不许回退到通用模板 —— 按 fail-closed 规则，没有初始态的插件按键不出现。
 * 3. **内置数据不是素材。** 底图之类随包发布的字节不进货架、不进 `artifact_revisions`、
 *    没有份数、没有预览图。
 */

import type { BuiltInGeoAsset } from "./data/index";

/** 渲染这些插件的三个内核。分类裁定见 `docs/specs/oceanleo-plugins-v1/`。 */
export type PluginKernelId = "geo-map" | "grid" | "interactive-doc";

/** 内核对应的载体类型，与 `artifact-contract` 的 `ARTIFACT_TYPES` 同名。 */
export type PluginContentType = "geo_map" | "grid" | "interactive_doc";

export interface PluginInitialStateBase {
  /** L3 族 id，例如 `annotatable-city-map`。清册与按键映射都用这个 id。 */
  pluginId: string;
  /** 面向用户的中文名。界面上只出现这个名字。 */
  displayName: string;
  kernel: PluginKernelId;
  contentType: PluginContentType;
  /** 第一屏的标题。 */
  title: string;
  /** 第一屏上有什么 —— 一句话，给入口层做空态说明用。 */
  firstScreen: string;
  /** 用户第一个动作的按钮文案。 */
  firstAction: string;
  /** 随包发布的内置数据；没有就是空数组。 */
  builtInData: readonly BuiltInGeoAsset[];
}

export interface PluginGeoMapInitialState extends PluginInitialStateBase {
  kernel: "geo-map";
  contentType: "geo_map";
  /** `oceanleo.geo-map.v1` 工程。依赖闭包由 `builtInData` 逐条兑现。 */
  project: unknown;
  /** `sources` 的键 → 该键的字节取自哪一件内置数据。 */
  sourcePayloads: Readonly<Record<string, string>>;
}

/** 一张零行数据、只有列头的表。列头是插件的结构，不是别人的内容。 */
export interface PluginInitialSheet {
  name: string;
  /** 第一行是列头，其余是空行；单元格一律是字符串。 */
  rows: readonly (readonly string[])[];
  /** `行:列` → 单元格格式，与 `grid-model` 的 `formats` 同形。 */
  formats?: Readonly<Record<string, Record<string, unknown>>>;
}

export interface PluginGridInitialState extends PluginInitialStateBase {
  kernel: "grid";
  contentType: "grid";
  sheets: readonly PluginInitialSheet[];
}

export interface PluginInteractiveDocInitialState extends PluginInitialStateBase {
  kernel: "interactive-doc";
  contentType: "interactive_doc";
  /** `oceanleo.interactive-doc.v1` 工程。 */
  project: unknown;
}

export type PluginInitialState =
  | PluginGeoMapInitialState
  | PluginGridInitialState
  | PluginInteractiveDocInitialState;

/**
 * 入口层要造 `LibraryItem` 时需要的那几格。`key` / `id` / `siteId` / `app_id` /
 * 草稿标记由入口层自己补 —— 那是 `W12` 的面，这里只交内容与内容自带的元信息。
 */
export interface PluginInitialItemInput {
  pluginId: string;
  title: string;
  /** `LibraryItem.kind`。 */
  kind: "geo_map" | "sheet" | "interactive_doc";
  contentType: PluginContentType;
  /** 结构化源字节；表格类没有内联源，走 `meta.sheets`。 */
  content?: string;
  meta: Record<string, unknown>;
}
