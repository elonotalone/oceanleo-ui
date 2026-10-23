"use client";

/**
 * 表格舞台与活的 Univer 实例之间的三条线（从 `GridUniverStage.tsx` 抽出，舞台不再变大）：
 *
 * 1. 主题：站点 light / dark → `univerAPI.toggleDarkMode`（ribbon、菜单、页脚变深）+
 *    画布取色映射（`dark-canvas.ts`：默认色换主题色，用户色原样）。
 * 2. 改动判据：撤销栈栈顶变了 = 本人改了文档（`edit-watch.ts`）→ `onPersonWrite`，
 *    顶栏 ↶ ↷ 的可用状态也从撤销栈来。
 * 3. 编辑栏取值：每次命令 / 选区变化后读一次当前格子（`selection-style.ts`），
 *    一帧最多读一次，读数没变不重渲染。
 *
 * Univer 的服务标识符（`IUndoRedoService`、`ICanvasColorService`）由舞台传进来：
 * 运行时 import 只许在舞台那一个叶子里（`W01-deps.md` §4）。
 */
import { useCallback, useEffect, useRef, useState, type MutableRefObject } from "react";
import {
  GRID_DARK_STAGE_CSS,
  installGridDarkCanvas,
  type GridCanvasColorServiceLike,
} from "./dark-canvas";
import {
  createGridEditWatch,
  type GridCommandEventSource,
  type GridEditWatch,
  type GridUndoStackLike,
  type GridUndoStatus,
} from "./edit-watch";
import {
  gridSelectionReadKey,
  readGridSelectionStyle,
  type GridSelectionStyleApi,
  type GridSelectionStyleRead,
} from "./selection-style";

export const GRID_UNIVER_THEME_ATTR = "data-grid-univer-theme";
const STYLE_ELEMENT_ID = "oceanleo-grid-univer-dark";

interface InjectorLike {
  get(identifier: unknown): unknown;
}

export interface GridUniverLiveHandle {
  univer: { __getInjector?: () => InjectorLike };
  api: GridSelectionStyleApi &
    GridCommandEventSource & { toggleDarkMode?: (dark: boolean) => void };
}

export interface GridUniverServiceIds {
  undo: unknown;
  canvasColor: unknown;
}

function service<T>(handle: GridUniverLiveHandle, id: unknown): T | null {
  try {
    return (handle.univer.__getInjector?.().get(id) as T) ?? null;
  } catch {
    return null;
  }
}

function ensureDarkStyle() {
  if (typeof document === "undefined" || document.getElementById(STYLE_ELEMENT_ID)) return;
  const style = document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = GRID_DARK_STAGE_CSS;
  document.head.appendChild(style);
}

export function useGridUniverLive(options: {
  handleRef: MutableRefObject<unknown>;
  containerRef: MutableRefObject<HTMLElement | null>;
  ready: boolean;
  dark: boolean;
  ids: GridUniverServiceIds;
  editBlockedRef: MutableRefObject<boolean>;
  onPersonWrite: () => void;
}) {
  const { handleRef, containerRef, ready, dark, ids, editBlockedRef } = options;
  const [read, setRead] = useState<GridSelectionStyleRead | null>(null);
  const [history, setHistory] = useState<GridUndoStatus>({ canUndo: false, canRedo: false });
  const watchRef = useRef<GridEditWatch | null>(null);
  const darkRef = useRef(dark);
  darkRef.current = dark;
  const onPersonWriteRef = useRef(options.onPersonWrite);
  onPersonWriteRef.current = options.onPersonWrite;
  const idsRef = useRef(ids);

  useEffect(() => {
    const handle = handleRef.current as GridUniverLiveHandle | null;
    if (!ready || !handle) return undefined;
    ensureDarkStyle();
    const uninstall = installGridDarkCanvas(
      service<GridCanvasColorServiceLike>(handle, idsRef.current.canvasColor),
      () => darkRef.current,
    );
    let frame = 0;
    let lastKey = "";
    const refresh = () => {
      if (frame || typeof requestAnimationFrame === "undefined") return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const live = handleRef.current as GridUniverLiveHandle | null;
        const next = readGridSelectionStyle(live?.api);
        const key = gridSelectionReadKey(next);
        if (key === lastKey) return;
        lastKey = key;
        setRead(next);
      });
    };
    const watch = createGridEditWatch({
      undo: service<GridUndoStackLike>(handle, idsRef.current.undo),
      events: handle.api,
      onPersonWrite: () => onPersonWriteRef.current(),
      onHistory: setHistory,
      onAnyCommand: refresh,
      blocked: () => editBlockedRef.current,
    });
    watchRef.current = watch;
    refresh();
    return () => {
      watch.dispose();
      if (watchRef.current === watch) watchRef.current = null;
      uninstall();
      if (frame && typeof cancelAnimationFrame !== "undefined") cancelAnimationFrame(frame);
      // Univer 把 `univer-dark` 挂在 <html> 上，卸载时它自己不摘。
      if (typeof document !== "undefined") {
        document.documentElement.classList.remove("univer-dark");
      }
    };
    // 只按「实例就绪」重装；handle / 回调都从 ref 里现取。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready]);

  useEffect(() => {
    containerRef.current?.setAttribute(GRID_UNIVER_THEME_ATTR, dark ? "dark" : "light");
    const handle = handleRef.current as GridUniverLiveHandle | null;
    if (!ready || !handle) return;
    // 先换取色映射（darkRef 已是新值）再让 Univer 翻 darkMode：它会把所有画布标脏重画。
    handle.api.toggleDarkMode?.(dark);
  }, [containerRef, dark, handleRef, ready]);

  const resetBaseline = useCallback(() => {
    watchRef.current?.resetBaseline();
  }, []);

  return { read, history, resetBaseline };
}
