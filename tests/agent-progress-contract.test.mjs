import assert from "node:assert/strict";
import test from "node:test";

import {
  activeAgentProgressKey,
  buildAgentRenderItems,
  buildProcessEntries,
  isAgentProgressMessage,
  isAgentSpeechMessage,
  liveAgentProgressKey,
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

test("text1 · toolA · text2 · toolB：文字永远在块外、原地，只把相邻的过程收成块（2026-10-31）", () => {
  const text1 = { id: 11, role: "assistant", kind: "text", content: "先看看。" };
  const toolA = { id: 12, role: "assistant", kind: "step", content: "▶ 读取文件", meta: { tool: "read_file", status: "done" } };
  const text2 = { id: 13, role: "assistant", kind: "text", content: "再跑一下。" };
  const toolB = { id: 14, role: "assistant", kind: "step", content: "运行命令", meta: { tool: "run", status: "running" } };
  const answer = { id: 15, role: "assistant", kind: "text", content: "好了。", meta: { done: true } };
  const all = [user, text1, toolA, text2, toolB, answer];
  const items = buildAgentRenderItems(all);
  assert.deepEqual(items.map((item) => item.type), ["message", "message", "progress", "message", "progress", "message"]);
  assert.deepEqual(items.filter((item) => item.type === "message").map((item) => item.message.id), [1, 11, 13, 15]);
  assert.deepEqual(items[2].messages.map((message) => message.id), [12]);
  assert.deepEqual(items[4].messages.map((message) => message.id), [14]);
  const entries = buildProcessEntries(items[2].messages);
  assert.deepEqual(entries.map((entry) => entry.type), ["tool"]);
  assert.equal(entries[0].title, "读取文件");
  assert.equal(buildProcessEntries(items[4].messages)[0].status, "running");

  // Text never jumps: every message keeps its key while more process arrives after it.
  const keyOf = (list, id) => list.find((item) => item.type === "message" && item.message.id === id)?.key;
  for (let length = 3; length <= all.length; length += 1) {
    const partial = buildAgentRenderItems(all.slice(0, length));
    for (const message of all.slice(0, length)) {
      if (message.kind === "text") assert.equal(keyOf(partial, message.id), keyOf(items, message.id), `key of ${message.id} at length ${length}`);
    }
  }
  // Process blocks keep their key too once they exist.
  assert.equal(buildAgentRenderItems(all.slice(0, 3))[2].key, items[2].key);
});

test("liveAgentProgressKey：块后一出现文字就不再 live（自动收起），下一段过程是新的 live 块", () => {
  const think = { id: 41, role: "assistant", kind: "analysis", content: "想一想", meta: { interim: true } };
  const tool = { id: 42, role: "assistant", kind: "step", content: "查天气", meta: { tool: "web_search", status: "running" } };
  const said = { id: 43, role: "assistant", kind: "text", content: "我先查一下。" };
  const tool2 = { id: 44, role: "assistant", kind: "step", content: "读网页", meta: { tool: "fetch", status: "running" } };

  const a = [user, think, tool];
  const aItems = buildAgentRenderItems(a);
  assert.equal(liveAgentProgressKey(aItems, a), aItems[1].key);

  const b = [user, think, tool, said];
  const bItems = buildAgentRenderItems(b);
  assert.equal(liveAgentProgressKey(bItems, b), "", "text after the block ends its live state");
  assert.equal(activeAgentProgressKey(bItems, b), bItems[1].key, "it is still the turn's block");

  const c = [user, think, tool, said, tool2];
  const cItems = buildAgentRenderItems(c);
  assert.equal(liveAgentProgressKey(cItems, c), cItems[3].key);
  assert.notEqual(cItems[3].key, cItems[1].key);

  // A reply that is only reasoning so far (empty content) does not end it.
  const pending = { id: 45, role: "assistant", kind: "text", content: "", meta: { streaming: true, reasoning: "整理结果" } };
  const d = [user, think, tool, pending];
  const dItems = buildAgentRenderItems(d);
  assert.equal(liveAgentProgressKey(dItems, d), dItems[1].key);

  // A gate after the block also ends it; a new user turn without process has none.
  const gate = { id: 46, role: "assistant", kind: "gate", content: "确认？" };
  assert.equal(liveAgentProgressKey(buildAgentRenderItems([...a, gate]), [...a, gate]), "");
  const next = [...a, said, { ...user, id: 47 }];
  assert.equal(liveAgentProgressKey(buildAgentRenderItems(next), next), "");
});

test("云端 speech 行：meta.reasoning 是思考，正文是块外的普通消息；老行按「正文≠reasoning」判定", () => {
  const speech = {
    id: 51, role: "assistant", kind: "analysis", content: "我先查一下上海的天气。",
    meta: { interim: true, speech: true, reasoning: "用户问天气，要先搜索", reasoning_ms: 1800, gateway_tool_tier: true },
  };
  const step2 = { id: 52, role: "assistant", kind: "step", content: "联网搜索", meta: { tool: "web_search", status: "done" } };
  const answer = { id: 53, role: "assistant", kind: "text", content: "多云。", meta: { done: true, reasoning: "整理结果" } };
  assert.equal(isAgentSpeechMessage(speech), true);
  const items = buildAgentRenderItems([user, speech, step2, answer]);
  assert.deepEqual(items.map((item) => item.type), ["message", "progress", "message", "progress", "message"]);
  const [thought] = buildProcessEntries(items[1].messages);
  assert.equal(thought.type, "thought");
  assert.equal(thought.text, "用户问天气，要先搜索");
  assert.equal(thought.ms, 1800);
  assert.equal(items[2].message.id, 51);
  assert.equal(items[2].message.content, "我先查一下上海的天气。");
  assert.deepEqual(buildProcessEntries(items[3].messages).map((entry) => entry.type), ["tool", "thought"]);
  assert.equal(items[4].message.id, 53);

  // Old rows (no flag): content ≠ reasoning → speech; content = reasoning → a thought.
  const oldSpeech = { ...speech, id: 54, meta: { interim: true, reasoning: "先搜索" } };
  const oldThought = { ...speech, id: 55, content: "先搜索", meta: { interim: true, reasoning: "先搜索" } };
  const plain = { ...speech, id: 56, content: "执行并检查结果", meta: { interim: true } };
  const off = { ...speech, id: 57, meta: { interim: true, speech: false, reasoning: "x" } };
  assert.equal(isAgentSpeechMessage(oldSpeech), true);
  assert.equal(isAgentSpeechMessage(oldThought), false);
  assert.equal(isAgentSpeechMessage(plain), false);
  assert.equal(isAgentSpeechMessage(off), false);
  assert.equal(isAgentSpeechMessage({ ...speech, meta: { ...speech.meta, reasoning: true } }), true, "the flag wins");
  const oldItems = buildAgentRenderItems([user, oldThought, oldSpeech]);
  assert.deepEqual(oldItems.map((item) => item.type), ["message", "progress", "message"]);
  assert.deepEqual(buildProcessEntries(oldItems[1].messages).map((entry) => entry.text), ["先搜索", "先搜索"]);
  assert.equal(oldItems[2].message.id, 54);

  // Passed straight to the timeline, a speech row only contributes its reasoning.
  assert.deepEqual(buildProcessEntries([speech]).map((entry) => [entry.type, entry.text]), [["thought", "用户问天气，要先搜索"]]);
  assert.deepEqual(buildProcessEntries([{ ...speech, meta: { speech: true, interim: true } }]), []);
});

test("硬约束：过程块里没有一条是对用户说的话", () => {
  const said = (id, extra = {}) => ({ id, role: "assistant", kind: "text", content: `说了 ${id}`, ...extra });
  const tool = (id) => ({ id, role: "assistant", kind: "step", content: `工具 ${id}`, meta: { status: "done" } });
  const think = (id) => ({ id, role: "assistant", kind: "analysis", content: `想 ${id}`, meta: { interim: true } });
  const speech = (id) => ({ id, role: "assistant", kind: "analysis", content: `讲 ${id}`, meta: { interim: true, speech: true, reasoning: `因为 ${id}` } });
  const messages = [
    user, think(60), said(61), tool(62), speech(63), tool(64), said(65, { meta: { reasoning: "r" } }), plan,
    tool(66), said(67, { meta: { done: true } }), { ...user, id: 68 }, speech(69), said(70),
  ];
  const items = buildAgentRenderItems(messages);
  const spoken = new Set(messages.filter((m) => m.role === "assistant" && (m.kind === "text" || isAgentSpeechMessage(m))).map((m) => m.id));
  for (const item of items) {
    if (item.type !== "progress") continue;
    for (const message of item.messages) {
      assert.ok(message.kind !== "text" || message.meta?.interim === true, `text row ${message.id} inside a block`);
      assert.ok(!isAgentSpeechMessage(message), `speech row ${message.id} inside a block`);
    }
    for (const entry of buildProcessEntries(item.messages)) {
      assert.ok(["thought", "tool", "plan"].includes(entry.type), entry.type);
      if (entry.type === "thought") assert.doesNotMatch(entry.text, /^(说了|讲) /);
    }
  }
  assert.deepEqual(
    items.filter((item) => item.type === "message" && item.message.role === "assistant").map((item) => item.message.id),
    [...spoken],
    "every spoken row is a normal message, once, in order",
  );
  // Even raw answer text fed to the timeline yields nothing.
  assert.deepEqual(buildProcessEntries([said(71), said(72, { meta: { done: true } })]), []);
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
  assert.equal(liveAgentProgressKey(items, [user, streaming]), items[1].key, "reasoning with no words yet is live");
  const talking = [user, { ...streaming, content: "好" }];
  assert.equal(liveAgentProgressKey(buildAgentRenderItems(talking), talking), "", "the first words fold it");

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
