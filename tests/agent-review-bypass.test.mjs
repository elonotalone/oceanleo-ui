/**
 * W02 核心：agent 改动 100% 进审阅。有一条能绕过直接写文档就是红。
 *
 * 闸只包 agent 拿到的 surface。未持 apply token 的 mutates run() 不得调用底层 run。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  EDITOR_COMMAND_FENCE,
  createEditorCommandSession,
} from "../src/lib/fn-agent.ts";
import { createReviewSession } from "../src/shell/agent-review/session.ts";
import {
  applyParkedReview,
  gateSurfaceForAgent,
} from "../src/shell/agent-review/gate.ts";

function stubSurface() {
  const calls = [];
  let revision = 3;
  const surface = {
    editorId: "grid",
    describe: () => [
      {
        id: "grid.set-cell",
        label: "改单元格",
        summary: "写入一个格子",
        mutates: true,
        params: [{ key: "value", label: "值", type: "string", required: true }],
      },
      {
        id: "grid.read-cell",
        label: "读单元格",
        summary: "只读",
        mutates: false,
      },
    ],
    state: () => ({ revision }),
    async run(id, params) {
      calls.push({ id, params });
      if (id === "grid.set-cell") revision += 1;
      return { ok: true, message: "wrote", revision };
    },
  };
  return { surface, calls };
}

const block = (payload) =>
  ["```" + EDITOR_COMMAND_FENCE, JSON.stringify(payload), "```"].join("\n");

test("mutates 的 run 被闸拦住，底层一次都不写", async () => {
  const { surface, calls } = stubSurface();
  const session = createReviewSession();
  const gated = gateSurfaceForAgent(surface, session);
  const result = await gated.run("grid.set-cell", { value: "9" });
  assert.equal(result.ok, true);
  assert.match(result.message, /审阅/);
  assert.equal(calls.length, 0);
  assert.equal(surface.state().revision, 3);
  assert.equal(session.snapshot().status, "open");
  assert.equal(session.snapshot().currentRevision, 3);
});

test("只读指令仍立刻执行", async () => {
  const { surface, calls } = stubSurface();
  const gated = gateSurfaceForAgent(surface, createReviewSession());
  const result = await gated.run("grid.read-cell");
  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].id, "grid.read-cell");
});

test("allowAlways 会话仍然写不进文档", async () => {
  const { surface, calls } = stubSurface();
  const review = createReviewSession();
  const gated = gateSurfaceForAgent(surface, review);
  const cmd = createEditorCommandSession();
  cmd.allowAlways();
  const first = await cmd.offer({
    messageId: 1,
    content: block({ id: "grid.set-cell", params: { value: "9" } }),
    surface: gated,
  });
  // 未确认前 mutates 仍是 confirm；强制授权后再来一条。
  if (first.kind === "confirm") {
    cmd.allowAlways();
    await cmd.confirm();
  }
  const second = await cmd.offer({
    messageId: 2,
    content: block({ id: "grid.set-cell", params: { value: "8" } }),
    surface: gated,
  });
  assert.notEqual(second.kind, "none");
  assert.equal(calls.length, 0, "allowAlways 之后底层仍 0 次写入");
  assert.equal(surface.state().revision, 3);
});

test("接受之后才写入，revision 才前进", async () => {
  const { surface, calls } = stubSurface();
  const session = createReviewSession();
  const gated = gateSurfaceForAgent(surface, session);
  await gated.run("grid.set-cell", { value: "9" });
  const parked = session.snapshot().parked;
  assert.ok(parked);
  session.acceptAll();
  const result = await applyParkedReview(surface, parked);
  assert.equal(result.ok, true);
  session.markApplied(result.revision);
  assert.equal(calls.length, 1);
  assert.equal(surface.state().revision, 4);
  assert.equal(session.snapshot().currentRevision, 4);
});

test("拒绝则永远不调用底层 run", async () => {
  const { surface, calls } = stubSurface();
  const session = createReviewSession();
  const gated = gateSurfaceForAgent(surface, session);
  await gated.run("grid.set-cell", { value: "9" });
  session.rejectAll();
  session.markDiscarded();
  assert.equal(calls.length, 0);
  assert.equal(surface.state().revision, 3);
});

test("反面：去掉闸直接 run，文档当场被改（证明闸不是空转）", async () => {
  const { surface, calls } = stubSurface();
  await surface.run("grid.set-cell", { value: "9" });
  assert.equal(calls.length, 1);
  assert.equal(surface.state().revision, 4);
});
