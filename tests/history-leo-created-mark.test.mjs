/**
 * 「我的任务」名称右侧：只有 created_by === "leo" 的行出现火花标记。
 * 标记不替代标题，也不盖住标题。
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/workspace/poster",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
window.Element.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.React = React;

function session(id, title, createdBy) {
  return {
    id,
    site_id: "image",
    app_id: "poster",
    surface: "app",
    status: "active",
    title,
    snapshot: {},
    schema_version: 1,
    revision: 1,
    created_at: "2026-09-22T00:00:00Z",
    updated_at: "2026-09-22T00:00:00Z",
    last_activity_at: "2026-09-22T00:00:00Z",
    first_output_at: "2026-09-22T00:00:00Z",
    ...(createdBy === undefined ? {} : { created_by: createdBy }),
  };
}

function task(id, title, extra = {}) {
  return {
    id,
    title,
    status: "done",
    mode: "agent",
    created_at: "2026-09-21T00:00:00Z",
    ...extra,
  };
}

globalThis.__leoCreatedSessions = [
  session("s-leo", "由 leo 写成", "leo"),
  session("s-plain", "人手记下的"),
  session("s-empty", "空字符串", ""),
  session("s-linked", "挂在会话上"),
];
globalThis.__leoCreatedTasks = [
  task("t-leo", "leo 的旧任务", { created_by: "leo" }),
  task("t-plain", "旧对话"),
  task("t-other", "别人建的", { created_by: "user" }),
  task("t-shell", "终端里的活", { mode: "shell", created_by: "leo" }),
  task("t-shell-plain", "普通终端", { mode: "shell" }),
  task("t-linked-hidden", "不该单独成行的 leo 任务", {
    created_by: "leo",
    session_id: "s-linked",
  }),
];

const historyUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", {
  "../i18n/ui/useUI": dataModule(
    `export function useUI(){ return (value) => value; }`,
  ),
  "next/navigation": dataModule(`
    export function usePathname(){ return "/workspace/poster"; }
    export function useRouter(){ return { push(){}, replace(){}, prefetch(){} }; }
  `),
  "./WorkspaceSelection": dataModule(`
    export function useWorkspaceSelection(){ return globalThis.React.useState(null); }
  `),
  "./AgentChat": dataModule(`export function AgentChat(){ return null; }`),
  "./WorkspaceSession": dataModule(
    `export function WorkspaceSessionProvider({ children }){ return children; }`,
  ),
  "./HistoryRowActions": dataModule(`
    export function HistoryRowMenu(){ return null; }
    export function MoveTaskProjectDialog(){ return null; }
  `),
  "../ui": dataModule(`export function ConfirmDialog(){ return null; }`),
  "../lib/auth/client": dataModule(`
    export function browserClient(){ return null; }
    export async function accessToken(){ return null; }
  `),
  "../lib/agent": dataModule(`
    export async function authed(){ return { ok: false, error: "stub", status: 401 }; }
    export async function listTasks(){
      return { ok: true, data: { items: globalThis.__leoCreatedTasks } };
    }
    export async function deleteTask(){ return { ok: true }; }
    export async function getTask(){ return { ok: false, status: 404 }; }
    export function taskCostYuan(){ return 0; }
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){
      return status === 404 || status === 405 || status === 501;
    }
    export async function listAppSessions(){
      return { ok: true, data: { items: globalThis.__leoCreatedSessions } };
    }
    export async function getAppSession(){ return { ok: false, status: 404 }; }
    export async function deleteAppSession(){ return { ok: true }; }
    export async function updateAppSessionMetadata(){ return { ok: true }; }
  `),
});

const { HistoryInlineList } = await import(historyUrl);

function titleEl(button, title) {
  return [...button.querySelectorAll("span")].find(
    (span) =>
      span.textContent === title && String(span.className).includes("font-medium"),
  );
}

function rowButton(container, title) {
  return [...container.querySelectorAll("button")].find((button) => titleEl(button, title));
}

function assertLeoMark(container, title, present) {
  const button = rowButton(container, title);
  assert.ok(button, `找不到「${title}」这一行`);
  const titleNode = titleEl(button, title);
  const mark = button.querySelector("[data-oceanleo-leo-created]");
  assert.equal(titleNode.textContent, title);
  if (!present) {
    assert.equal(mark, null, `「${title}」不该出现 leo 标记`);
    return;
  }
  assert.ok(mark, `「${title}」应该出现 leo 标记`);
  assert.equal(mark.getAttribute("aria-label"), "leo");
  assert.equal(mark.textContent, "");
  assert.equal(titleNode.parentElement, mark.parentElement);
  assert.ok(
    titleNode.compareDocumentPosition(mark) & Node.DOCUMENT_POSITION_FOLLOWING,
  );
  const markClass = mark.getAttribute("class") || "";
  assert.match(markClass, /shrink-0/);
  assert.doesNotMatch(markClass, /absolute/);
}

test("created_by 为 leo 的行在名称右侧标出火花，其它行不标", async () => {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(HistoryInlineList, { siteId: "image" }));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  try {
    assertLeoMark(container, "由 leo 写成", true);
    assertLeoMark(container, "挂在会话上", true);
    assertLeoMark(container, "leo 的旧任务", true);
    assertLeoMark(container, "终端里的活", true);
    assertLeoMark(container, "人手记下的", false);
    assertLeoMark(container, "空字符串", false);
    assertLeoMark(container, "旧对话", false);
    assertLeoMark(container, "别人建的", false);
    assertLeoMark(container, "普通终端", false);

    const shellLeo = rowButton(container, "终端里的活");
    const shellPlain = rowButton(container, "普通终端");
    assert.ok(shellLeo.querySelector("[data-oceanleo-cc-shell-tag]"));
    assert.match(shellLeo.textContent, /Shell/);
    assert.ok(shellPlain.querySelector("[data-oceanleo-cc-shell-tag]"));
    assert.equal(shellPlain.querySelector("[data-oceanleo-leo-created]"), null);
    assert.equal(rowButton(container, "不该单独成行的 leo 任务"), undefined);

    const marks = container.querySelectorAll("[data-oceanleo-leo-created]");
    assert.equal(marks.length, 4);
    for (const mark of marks) assert.equal(mark.getAttribute("aria-label"), "leo");
  } finally {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  }
});
