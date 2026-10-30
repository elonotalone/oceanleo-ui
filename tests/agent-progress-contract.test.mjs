import assert from "node:assert/strict";
import test from "node:test";

import {
  activeAgentProgressKey,
  buildAgentRenderItems,
  buildProcessEntries,
  isAgentProgressMessage,
  sameAgentMessages,
  summarizeProcess,
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

test("轮询到相同消息时保持 transcript 引用，内容更新时才重绘", () => {
  const current = [user, analysis];
  assert.equal(sameAgentMessages(current, structuredClone(current)), true);
  assert.equal(
    sameAgentMessages(current, [
      user,
      { ...analysis, content: "更新后的详细分析" },
    ]),
    false,
  );
});


test("新旧过程消息都识别为 agent 进度，最终回答不混入", () => {
  assert.equal(isAgentProgressMessage(plan), true);
  assert.equal(isAgentProgressMessage(analysis), true);
  assert.equal(isAgentProgressMessage(step), true);
  assert.equal(isAgentProgressMessage(legacyAnalysis), true);
  assert.equal(isAgentProgressMessage(final), false);
});

test("过程按真实顺序成块：产物留在原处并切开过程块，最终回答在块外", () => {
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
    ["message", "progress", "message", "progress", "message"],
  );
  assert.deepEqual(items[1].messages.map((message) => message.id), [2, 3, 4]);
  assert.equal(items[2].message.id, 5);
  assert.deepEqual(items[3].messages.map((message) => message.id), [6]);
  assert.equal(items[4].message.id, 7);
});

test("text1 · toolA · text2 · toolB 保持原序；回合最后一段文字是块外的回答", () => {
  const text1 = { id: 11, role: "assistant", kind: "text", content: "先看看。" };
  const toolA = { id: 12, role: "assistant", kind: "step", content: "▶ 读取文件", meta: { tool: "read_file", status: "done" } };
  const text2 = { id: 13, role: "assistant", kind: "text", content: "再跑一下。" };
  const toolB = { id: 14, role: "assistant", kind: "step", content: "运行命令", meta: { tool: "run", status: "running" } };
  const answer = { id: 15, role: "assistant", kind: "text", content: "好了。", meta: { done: true } };
  const items = buildAgentRenderItems([user, text1, toolA, text2, toolB, answer]);
  assert.deepEqual(items.map((item) => item.type), ["message", "progress", "message"]);
  assert.deepEqual(items[1].messages.map((message) => message.id), [11, 12, 13, 14]);
  assert.equal(items[2].message.id, 15);
  const entries = buildProcessEntries(items[1].messages);
  assert.deepEqual(entries.map((entry) => entry.type), ["text", "tool", "text", "tool"]);
  assert.equal(entries[1].title, "读取文件");
  assert.equal(entries[3].status, "running");

  // Still streaming text2 with nothing after it: it is the (current) answer, outside the block.
  const live = buildAgentRenderItems([user, text1, toolA, text2]);
  assert.deepEqual(live.map((item) => item.type), ["message", "progress", "message"]);
  assert.deepEqual(live[1].messages.map((message) => message.id), [11, 12]);
  assert.equal(live[2].message.id, 13);
});

test("回复行的 meta.reasoning 成为回答之前的思考条目（C1），老行没有也不出块", () => {
  const streaming = { id: 21, role: "assistant", kind: "text", content: "", meta: { streaming: true, reasoning: "用户要一个网站……" } };
  const items = buildAgentRenderItems([user, streaming]);
  assert.deepEqual(items.map((item) => item.type), ["message", "progress", "message"]);
  const [thought] = buildProcessEntries(items[1].messages);
  assert.equal(thought.type, "thought");
  assert.equal(thought.text, "用户要一个网站……");
  assert.equal(thought.streaming, true);
  assert.equal(items[2].message.id, 21, "the reply row itself stays a normal bubble");
  assert.ok(activeAgentProgressKey(items, [user, streaming]), "the live thought replaces the bare spinner");

  const answered = { ...streaming, content: "好的", meta: { reasoning: "想好了", reasoning_ms: 4200, done: true } };
  const done = buildProcessEntries(buildAgentRenderItems([user, answered])[1].messages);
  assert.equal(done[0].streaming, false);
  assert.equal(done[0].ms, 4200);
  assert.equal(summarizeProcess(buildAgentRenderItems([user, answered])[1].messages).ms, 4200);

  const legacy = buildAgentRenderItems([user, { id: 22, role: "assistant", kind: "text", content: "hi", meta: { done: true } }]);
  assert.deepEqual(legacy.map((item) => item.type), ["message", "message"]);
});

test("云端步骤带上入参、结果、错误与状态（C2），分析是步骤之前的思考而不是步骤正文", () => {
  const failedStep = {
    id: 31, role: "assistant", kind: "step", content: "在电脑上查找元素",
    meta: { tool: "computer_ui_find", status: "failed", step_index: 1, args_preview: '{"name":"OK"}', result_preview: "", error: "失败：failed（没有执行）：ui.find: the foreground window is the hand itself" },
  };
  const entries = buildProcessEntries([analysis, failedStep, step]);
  assert.deepEqual(entries.map((entry) => entry.type), ["thought", "tool", "tool"]);
  assert.equal(entries[0].text, "详细分析与代码");
  assert.equal(entries[0].summary, "先检查项目");
  assert.equal(entries[1].title, "在电脑上查找元素");
  assert.equal(entries[1].status, "failed");
  assert.equal(entries[1].args, '{"name":"OK"}');
  assert.match(entries[1].error, /foreground window is the hand itself/);
  assert.equal(entries[2].status, "done");
  const summary = summarizeProcess([analysis, failedStep, step], entries);
  assert.deepEqual(
    { thoughts: summary.thoughts, tools: summary.tools, failed: summary.failed },
    { thoughts: 1, tools: 2, failed: 1 },
  );
});

test("用时：没有 reasoning_ms 时按过程行的时间跨度算，不足 1 秒不报", () => {
  const a = { ...analysis, created_at: "2026-10-30T10:00:00Z" };
  const b = { ...step, created_at: "2026-10-30T10:00:12Z" };
  assert.equal(summarizeProcess([a, b]).ms, 12000);
  assert.equal(summarizeProcess([a, { ...b, created_at: a.created_at }]).ms, null);
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


test("结构化与旧 interim 混排时逐条成条目，不合并不覆盖", () => {
  const entries = buildProcessEntries([analysis, legacyAnalysis, step, plan]);
  assert.deepEqual(entries.map((entry) => entry.type), ["thought", "thought", "tool", "plan"]);
  assert.equal(entries[1].text, "Thought: legacy");
  assert.equal(entries[1].summary, "legacy");
  assert.deepEqual(entries[3].items.map((item) => item.content), ["创建会话", "编写页面", "检查结果"]);
});
