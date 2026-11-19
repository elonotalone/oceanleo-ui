// TG-U1 (2026-11-07 thin gateway): render smoke test for `src/acp/AcpTranscript.tsx`.
//
// Stored ACP frame rows go in; the task chat's own components come out (`AgentTranscriptBubble` for words, gates
// and notices, `AgentProgress` for thoughts / tool steps / plans). Static markup is parsed with jsdom (obtained
// through fabric's dependency tree, same as agent-chat-search-highlight.test.mjs) and checked via data-* hooks.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { cursorAnswerResult } from "../src/acp/messages.ts";
import { reduceRows } from "../src/acp/reduce.ts";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);
const clipboardStub = dataModule(`
  export async function writeClipboardText() { return true; }
`);
const attachmentUrlStub = dataModule(`
  export * from ${JSON.stringify(new URL("../src/lib/attachment-url.ts", import.meta.url).href)};
  export function useAttachmentDisplayUrl(attachment) {
    return attachment?.artifact_id ? "/private-thumbnail/" + attachment.artifact_id : attachment?.url;
  }
`);

const { AcpBackgroundTaskStrip, AcpTranscript } = await import(
  await compileModule("src/acp/AcpTranscript.tsx", {
    "../i18n/ui/useUI": uiStub,
    "./share/share-clipboard": clipboardStub,
    "../lib/attachment-url": attachmentUrlStub,
  })
);

// ---- row builders ------------------------------------------------------------

let nextId = 1;
let nextSeq = 1;
const node = (line) => {
  const seq = nextSeq++;
  return { id: nextId++, direction: "agent", node_seq: seq, raw: JSON.stringify({ oceanleo_acp: 1, seq, ...line }), received_at: "2026-11-07T10:00:00Z" };
};
// Agent rows hold the agent's JSON-RPC message as written; only node meta lines carry `oceanleo_acp` (TG-G1 storage).
const agent = (message) => ({ id: nextId++, direction: "agent", node_seq: nextSeq++, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const client = (message) => ({ id: nextId++, direction: "client", node_seq: null, raw: JSON.stringify({ jsonrpc: "2.0", ...message }), received_at: "2026-11-07T10:00:00Z" });
const update = (u, sessionId = "s1") => agent({ method: "session/update", params: { sessionId, update: u } });

const prompt = (id, text) => client({ id, method: "session/prompt", params: { sessionId: "s1", prompt: [{ type: "text", text }] } });
const said = (text) => update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text } });
const thought = (text) => update({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text } });
const endTurn = (id) => agent({ id, result: { stopReason: "end_turn" } });
const answer = (id, result) => client({ id, result });

const permissionRequest = () =>
  agent({
    id: 7,
    method: "session/request_permission",
    params: {
      sessionId: "s1",
      toolCall: { toolCallId: "t1", title: "Run ls" },
      options: [
        { optionId: "allow", name: "Allow", kind: "allow_once" },
        { optionId: "deny", name: "Deny", kind: "reject_once" },
      ],
    },
  });

// ---- render helpers ------------------------------------------------------------

function html(rows, props = {}) {
  return renderToStaticMarkup(React.createElement(AcpTranscript, { rows, program: "claude", onAnswer: () => {}, ...props }));
}

function render(rows, props) {
  return new JSDOM(`<!doctype html><html><body>${html(rows, props)}</body></html>`).window.document.body;
}

function occurrences(text, needle) {
  return text.split(needle).length - 1;
}

const TASK = "11111111-1111-4111-8111-111111111111";
const privateImageUri = "oceanleo-attachment://aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb/photo.png";
const imagePrompt = (image) => client({ id: 800, method: "session/prompt", params: { sessionId: "s1", prompt: [
  { type: "text", text: "看看截图…" }, { type: "image", mimeType: "image/png", ...image },
] } });

test("a reference-only picture shows a clickable thumbnail inside its user bubble", () => {
  const row = imagePrompt({ uri: privateImageUri, width: 1200, height: 800 });
  const body = render([row], { onOpenAttachment: () => {} });
  const bubble = body.querySelector('[data-testid="task-user-bubble"]');
  assert.equal(bubble.querySelector('img').getAttribute('src'), '/private-thumbnail/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.ok(bubble.querySelector('[data-upload-kind="image"] button'));
  assert.equal(body.querySelector('[data-acp-truncated-row]'), null);
  // A historical binary-only compacted row with a usable URI needs no expansion notice either.
  const historical = render([{ ...row, truncated: { bytes: 2164000, text: false, binary: true } }]);
  assert.ok(historical.querySelector('[data-upload-kind="image"]'));
  assert.doesNotMatch(historical.textContent, /内容较长|点击加载/);
});

test("a compacted binary image uses an inline thumbnail without a load-row action", () => {
  for (const truncated of [{ bytes: 2164000 }, { bytes: 2164000, text: false, binary: true }]) {
    const row = { ...imagePrompt({ data: "" }), truncated };
    const body = render([row], { taskId: TASK, onOpenAttachment: () => {} });
    assert.equal(body.querySelector('[data-acp-load-attachment]'), null);
    assert.ok(body.querySelector('[data-upload-kind="image"] img'));
    assert.doesNotMatch(body.textContent, /内容较长|点击加载/);
  }
});

test("true long text keeps expansion, even when the same row also has a missing legacy image", () => {
  const row = { ...prompt(801, '长文…'), truncated: { bytes: 50000, text: true, binary: false } };
  const body = render([row], { onExpandRow: async () => {} });
  assert.match(body.querySelector('[data-acp-truncated-row]').textContent, /内容较长，已省略 49 KB · 展开/);
  assert.equal(body.querySelector('[data-acp-load-attachment]'), null);
  const oldGateway = render([{ ...prompt(802, 'x'.repeat(8192) + '…'), truncated: { bytes: 50000 } }]);
  assert.match(oldGateway.textContent, /内容较长/);
  const mixed = imagePrompt({ data: '' });
  const message = JSON.parse(mixed.raw);
  message.params.prompt[0].text = '长文…';
  const both = render([{ ...mixed, raw: JSON.stringify(message), truncated: { bytes: 50000, text: true, binary: true } }]);
  assert.match(both.textContent, /内容较长/);
  assert.doesNotMatch(both.textContent, /点击加载/);
});

test("an image thumbnail opens its exact task block through the existing attachment callback", () => toolImageDom(async (root, doc) => {
  const row = { ...imagePrompt({ data: "" }), truncated: { bytes: 50000, text: false, binary: true } };
  const opened = [];
  await act(async () => root.render(React.createElement(AcpTranscript, { rows: [row], taskId: TASK, program: 'generic', onOpenAttachment: attachment => opened.push(attachment) })));
  assert.equal(doc.querySelector('[data-acp-load-attachment]'), null);
  await act(async () => doc.querySelector('[data-upload-kind="image"] button').click());
  assert.equal(opened[0].url, `/v1/tasks/${TASK}/frames/${row.id}/blocks/1`);
}));

function renderStrip(tasks, onStopTask) {
  return renderToStaticMarkup(React.createElement(AcpBackgroundTaskStrip, { tasks, onStopTask }));
}

test("no rows renders nothing at all (no empty-state copy)", () => {
  assert.equal(html([]), "");
});

test("a closed turn: user bubble, one finished process block, the reply once outside it", () => {
  const body = render([
    prompt(1, "hi"),
    thought("Let me look."),
    update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", kind: "read", status: "pending" }),
    update({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed", content: [{ type: "diff", path: "/a.ts", oldText: "a", newText: "b" }] }),
    said("Hel"),
    said("lo"),
    endTurn(1),
  ]);
  assert.ok(body.querySelector("[data-acp-transcript]"));
  const users = body.querySelectorAll('[data-testid="task-user-bubble"]');
  assert.equal(users.length, 1);
  assert.equal(users[0].textContent, "hi");
  const processes = body.querySelectorAll("[data-agent-process]");
  assert.equal(processes.length, 1);
  assert.equal(processes[0].getAttribute("data-agent-process-state"), "done");
  assert.equal(occurrences(body.textContent, "Hello"), 1);
  assert.ok(!processes[0].textContent.includes("Hello"), "the reply is not part of the process block");
});

test("an open turn (no response row yet) keeps its process block running", () => {
  const body = render([
    prompt(1, "hi"),
    thought("Working on it."),
    update({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", kind: "read", status: "in_progress" }),
  ]);
  const processes = body.querySelectorAll("[data-agent-process]");
  assert.equal(processes.length, 1);
  assert.equal(processes[0].getAttribute("data-agent-process-state"), "running");
});

test("a permission request is answerable until the client response row records the chosen option", () => {
  const rows = [prompt(1, "list files"), permissionRequest()];
  const pending = render(rows);
  const card = pending.querySelector('[data-native-permission="7"]');
  assert.ok(card, "permission card for request id 7");
  const options = card.querySelectorAll("[data-native-permission-option]");
  assert.deepEqual([...options].map((button) => button.getAttribute("data-native-permission-option")), ["allow", "deny"]);
  for (const button of options) assert.equal(button.hasAttribute("disabled"), false);
  assert.equal(card.querySelector("[data-native-permission-chosen]"), null);

  const answered = render([...rows, answer(7, { outcome: { outcome: "selected", optionId: "allow" } })]);
  const done = answered.querySelector('[data-native-permission="7"]');
  assert.ok(done);
  const chosen = done.querySelector("[data-native-permission-chosen]");
  assert.ok(chosen, "chosen line shown");
  assert.ok(chosen.textContent.includes("Allow"), `chosen shows the option name, got ${JSON.stringify(chosen.textContent)}`);
  assert.ok(!chosen.textContent.includes("allow"), "the option name, not its id");
  const buttons = done.querySelectorAll("[data-native-permission-option]");
  assert.equal(buttons.length, 2);
  for (const button of buttons) assert.equal(button.hasAttribute("disabled"), true);
});

test("node meta rows: a gap and an exit render as notices", () => {
  const body = render([node({ gap: { from: 2, to: 4, count: 3 } }), prompt(1, "hi"), node({ exit: { code: 1, signal: null } })]);
  const gap = body.querySelector('[data-agent-notice="gap"]');
  assert.ok(gap);
  assert.ok(gap.textContent.includes("此处省略 3 条"));
  const exit = body.querySelector('[data-agent-notice="exit"]');
  assert.ok(exit);
  assert.ok(exit.textContent.includes("code 1"));
});

test("a running background task is rendered in the composer strip, never after the transcript", () => {
  const rows = [
    prompt(1, "build it"),
    update({ sessionUpdate: "async_task_spawned", asyncTaskId: "bg1", name: "build", description: "npm build", canStop: true }),
  ];
  const withStop = render(rows, { onStopTask: () => {} });
  assert.equal(withStop.querySelector('[data-acp-background-task="bg1"]'), null);
  const view = reduceRows(rows);
  const strip = new JSDOM(`<!doctype html><html><body>${renderStrip(view.backgroundTasks, () => {})}</body></html>`).window.document.body;
  assert.ok(strip.querySelector('[data-acp-background-strip]'));
  assert.match(strip.querySelector('[data-acp-background-summary]').textContent, /后台任务运行中 · build · \d+(?:s|m \d+s)/);
  assert.equal(strip.querySelector('[data-acp-background-toggle]').getAttribute("aria-expanded"), "false");
  assert.equal(strip.querySelector('[data-acp-background-list]'), null, "the task list stays collapsed by default");
  assert.ok(strip.querySelector('[data-acp-stop-task="bg1"]'));

  const without = new JSDOM(`<!doctype html><html><body>${renderStrip(view.backgroundTasks)}</body></html>`).window.document.body;
  assert.equal(without.querySelector("[data-acp-stop-task]"), null);
});

test("an unknown agent request shows method and params verbatim while pending, and is gone once answered", () => {
  const params = { sessionId: "s1", path: "/tmp/x", nested: { n: 1, list: ["a", "b"] } };
  const rows = [prompt(1, "hi"), agent({ id: 9, method: "x/custom", params })];
  const pending = render(rows);
  const card = pending.querySelector('[data-acp-raw-request="x/custom"]');
  assert.ok(card);
  assert.equal(card.querySelector("pre").textContent, JSON.stringify(params, null, 2));

  const answered = render([...rows, client({ id: 9, error: { code: -32601, message: "Method not found" } })]);
  assert.equal(answered.querySelector("[data-acp-raw-request]"), null);
});

test("cursor/create_plan renders a native question gate", () => {
  const body = render(
    [prompt(1, "plan it"), agent({ id: 11, method: "cursor/create_plan", params: { plan: "1. do x", name: "My plan" } })],
    { program: "cursor" },
  );
  const gate = body.querySelector('[data-native-question="11"]');
  assert.ok(gate);
  assert.ok(gate.textContent.includes("My plan"));
  assert.ok(gate.textContent.includes("1. do x"));
  assert.ok(gate.querySelector('[data-native-question-option="accepted"]'));
  assert.ok(gate.querySelector('[data-native-question-option="rejected"]'));
});

test("a prompt error response is shown verbatim in a labelled system error line", () => {
  const body = render([
    prompt(1, "hi"),
    agent({ id: 1, error: { code: -32603, message: "Internal error: boom", data: { detail: "x" } } }),
  ]);
  const errors = [...body.querySelectorAll('[role="alert"][data-agent-system="error"]')];
  assert.equal(errors.length, 1);
  assert.ok(errors[0].textContent.includes("Internal error: boom"));
});

test("cursorAnswerResult builds the result object Cursor reads", () => {
  assert.deepEqual(cursorAnswerResult("cursor/create_plan", { __plan__: "accepted" }), { outcome: { outcome: "accepted" } });
  assert.deepEqual(cursorAnswerResult("cursor/ask_question", { q1: "a,b", text: "x" }), {
    outcome: { outcome: "answered", answers: [{ questionId: "q1", selectedOptionIds: ["a", "b"] }] },
  });
});

test('a refused carried setting is one plain notice; it does not hide the following sent prompt', () => {
  const body = render([
    client({ id: 950, method: 'session/set_config_option', params: { sessionId: 's1', configId: 'fast', value: true } }),
    agent({ id: 950, error: { code: -32602, message: 'Unknown config option: fast', data: { code: 'not_offered', technical: 'hidden-data' } } }),
    prompt(951, '这条消息照常发送'), endTurn(951),
  ]);
  assert.equal(occurrences(body.textContent, '设置没有生效：Unknown config option: fast'), 1);
  assert.match(body.textContent, /这条消息照常发送/);
  assert.doesNotMatch(body.textContent, /hidden-data|not_offered|session\/set_config_option/);
});


async function toolImageDom(run) {
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { url: 'https://p-test.dev.oceanleo.com/tasks/test' });
  const saved = Object.fromEntries(['window', 'document', 'IS_REACT_ACT_ENVIRONMENT'].map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  Object.assign(globalThis, { window: dom.window, document: dom.window.document, IS_REACT_ACT_ENVIRONMENT: true });
  const root = createRoot(dom.window.document.getElementById('root'));
  try { await run(root, dom.window.document); }
  finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [key, descriptor] of Object.entries(saved)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor); else delete globalThis[key];
    }
  }
}
const toolImage = image => update({ sessionUpdate: 'tool_call_update', toolCallId: 'tp-image', title: 'Screenshot', kind: 'read', status: 'completed', content: [
  { type: 'content', content: { type: 'text', text: 'Screenshot output' } },
  { type: 'content', content: { type: 'image', mimeType: 'image/png', ...image } },
] });

test('TP: compacted tool images show directly and open their exact block', () => toolImageDom(async (root, doc) => {
  const row = { ...toolImage({ data: '' }), truncated: { bytes: 50000, text: false, binary: true } };
  const opened = [];
  await act(async () => root.render(React.createElement(AcpTranscript, { rows: [row], taskId: TASK, program: 'generic', onOpenAttachment: file => opened.push(file) })));
  assert.equal(doc.querySelector('[data-acp-load-attachment]'), null);
  if (!doc.querySelector('[data-agent-process-image]')) await act(async () => doc.querySelector('[data-agent-process-toggle]').click());
  const tile = doc.querySelector('[data-agent-process-image]');
  assert.ok(tile.querySelector('img'));
  await act(async () => tile.querySelector('button').click());
  assert.equal(opened[0].url, `/v1/tasks/${TASK}/frames/${row.id}/blocks/1`);
  assert.ok(doc.querySelector('[data-agent-process-tool-body]'));
  await act(async () => doc.querySelector('[data-agent-process-tool] > button').click());
  assert.equal(doc.querySelector('[data-agent-process-tool-body]'), null);
}));

test('TP: file preview failures are explicit and allow another click', () => toolImageDom(async (root, doc) => {
  const row = toolImage({ data: '' });
  await act(async () => root.render(React.createElement(AcpTranscript, { rows: [row], taskId: TASK, program: 'generic', onOpenAttachment: async () => false })));
  if (!doc.querySelector('[data-agent-process-image]')) await act(async () => doc.querySelector('[data-agent-process-toggle]').click());
  await act(async () => doc.querySelector('[data-agent-process-image] button').click());
  assert.match(doc.querySelector('[role="alert"]').textContent, /无法读取文件/);
  assert.equal(doc.querySelector('[data-agent-process-image] button').disabled, false);
}));

test('TP: multiple inline and private images retain their identity; decode failures show a reason', () => toolImageDom(async (root, doc) => {
  const row = toolImage({ data: 'aGVsbG8=' });
  const raw = JSON.parse(row.raw);
  raw.params.update.content.push({ type: 'content', content: { type: 'image', mimeType: 'image/png', uri: privateImageUri } });
  const opened = [];
  await act(async () => root.render(React.createElement(AcpTranscript, { rows: [{ ...row, raw: JSON.stringify(raw) }], taskId: TASK, program: 'claude', onOpenAttachment: a => opened.push(a) })));
  await act(async () => doc.querySelector('[data-agent-process-toggle]').click());
  const tiles = doc.querySelectorAll('[data-agent-process-image]');
  assert.equal(tiles.length, 2);
  await act(async () => tiles[1].querySelector('button').click());
  assert.equal(opened[0].artifact_id, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  assert.equal(opened[0].revision_id, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
  await act(async () => tiles[0].querySelector('img').dispatchEvent(new window.Event('error')));
  assert.match(tiles[0].querySelector('[role="alert"]').textContent, /图片加载失败.*无法解码/);
  assert.ok(doc.querySelector('[data-agent-process-tool-body]'));
}));

test('TP: child tool screenshots render inside their child step and use the attachment opener', () => toolImageDom(async (root, doc) => {
  const rows = [update({ sessionUpdate: 'tool_call', toolCallId: 'parent-task', title: 'Subtask', kind: 'other', status: 'completed' })];
  const row = toolImage({ data: 'aGVsbG8=' });
  const raw = JSON.parse(row.raw);
  raw.params.update._meta = { claudeCode: { parentToolUseId: 'parent-task' } };
  rows.push({ ...row, raw: JSON.stringify(raw) });
  const opened = [];
  await act(async () => root.render(React.createElement(AcpTranscript, { rows, taskId: TASK, program: 'claude', onOpenAttachment: a => opened.push(a) })));
  await act(async () => doc.querySelector('[data-agent-process-toggle]').click());
  const tile = doc.querySelector('[data-agent-process-substep-list] [data-agent-process-image]');
  assert.ok(tile);
  await act(async () => tile.querySelector('button').click());
  assert.equal(opened[0].url, `/v1/tasks/${TASK}/frames/${row.id}/blocks/1`);
}));

test('TP: attachment errors have translations in every UI locale', async () => {
  const { LOCALES } = await import('../src/i18n/config.ts');
  const { UT_COPY_A } = await import('../src/i18n/ui/messages/pages-bay-wave-copy-a.ts');
  for (const locale of LOCALES) for (const key of ['图片已不可用', '图片加载失败：{reason}', '图片数据无法解码']) {
    assert.ok(UT_COPY_A[locale][key], `${locale}: ${key}`);
    if (key.includes('{reason}')) assert.ok(UT_COPY_A[locale][key].includes('{reason}'));
  }
});


test("a silent open turn shows the My Tasks working figure without a spinner or timer", () => {
  const body = render([prompt(901, "Please work")]);
  const line = body.querySelector("[data-acp-model-waiting] [data-stream-waiting]");
  assert.ok(line);
  assert.match(line.textContent, /智能体正在工作/);
  assert.ok(line.querySelector("[data-oceanleo-acp-pixel-run]"));
  assert.equal(line.querySelector(".v-spinner"), null);
  assert.doesNotMatch(line.textContent, /等待模型回应|\d+:\d{2}/);
});
