import type { AdvancedFlushResult } from "./advanced-session-context";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";

/**
 * 关闭编辑器之前把还没同步的改动冲刷出去，并给出一个能读的结论。
 *
 * 等待有上限：冲刷本身可能卡在网络上，而关闭动作不能跟着一起挂起——超时就按
 * 「没同步成功」返回，由调用方去问用户还走不走。自动保存本来就已经是错误态时
 * 不必再试一次，直接报那个错。
 */
export function flushAdvancedWorkBeforeLeave(
  autoSave: {
    state: AdvancedAutoSaveState;
    flushLatest: () => Promise<AdvancedFlushResult>;
  },
  timeoutMs = 3_000,
): Promise<AdvancedFlushResult> {
  if (autoSave.state === "error") {
    return Promise.resolve({ ok: false, error: "自动保存仍未同步" });
  }
  return Promise.race([
    autoSave.flushLatest(),
    new Promise<AdvancedFlushResult>((resolve) =>
      setTimeout(
        () => resolve({ ok: false, error: "离开前保存等待超时" }),
        timeoutMs,
      ),
    ),
  ]);
}
