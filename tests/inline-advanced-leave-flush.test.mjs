// 关闭编辑器之前那次冲刷的三条分支。原本内联在 InlineAdvancedWorkbenchShell 的
// requestClose 里，没有任何用例；单独成模块时把行为锁下来，免得下一次「顺手
// 简化」把 3 秒上限或者错误态的短路去掉，关闭动作跟着挂死。
import assert from "node:assert/strict";
import test from "node:test";

import { flushAdvancedWorkBeforeLeave } from "../src/shell/advanced-leave-flush.ts";

test("自动保存已是错误态时直接报那个错，不再多试一次", async () => {
  let calls = 0;
  const result = await flushAdvancedWorkBeforeLeave({
    state: "error",
    flushLatest: async () => {
      calls += 1;
      return { ok: true };
    },
  });
  assert.deepEqual(result, { ok: false, error: "自动保存仍未同步" });
  assert.equal(calls, 0);
});

test("冲刷成功就按成功返回", async () => {
  const result = await flushAdvancedWorkBeforeLeave({
    state: "saving",
    flushLatest: async () => ({ ok: true }),
  });
  assert.deepEqual(result, { ok: true });
});

test("冲刷卡住时到点就收，关闭动作不跟着一起挂起", async () => {
  const started = Date.now();
  const result = await flushAdvancedWorkBeforeLeave(
    {
      state: "saving",
      flushLatest: () => new Promise(() => {}),
    },
    20,
  );
  assert.deepEqual(result, { ok: false, error: "离开前保存等待超时" });
  assert.ok(Date.now() - started >= 15, "不许还没等就先判超时");
});
