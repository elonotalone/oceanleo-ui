// 通话界面的本地状态（不进引擎）：放大视图开没开、小窗贴哪个角（记在本机）、有没有人要求把焦点给小窗。
// 模块级小仓库 + useSyncExternalStore：CallHost 换页重挂也不丢「放大」状态；别的模块（W08 的入口）只发信号不直接改。
import { useSyncExternalStore } from "react";
import { DEFAULT_DOCK_CORNER, isDockCorner, type DockCorner } from "./layout";

export const DOCK_CORNER_STORAGE_KEY = "oceanleo.call.dock-corner";

export interface CallUiState {
  /** 放大视图（全窗口浮层）开着。 */
  stageOpen: boolean;
  /** 小窗贴的角（窄屏不用：窄屏固定底部条）。 */
  corner: DockCorner;
  /** 每要求一次「把焦点给通话窗口」就 +1（W08 的入口点「通话中」时发）。 */
  focusTick: number;
}

function storedCorner(): DockCorner {
  if (typeof window === "undefined") return DEFAULT_DOCK_CORNER;
  try {
    const value = window.localStorage.getItem(DOCK_CORNER_STORAGE_KEY);
    return isDockCorner(value) ? value : DEFAULT_DOCK_CORNER;
  } catch {
    return DEFAULT_DOCK_CORNER;
  }
}

const SERVER_STATE: CallUiState = { stageOpen: false, corner: DEFAULT_DOCK_CORNER, focusTick: 0 };

let state: CallUiState = { stageOpen: false, corner: storedCorner(), focusTick: 0 };
const listeners = new Set<() => void>();

function commit(next: CallUiState): void {
  if (next === state) return;
  state = next;
  for (const listener of [...listeners]) listener();
}

export const callUiStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): CallUiState {
    return state;
  },
};

export function useCallUiState(): CallUiState {
  return useSyncExternalStore(callUiStore.subscribe, callUiStore.getSnapshot, () => SERVER_STATE);
}

/** 放大：全窗口浮层（不是新页面）。 */
export function openCallStage(): void {
  if (!state.stageOpen) commit({ ...state, stageOpen: true });
}

/** 缩小：回到小窗。 */
export function closeCallStage(): void {
  if (state.stageOpen) commit({ ...state, stageOpen: false });
}

/** 把焦点交给通话窗口（小窗；放大视图开着就是放大视图）。 */
export function requestCallWindowFocus(): void {
  commit({ ...state, focusTick: state.focusTick + 1 });
}

export function setDockCorner(corner: DockCorner): void {
  if (!isDockCorner(corner)) return;
  try {
    window.localStorage.setItem(DOCK_CORNER_STORAGE_KEY, corner);
  } catch {
    /* 隐身模式等存不进去：本次会话里照样生效 */
  }
  if (state.corner !== corner) commit({ ...state, corner });
}
