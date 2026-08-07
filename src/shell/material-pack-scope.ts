/**
 * 素材包视图的下发通道（模型本身在 `material-pack-model.ts`）。
 *
 * 为什么要一条通道而不是直接传 props：算出三层需要**未经分区过滤、未改标题**的原始
 * entries 加上站点 app 目录，这两样只有 `material-library-view.tsx` 手里齐全；而渲染包
 * 的是探索页与货架那几个组件（另一位 owner 的面）。中间隔着 `WorkspaceLibrary` 的 props
 * 契约，加一个穿透 prop 要同时改两个 owner 的文件。
 *
 * 形状照抄同目录里已经在用的 `registerSiteAppDirectory`：模块级 Map + 显式订阅，
 * 消费侧 `useSyncExternalStore` 绑定，SSR 与 CSR 拿到同一份快照。
 */

import { useEffect, useMemo, useSyncExternalStore } from "react";
import {
  materialPackView,
  type MaterialPackView,
  type MaterialPackViewInput,
} from "./material-pack-model";

const views = new Map<string, MaterialPackView>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of [...listeners]) listener();
}

/** 下发一份包视图；返回撤回函数（站点卸载时把这一份摘掉，别让陈旧包留在 Map 里）。 */
export function publishMaterialPackView(
  siteKey: string,
  view: MaterialPackView | null,
): () => void {
  const key = String(siteKey || "").trim();
  if (!key || !view) return () => {};
  views.set(key, view);
  emit();
  return () => {
    if (views.get(key) === view) {
      views.delete(key);
      emit();
    }
  };
}

export function readMaterialPackView(siteKey: string): MaterialPackView | null {
  return views.get(String(siteKey || "").trim()) || null;
}

export function subscribeMaterialPackViews(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 测试与 HMR 用。产品代码不要调。 */
export function resetMaterialPackViews(): void {
  views.clear();
  emit();
}

/**
 * 算一份包视图并下发。`input` 为 null（不在本站层、目录还没到）时什么都不做，
 * 消费侧读到 null 就退回今天的两层呈现，而不是画一个空的三层骨架。
 */
export function useMaterialPackView(
  input: MaterialPackViewInput | null,
): MaterialPackView | null {
  const entries = input?.entries;
  const siteKey = input?.siteKey || "";
  const directory = input?.directory || null;
  const scene = input ? input.scene : null;
  const anchoredAppId = input?.anchoredAppId || "";
  const view = useMemo(
    () =>
      entries
        ? materialPackView({
            entries,
            siteKey,
            directory,
            scene,
            anchoredAppId,
          })
        : null,
    [anchoredAppId, directory, entries, scene, siteKey],
  );
  useEffect(
    () => publishMaterialPackView(siteKey, view),
    [siteKey, view],
  );
  return view;
}

/** 消费侧入口：拿本站当前的包视图，没有就是 null。 */
export function useMaterialPacks(siteKey: string): MaterialPackView | null {
  return useSyncExternalStore(
    subscribeMaterialPackViews,
    () => readMaterialPackView(siteKey),
    () => readMaterialPackView(siteKey),
  );
}
