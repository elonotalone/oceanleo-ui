// 「通话检测」面板的开关（模块内小 store）：`CallTestMenuItem` 只负责打开，
// 面板由常驻的 `CallDiagnosticsHost` 渲染（A-7），菜单关掉、不在通话中都不影响。
export interface CallTestState {
  open: boolean;
  /** 已挂载的宿主数；为 0 时 `CallTestMenuItem` 自己兜底渲染面板。 */
  hosts: number;
}

let state: CallTestState = { open: false, hosts: 0 };
const listeners = new Set<() => void>();

function set(next: Partial<CallTestState>): void {
  const merged = { ...state, ...next };
  if (merged.open === state.open && merged.hosts === state.hosts) return;
  state = merged;
  for (const listener of [...listeners]) listener();
}

export const callTestStore = {
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  getSnapshot(): CallTestState {
    return state;
  },
};

export function openCallTest(): void {
  set({ open: true });
}

export function closeCallTest(): void {
  set({ open: false });
}

/** 宿主挂载时登记，返回注销函数。 */
export function registerCallTestHost(): () => void {
  set({ hosts: state.hosts + 1 });
  let done = false;
  return () => {
    if (done) return;
    done = true;
    set({ hosts: Math.max(0, state.hosts - 1) });
  };
}
