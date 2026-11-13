import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { siblingRepoUrl } from "./helpers/sibling-repo-url.mjs";

const source = relativePath => fileURLToPath(siblingRepoUrl("oceanleo", relativePath));
const sources = {
  plan: source("components/project/ProjectSidePlanCard.tsx"),
  assets: source("components/project/ProjectSideAssetsCard.tsx"),
  preview: source("components/project/ProjectSidePreview.ts"),
  create: source("app/projects/new/page.tsx"),
};
function skipMissing(t, keys) {
  const missing = keys.map(key => sources[key]).filter(path => !existsSync(path));
  if (!missing.length) return false;
  t.skip(`optional sibling portal source absent: ${missing.join(", ")}`);
  return true;
}

test("portal project-card integration resolves its canonical sibling sources", t => {
  if (skipMissing(t, Object.keys(sources))) return;
  assert.equal(Object.keys(sources).length, 4);
  assert.ok(Object.values(sources).every(path => existsSync(path)));
});

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
// 2026-10-24（skills-overhaul W13，仲裁 A-23）：计划 / 资产卡点开的是 kit 的统一大弹窗
// ConfigDialogShell（D8），替身的 `@oceanleo/ui/shell` 因此同时带上 project-workspace 与
// kit 的 ConfigDialogShell / ConfigToolbar / 图标；页签替身按真组件的 renderFrame 合同把
// 正文交给卡片的大弹窗。就地「添加待办 / 上传文件」已移进弹窗（由门户
// tests/sko-w13-side-cards.test.mjs 与 project-plan-tab / project-assets-tab 覆盖），
// 这里改验：+ 打开大弹窗、卡片自己不写任何东西、只读成员没有 + 也没有文件输入但能打开。
const workspaceUrl = await compileModule("src/shell/project-workspace.tsx", {
  "../ui": dataModule(`import React from ${JSON.stringify(reactUrl)};
    export function Modal({children}) { return React.createElement("div", {role: "dialog"}, children); }`),
});
const useUIStub = dataModule("export function useUI() { return (value) => value; }");
const overlayUrl = await compileModule("src/shell/anchored-popover.tsx");
const overlayFixture = dataModule(`export * from ${JSON.stringify(overlayUrl)};
  // jsdom cannot parse modern discrete CSS transitions; keep actual focus/scroll behavior.
  export function ensureOverlayMotionStyles() {}`);
const kitUrls = [];
for (const file of ["ConfigDialogShell.tsx", "ConfigToolbar.tsx", "kit-icons.tsx"]) {
  kitUrls.push(await compileModule(`src/shell/skills/kit/${file}`, { "../../../i18n/ui/useUI": useUIStub, "../../anchored-popover": overlayFixture }));
}
const shellUrl = dataModule(
  [workspaceUrl, await compileModule("src/shell/collection-chrome.tsx", { "../i18n/ui/useUI": useUIStub }), ...kitUrls].map((url) => `export * from ${JSON.stringify(url)};`).join("\n"),
);
const framedTab = (attr) => dataModule(`import React from ${JSON.stringify(reactUrl)};
  export function Tab(props) {
    const body = React.createElement("div", {"${attr}": true, "data-can-edit": String(props.canEdit)});
    return props.renderFrame ? props.renderFrame({ toolbar: null, body, holdOpen: false }) : body;
  }`);
const resourceUrl = dataModule(`import {useState} from ${JSON.stringify(reactUrl)};
  export function useProjectSideResource() {
    const harness = globalThis.__uiFollowupProjectCards;
    const [data, setData] = useState(harness.data);
    return { data, loading: false, error: "", reload() {},
      refresh() { harness.refreshes += 1; }, mutate: setData };
  }`);
const stubs = {
  "@oceanleo/ui/ui": await compileModule("src/ui/menu/FloatingMenu.tsx"),
  "@oceanleo/ui/shell": shellUrl,
  "@oceanleo/ui/i18n": dataModule("const tt = (value) => value; export const useUI = () => tt;"),
  "sonner": dataModule("export const toast = { error() {}, success() {} };"),
  "next/navigation": dataModule("export function useRouter() { return {push(path) { globalThis.__uiFollowupProjectCards.routes.push(path); }}; }"),
  "@/app/_components/clone-shell": dataModule("export function CloneShell({children}) { return children; }"),
  "@/components/ProjectConfigEditor": dataModule("export const PROJECT_TEMPLATES = []; export default function ProjectConfigEditor() { return null; }"),
  "@/components/projects-cache": dataModule("export function prependProject(project) { globalThis.__uiFollowupProjectCards.cached.push(project); }"),
  "@/app/_components/icons": dataModule('export function IconPlus() { return "+"; } export function IconChevronDown() { return null; }'),
  "@/components/project/ProjectSideResource": resourceUrl,
  ...(existsSync(sources.preview) ? { "@/components/project/ProjectSidePreview": await compileModule(sources.preview) } : {}),
  "@/components/project/ProjectPlanTab": dataModule(`export { Tab as ProjectPlanTab } from ${JSON.stringify(framedTab("data-plan-detail"))};`),
  "@/components/project/ProjectAssetsTab": dataModule(`export { Tab as ProjectAssetsTab } from ${JSON.stringify(framedTab("data-assets-detail"))};`),
  "@/lib/projects": dataModule(`
    export const EMPTY_CONFIG = {connectors: [], agent_ids: [], skill_ids: [], workflow_ids: [], organization_id: null, connector_bindings: [], todo_sources: []};
    export async function listProjectTodos() {}
    export async function listProjectAssets() {}
    export async function listProjectLibraryItems() {}
    export async function removeProjectLibraryItem() { throw new Error("unexpected project reference removal"); }
    export async function createProject(payload) {
      globalThis.__uiFollowupProjectCards.calls.push({payload});
      return {ok: true, data: {project: {id: "project-created", ...payload}}};
    }
    export async function createProjectTodo(projectId, payload) {
      globalThis.__uiFollowupProjectCards.calls.push({projectId, payload});
      return {ok: true, data: {todo: {id: "todo-new", ...payload}}};
    }
    export async function uploadProjectAsset(projectId, file, folderId) {
      globalThis.__uiFollowupProjectCards.calls.push({projectId, file, folderId});
      return {ok: true, data: {asset: {id: "asset-new", name: file.name, kind: "file", size_bytes: file.size}}};
    }`),
};
const { ProjectSidePlanCard } = existsSync(sources.plan) && existsSync(sources.preview) ? await import(await compileModule(sources.plan, stubs)) : {};
const { ProjectSideAssetsCard } = existsSync(sources.assets) && existsSync(sources.preview) ? await import(await compileModule(sources.assets, stubs)) : {};
const { default: NewProjectPage } = existsSync(sources.create) ? await import(await compileModule(sources.create, stubs)) : {};

async function withCard(Component, { canEdit = true, items = [], props = {} } = {}, run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://dev.test/projects/p-one", pretendToBeVisual: true });
  dom.window.scrollTo = () => {};
  const restore = [];
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, Event: dom.window.Event, KeyboardEvent: dom.window.KeyboardEvent, MutationObserver: dom.window.MutationObserver, getComputedStyle: dom.window.getComputedStyle.bind(dom.window), requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window), cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window), IS_REACT_ACT_ENVIRONMENT: true })) {
    const old = Object.getOwnPropertyDescriptor(globalThis, name);
    restore.push(() => old ? Object.defineProperty(globalThis, name, old) : delete globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const harness = { data: { items }, calls: [], refreshes: 0, routes: [], cached: [] };
  globalThis.__uiFollowupProjectCards = harness;
  const { createRoot } = await import("react-dom/client");
  const root = createRoot(document.getElementById("root"));
  const find = (selector) => document.querySelector(selector);
  const click = (node) => act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  try {
    await act(async () => root.render(React.createElement(Component, { projectId: "p-one", canEdit, ...props })));
    await run({ harness, find, click, window: dom.window });
  } finally {
    await act(async () => root.unmount());
    delete globalThis.__uiFollowupProjectCards;
    dom.window.close();
    restore.reverse().forEach((undo) => undo());
  }
}

test("empty Plan header plus opens the plan dialog; the card itself creates nothing", async t => {
  if (skipMissing(t, ["plan", "preview"])) return;
  await withCard(ProjectSidePlanCard, {}, async ({ harness, find, click }) => {
    const plus = find('[data-project-config-action="add"]');
    assert.equal(plus.getAttribute("aria-label"), "添加待办");
    assert.equal(plus.closest("[data-project-config-card]") !== null, true);
    assert.equal(find('[data-project-config-action="open"]'), null);
    await click(plus);
    const dialog = find("[data-config-dialog]");
    assert.ok(dialog, "+ opens the unified dialog");
    assert.equal(dialog.getAttribute("role"), "dialog");
    assert.equal(dialog.querySelector("[data-plan-detail]").getAttribute("data-can-edit"), "true");
    assert.equal(find("[data-project-side-plan-add]"), null, "no inline form on the card any more");
    assert.deepEqual(harness.calls, []);
  });
});

// 2026-11-10 sidebar wave: the Assets card opens the product's shared right sidebar on the project's materials
// (onOpenAssets) — operator: 「点击这个页面中的assets为什么不打开右侧侧边栏中的library？」. No Assets dialog any more.
test("empty Assets header plus opens the shared sidebar on the project's materials; no dialog, no file input", async t => {
  if (skipMissing(t, ["assets", "preview"])) return;
  let opened = 0;
  await withCard(ProjectSideAssetsCard, { props: { onOpenAssets: () => { opened += 1; } } }, async ({ harness, find, click }) => {
    const plus = find('[data-project-config-action="add"]');
    assert.equal(plus.getAttribute("aria-label"), "添加资产");
    assert.equal(find('[data-project-config-action="open"]'), null);
    assert.equal(find('input[type="file"]'), null, "the card carries no file input");
    await click(plus);
    assert.equal(opened, 1);
    assert.equal(find("[data-config-dialog]"), null);
    assert.deepEqual(harness.calls, []);
  });
});

test("read-only members cannot add and still open: plan in its dialog, assets in the shared sidebar", async t => {
  if (skipMissing(t, ["plan", "assets", "preview"])) return;
  await withCard(ProjectSidePlanCard, { canEdit: false, items: [{ id: "t", title: "To do", status: "todo" }] }, async ({ find, click }) => {
    assert.equal(find('[data-project-config-action="add"]'), null);
    assert.equal(find('input[type="file"]'), null);
    await click(find("[data-project-config-card]"));
    assert.ok(find('[role="dialog"]'));
    assert.equal(find("[data-plan-detail]").getAttribute("data-can-edit"), "false");
  });
  let opened = 0;
  await withCard(ProjectSideAssetsCard, { canEdit: false, items: [{ id: "a", kind: "artifact", added_at: "2026-11-01T00:00:00Z", item: { title: "brief.txt", kind: "document", updated_at: "2026-11-01T00:00:00Z" } }], props: { onOpenAssets: () => { opened += 1; } } }, async ({ find, click }) => {
    assert.equal(find('[data-project-config-action="add"]'), null);
    assert.equal(find('input[type="file"]'), null);
    await click(find("[data-project-config-card]"));
    assert.equal(opened, 1);
    assert.equal(find('[role="dialog"]'), null);
  });
});

test("project creation submits without a category and opens the newly created project", async t => {
  if (skipMissing(t, ["create"])) return;
  await withCard(NewProjectPage, {}, async ({ harness, find, click, window }) => {
    const input = find('input[placeholder="请输入项目名称"]');
    const confirm = [...window.document.querySelectorAll("button")].find((button) => button.textContent === "确定");
    assert.equal(confirm.disabled, true);
    assert.doesNotMatch(window.document.body.textContent, /项目类型|AI 项目|设计项目|营销项目|内容项目/);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "  Client workspace  ");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    assert.equal(confirm.disabled, false);
    await click(confirm);
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].payload.name, "Client workspace");
    assert.equal("kind" in harness.calls[0].payload, false);
    assert.equal(harness.cached[0].id, "project-created");
    assert.deepEqual(harness.routes, ["/projects/project-created"]);
  });
});
