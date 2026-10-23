"use client";

// ============================================================================
// 第一行 `···` 菜单的挂号处（W01，编辑器整改波 2026-10-23，操作员裁定 D1）
// ----------------------------------------------------------------------------
// 第一行只剩一个 `···`。分享 / 收藏 / 下载由菜单自己画；「邀请一起改」「生成回放」
// 却住在懒加载的协同块里——`collab/CollabActionSlot.tsx` 刻意只依赖 react，
// 没有协同绑定的编辑器、没登录的人、境内版都不加载 yjs 与消息客户端。
// 所以菜单不 import 它们：协同块挂载后把自己的菜单项登记到这里，菜单打开时
// 按 `order` 画在最前面。弹窗仍由协同块自己画、锚在 `···` 按钮上（`anchorRef`），
// 所以点菜单项弹出的就是原来那个窗口，不是另做的一份。
//
// 纯 TS（无 JSX），判据可以直接 import。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { WorkbenchIconName } from "../AdvancedEditorIcon";

export interface PluginMoreMenuEntry {
  /** 稳定 id；菜单项上落成 `data-more-menu-entry`。 */
  id: string;
  /** 已翻译的文字（登记方在自己的 `tt()` 里翻好）。 */
  label: string;
  icon: WorkbenchIconName;
  /** 小的排前面。邀请一起改 = 10，生成回放 = 20；分享 / 收藏 / 下载恒在登记项之后。 */
  order: number;
  onSelect: () => void;
}

export interface PluginMoreMenuRegistry {
  /** `···` 按钮本身。登记方的弹窗锚在它上面。 */
  anchorRef: RefObject<HTMLButtonElement | null>;
  setEntries(ownerId: string, entries: readonly PluginMoreMenuEntry[]): void;
  clearEntries(ownerId: string): void;
}

export const PluginMoreMenuRegistryContext =
  createContext<PluginMoreMenuRegistry | null>(null);

/** 菜单项排序：先 `order`，同序按 id，保证两次渲染顺序一致。 */
export function sortPluginMoreMenuEntries(
  entries: readonly PluginMoreMenuEntry[],
): PluginMoreMenuEntry[] {
  return [...entries].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  );
}

/** 宿主（第一行）用：建登记处，并拿到排好序的登记项。 */
export function usePluginMoreMenuHost(): {
  registry: PluginMoreMenuRegistry;
  entries: readonly PluginMoreMenuEntry[];
} {
  const anchorRef = useRef<HTMLButtonElement | null>(null);
  const [byOwner, setByOwner] = useState<
    ReadonlyMap<string, readonly PluginMoreMenuEntry[]>
  >(() => new Map());
  const setEntries = useCallback(
    (ownerId: string, entries: readonly PluginMoreMenuEntry[]) => {
      setByOwner((current) => {
        const next = new Map(current);
        next.set(ownerId, entries);
        return next;
      });
    },
    [],
  );
  const clearEntries = useCallback((ownerId: string) => {
    setByOwner((current) => {
      if (!current.has(ownerId)) return current;
      const next = new Map(current);
      next.delete(ownerId);
      return next;
    });
  }, []);
  const registry = useMemo(
    () => ({ anchorRef, setEntries, clearEntries }),
    [clearEntries, setEntries],
  );
  const entries = useMemo(
    () => sortPluginMoreMenuEntries([...byOwner.values()].flat()),
    [byOwner],
  );
  return { registry, entries };
}

/** 登记方是否挂在某个 `···` 宿主里（不在时它该自己画触发器）。 */
export function usePluginMoreMenuRegistry(): PluginMoreMenuRegistry | null {
  return useContext(PluginMoreMenuRegistryContext);
}

/**
 * 登记方用：挂载时登记，卸载或清单变化时撤销重登。
 *
 * `onSelect` 每次渲染都可以是新闭包：登记进去的是一个转发器，永远调最新那一个，
 * 所以闭包换了不会触发重登记（重登记会让宿主重渲染，宿主又让登记方重渲染，
 * 闭包再换——那就是一个死循环）。只有 id / 文字 / 图标 / 顺序变了才重登。
 * 返回 `···` 按钮的 ref（弹窗锚点）；不在任何宿主里时返回 null。
 */
export function usePluginMoreMenuEntries(
  ownerId: string,
  entries: readonly PluginMoreMenuEntry[],
): RefObject<HTMLButtonElement | null> | null {
  const registry = useContext(PluginMoreMenuRegistryContext);
  const latest = useRef(entries);
  latest.current = entries;
  const signature = entries
    .map((entry) => [entry.id, entry.label, entry.icon, entry.order].join("\u0000"))
    .join("\u0001");
  useEffect(() => {
    if (!registry) return;
    registry.setEntries(
      ownerId,
      latest.current.map((entry) => ({
        ...entry,
        onSelect: () =>
          latest.current.find((current) => current.id === entry.id)?.onSelect(),
      })),
    );
    return () => registry.clearEntries(ownerId);
  }, [ownerId, registry, signature]);
  return registry?.anchorRef ?? null;
}
