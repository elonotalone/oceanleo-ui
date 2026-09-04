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
import { createReviewSession, hostReviewSession } from "../src/shell/agent-review/session.ts";
import {
  gateSurfaceForAgent,
  isAgentGatedSurface,
} from "../src/shell/agent-review/gate.ts";
import { readAgentCommandSurface } from "../src/shell/agent-review/surface.ts";
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

test("闸没装时 readEditorCommandSurface 是 null，而产品取面口照样只给包过闸的面", async () => {
  // 这一例原来把病写成了预期（「回落是 null，调用方会走 currentPluginCommandSurface」）。
  // 那条回落正是 `PARENT-red-1`：**失败即开放**。现在钉住的是相反的事——
  // 闸装没装都影响不了 agent 拿到什么，因为取面处自己就地包闸。
  hostReviewSession.reset();
  resetAgentReviewInbox();
  resetPluginCommandSurface();
  uninstallAgentReviewGate();
  const { surface, calls } = stubSurface();
  const unreg = registerPluginCommandSurface(surface);
  try {
    assert.equal(readEditorCommandSurface(), null, "没 install 时模块级 reader 读不到面");
    const forAgent = readAgentCommandSurface();
    assert.ok(forAgent, "但产品取面口必须仍然给出一份面（编辑器是真的开着）");
    const result = await forAgent.run("grid.set-cell", { value: "9" });
    assert.equal(result.ok, true);
    assert.match(result.message, /审阅/);
    assert.equal(calls.length, 0, "底层 run 零调用");
    assert.equal(surface.state().revision, 3);
    // 反面：同一份原始面直接调，文档当场就变 —— 证明闸不是摆设，是那一层包法在起作用。
    await surface.run("grid.set-cell", { value: "9" });
    assert.equal(calls.length, 1);
    assert.equal(surface.state().revision, 4);
  } finally {
    unreg();
    resetPluginCommandSurface();
    resetAgentReviewInbox();
  }
});

test("包闸是幂等的：宿主已包过的面不会被再套一层，一条改动只出一份提案", async () => {
  hostReviewSession.reset();
  resetAgentReviewInbox();
  resetPluginCommandSurface();
  uninstallAgentReviewGate();
  const { surface, calls } = stubSurface();
  const unreg = registerPluginCommandSurface(surface);
  try {
    // 宿主（AgentChat / AgentConsole）自己就把面包过闸再传下来，取面处不许再套一层：
    // 套两层会让一条改动产出两份提案，用户点一次头只落地一半。
    const gatedOnce = gateSurfaceForAgent(surface);
    assert.equal(isAgentGatedSurface(gatedOnce), true);
    const viaProduct = readAgentCommandSurface(() => gatedOnce);
    assert.equal(viaProduct, gatedOnce, "已包过闸的面必须原样返回");
    const result = await viaProduct.run("grid.set-cell", { value: "9" });
    assert.match(result.message, /审阅/);
    assert.equal(calls.length, 0);
    const snapshot = hostReviewSession.snapshot();
    assert.equal(snapshot.status, "open");
    assert.equal(snapshot.parked.proposal.commandId, "grid.set-cell");
  } finally {
    unreg();
    uninstallAgentReviewGate();
    resetPluginCommandSurface();
    resetAgentReviewInbox();
  }
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
