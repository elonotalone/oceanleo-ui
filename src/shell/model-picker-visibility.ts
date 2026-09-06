// 右上角「模型组合」只出现在首页和 agent 对话页。
// 项目、工作台、探索、素材库等自带顶栏操作的页面不再挂它，避免压住本页按钮。

import { LOCALES } from "../i18n/config";
import { stripFusionMountPrefix } from "./workspace-route";

export type ModelPickerSearchParams = Pick<URLSearchParams, "get" | "has">;
export type ModelPickerSearchInput =
  | string
  | ModelPickerSearchParams
  | null
  | undefined;

const FUNCTION_RUNTIME_PARAMS = ["fn", "function", "app", "mode"] as const;
const LOCALE_PATH_PREFIXES = new Set(
  LOCALES.map((locale) => locale.toLowerCase()),
);
const DISABLED_QUERY_FLAGS = new Set(["0", "false", "no", "off"]);

function searchParamReader(search: ModelPickerSearchInput): ModelPickerSearchParams {
  if (typeof search === "string") {
    return new URLSearchParams(search.replace(/^\?/, ""));
  }
  return search ?? new URLSearchParams();
}

function decodedRouteSegment(segment: string): string {
  try {
    return decodeURIComponent(segment);
  } catch {
    return segment;
  }
}

export function logicalRouteSegments(pathname: string): string[] {
  const pathOnly = stripFusionMountPrefix(
    (pathname || "/").split(/[?#]/, 1)[0],
  );
  const segments = pathOnly
    .split("/")
    .filter(Boolean)
    .map(decodedRouteSegment);
  if (segments[0] && LOCALE_PATH_PREFIXES.has(segments[0].toLowerCase())) {
    return segments.slice(1);
  }
  return segments;
}

function enabledQueryFlag(
  searchParams: ModelPickerSearchParams,
  key: "embed" | "solo",
): boolean {
  if (!searchParams.has(key)) return false;
  const value = (searchParams.get(key) || "").trim().toLowerCase();
  return !DISABLED_QUERY_FLAGS.has(value);
}

function filledQuery(searchParams: ModelPickerSearchParams, key: string): boolean {
  return (searchParams.get(key) || "").trim().length > 0;
}

export interface ModelPickerVisibilityContext {
  /**
   * 路由之外的覆盖层事实：任一编辑器 / 详情面板正开着（`workbench-open-store.ts`）。
   * /history/<id> 按路由是对话页，但库里点开一件素材之后同一条路由上叠的是编辑器，
   * 选择框再留着就压在面板页签上——所以它一律优先于路由规则。
   */
  workbenchOpen?: boolean;
}

/**
 * 首页（`/`、`/home`）和正在进行 / 历史任务对话页显示切换器。
 * 嵌入页、编辑器、工作台 app 运行时、项目和其他目录页都不显示。
 * 任一编辑器 / 详情面板开着时（`context.workbenchOpen`）无论路由一律不显示。
 */
export function shouldShowModelPicker(
  pathname: string,
  search: ModelPickerSearchInput = "",
  context: ModelPickerVisibilityContext = {},
): boolean {
  if (context.workbenchOpen) return false;
  const searchParams = searchParamReader(search);
  if (
    enabledQueryFlag(searchParams, "embed")
    || enabledQueryFlag(searchParams, "solo")
  ) {
    return false;
  }
  if (FUNCTION_RUNTIME_PARAMS.some((key) => filledQuery(searchParams, key))) {
    return false;
  }

  const segments = logicalRouteSegments(pathname);
  const head = (segments[0] || "").toLowerCase();
  if (head === "advanced") return false;
  if (segments.length === 0) return true;
  if (segments.length === 1 && head === "home") return true;

  if (head === "tasks") {
    return segments.length === 2 && Boolean(segments[1]);
  }

  if (head === "history") {
    if (segments.length >= 2 && Boolean(segments[1])) return true;
    if (segments.length === 1) {
      return filledQuery(searchParams, "task") || filledQuery(searchParams, "session");
    }
    return false;
  }

  return false;
}
