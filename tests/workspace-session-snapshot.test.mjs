import assert from "node:assert/strict";
import test from "node:test";

import {
  mergeWorkspaceSessionSnapshot,
  splitWorkspaceSessionSnapshot,
} from "../src/shell/workspace-session-snapshot.ts";

test("共享右栏标签与站点 runtime 原子往返且互不泄漏", () => {
  const runtime = {
    topic: "用户修改后的主题",
    outline: ["一", "二"],
  };
  const merged = mergeWorkspaceSessionSnapshot(runtime, {
    right_tab: "outline",
  });

  assert.deepEqual(merged.__oceanleo_ui, { right_tab: "outline" });
  const split = splitWorkspaceSessionSnapshot(merged);
  assert.deepEqual(split.runtime, runtime);
  assert.deepEqual(split.ui, { right_tab: "outline" });
});

test("旧手填备注只读迁移后被清理且不再写回", () => {
  const split = splitWorkspaceSessionSnapshot({
    topic: "提案",
    __oceanleo_note: "董事会最终版",
  });
  assert.deepEqual(split.runtime, { topic: "提案" });
  assert.deepEqual(
    mergeWorkspaceSessionSnapshot(split.runtime, split.ui),
    { topic: "提案" },
  );
});

test("非法或过长的共享标签不会污染 snapshot", () => {
  const merged = mergeWorkspaceSessionSnapshot(
    { topic: "提案" },
    { right_tab: "x".repeat(161) },
  );
  assert.equal("__oceanleo_ui" in merged, false);
  assert.deepEqual(
    splitWorkspaceSessionSnapshot({
      topic: "提案",
      __oceanleo_ui: { right_tab: 42 },
    }).ui,
    {},
  );
});
