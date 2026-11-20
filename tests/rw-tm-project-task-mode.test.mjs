// Wave 2026-11-20 TM: project task modes (Private / Can view / Can collaborate),
// the owner's mode control, and the live push for idle cloud tasks.
import assert from "node:assert/strict";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import "./helpers/w1-jsdom-window.mjs";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const reactUrl = JSON.stringify(import.meta.resolve("react"));
const menuStub = dataModule(`
  import React from ${reactUrl};
  export function FloatingMenu({ open, children, ariaLabel }) {
    return open ? React.createElement("div", { role: "menu", "aria-label": ariaLabel }, children) : null;
  }
  export function FloatingMenuItem({ label, description, selected, disabled, onSelect, role }) {
    return React.createElement("button", { type: "button", role, "aria-checked": selected ? "true" : "false",
      disabled, "data-mode-option": label, onClick: onSelect }, label, description ? " — " + description : "");
  }
`);
const { ProjectTaskModeControl, setProjectTaskMode, PROJECT_TASK_MODE_LABEL } = await import(await compileModule(
  "src/shell/access/ProjectTaskModeControl.tsx", {
    "../../i18n/ui/useUI": dataModule("const tt = (x) => x; export function useUI(){ return tt; }"),
    "../../lib/auth/client": dataModule("export async function accessToken(){ return 'tok'; }"),
    "../../lib/auth/config": dataModule("export const GATEWAY_BASE = 'https://gw.test';"),
    "../../ui/menu/FloatingMenu": menuStub,
  }));
const { useTaskEvents, TASK_EVENTS_RETRY_MS } = await import(await compileModule("src/shell/agent-thread/useTaskEvents.ts", {
  "../../lib/auth/config": dataModule("export const GATEWAY_BASE = 'https://gw.test';"),
}));
const { rwTmCopy } = await import(await compileModule("src/i18n/ui/messages/rw-tm-copy.ts"));

async function render(element) {
  const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(element));
  return { host, root, async close() { await act(async () => root.unmount()); host.remove(); } };
}
const click = (node) => act(async () => { node.click(); await new Promise((r) => setTimeout(r, 0)); });

test("mode names: Private / Can view / Can collaborate, never Shared", () => {
  const en = rwTmCopy("en");
  assert.deepEqual(Object.values(PROJECT_TASK_MODE_LABEL).map((key) => en[key]), ["Private", "Can view", "Can collaborate"]);
  assert.deepEqual(Object.values(PROJECT_TASK_MODE_LABEL).map((key) => rwTmCopy("zh")[key]), ["私有", "可查看", "可协作"]);
  for (const locale of ["zh-TW", "de", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi", "tr", "ja", "ko", "ar", "th", "hi"]) {
    const copy = rwTmCopy(locale);
    assert.deepEqual(Object.keys(copy), Object.keys(rwTmCopy("zh")), locale);
    assert.ok(Object.values(copy).every((value) => value && !/shared/i.test(value)), locale);
  }
});

test("setProjectTaskMode PATCHes the project work route and returns the saved effective mode", async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, body: JSON.parse(init.body), auth: init.headers.Authorization });
    return new Response(JSON.stringify({ item: { project_mode: "collaborate" } }), { status: 200 });
  };
  assert.equal(await setProjectTaskMode("p 1", "t1", "collaborate", { fetchImpl }), "collaborate");
  assert.deepEqual(calls, [{ url: "https://gw.test/v1/projects/p%201/work/task/t1/mode", method: "PATCH",
    body: { mode: "collaborate" }, auth: "Bearer tok" }]);
  const unavailable = async () => new Response(JSON.stringify({ detail: { code: "project_mode_unavailable" } }), { status: 503 });
  await assert.rejects(setProjectTaskMode("p", "t1", "collaborate", { fetchImpl: unavailable }), { code: "project_mode_unavailable" });
});

test("the owner's control switches the mode and shows a labelled failure", async () => {
  const saved = [];
  let mode = "private";
  let fail = "";
  const save = async (projectId, taskId, next) => {
    saved.push([projectId, taskId, next]);
    if (fail) { const error = new Error(fail); error.name = "ProjectTaskModeError"; throw Object.assign(error, { code: fail }); }
    return next;
  };
  const view = await render(React.createElement(function Harness() {
    const [value, setValue] = React.useState(mode);
    mode = value;
    return React.createElement(ProjectTaskModeControl, { projectId: "p", taskId: "t1", mode: value, onChange: setValue, save });
  }));
  try {
    const button = view.host.querySelector("[data-project-task-mode]");
    assert.equal(button.textContent, "私有");
    await click(button);
    const options = [...view.host.querySelectorAll("[data-mode-option]")].map((node) => node.dataset.modeOption);
    assert.deepEqual(options, ["私有", "可查看", "可协作"]);
    assert.match(view.host.textContent, /项目成员可以继续这个对话，费用由你承担/);
    await click(view.host.querySelector('[data-mode-option="可协作"]'));
    assert.deepEqual(saved, [["p", "t1", "collaborate"]]);
    assert.equal(view.host.querySelector("[data-project-task-mode]").dataset.projectTaskMode, "collaborate");
    assert.equal(view.host.querySelector('[role="menu"]'), null);

    await click(view.host.querySelector("[data-project-task-mode]"));
    fail = "http_500";
    await click(view.host.querySelector('[data-mode-option="可查看"]'));
    assert.equal(view.host.querySelector('[role="alert"]').textContent, "任务模式未能更改，请重试。");
    assert.equal(view.host.querySelector("[data-project-task-mode]").dataset.projectTaskMode, "collaborate");
  } finally { await view.close(); }
});

test("before migration 0611 Can collaborate says it is not available yet", async () => {
  const { ProjectTaskModeError } = await import(await compileModule("src/shell/access/ProjectTaskModeControl.tsx", {
    "../../i18n/ui/useUI": dataModule("const tt = (x) => x; export function useUI(){ return tt; }"),
    "../../lib/auth/client": dataModule("export async function accessToken(){ return 'tok'; }"),
    "../../lib/auth/config": dataModule("export const GATEWAY_BASE = 'https://gw.test';"),
    "../../ui/menu/FloatingMenu": menuStub,
  }));
  const save = async () => { throw new ProjectTaskModeError("project_mode_unavailable"); };
  const view = await render(React.createElement(ProjectTaskModeControl, { projectId: "p", taskId: "t1", mode: "view", onChange() {}, save }));
  try {
    await click(view.host.querySelector("[data-project-task-mode]"));
    await click(view.host.querySelector('[data-mode-option="可协作"]'));
    assert.equal(view.host.querySelector('[role="alert"]').textContent, "可协作暂不可用，请稍后再试。");
  } finally { await view.close(); }
});

function eventsHarness() {
  const opened = [];
  const streams = [];
  const open = (init) => {
    opened.push(init);
    let push; let end;
    const queue = [];
    const iterator = {
      [Symbol.asyncIterator]() { return this; },
      next() {
        if (queue.length) return Promise.resolve(queue.shift());
        return new Promise((resolve, reject) => {
          push = (value) => resolve({ value, done: false });
          end = () => resolve({ value: undefined, done: true });
          init.signal.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
        });
      },
    };
    streams.push({ send: (event) => push({ event }), end: () => end() });
    return iterator;
  };
  const waits = [];
  const wait = (ms) => { waits.push(ms); return Promise.resolve(); };
  return { opened, streams, open, waits, wait, token: async () => "tok" };
}

test("an idle shared cloud task follows the push stream and reconnects", async () => {
  const deps = eventsHarness();
  const changes = [];
  const onChange = (id) => changes.push(id);
  function Harness({ id }) { useTaskEvents(id, onChange, deps); return null; }
  const view = await render(React.createElement(Harness, { id: "t1" }));
  const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  try {
    await flush();
    assert.equal(deps.opened.length, 1);
    assert.equal(deps.opened[0].url, "https://gw.test/v1/tasks/t1/events");
    assert.deepEqual(deps.opened[0].headers, { Authorization: "Bearer tok" });
    // Another person starts a turn: the page re-reads the task without a reload.
    await act(async () => deps.streams[0].send("snapshot"));
    await act(async () => deps.streams[0].send("message"));
    await act(async () => deps.streams[0].send("access_changed"));
    assert.deepEqual(changes, ["t1", "t1"]);
    await act(async () => deps.streams[0].end());
    await flush();
    assert.deepEqual(deps.waits, [TASK_EVENTS_RETRY_MS[0]]);
    assert.equal(deps.opened.length, 2);
    // A running task (or one only its owner sees) closes the stream.
    await act(async () => view.root.render(React.createElement(Harness, { id: null })));
    assert.equal(deps.opened[1].signal.aborted, true);
  } finally { await view.close(); }
});
