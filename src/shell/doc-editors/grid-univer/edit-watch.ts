/**
 * 表格里「这个人改了文档」的唯一判据：**Univer 撤销栈的栈顶变了**。
 *
 * 为什么不是「收到了某条 mutation」：直接在格子里打字、粘贴、拖填充柄、专业模式
 * ribbon、快捷键 Ctrl+B / Ctrl+Z，全都不经过 OceanLeo 编辑栏；以前舞台只在编辑栏
 * 命令后 `bumpHistory`，于是格子里打的字永远不触发保存。而 mutation 里又混着
 * 公式引擎回写、协同里别人的格子、载入时的整本替换——这些都不是本人改动，算进去
 * 会在「只是打开」时就自动存一版（从公共素材打开时等于凭空 fork 一份）。
 *
 * 撤销栈正好把两类分开：本人的每次改动都进栈（栈满 100 条时长度不变，但栈顶换了
 * 一个新对象，所以比的是栈顶引用而不是长度）；撤销 / 重做移动栈顶；公式回写、
 * 协同远端写入、载入都不进栈。整本替换后新工作簿的栈是空的，调用方要 `resetBaseline()`。
 *
 * 本文件不 import Univer：撤销服务与事件入口由舞台注入（`IUndoRedoService`）。
 */

export interface GridUndoStackLike {
  pitchTopUndoElement(): unknown;
  pitchTopRedoElement(): unknown;
}

export interface GridUndoStatus {
  canUndo: boolean;
  canRedo: boolean;
}

export interface GridCommandEventSource {
  Event?: { CommandExecuted?: string } & Record<string, unknown>;
  addEvent?(event: string, cb: (params: unknown) => void): { dispose(): void } | undefined;
  onCommandExecuted?(cb: (command: unknown) => void): { dispose(): void } | undefined;
}

export interface GridEditWatch {
  /** 处理一次「命令执行完」：栈顶变了返回 true。测试与舞台都走它。 */
  observe(): boolean;
  /** 整本替换 / 载入之后：以新工作簿的栈为基线，不把换簿算成改动。 */
  resetBaseline(): void;
  dispose(): void;
}

function readStatus(undo: GridUndoStackLike): {
  top: unknown;
  redoTop: unknown;
  status: GridUndoStatus;
} {
  const top = undo.pitchTopUndoElement() ?? null;
  const redoTop = undo.pitchTopRedoElement() ?? null;
  return { top, redoTop, status: { canUndo: top !== null, canRedo: redoTop !== null } };
}

export function createGridEditWatch(options: {
  undo: GridUndoStackLike | null | undefined;
  events?: GridCommandEventSource | null;
  /** 本人改了文档（打字、编辑栏、ribbon、快捷键、撤销、重做）。 */
  onPersonWrite: () => void;
  /** 撤销 / 重做是否可用（顶栏 ↶ ↷）。 */
  onHistory: (status: GridUndoStatus) => void;
  /** 任何命令之后（含选区变化）：让编辑栏重读当前格子的值。 */
  onAnyCommand?: () => void;
  /** 只读 / 等协同首同步时不把改动算给本人（画布本身也是不可编辑的）。 */
  blocked?: () => boolean;
}): GridEditWatch {
  const undo = options.undo;
  let baseline = undo ? readStatus(undo) : null;
  let lastStatusKey = "";

  const publish = (status: GridUndoStatus) => {
    const key = `${status.canUndo ? 1 : 0}${status.canRedo ? 1 : 0}`;
    if (key === lastStatusKey) return;
    lastStatusKey = key;
    options.onHistory(status);
  };

  const observe = (): boolean => {
    if (!undo) return false;
    const next = readStatus(undo);
    // 两个栈同时为空只可能是换了工作簿或清了栈：本人的改动（含撤销到底）总会在
    // 撤销栈或重做栈里留下一项。焦点晚一拍切到新工作簿时，这条挡住误判。
    const emptied = next.top === null && next.redoTop === null;
    const moved =
      !emptied &&
      (!baseline || next.top !== baseline.top || next.redoTop !== baseline.redoTop);
    baseline = next;
    publish(next.status);
    if (moved && !options.blocked?.()) {
      options.onPersonWrite();
      return true;
    }
    return false;
  };

  let handle: { dispose(): void } | undefined;
  const events = options.events;
  if (events) {
    const listener = () => {
      observe();
      options.onAnyCommand?.();
    };
    const name = events.Event?.CommandExecuted;
    handle =
      events.addEvent && typeof name === "string"
        ? events.addEvent(name, listener)
        : events.onCommandExecuted?.(listener);
  }
  if (baseline) publish(baseline.status);

  return {
    observe,
    resetBaseline() {
      baseline = undo ? readStatus(undo) : null;
      if (baseline) publish(baseline.status);
    },
    dispose() {
      handle?.dispose();
      handle = undefined;
    },
  };
}
