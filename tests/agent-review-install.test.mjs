/**
 * W02：installAgentReviewGate 把 FunctionAgentChat 的回落面也包进闸。
 * 这是 PluginAgentPanel 不传 surfaceReader 时唯一能拦住的挂钩。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  readEditorCommandSurface,
} from "../src/lib/fn-agent.ts";
import {
  registerPluginCommandSurface,
  resetPluginCommandSurface,
} from "../src/shell/plugin-command/registry.ts";
import { createReviewSession } from "../src/shell/agent-review/session.ts";
import { gateSurfaceForAgent } from "../src/shell/agent-review/gate.ts";
import {
  publishAgentSelection,
  resetAgentReviewInbox,
} from "../src/shell/agent-review/inbox.ts";
import {
  installAgentReviewGate,
  uninstallAgentReviewGate,
} from "../src/shell/agent-review/install.ts";

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
      },
    ],
    state: () => ({ revision }),
    async run(id, params) {
      calls.push({ id, params });
      revision += 1;
      return { ok: true, message: "wrote", revision };
    },
  };
  return { surface, calls, getRevision: () => revision };
}

test("install 之后 readEditorCommandSurface 的 mutates run 不写文档", async () => {
  resetAgentReviewInbox();
  resetPluginCommandSurface();
  uninstallAgentReviewGate();
  const { surface, calls } = stubSurface();
  const unreg = registerPluginCommandSurface(surface);
  try {
    installAgentReviewGate();
    const via = readEditorCommandSurface();
    assert.ok(via, "注册闸之后必须读得到包过的面");
    const result = await via.run("grid.set-cell", { value: "9" });
    assert.equal(result.ok, true);
    assert.match(result.message, /审阅/);
    assert.equal(calls.length, 0);
    assert.equal(surface.state().revision, 3);
  } finally {
    unreg();
    uninstallAgentReviewGate();
    resetPluginCommandSurface();
    resetAgentReviewInbox();
  }
});

test("反面：卸掉闸之后同一条 run 当场写文档", async () => {
  resetAgentReviewInbox();
  resetPluginCommandSurface();
  uninstallAgentReviewGate();
  const { surface, calls } = stubSurface();
  const unreg = registerPluginCommandSurface(surface);
  const raw = readEditorCommandSurface();
  assert.equal(raw, null, "没 install 时注册表回落是 null，调用方会走 currentPluginCommandSurface");
  await surface.run("grid.set-cell", { value: "9" });
  assert.equal(calls.length, 1);
  assert.equal(surface.state().revision, 4);
  unreg();
  resetPluginCommandSurface();
});

test("闸的 state() 把当前选区编进 agentSelection，超预算时保住选区", async () => {
  resetAgentReviewInbox();
  publishAgentSelection({
    kind: "grid-column",
    id: "col-B",
    summary: "B 列销售额",
  });
  const session = createReviewSession();
  const { surface } = stubSurface();
  const gated = gateSurfaceForAgent(surface, session);
  const state = gated.state();
  assert.equal(state.agentSelection.kind, "grid-column");
  assert.equal(state.agentSelection.id, "col-B");
  assert.match(state.agentSelection.summary, /B 列/);
  resetAgentReviewInbox();
});
