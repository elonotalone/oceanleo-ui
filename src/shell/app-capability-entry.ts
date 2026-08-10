// 操控台按键的数据面只做位置解析：插件模块自己声明 placements，平台不持有
// site/app/插件清册，也不检查它使用何种数据结构或渲染方式。

import {
  pluginModules,
  type PluginModule,
} from "./plugin-module";

export const APP_CAPABILITY_QUERY_KEY = "cap";

/** 位置层直接携带完整模块，右栏因此能调用模块自己的 render。 */
export type AppCapabilityEntry = PluginModule;

/**
 * 唯一的显示约束：用户可见名称不能含内部概念名「插件」。
 * 不检查模块内容、渲染器、状态形状或导出种类。
 */
export function isUsableAppCapabilityEntry(
  entry: AppCapabilityEntry | null | undefined,
): entry is AppCapabilityEntry {
  return Boolean(entry && !entry.label.includes("插件"));
}

/**
 * 从插件自己的 placements 取当前 app 的按钮。不存在的 app 自然得到空数组，
 * 既不需要登记，也不会抛错。
 */
export function resolveAppCapabilityEntries(
  modules: readonly PluginModule[] | null | undefined,
  siteKey: string,
  appId: string,
): AppCapabilityEntry[] {
  const site = (siteKey || "").trim();
  const app = (appId || "").trim();
  if (!site || !app || !modules) return [];

  return modules.filter(
    (module) =>
      isUsableAppCapabilityEntry(module) &&
      module.placements.some(
        (placement) =>
          placement.site.trim() === site && placement.app.trim() === app,
      ),
  );
}

export function appCapabilityEntries(
  siteKey: string,
  appId: string,
): AppCapabilityEntry[] {
  return resolveAppCapabilityEntries(pluginModules(), siteKey, appId);
}

export function appCapabilityEntryByFamily(
  siteKey: string,
  appId: string,
  pluginId: string,
): AppCapabilityEntry | null {
  const wanted = (pluginId || "").trim();
  if (!wanted) return null;
  return (
    appCapabilityEntries(siteKey, appId).find((entry) => entry.id === wanted) ??
    null
  );
}

export function appCapabilityFamilyFromSearch(search: string): string {
  const raw = (search || "").trim();
  if (!raw) return "";
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  return (params.get(APP_CAPABILITY_QUERY_KEY) || "").trim();
}

export function appCapabilityFromSearch(
  search: string,
  siteKey: string,
  appId: string,
): AppCapabilityEntry | null {
  return appCapabilityEntryByFamily(
    siteKey,
    appId,
    appCapabilityFamilyFromSearch(search),
  );
}

/** 选中态只改 query，不改变 `/workspace/<appId>` 路径。 */
export function appCapabilitySearch(
  search: string,
  pluginId: string | null,
): string {
  const raw = (search || "").trim();
  const params = new URLSearchParams(raw.startsWith("?") ? raw.slice(1) : raw);
  const next = (pluginId || "").trim();
  if (next) params.set(APP_CAPABILITY_QUERY_KEY, next);
  else params.delete(APP_CAPABILITY_QUERY_KEY);
  const query = params.toString();
  return query ? `?${query}` : "";
}
