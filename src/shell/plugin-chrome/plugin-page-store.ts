// 插件「当前页」小仓（plugin-chrome-unification · W01）。
// 页面记忆 = 模式记忆：持久化仍走 plugin-mode-store 的 key。
// aux 页只活在本会话的内存里；刷新后按记住的 normal/pro 回到 artifact 或 pro。

import { useCallback, useSyncExternalStore } from "react";

import type { PluginThemeId } from "../plugin-theme";
import {
  ARTIFACT_PAGE_ID,
  editorModeToPage,
  pageToEditorMode,
} from "./plugin-pages";
import {
  currentPluginMode,
  setPluginMode,
  subscribePluginMode,
} from "./plugin-mode-store";

const pageCache = new Map<PluginThemeId, string>();
const pageListeners = new Map<PluginThemeId, Set<() => void>>();
const modeBridged = new Set<PluginThemeId>();

function notify(pluginId: PluginThemeId) {
  pageListeners.get(pluginId)?.forEach((listener) => listener());
}

function syncPageFromMode(pluginId: PluginThemeId) {
  const mode = currentPluginMode(pluginId);
  const page = pageCache.get(pluginId) ?? editorModeToPage(mode);
  if (pageToEditorMode(page) === mode) return;
  pageCache.set(pluginId, editorModeToPage(mode));
  notify(pluginId);
}

function ensureModeBridge(pluginId: PluginThemeId) {
  if (modeBridged.has(pluginId)) return;
  modeBridged.add(pluginId);
  subscribePluginMode(pluginId, () => syncPageFromMode(pluginId));
}

export function currentPluginPage(pluginId: PluginThemeId): string {
  ensureModeBridge(pluginId);
  const cached = pageCache.get(pluginId);
  if (cached) return cached;
  return editorModeToPage(currentPluginMode(pluginId));
}

export function setPluginPage(pluginId: PluginThemeId, pageId: string): void {
  ensureModeBridge(pluginId);
  const prev = currentPluginPage(pluginId);
  if (prev !== pageId) {
    pageCache.set(pluginId, pageId);
    notify(pluginId);
  } else if (!pageCache.has(pluginId)) {
    pageCache.set(pluginId, pageId);
  }
  const nextMode = pageToEditorMode(pageId);
  if (currentPluginMode(pluginId) !== nextMode) {
    setPluginMode(pluginId, nextMode);
  }
}

export function subscribePluginPage(
  pluginId: PluginThemeId,
  cb: () => void,
): () => void {
  ensureModeBridge(pluginId);
  let set = pageListeners.get(pluginId);
  if (!set) {
    set = new Set();
    pageListeners.set(pluginId, set);
  }
  set.add(cb);
  return () => {
    set.delete(cb);
  };
}

export function usePluginPage(
  pluginId: PluginThemeId,
): { pageId: string; setPage(id: string): void } {
  const pageId = useSyncExternalStore(
    useCallback(
      (listener: () => void) => subscribePluginPage(pluginId, listener),
      [pluginId],
    ),
    useCallback(() => currentPluginPage(pluginId), [pluginId]),
    useCallback(() => ARTIFACT_PAGE_ID, []),
  );
  return {
    pageId,
    setPage: useCallback(
      (id: string) => setPluginPage(pluginId, id),
      [pluginId],
    ),
  };
}

/** 测试用：清掉进程内页缓存，让下一次读重新从 mode store 推导。 */
export function resetPluginPageCache() {
  pageCache.clear();
}
