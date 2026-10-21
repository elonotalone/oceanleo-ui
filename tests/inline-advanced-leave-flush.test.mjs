// 旧断言钉的是「离开前最多等 3 秒 / 错误态短路再弹确认」。那正是用户被拦的原因。
// 离开改为同步：有待保存就 handOff，然后立刻 close；网站关自动保存则不接手。
import assert from "node:assert/strict";
import test from "node:test";

import { leaveAdvancedWorkbench } from "../src/shell/advanced-background-saver.ts";

test("离开是同步的：先接手再关，不等冲刷结果", () => {
  const order = [];
  leaveAdvancedWorkbench({
    autoSaveEnabled: true,
    handOff: () => {
      order.push("handOff");
    },
    closeDetail: () => {
      order.push("closeDetail");
    },
    onClose: () => {
      order.push("onClose");
    },
  });
  assert.deepEqual(order, ["handOff", "closeDetail", "onClose"]);
});

test("网站关闭自动保存时不接手，仍然立刻离开", () => {
  let handed = false;
  let closed = false;
  leaveAdvancedWorkbench({
    autoSaveEnabled: false,
    handOff: () => {
      handed = true;
    },
    closeDetail: () => {},
    onClose: () => {
      closed = true;
    },
  });
  assert.equal(handed, false);
  assert.equal(closed, true);
});

test("hosted editor remains open until the mounted flush confirms durability", async () => {
  const order = [];
  let finish;
  const pending = leaveAdvancedWorkbench({
    autoSaveEnabled: true,
    handOff: () => order.push("handoff-must-not-run"),
    closeDetail: () => order.push("close-detail"),
    onClose: () => order.push("unmount"),
    flushMounted: () => new Promise((resolve) => { finish = resolve; }),
  });
  assert.deepEqual(order, []);
  finish({ ok: true });
  assert.equal(await pending, true);
  assert.deepEqual(order, ["close-detail", "unmount"]);
});

test("hosted failed flush never unmounts the only unsaved frame", async () => {
  let closed = false;
  const pending = leaveAdvancedWorkbench({ autoSaveEnabled: true, handOff() {}, closeDetail() {}, onClose: () => { closed = true; }, flushMounted: async () => ({ ok: false }) });
  assert.equal(await pending, false);
  assert.equal(closed, false);
});
