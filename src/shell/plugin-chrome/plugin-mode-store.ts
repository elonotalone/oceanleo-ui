// ============================================================================
// L0 专业模式的状态与持久化（W01，2026-09-03，editor-core-swap · 判据 3 / R3）
//
// **默认普通模式。** 这是 R3 的原话，也是本文件存在的全部理由：13 件编辑器接了
// 成熟内核之后，内核自带的完整 UI（Univer 的 ribbon、Umo 的菜单栏、PPTist 的
// 工具栏）不能一上来就糊在用户脸上——那正是本波要治的「死板」的另一种形态。
// 专业模式是一个**用户主动做出的选择**，做完之后按「用户 × 编辑器」记住。
//
// 持久化形状逐字照抄 `plugin-theme.tsx` 的既有样板（同一个 key 前缀风格、
// 同一套跨实例小仓 + storage 事件收敛、同一个 SSR 回落）。不另发明一套的理由
// 很实在：那份样板已经在 13 件插件上跑过一波，且它解决过一个这里一定会撞上的
// 问题——同一页里多个 hook 读同一份值要同步。
//
// **状态与组件分两个文件**：这一份是纯 TS（无 JSX），所以判据能直接 import 它
// 单测；`node --experimental-strip-types` 不认 `.tsx` 里的 JSX
// （`tests/ts-extension-loader.mjs` 只补扩展名、不做 JSX 转译，全仓也没有任何
// 一份判据 import 过 `.tsx`）。把可测的逻辑留在 `.ts` 里是仓里已有的分工。
//
// ⚠️ 「按用户」在浏览器侧就是 localStorage（本仓没有第一方用户偏好后端，
// 主题那条也是这么落的）。换机器/换浏览器不跟随，这是**已知的、缩小了的承诺**，
// 写在交付说明里，不假装它是服务端偏好。
// ============================================================================

import type { EditorMode } from "../hosted-editor";
import type { PluginThemeId } from "../plugin-theme";

const STORAGE_PREFIX = "oceanleo.editor-mode.";

/** R3：默认普通模式。不是「记住上次」——没存过就是 normal。 */
export const DEFAULT_PLUGIN_MODE: EditorMode = "normal";

export function pluginModeStorageKey(pluginId: PluginThemeId): string {
  return `${STORAGE_PREFIX}${pluginId}`;
}

function parseMode(value: string | null): EditorMode | null {
  return value === "normal" || value === "pro" ? value : null;
}

/* ---------------------------------------------------------------------------
 * 跨实例同步的小仓。同一 pluginId 的所有 hook（顶栏开关、路由、adapter 桥）
 * 读同一份值；写入通知本页监听者；其他标签页经 storage 事件收敛。
 * ------------------------------------------------------------------------- */
const modeCache = new Map<PluginThemeId, EditorMode>();
const modeListeners = new Map<PluginThemeId, Set<() => void>>();
let storageListenerInstalled = false;

function notify(pluginId: PluginThemeId) {
  modeListeners.get(pluginId)?.forEach((listener) => listener());
}

function ensureStorageListener() {
  if (storageListenerInstalled || typeof window === "undefined") return;
  storageListenerInstalled = true;
  window.addEventListener("storage", (event) => {
    if (!event.key?.startsWith(STORAGE_PREFIX)) return;
    const pluginId = event.key.slice(STORAGE_PREFIX.length) as PluginThemeId;
    const next = parseMode(event.newValue) || DEFAULT_PLUGIN_MODE;
    if (modeCache.get(pluginId) === next) return;
    modeCache.set(pluginId, next);
    notify(pluginId);
  });
}

export function currentPluginMode(pluginId: PluginThemeId): EditorMode {
  const cached = modeCache.get(pluginId);
  if (cached) return cached;
  let stored: EditorMode | null = null;
  if (typeof window !== "undefined") {
    try {
      stored = parseMode(
        window.localStorage.getItem(pluginModeStorageKey(pluginId)),
      );
    } catch {
      stored = null;
    }
  }
  const value = stored || DEFAULT_PLUGIN_MODE;
  modeCache.set(pluginId, value);
  return value;
}

export function setPluginMode(pluginId: PluginThemeId, mode: EditorMode) {
  modeCache.set(pluginId, mode);
  try {
    window.localStorage.setItem(pluginModeStorageKey(pluginId), mode);
  } catch {
    /* 存储不可用时本次会话内仍即时生效，只是不持久。 */
  }
  notify(pluginId);
}

export function subscribePluginMode(
  pluginId: PluginThemeId,
  listener: () => void,
) {
  ensureStorageListener();
  let set = modeListeners.get(pluginId);
  if (!set) {
    set = new Set();
    modeListeners.set(pluginId, set);
  }
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/** 测试用：清掉进程内缓存，让下一次读重新走 localStorage。 */
export function resetPluginModeCache() {
  modeCache.clear();
}
