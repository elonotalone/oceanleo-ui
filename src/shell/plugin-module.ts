import type { ReactNode } from "react";

/** 这件插件自己决定它出现在哪些 app 上。写不出理由的 app 不要列。 */
export type PluginPlacement = { site: string; app: string };

/** 平台给插件的全部能力面。插件想用就用，一个都不是必填的。 */
export type PluginHost = {
  siteKey: string;
  appId: string;
  /** 读所在 app 已经算出来的数（W6 实现）。app 没有可给的数时返回 null。 */
  appData: () => Promise<unknown | null>;
  /** 存插件自己的状态。形状由插件自己定，平台不校验。 */
  save: (state: unknown) => Promise<void>;
  load: () => Promise<unknown | null>;
  /** 导出物是素材，落进「我的库」。kind 由插件自己给，平台不枚举。 */
  exportArtifact: (bytes: Blob, kind: string, filename: string) => Promise<void>;
};

export type PluginModule = {
  /** 全平台唯一。 */
  id: string;
  /** 用户看到的中文名。不许含「插件」二字（那是内部概念名）。 */
  label: string;
  placements: PluginPlacement[];
  /**
   * 它自己画。canvas、WebGL、SVG、DOM、自带的渲染器 —— 全都行，
   * 平台不规定用哪一种，也不提供必须套的壳。
   */
  render: (host: PluginHost) => ReactNode;
};

export interface PluginStateAccess {
  save: PluginHost["save"];
  load: PluginHost["load"];
}

const PLUGIN_STATE_DATABASE = "oceanleo-plugin-host";
const PLUGIN_STATE_STORE = "states";
const pluginStateMemory = new Map<string, unknown>();
let pluginStateDatabasePromise: Promise<IDBDatabase | null> | null = null;

function pluginStateKey(siteKey: string, appId: string, pluginId: string): string {
  return JSON.stringify([siteKey, appId, pluginId]);
}

function openPluginStateDatabase(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (pluginStateDatabasePromise) return pluginStateDatabasePromise;
  pluginStateDatabasePromise = new Promise((resolve) => {
    const request = indexedDB.open(PLUGIN_STATE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(PLUGIN_STATE_STORE)) {
        request.result.createObjectStore(PLUGIN_STATE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return pluginStateDatabasePromise;
}

/**
 * 一件模块在一个 app 里的不透明状态槽。浏览器持久层使用 structured clone；
 * 平台不解析、不规范化，也不要求状态属于某种 schema。
 */
export function createPluginStateAccess(
  siteKey: string,
  appId: string,
  pluginId: string,
): PluginStateAccess {
  const key = pluginStateKey(siteKey, appId, pluginId);
  return {
    save: async (state) => {
      pluginStateMemory.set(key, state);
      const database = await openPluginStateDatabase();
      if (!database) return;
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(PLUGIN_STATE_STORE, "readwrite");
        transaction.objectStore(PLUGIN_STATE_STORE).put(state, key);
        transaction.oncomplete = () => resolve();
        transaction.onerror = () => reject(transaction.error);
        transaction.onabort = () => reject(transaction.error);
      });
    },
    load: async () => {
      if (pluginStateMemory.has(key)) return pluginStateMemory.get(key) ?? null;
      const database = await openPluginStateDatabase();
      if (!database) return null;
      const state = await new Promise<unknown>((resolve, reject) => {
        const request = database
          .transaction(PLUGIN_STATE_STORE, "readonly")
          .objectStore(PLUGIN_STATE_STORE)
          .get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      if (state === undefined) return null;
      pluginStateMemory.set(key, state);
      return state;
    },
  };
}

/** 把模块给出的原始 Blob 交给现有文件库；`kind` 原样作为文件内容类型。 */
export async function exportPluginArtifact(
  siteKey: string,
  bytes: Blob,
  kind: string,
  filename: string,
): Promise<void> {
  const { uploadFile } = await import("../lib/database");
  const result = await uploadFile(
    new File([bytes], filename, { type: kind }),
    { siteId: siteKey, title: filename },
  );
  if (!result.ok || !result.data?.file) {
    throw new Error(result.error || "导出物写入我的库失败。");
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("oceanleo:artifact-library-change", {
        detail: { action: "upload", file: result.data.file },
      }),
    );
  }
}

/** 本波之后返回空数组：平台上一件插件都没有，这是预期状态。 */
export function pluginModules(): PluginModule[] {
  return [];
}

/** 位置层唯一需要指出的模块文案问题；这里不检查插件内容。 */
export function pluginModuleProblem(module: PluginModule): string | null {
  return module.label.includes("插件")
    ? `「${module.label}」含内部概念名“插件”，不能作为用户可见名称。`
    : null;
}

/**
 * 给位置层取当前 app 的模块。placements 为空自然不会产出按键；除此之外，
 * 平台不枚举、不审核模块内容。
 */
export function pluginModulesForPlacement(
  site: string,
  app: string,
  modules: readonly PluginModule[] = pluginModules(),
): PluginModule[] {
  return modules.filter(
    (module) =>
      !pluginModuleProblem(module) &&
      module.placements.some(
        (placement) => placement.site === site && placement.app === app,
      ),
  );
}
