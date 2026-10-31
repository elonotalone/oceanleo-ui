/**
 * W11（skills-overhaul 2026-10-24，合同 D11 / §3.7 / A11）：
 *  - 左侧栏「我的任务」显式按 project_scope=all 拉列表，项目里建的任务也显示；
 *  - 项目条目副标题带项目标注（图标 + 项目名，点标签进 /projects/<id>，点行仍打开任务），
 *    与站点 / app 来源字样并存时项目名优先；
 *  - 已在项目里的条目菜单给「换项目 / 移出项目」；
 *  - /history 打开项目任务不再拦截（「这条记录已归属项目」页已删）。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/history",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
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
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
window.Element.prototype.scrollIntoView = function () {};
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.React = React;

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const masterDetail = source("../src/shell/HistoryMasterDetail.tsx");
const rowActions = source("../src/shell/HistoryRowActions.tsx");

const model = await import("../src/shell/history-model.ts");

test("mergeHistoryEntries 不再按项目过滤：项目会话与项目旧任务都成行", () => {
  const entries = model.mergeHistoryEntries(
    [{ id: "s1", project_id: "p1", last_activity_at: "2026-10-24T02:00:00Z" }],
    [{ id: "t1", project_id: "p1", status: "done", mode: "agent", created_at: "2026-10-24T01:00:00Z" }],
  );
  assert.deepEqual(entries.map((e) => `${e.kind}:${e.id}`), ["session:s1", "task:t1"]);
});

// ---------------------------------------------------------------------------
// 侧栏渲染：HistoryInlineList
// ---------------------------------------------------------------------------
globalThis.__w11 = { sessionsCalls: [], tasksCalls: [], pushes: [], updates: [] };
globalThis.__w11Sessions = [
  {
    id: "s-proj",
    site_id: "oceanleo",
    app_id: "home-agent",
    surface: "app",
    status: "active",
    title: "项目里的任务",
    task_id: "t-x",
    schema_version: 1,
    revision: 1,
    created_at: "2026-10-24T00:00:00Z",
    last_activity_at: "2026-10-24T03:00:00Z",
    first_output_at: "2026-10-24T00:00:00Z",
    project_id: "p1",
    project: { id: "p1", name: "非常非常长的项目名称用于截断", icon: "🚀" },
  },
  {
    id: "s-plain",
    site_id: "oceanleo",
    app_id: "home-agent",
    surface: "app",
    status: "active",
    title: "普通任务",
    task_id: "t-y",
    schema_version: 1,
    revision: 1,
    created_at: "2026-10-24T00:00:00Z",
    last_activity_at: "2026-10-24T02:00:00Z",
    first_output_at: "2026-10-24T00:00:00Z",
    project_id: null,
  },
];
globalThis.__w11Sessions.push({
  ...globalThis.__w11Sessions[1],
  id: "s-mismatch",
  title: "标注对不上",
  last_activity_at: "2026-10-24T00:30:00Z",
  project_id: "p3",
  project: { id: "other", name: "别的项目", icon: "x" },
});
globalThis.__w11Tasks = [
  {
    id: "t-legacy-proj",
    title: "降级的项目旧任务",
    status: "done",
    mode: "agent",
    created_at: "2026-10-24T01:00:00Z",
    project_id: "p2",
    project: null,
  },
];

const sharedStubs = {
  "../i18n/ui/useUI": dataModule(`
    export function useUI(){
      return (value, vars) => vars ? String(value).replace(/\\{(\\w+)\\}/g, (_, k) => String(vars[k] ?? "")) : value;
    }
  `),
  "next/navigation": dataModule(`
    export function usePathname(){ return globalThis.__w11Path || "/history"; }
    // 稳定引用：HistoryDetail 的加载 effect 依赖 router，新对象会让它每次渲染都重拉。
    const router = {
      push(href){ globalThis.__w11.pushes.push(href); },
      replace(href){ globalThis.__w11.pushes.push("replace:" + href); },
      prefetch(){},
    };
    export function useRouter(){ return router; }
  `),
  "./WorkspaceSelection": dataModule(`
    export function useWorkspaceSelection(){
      return globalThis.React.useState(globalThis.__w11Selected ?? null);
    }
  `),
  "./AgentChat": dataModule(`
    export function AgentChat(props){
      return globalThis.React.createElement("div", { "data-w11-agent-chat": props.taskId });
    }
  `),
  "./library-task-history": dataModule(`export function LibraryTaskHistoryWorkspace(){ return null; }`),
  "./WorkspaceSession": dataModule(`export function WorkspaceSessionProvider({ children }){ return children; }`),
  "./HistoryRowActions": dataModule(`
    export function HistoryRowMenu(props){
      return globalThis.React.createElement("span", {
        "data-w11-menu": props.inProject ? "in-project" : "no-project",
      });
    }
    export function MoveTaskProjectDialog(){ return null; }
  `),
  "../ui": dataModule(`export function ConfirmDialog(){ return null; } export function SkeletonCard(){ return null; } export function SkeletonLine(){ return null; }`),
  "./PublishToOrgButton": dataModule(`export function PublishToOrgButton(){ return null; }`),
  "./cloud-computer/ShellTaskView": dataModule(`export function ShellTaskView(){ return null; }`),
  "../lib/auth/client": dataModule(`
    export function browserClient(){ return null; }
    export async function accessToken(){ return null; }
  `),
  "../lib/agent": dataModule(`
    export async function authed(){ return { ok: false, error: "stub", status: 401 }; }
    export async function listTasks(...args){
      globalThis.__w11.tasksCalls.push(args);
      return { ok: true, data: { items: globalThis.__w11Tasks } };
    }
    export async function deleteTask(){ return { ok: true }; }
    export async function getTask(id){
      const task = globalThis.__w11TaskDetail;
      return task ? { ok: true, data: { task, messages: [], artifacts: [] } } : { ok: false, status: 404 };
    }
    export function taskCostYuan(){ return 0; }
  `),
  "../lib/app-session": dataModule(`
    export function isAppSessionApiUnavailableStatus(status){ return status === 404 || status === 405 || status === 501; }
    export async function listAppSessions(options){
      globalThis.__w11.sessionsCalls.push(options);
      return { ok: true, data: { items: globalThis.__w11Sessions } };
    }
    export async function getAppSession(){
      const s = globalThis.__w11SessionDetail;
      return s ? { ok: true, data: s } : { ok: false, status: 404 };
    }
    export async function deleteAppSession(){ return { ok: true }; }
    export async function updateAppSessionMetadata(id, patch){
      globalThis.__w11.updates.push({ id, patch });
      return { ok: true };
    }
  `),
};

const historyUrl = await compileModule("src/shell/HistoryMasterDetail.tsx", sharedStubs);
const { HistoryInlineList, HistoryDetail } = await import(historyUrl);

async function render(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 30));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function row(container, id) {
  const el = container.querySelector(`[data-history-row="${id}"]`);
  assert.ok(el, `找不到 ${id} 这一行`);
  return el;
}

test("侧栏显式传 project_scope=all，项目任务成行并带项目标注", async () => {
  globalThis.__w11.sessionsCalls.length = 0;
  globalThis.__w11.tasksCalls.length = 0;
  const view = await render(React.createElement(HistoryInlineList, { siteId: "oceanleo" }));
  try {
    assert.equal(globalThis.__w11.sessionsCalls[0].projectScope, "all");
    assert.equal(globalThis.__w11.tasksCalls[0][4], "all", "listTasks 第 5 个参数必须是 all");

    const projRow = row(view.container, "s-proj");
    const tag = projRow.querySelector('[data-history-project-tag="p1"]');
    assert.ok(tag, "项目会话要有项目标签");
    assert.equal(tag.tagName, "A");
    assert.equal(tag.getAttribute("href"), "/projects/p1");
    assert.match(tag.textContent, /🚀/);
    assert.match(tag.textContent, /非常非常长的项目名称用于截断/);
    assert.equal(tag.getAttribute("title"), "非常非常长的项目名称用于截断");
    assert.equal(tag.getAttribute("aria-label"), "打开项目「非常非常长的项目名称用于截断」");
    assert.match(tag.className, /rounded-full/);
    assert.match(tag.querySelector(".truncate")?.textContent || "", /非常非常长/);
    // 标签不嵌在按钮里（嵌套交互元素非法）。
    assert.equal(tag.closest("button"), null);
    // 2026-10-31 Manus 式一行：任何行都不再显示 home-agent 这类来源字样（项目行只留项目标签）。
    assert.doesNotMatch(projRow.textContent, /home-agent/);
    assert.doesNotMatch(row(view.container, "s-plain").textContent, /home-agent/);
    assert.equal(row(view.container, "s-plain").querySelector("[data-history-project-tag]"), null);

    // 名字截断：标签有最大宽度，名字在 truncate 容器里。
    assert.match(tag.className, /max-w-/);

    // 网关降级（project: null）：仍成行，标签只用通用字样，不强加文件夹图标。
    const legacy = row(view.container, "t-legacy-proj");
    const legacyTag = legacy.querySelector('[data-history-project-tag="p2"]');
    assert.ok(legacyTag);
    assert.doesNotMatch(legacyTag.textContent, /📁/);
    assert.match(legacyTag.textContent, /项目/);

    // project.id 与 project_id 对不上：只认 project_id，不显示错名。
    const mismatchTag = row(view.container, "s-mismatch").querySelector('[data-history-project-tag="p3"]');
    assert.ok(mismatchTag);
    assert.doesNotMatch(mismatchTag.textContent, /别的项目/);

    // 菜单知道条目已在项目里（顺序按时间：s-proj, s-plain, t-legacy-proj, s-mismatch）。
    const menus = [...view.container.querySelectorAll("[data-w11-menu]")].map((m) =>
      m.getAttribute("data-w11-menu"),
    );
    assert.deepEqual(menus, ["in-project", "no-project", "in-project", "in-project"]);
  } finally {
    await view.unmount();
  }
});

test("点项目标签进项目、不打开任务；点行其余位置仍打开任务", async () => {
  const view = await render(React.createElement(HistoryInlineList, { siteId: "oceanleo" }));
  try {
    globalThis.__w11.pushes.length = 0;
    const projRow = row(view.container, "s-proj");
    const tag = projRow.querySelector("[data-history-project-tag]");
    await act(async () => {
      tag.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true, button: 0 }));
    });
    assert.deepEqual(globalThis.__w11.pushes, ["/projects/p1"]);

    globalThis.__w11.pushes.length = 0;
    const titleButton = projRow.querySelector("button");
    await act(async () => {
      titleButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    assert.equal(globalThis.__w11.pushes.length, 1);
    assert.match(globalThis.__w11.pushes[0], /\/history\/s-proj/);
    assert.doesNotMatch(globalThis.__w11.pushes[0], /projects/);
  } finally {
    await view.unmount();
  }
});

// ---------------------------------------------------------------------------
// 主区：项目任务直接打开
// ---------------------------------------------------------------------------
// W3 2026-10-31: a portal home-agent session with `snapshot: {}` is its task thread —
// it opens as the task chat (its task_id), never as a portal "site workspace".
test("/history 打开项目会话：直接进对话（门户 home-agent 无 snapshot），不再出拦截页", async () => {
  globalThis.__w11Path = "/history/s-proj";
  globalThis.__w11SessionDetail = { ...globalThis.__w11Sessions[0], snapshot: {} };
  globalThis.__w11TaskDetail = null;
  const view = await render(
    React.createElement(HistoryDetail, {
      siteId: "oceanleo",
      renderWorkspace: (session) =>
        React.createElement("div", { "data-w11-workspace": session.id }),
    }),
  );
  try {
    assert.ok(view.container.querySelector('[data-w11-agent-chat="t-x"]'));
    assert.equal(view.container.querySelector('[data-w11-workspace="s-proj"]'), null);
    assert.doesNotMatch(view.container.textContent, /这条记录已归属项目|进入项目|返回普通历史|网站已下线/);
  } finally {
    await view.unmount();
    globalThis.__w11Path = undefined;
    globalThis.__w11SessionDetail = undefined;
  }
});

test("/history?task= 打开项目旧任务：直接进对话", async () => {
  globalThis.__w11Path = "/history";
  globalThis.__w11Selected = "t-legacy-proj";
  globalThis.__w11SessionDetail = null;
  globalThis.__w11TaskDetail = {
    id: "t-legacy-proj",
    status: "done",
    mode: "agent",
    site_id: "oceanleo",
    project_id: "p2",
  };
  const view = await render(React.createElement(HistoryDetail, { siteId: "oceanleo" }));
  try {
    assert.ok(view.container.querySelector('[data-w11-agent-chat="t-legacy-proj"]'));
    assert.doesNotMatch(view.container.textContent, /这条记录已归属项目/);
  } finally {
    await view.unmount();
    globalThis.__w11Path = undefined;
    globalThis.__w11Selected = undefined;
    globalThis.__w11TaskDetail = undefined;
  }
});

// ---------------------------------------------------------------------------
// 源码断言
// ---------------------------------------------------------------------------
test("源码：不再按 project_id 过滤、不再有拦截页分支", () => {
  assert.doesNotMatch(masterDetail, /project_id == null/);
  assert.doesNotMatch(masterDetail, /kind: "project"/);
  assert.doesNotMatch(masterDetail, /loaded\.kind === "project"/);
  assert.doesNotMatch(masterDetail, /这条记录已归属项目/);
  assert.doesNotMatch(masterDetail, /safeProjectHref/);
  assert.match(masterDetail, /projectScope: "all"/);
  assert.match(masterDetail, /listTasks\(100, siteId, pending, "all", "all"\)/);
  // 换项目后的乐观标注只进本地列表；写库的 patch 只有 project_id。
  assert.match(masterDetail, /mutate\(entry, \{ project_id: null \}\)/);
  assert.match(masterDetail, /\{ project_id: projectId \}/);
});

test("源码：菜单在已有项目时给「换项目 / 移出项目」", () => {
  assert.match(rowActions, /inProject \? \(/);
  assert.match(rowActions, /tt\("换项目"\)/);
  assert.match(rowActions, /tt\("移出项目"\)/);
  assert.match(rowActions, /tt\("移动到项目"\)/);
  assert.match(rowActions, /currentProjectId \? tt\("换项目"\) : tt\("移动到项目"\)/);
});

test("文案分表：sko-w11 两条新词条 16 个语种齐全", async () => {
  const { SKO_W11_MESSAGES } = await import("../src/i18n/ui/messages/sko-w11-copy.ts");
  const { LOCALES } = await import("../src/i18n/config.ts");
  for (const locale of LOCALES) {
    const table = SKO_W11_MESSAGES[locale];
    for (const key of ["换项目", "打开项目「{name}」"]) {
      assert.ok(table[key], `${locale} 缺 ${key}`);
      if (locale !== "zh" && key.includes("{name}")) assert.match(table[key], /\{name\}/);
    }
  }
});
