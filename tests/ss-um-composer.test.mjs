// Session / sites wave 2026-11-21, unit UM: the LeoChat / session composer looks like the task composer,
// has no "Ask an agent" / agent @ rows, offers "Task" in its attach menu only in a session (attachTaskCard),
// turns a pasted task link into a task card there, and shows errors without changing its height.
//
// node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//   --experimental-loader ./tests/ts-extension-loader.mjs --test tests/ss-um-composer.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React, { act } from "react";
import "./helpers/w1-jsdom-window.mjs";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { LOCALES } from "../src/i18n/config.ts";
import { ssUmCopy, SS_UM_COPY_SOURCE } from "../src/i18n/ui/messages/ss-um-copy.ts";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.CustomEvent = window.CustomEvent;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.HTMLElement.prototype.scrollIntoView = function () {};
window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
const { createRoot } = await import("react-dom/client");

const imClient = dataModule(`
  export class ImApiError extends Error { constructor(status, code) { super(code); this.status = status; this.code = code; } }
  export async function imFetch() { throw new Error("no network in tests"); }
`);
const stubs = {
  "../../../i18n/ui/useUI": dataModule("export function useUI(){ return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh; }"),
  "../../../lib/im/messages-api": dataModule("export const messagesApi = {};"),
  "../../../lib/im/client": imClient,
  "../../replay/work/ReplayPickerDialog": dataModule("export function ReplayPickerDialog(){ return null; }"),
  "../realtime/hooks": dataModule("export function sendTyping(){}"),
  "./ArtifactPickerDialog": dataModule("export function ArtifactPickerDialog(){ return null; }"),
  "./drafts": dataModule("export const draftBook = { read: async () => '', write(){}, clear(){}, saver: { flush: async () => {} } };"),
};
const { Composer, COMPOSER_FRAME_CLASS, composerSendButtonClass } = await import(
  await compileModule("src/shell/messages/composer/Composer.tsx", stubs)
);
const { ImApiError } = await import(imClient);
const taskCard = await import(await compileModule("src/shell/messages/composer/task-card.ts", { "../../../lib/im/client": imClient }));

const TASK_A = "11111111-2222-4333-8444-555555555555";
const TASK_B = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const CHOICES = [
  { id: TASK_A, title: "Launch plan", project: "Spring" },
  { id: TASK_B, title: "Budget review", project: null },
];

function makeStore() {
  const calls = { send: [], ingest: [] };
  return {
    calls,
    async send(input) { calls.send.push(input); return null; },
    ingestMessage(message) { calls.ingest.push(message); },
    async edit() { return null; },
  };
}

async function mount(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Composer, props)));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  return {
    host,
    q: (selector) => host.querySelector(selector),
    async click(element) { assert.ok(element); await act(async () => element.click()); },
    async type(value) {
      const area = host.querySelector("textarea");
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
      await act(async () => {
        setter.call(area, value);
        area.dispatchEvent(new window.Event("input", { bubbles: true }));
      });
    },
    async settle() { await act(async () => new Promise((resolve) => setTimeout(resolve, 0))); },
    async unmount() { await act(async () => root.unmount()); host.remove(); },
  };
}

const baseProps = (store, extra = {}) => ({
  store,
  conversationId: "session-1",
  conversation: null,
  viewerId: "me",
  layout: "full",
  ...extra,
});

const menuItems = () => [...document.querySelectorAll('[data-composer-attach-menu] [role="menuitem"]')].map((node) => node.textContent.trim());

test("attach menu: Task is offered only when attachTaskCard is set", async () => {
  const plain = await mount(baseProps(makeStore()));
  try {
    await plain.click(plain.q("[data-composer-attach]"));
    assert.deepEqual(menuItems(), ["上传文件", "分享作品", "分享工作回放"]);
  } finally {
    await plain.unmount();
  }
  const session = await mount(baseProps(makeStore(), { attachTaskCard: true, loadTaskChoices: async () => CHOICES }));
  try {
    await session.click(session.q("[data-composer-attach]"));
    assert.deepEqual(menuItems(), ["上传文件", "分享作品", "分享工作回放", "任务"]);
  } finally {
    await session.unmount();
  }
});

test("Task page: searchable list of my tasks; picking one posts a task card into the session", async () => {
  const store = makeStore();
  const posted = [];
  const view = await mount(baseProps(store, {
    attachTaskCard: true,
    loadTaskChoices: async () => CHOICES,
    postTaskCardImpl: async (conversationId, taskId) => {
      posted.push([conversationId, taskId]);
      return { id: "m-card", kind: "task", card: { type: "task", child_kind: "agent_task", child_id: taskId, title: "Launch plan" } };
    },
  }));
  try {
    await view.click(view.q("[data-composer-attach]"));
    const taskRow = [...document.querySelectorAll('[data-composer-attach-menu] [role="menuitem"]')].find((node) => node.textContent.trim() === "任务");
    await view.click(taskRow);
    await view.settle();
    const page = document.querySelector('[data-composer-attach-menu="task"]');
    assert.ok(page, "second page of the same popover, not a dialog frame");
    assert.equal(page.getAttribute("role"), "dialog");
    const titles = () => [...page.querySelectorAll('[role="menuitem"]')].map((node) => node.textContent);
    assert.equal(titles().length, 2);
    const search = page.querySelector('input[type="search"]');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(search, "budget");
      search.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(titles().length, 1);
    assert.match(titles()[0], /Budget review/);
    await view.click(page.querySelector('[role="menuitem"]'));
    await view.settle();
    assert.deepEqual(posted, [["session-1", TASK_B]]);
    assert.equal(store.calls.ingest.length, 1, "the card message lands in the conversation at once");
    assert.equal(store.calls.send.length, 0);
    assert.equal(view.q("[data-composer-attach]").getAttribute("aria-expanded"), "false", "menu closes after the card is posted");
  } finally {
    await view.unmount();
  }
});

test("a session message that is only a task link is posted as a task card, not as URL text", async () => {
  const store = makeStore();
  const posted = [];
  const view = await mount(baseProps(store, {
    attachTaskCard: true,
    postTaskCardImpl: async (_conversationId, taskId) => { posted.push(taskId); return { id: "m1", kind: "task" }; },
  }));
  try {
    await view.type(`  https://oceanleo.com/tasks/${TASK_A}  `);
    await view.click(view.q("[data-send-button]"));
    await view.settle();
    assert.deepEqual(posted, [TASK_A]);
    assert.equal(store.calls.send.length, 0, "no text message with the URL");
    assert.equal(view.q("textarea").value, "", "box is cleared");
  } finally {
    await view.unmount();
  }
});

test("outside a session, or with other words, or when the server refuses, the link goes out as text", async () => {
  const link = `https://oceanleo.com/tasks/${TASK_A}`;
  for (const [extra, text] of [
    [{}, link],
    [{ attachTaskCard: true, postTaskCardImpl: async () => { throw new Error("must not post"); } }, `see ${link}`],
    [{ attachTaskCard: true, postTaskCardImpl: async () => { throw new ImApiError(403, "forbidden"); } }, link],
  ]) {
    const store = makeStore();
    const view = await mount(baseProps(store, extra));
    try {
      await view.type(text);
      await view.click(view.q("[data-send-button]"));
      await view.settle();
      assert.equal(store.calls.send.length, 1, text);
      assert.equal(store.calls.send[0].body, text);
      assert.equal(store.calls.ingest.length, 0);
    } finally {
      await view.unmount();
    }
  }
});

test("a failed task card keeps the text and shows a floating notice", async () => {
  const store = makeStore();
  const view = await mount(baseProps(store, {
    attachTaskCard: true,
    postTaskCardImpl: async () => { throw new ImApiError(503, "unavailable"); },
  }));
  try {
    const link = `https://oceanleo.com/history?task=${TASK_B}`;
    await view.type(link);
    await view.click(view.q("[data-send-button]"));
    await view.settle();
    assert.equal(store.calls.send.length, 0);
    assert.equal(view.q("textarea").value, link);
    const notice = view.q("[data-composer-notice]");
    assert.ok(notice);
    assert.equal(notice.textContent.includes("没能发出任务卡片，请重试。"), true);
  } finally {
    await view.unmount();
  }
});

test("microphone error is a notice floating above the frame, not a red line inside it", async () => {
  const view = await mount(baseProps(makeStore()));
  try {
    const mic = view.q('button[aria-label="录音"]');
    await act(async () => mic.dispatchEvent(new window.Event("pointerdown", { bubbles: true })));
    await view.settle();
    const notice = view.q("[data-composer-notice]");
    assert.ok(notice, "notice shown");
    assert.equal(notice.getAttribute("role"), "alert");
    const layer = notice.parentElement;
    assert.ok(layer.classList.contains("absolute") && layer.classList.contains("bottom-full"), "out of the flow, above the frame");
    assert.equal(layer.parentElement, view.q("[data-composer]"));
    await view.click(notice.querySelector("button"));
    assert.equal(view.q("[data-composer-notice]"), null);
  } finally {
    await view.unmount();
  }
});

test("looks like the task composer: one frame, px-4, round icon buttons, 36px send circle, 15px text", async () => {
  const leo = readFileSync(new URL("../src/shell/LeoComposer.tsx", import.meta.url), "utf8");
  for (const token of COMPOSER_FRAME_CLASS.split(/\s+/)) assert.ok(leo.includes(token), `task frame uses ${token}`);
  assert.match(composerSendButtonClass(true), /\bh-9 w-9\b.*rounded-full/);
  assert.match(composerSendButtonClass(true), /bg-neutral-900/);
  assert.match(composerSendButtonClass(false), /bg-neutral-300/);

  const view = await mount(baseProps(makeStore(), {
    conversation: { id: "c", kind: "group", leo_enabled: true, members: [], my_role: "member" },
  }));
  try {
    const frame = view.q("[data-composer]");
    assert.equal(frame.getAttribute("data-im-composer"), null, "no messages-surface CSS hook");
    assert.ok(frame.classList.contains("rounded-2xl"));
    assert.ok(view.q("[data-composer-actions]").classList.contains("px-4"));
    assert.ok(view.q("textarea").classList.contains("text-[15px]"));
    const send = view.q("[data-send-button]");
    assert.equal(send.disabled, true);
    assert.ok(send.classList.contains("bg-neutral-300"));
    assert.ok(send.querySelector("svg"), "up arrow icon, no text");
    const leoButton = view.q("[data-composer-leo]");
    assert.ok(leoButton.querySelector("svg"), "@ is an icon button");
    assert.equal(leoButton.textContent.trim(), "");
    await view.click(leoButton);
    assert.equal(view.q("textarea").value, "@leo ");
    for (const label of ["表情", "录音", "问 leo"]) {
      const button = view.q(`button[aria-label="${label}"]`);
      assert.ok(button.classList.contains("rounded-full"), label);
      assert.ok(button.classList.contains("active:scale-95"), label);
    }
    assert.ok(view.q("[data-composer-attach]").classList.contains("rounded-full"));
    assert.doesNotMatch(view.host.innerHTML, /\bmin-[hw]-11\b/, "no 44px minimum on 28–32px controls");
    await view.click(view.q('button[aria-label="表情"]'));
    const emoji = view.q('[role="dialog"]');
    assert.ok(emoji.classList.contains("w-[248px]") && emoji.classList.contains("grid-cols-8"));
    assert.doesNotMatch(emoji.innerHTML, /\bmin-[hw]-11\b/, "eight columns fit in 248px");
  } finally {
    await view.unmount();
  }
});

test("no Ask an agent and no agent rows in the @ list", async () => {
  const dir = new URL("../src/shell/messages/composer/", import.meta.url);
  for (const file of ["Composer.tsx", "MentionPicker.tsx"]) {
    const source = readFileSync(new URL(file, dir), "utf8");
    assert.doesNotMatch(source, /sendAccessory|extraMentions|ComposerExtraMention|composer-extras|task-room/, file);
  }
  const mentions = await import(await compileModule("src/shell/messages/composer/MentionPicker.tsx"));
  assert.equal(mentions.extraMentionCandidates, undefined);
  const view = await mount(baseProps(makeStore(), { attachTaskCard: true }));
  try {
    assert.doesNotMatch(view.host.textContent, /Ask an agent|交给智能体|叫智能体/);
  } finally {
    await view.unmount();
  }
});

test("task-card helpers: link-only detection, my-task list shape, search", () => {
  const origin = "https://oceanleo.com";
  assert.deepEqual(taskCard.taskIdsFromLinkOnlyText(`https://oceanleo.com/tasks/${TASK_A}`, origin), [TASK_A]);
  assert.deepEqual(
    taskCard.taskIdsFromLinkOnlyText(`https://oceanleo.com/tasks/${TASK_A}\nhttps://oceanbizs.com/history?task=${TASK_B} https://oceanleo.com/tasks/${TASK_A}`, origin),
    [TASK_A, TASK_B],
  );
  assert.equal(taskCard.taskIdsFromLinkOnlyText(`look https://oceanleo.com/tasks/${TASK_A}`, origin), null);
  assert.equal(taskCard.taskIdsFromLinkOnlyText(`https://oceanleo.app/tasks/${TASK_A}`, origin), null, "user-content domain is never a task link");
  assert.equal(taskCard.taskIdsFromLinkOnlyText("   ", origin), null);
  assert.deepEqual(
    taskCard.taskCardChoices([{ id: TASK_A, title: " Plan ", status: "done", mode: "agent", project: { id: "p", name: "Spring" } }, { id: "", status: "done", mode: "agent" }]),
    [{ id: TASK_A, title: "Plan", project: "Spring" }],
  );
  assert.deepEqual(taskCard.filterTaskCardChoices(CHOICES, "spring").map((c) => c.id), [TASK_A]);
  assert.equal(taskCard.filterTaskCardChoices(CHOICES, "").length, 2);
});

test("ss-um copy: every locale has every key", () => {
  const keys = Object.keys(SS_UM_COPY_SOURCE).sort();
  for (const locale of LOCALES) {
    const copy = ssUmCopy(locale);
    assert.deepEqual(Object.keys(copy).sort(), keys, locale);
    for (const key of keys) assert.ok(copy[key].trim(), `${locale}: ${key}`);
  }
});
