"use client";

// ============================================================================
// @oceanleo/ui — 「当前打开哪个功能」的跨树派发（H 波 W2 产出，W3 承载层消费）
// ----------------------------------------------------------------------------
// 分工（派活合同 §2）：
//   W2（本文件 + `AppCapabilityBar`）只管**入口与选中态**——按键条上点了哪一枚。
//   W3（`ResultCanvas` / `AdvancedContentWorkbench`）管**挂载**——拿到选中态之后
//   在右栏前景层把对应编辑器空手挂起来。
//
// 两边靠这个 context 对接，不靠 DOM 事件也不靠 URL 轮询：
//   · 入口侧：`OperatorConsole` 在 `<Studio>` 外层挂 `AppCapabilityEntryProvider`，
//     所以整棵工作台子树（含右栏 canvas）都读得到。
//   · 承载侧：`useActiveAppCapability()` 返回 `null` 表示「没开功能，右栏照旧」；
//     返回一条记录表示「请在前景层空手挂起 `editorCapability` 这个编辑器」。
//   · 关闭：承载层调 `useAppCapabilityControls().close()`，选中态回到 app 本身，
//     URL 上的 `?cap=` 一并清掉。**前景层不要自己藏起来**——那样按键条还亮着，
//     两边状态就分叉了。
//
// 不变量：功能一律挂前景层，右栏那 5 个固定槽位一个都不动（目标形态文档 §7(b)）。
// ============================================================================

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  type ReactNode,
} from "react";
import {
  appCapabilityFamilyFromSearch,
  appCapabilitySearch,
  type AppCapabilityEntry,
} from "./app-capability-entry";

/** 当前被点开的那枚功能，外加它所属的 app 身份（承载层要用它拼产物归属）。 */
export interface ActiveAppCapability extends AppCapabilityEntry {
  siteKey: string;
  appId: string;
}

export interface AppCapabilityContextValue {
  siteKey: string;
  appId: string;
  /** 这个 app 的全部功能按钮（顺序即按键条顺序）。 */
  entries: AppCapabilityEntry[];
  /** 当前选中的功能；`null` = 没开功能，右栏保持 app 自己的形态。 */
  active: ActiveAppCapability | null;
  /** 打开某枚功能（传映射里的族 id）。不在本 app 映射里的 id 会被忽略。 */
  open: (family: string) => void;
  /** 关掉当前功能，回到 app 本身。 */
  close: () => void;
}

const EMPTY_ENTRIES: AppCapabilityEntry[] = [];

const AppCapabilityContext = createContext<AppCapabilityContextValue | null>(
  null,
);

export interface AppCapabilityEntryProviderProps {
  siteKey: string;
  appId: string;
  entries: AppCapabilityEntry[];
  /** 当前选中的族 id（空串 = 未选）。由 URL `?cap=` 或组件内部状态驱动。 */
  family: string;
  onFamilyChange: (family: string) => void;
  children: ReactNode;
}

export function AppCapabilityEntryProvider({
  siteKey,
  appId,
  entries,
  family,
  onFamilyChange,
  children,
}: AppCapabilityEntryProviderProps) {
  const value = useMemo<AppCapabilityContextValue>(() => {
    const selected = entries.find((entry) => entry.family === family) ?? null;
    return {
      siteKey,
      appId,
      entries,
      active: selected ? { ...selected, siteKey, appId } : null,
      open: (next: string) => {
        // 只认这个 app 映射里真有的族：外来 `?cap=` 或过期书签不得把界面带进一个
        // 解析不出适配器的状态（fail-closed，判据 H1-a 删行即消失也靠这一句）。
        if (!entries.some((entry) => entry.family === next)) return;
        onFamilyChange(next);
      },
      close: () => onFamilyChange(""),
    };
  }, [appId, entries, family, onFamilyChange, siteKey]);
  return (
    <AppCapabilityContext.Provider value={value}>
      {children}
    </AppCapabilityContext.Provider>
  );
}

/** `useAppCapabilityUrlBinding` 的产出：直接摊给 `<OperatorConsole {...} />`。 */
export interface OperatorConsoleCapabilityProps {
  capabilityFamily: string;
  onCapabilityFamilyChange: (family: string) => void;
}

export interface AppCapabilityUrlBindingArgs {
  /** 当前路径（不含 query）。功能选中态只往它后面加 query，路径本身绝不变。 */
  pathname: string;
  /** 当前 query 串（宿主持有的那一份，如 `SiteCatalogConsole.locationSearch`）。 */
  search: string;
  /** 只用到 `replace`：开关功能不该在浏览器历史里堆条目，「返回」仍应回 app 目录。 */
  router: { replace: (href: string) => void };
  /** 宿主自己那份 query 状态的 setter（URL 与本地状态要同一帧更新）。 */
  onSearchChange: (search: string) => void;
}

/**
 * 把功能选中态绑到 URL 的 `?cap=<family>` 上（判据 H1-d：路由仍是 `/workspace/<appId>`）。
 *
 * 与 app 身份用同一套约定——单一事实源在 URL，组件受控——只是键名不同。
 * 换 app 时宿主生成的 href 不带 query，`?cap=` 自然被丢掉，不会串到下一个 app。
 */
export function useAppCapabilityUrlBinding({
  pathname,
  search,
  router,
  onSearchChange,
}: AppCapabilityUrlBindingArgs): OperatorConsoleCapabilityProps {
  const onCapabilityFamilyChange = useCallback(
    (family: string) => {
      const nextSearch = appCapabilitySearch(search, family);
      if (nextSearch === search) return;
      onSearchChange(nextSearch);
      router.replace(`${pathname}${nextSearch}`);
    },
    [onSearchChange, pathname, router, search],
  );
  return {
    capabilityFamily: appCapabilityFamilyFromSearch(search),
    onCapabilityFamilyChange,
  };
}

/**
 * 承载层（W3）的读取入口：当前该在前景层挂哪个编辑器。
 * 不在 Provider 下（旧宿主、embed 的一部分路径）返回 `null`，不抛错。
 */
export function useActiveAppCapability(): ActiveAppCapability | null {
  return useContext(AppCapabilityContext)?.active ?? null;
}

/**
 * 选中态的读写面。没有 Provider 时给一份惰性空值（`open`/`close` 是 no-op），
 * 这样承载层不必到处写 `?.`，也不会因为宿主没接线就崩。
 */
export function useAppCapabilityControls(): AppCapabilityContextValue {
  const value = useContext(AppCapabilityContext);
  return (
    value ?? {
      siteKey: "",
      appId: "",
      entries: EMPTY_ENTRIES,
      active: null,
      open: () => {},
      close: () => {},
    }
  );
}
