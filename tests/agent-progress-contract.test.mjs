import assert from "node:assert/strict";
import test from "node:test";

import {
  activeAgentProgressKey,
  buildAgentProgressActions,
  buildAgentRenderItems,
  isAgentProgressMessage,
  takeUnreportedAgentArtifacts,
} from "../src/lib/agent-progress.ts";


const user = { id: 1, role: "user", kind: "text", content: "做一个网站" };
const plan = {
  id: 2,
  role: "assistant",
  kind: "plan",
  content: "完整规划",
  meta: { plan_steps: ["创建会话", "编写页面", "检查结果"] },
};
const analysis = {
  id: 3,
  role: "assistant",
  kind: "analysis",
  content: "详细分析与代码",
  meta: { interim: true, summary: "先检查项目", step_index: 1 },
};
const step = {
  id: 4,
  role: "assistant",
  kind: "step",
  content: "读取项目结构",
  meta: { tool: "site_read", step_index: 1, status: "done" },
};
const artifact = {
  id: 5,
  role: "assistant",
  kind: "artifact",
  content: "已创建预览",
  meta: { artifact: { type: "preview", url: "https://p3300.website.oceanleo.com" } },
};
const legacyAnalysis = {
  id: 6,
  role: "assistant",
  kind: "text",
  content: "Thought: legacy",
  meta: { interim: true },
};
const final = {
  id: 7,
  role: "assistant",
  kind: "text",
  content: "网站已经完成。",
  meta: { done: true },
};


test("新旧过程消息都识别为 agent 进度，最终回答不混入", () => {
  assert.equal(isAgentProgressMessage(plan), true);
  assert.equal(isAgentProgressMessage(analysis), true);
  assert.equal(isAgentProgressMessage(step), true);
  assert.equal(isAgentProgressMessage(legacyAnalysis), true);
  assert.equal(isAgentProgressMessage(final), false);
});

test("同一轮过程聚合成一张进度卡，产物与最终回答保持独立", () => {
  const items = buildAgentRenderItems([
    user,
    plan,
    analysis,
    step,
    artifact,
    legacyAnalysis,
    final,
  ]);

  assert.deepEqual(
    items.map((item) => item.type),
    ["message", "progress", "message", "message"],
  );
  const progress = items[1];
  assert.equal(progress.type, "progress");
  assert.deepEqual(
    progress.messages.map((message) => message.id),
    [2, 3, 4, 6],
  );
  assert.equal(items[2].message.id, 5);
  assert.equal(items[3].message.id, 7);
});

test("下一条用户消息开始新的进度组", () => {
  const items = buildAgentRenderItems([
    user,
    plan,
    step,
    final,
    { ...user, id: 8, content: "继续修改" },
    { ...analysis, id: 9, meta: { ...analysis.meta, step_index: 2 } },
    { ...step, id: 10, meta: { ...step.meta, step_index: 2 } },
  ]);

  assert.equal(items.filter((item) => item.type === "progress").length, 2);
});


test("新追问尚无过程事件时不把上一轮进度误标为运行中", () => {
  const nextUser = { ...user, id: 8, content: "继续修改" };
  const waitingMessages = [user, plan, step, final, nextUser];
  const waitingItems = buildAgentRenderItems(waitingMessages);
  assert.equal(activeAgentProgressKey(waitingItems, waitingMessages), "");

  const runningMessages = [
    ...waitingMessages,
    { ...analysis, id: 9, meta: { ...analysis.meta, step_index: 2 } },
  ];
  const runningItems = buildAgentRenderItems(runningMessages);
  const key = activeAgentProgressKey(runningItems, runningMessages);
  assert.ok(key);
  assert.equal(
    runningItems.find((item) => item.key === key)?.type,
    "progress",
  );
});


test("同批到达的 preview 与最终产物逐条上报，同 URL 新消息仍会上报", () => {
  const finalArtifact = {
    id: 8,
    role: "assistant",
    kind: "artifact",
    content: "最终文档",
    meta: { artifact: { type: "doc", title: "结果" } },
  };
  const reported = new Set();
  assert.deepEqual(
    takeUnreportedAgentArtifacts(
      [artifact, finalArtifact],
      reported,
      "task-1",
      "task-1",
    ).map((message) => message.id),
    [5, 8],
  );
  assert.deepEqual(
    takeUnreportedAgentArtifacts(
      [artifact, finalArtifact],
      reported,
      "task-1",
      "task-1",
    ),
    [],
  );
  const repeatedPreview = { ...artifact, id: 9 };
  assert.deepEqual(
    takeUnreportedAgentArtifacts(
      [artifact, finalArtifact, repeatedPreview],
      reported,
      "task-1",
      "task-1",
    ).map((message) => message.id),
    [9],
  );
});


test("task 切换过渡帧不会把旧消息产物上报给新 task", () => {
  const reported = new Set();
  assert.deepEqual(
    takeUnreportedAgentArtifacts(
      [artifact],
      reported,
      "task-old",
      "task-new",
    ),
    [],
  );
  assert.equal(reported.size, 0);
});


test("结构化与旧 interim 混排时不会共用索引并覆盖分析", () => {
  const actions = buildAgentProgressActions([
    analysis,
    legacyAnalysis,
    step,
  ]);
  assert.equal(actions.length, 2);
  assert.equal(actions[0].analysis?.id, analysis.id);
  assert.deepEqual(actions[0].labels, ["读取项目结构"]);
  assert.equal(actions[1].analysis?.id, legacyAnalysis.id);
});
