/**
 * W02 · 去向纯函数 + 按件 apply 持有（A-53 / A-59 / V3-red-6）
 *
 * 闸锁的是产品行为：接受表格提案时，图片那条还没审的 mutates 指令 0 写。
 * 把 `routeAgentCommandRun` 改成「有持有就放行」（全局 applyDepth 那一招），
 * 这一条当场红。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  registerEditorCommandSurfaceReader,
} from "../src/lib/fn-agent.ts";
import {
  registerPluginCommandSurface,
  resetPluginCommandSurface,
} from "../src/shell/plugin-command/registry.ts";
import { createReviewSession } from "../src/shell/agent-review/session.ts";
import {
  applyParkedReview,
  gateSurfaceForAgent,
  reviewApplyHeld,
  resetReviewApplyHolds,
  routeAgentCommandRun,
  withReviewApply,
} from "../src/shell/agent-review/gate.ts";
import {
  readAgentCommandSurface,
  resolveAgentSurfaceSource,
} from "../src/shell/agent-review/surface.ts";

function stubSurface(editorId, commandId = `${editorId}.mutate`) {
  const calls = [];
  let revision = 3;
  const surface = {
    editorId,
    describe: () => [
      {
        id: commandId,
        label: "改",
        summary: "会改文档",
        mutates: true,
      },
      {
        id: `${editorId}.read`,
        label: "读",
        summary: "只读",
        mutates: false,
      },
    ],
    state: () => ({ revision }),
    async run(id, params) {
      calls.push({ id, params });
      revision += 1;
      return { ok: true, message: "wrote", revision };
    },
  };
  return { surface, calls, commandId, revisionNow: () => revision };
}

test("去向由纯函数决定：缺凭据送审，盖了这件的 apply 章才执行", () => {
  const review = routeAgentCommandRun({
    surfaceEditorId: "image",
    commandId: "image.paint",
    mutates: true,
    holds: [],
  });
  assert.equal(review.kind, "review");
  assert.equal(review.reason, "untrusted-agent");

  const foreign = routeAgentCommandRun({
    surfaceEditorId: "image",
    commandId: "image.paint",
    mutates: true,
    holds: [{ editorId: "grid", commandId: "grid.set-cell" }],
  });
  assert.equal(foreign.kind, "review", "接受 A 时 B 必须仍送审 —— V3-red-6");
  assert.equal(foreign.reason, "foreign-apply");

  const matching = routeAgentCommandRun({
    surfaceEditorId: "grid",
    commandId: "grid.set-cell",
    mutates: true,
    holds: [{ editorId: "grid", commandId: "grid.set-cell" }],
  });
  assert.equal(matching.kind, "execute");
  assert.equal(matching.reason, "accepted-apply");

  const readonly = routeAgentCommandRun({
    surfaceEditorId: "grid",
    commandId: "grid.read",
    mutates: false,
    holds: [],
  });
  assert.equal(readonly.kind, "execute");
  assert.equal(readonly.reason, "readonly");
});

test("接受 A 正在落地时，B 的 mutates run 零写入（产品路径，不是自比夹具）", async () => {
  resetReviewApplyHolds();
  const a = stubSurface("grid", "grid.set-cell");
  const b = stubSurface("image", "image.paint");
  const sessionB = createReviewSession();
  const gatedB = gateSurfaceForAgent(b.surface, sessionB);
  await withReviewApply(
    async () => {
      assert.equal(reviewApplyHeld(), true);
      assert.equal(reviewApplyHeld("grid"), true);
      assert.equal(reviewApplyHeld("image"), false, "按件查询：图片不该看到表格的 apply");
      const sneak = await gatedB.run("image.paint", { value: "sneak" });
      assert.match(sneak.message, /审阅/);
      assert.equal(b.calls.length, 0, "B 的文档一个字都不能变");
      assert.equal(sessionB.snapshot().parked?.editorId, "image");
    },
    { editorId: "grid", commandId: "grid.set-cell", proposalId: "p-a" },
  );
  assert.equal(reviewApplyHeld(), false);
  assert.equal(b.calls.length, 0);
});

test("这件自己的 apply 期间，同一面的 run 才写得进去", async () => {
  resetReviewApplyHolds();
  const a = stubSurface("grid", "grid.set-cell");
  const session = createReviewSession();
  const gated = gateSurfaceForAgent(a.surface, session);
  await withReviewApply(
    async () => {
      const result = await gated.run("grid.set-cell", { value: "9" });
      assert.equal(result.ok, true);
      assert.equal(a.calls.length, 1);
    },
    { editorId: "grid", commandId: "grid.set-cell" },
  );
});

test("applyParkedReview 把持有绑在这份提案的 editorId 上，旁路面仍 0 写", async () => {
  resetReviewApplyHolds();
  const a = stubSurface("grid", "grid.set-cell");
  const b = stubSurface("image", "image.paint");
  const sessionA = createReviewSession();
  const sessionB = createReviewSession();
  const gatedA = gateSurfaceForAgent(a.surface, sessionA);
  const gatedB = gateSurfaceForAgent(b.surface, sessionB);
  await gatedA.run("grid.set-cell", { value: "A" });
  const parked = sessionA.snapshot().parked;
  assert.ok(parked);
  sessionA.acceptAll();
  const applied = await applyParkedReview(a.surface, parked);
  assert.equal(applied.ok, true);
  assert.equal(a.calls.length, 1);
  const sneak = await gatedB.run("image.paint", { value: "B" });
  assert.match(sneak.message, /审阅/);
  assert.equal(b.calls.length, 0);
});

test("reviewApplyHeld 已导出，且按件而不是全局一把钥匙", async () => {
  resetReviewApplyHolds();
  assert.equal(reviewApplyHeld(), false);
  await withReviewApply(
    async () => {
      assert.equal(reviewApplyHeld(), true);
      assert.equal(reviewApplyHeld("grid"), true);
      assert.equal(reviewApplyHeld("image"), false);
    },
    { editorId: "grid" },
  );
});

test("未指明 editorId 的 withReviewApply（旧调用）不把所有面的门锁打开", async () => {
  resetReviewApplyHolds();
  const b = stubSurface("image", "image.paint");
  const sessionB = createReviewSession();
  const gatedB = gateSurfaceForAgent(b.surface, sessionB);
  await withReviewApply(async () => {
    assert.equal(reviewApplyHeld("grid"), true, "查询口仍认旧调用，W03 探针测试不破");
    const sneak = await gatedB.run("image.paint", { value: "open-all" });
    assert.match(sneak.message, /审阅/);
    assert.equal(b.calls.length, 0, "`*` 持有不得放行产品面");
  });
});

test("显式 reader 优先于注册表；两条非空路径都包闸", async () => {
  resetPluginCommandSurface();
  resetReviewApplyHolds();
  registerEditorCommandSurfaceReader(null);
  const registry = stubSurface("grid", "grid.set-cell");
  const reader = stubSurface("image", "image.paint");
  const unreg = registerPluginCommandSurface(registry.surface);
  registerEditorCommandSurfaceReader(() => reader.surface);
  try {
    const resolved = resolveAgentSurfaceSource();
    assert.equal(resolved.source, "reader");
    assert.equal(resolved.raw.editorId, "image");
    const gated = readAgentCommandSurface();
    assert.ok(gated);
    const result = await gated.run("image.paint", { value: "9" });
    assert.match(result.message, /审阅/);
    assert.equal(reader.calls.length, 0);
    assert.equal(registry.calls.length, 0);
  } finally {
    unreg();
    registerEditorCommandSurfaceReader(null);
    resetPluginCommandSurface();
  }
});

test("没有 reader 时走注册表，仍然包闸（PluginAgentPanel 那条路）", async () => {
  resetPluginCommandSurface();
  resetReviewApplyHolds();
  registerEditorCommandSurfaceReader(null);
  const registry = stubSurface("grid", "grid.set-cell");
  const unreg = registerPluginCommandSurface(registry.surface);
  try {
    const resolved = resolveAgentSurfaceSource();
    assert.equal(resolved.source, "registry");
    const gated = readAgentCommandSurface();
    const result = await gated.run("grid.set-cell", { value: "9" });
    assert.match(result.message, /审阅/);
    assert.equal(registry.calls.length, 0);
  } finally {
    unreg();
    resetPluginCommandSurface();
  }
});
