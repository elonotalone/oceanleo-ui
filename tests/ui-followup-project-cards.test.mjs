import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

if (!existsSync(resolve("../oceanleo/components/project/ProjectSidePlanCard.tsx"))) {
  test("portal project-card integration requires the sibling portal checkout", { skip: true }, () => {});
} else {
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const shellUrl = await compileModule("src/shell/project-workspace.tsx", {
  "../ui": dataModule(`import React from ${JSON.stringify(reactUrl)};
    export function Modal({children}) { return React.createElement("div", {role: "dialog"}, children); }`),
});
const resourceUrl = dataModule(`import {useState} from ${JSON.stringify(reactUrl)};
  export function useProjectSideResource() {
    const harness = globalThis.__uiFollowupProjectCards;
    const [data, setData] = useState(harness.data);
    return { data, loading: false, error: "", reload() {},
      refresh() { harness.refreshes += 1; }, mutate: setData };
  }`);
const stubs = {
  "@oceanleo/ui/shell": shellUrl,
  "@oceanleo/ui/i18n": dataModule("const tt = (value) => value; export const useUI = () => tt;"),
  "sonner": dataModule("export const toast = { error() {}, success() {} };"),
  "next/navigation": dataModule("export function useRouter() { return {push(path) { globalThis.__uiFollowupProjectCards.routes.push(path); }}; }"),
  "@/app/_components/clone-shell": dataModule("export function CloneShell({children}) { return children; }"),
  "@/components/ProjectConfigEditor": dataModule("export const PROJECT_TEMPLATES = []; export default function ProjectConfigEditor() { return null; }"),
  "@/components/projects-cache": dataModule("export function prependProject(project) { globalThis.__uiFollowupProjectCards.cached.push(project); }"),
  "@/app/_components/icons": dataModule('export function IconPlus() { return "+"; } export function IconChevronDown() { return null; }'),
  "@/components/project/ProjectSideResource": resourceUrl,
  "@/components/project/ProjectSidePreview": await compileModule(resolve("../oceanleo/components/project/ProjectSidePreview.ts")),
  "@/components/project/ProjectPlanTab": dataModule(`import React from ${JSON.stringify(reactUrl)};
    export function ProjectPlanTab() { return React.createElement("div", {"data-plan-detail": true}); }`),
  "@/components/project/ProjectAssetsTab": dataModule(`import React from ${JSON.stringify(reactUrl)};
    export function ProjectAssetsTab() { return React.createElement("div", {"data-assets-detail": true}); }`),
  "@/lib/projects": dataModule(`
    export const EMPTY_CONFIG = {connectors: [], agent_ids: [], skill_ids: [], workflow_ids: [], organization_id: null, connector_bindings: [], todo_sources: []};
    export async function listProjectTodos() {}
    export async function listProjectAssets() {}
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
const { ProjectSidePlanCard } = await import(await compileModule(resolve("../oceanleo/components/project/ProjectSidePlanCard.tsx"), stubs));
const { ProjectSideAssetsCard } = await import(await compileModule(resolve("../oceanleo/components/project/ProjectSideAssetsCard.tsx"), stubs));
const { default: NewProjectPage } = await import(await compileModule(resolve("../oceanleo/app/projects/new/page.tsx"), stubs));

async function withCard(Component, { canEdit = true, items = [] } = {}, run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvas = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>", { url: "https://dev.test/projects/p-one" });
  const restore = [];
  for (const [name, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node, IS_REACT_ACT_ENVIRONMENT: true })) {
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
    await act(async () => root.render(React.createElement(Component, { projectId: "p-one", canEdit })));
    await run({ harness, find, click, window: dom.window });
  } finally {
    await act(async () => root.unmount());
    delete globalThis.__uiFollowupProjectCards;
    dom.window.close();
    restore.reverse().forEach((undo) => undo());
  }
}

test("empty Plan header plus opens its form and creates a project todo", async () => {
  await withCard(ProjectSidePlanCard, {}, async ({ harness, find, click, window }) => {
    const plus = find('[data-project-config-action="add"]');
    assert.equal(plus.getAttribute("aria-label"), "添加待办");
    assert.equal(plus.parentElement.parentElement.hasAttribute("data-project-config-card"), true);
    assert.equal(find('[data-project-config-action="open"]'), null);
    await click(plus);
    assert.ok(find("[data-project-side-plan-add]"));
    const input = find('input[aria-label="待办标题"]');
    assert.equal(input.disabled, false);
    await act(async () => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set.call(input, "Plan kickoff");
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
    await act(async () => find("[data-project-side-plan-add]").dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    assert.deepEqual(harness.calls, [{ projectId: "p-one", payload: { title: "Plan kickoff", status: "todo", source_kind: "manual" } }]);
    assert.equal(find("[data-project-side-plan-add]"), null);
    assert.match(find("[data-project-side-plan-list]").textContent, /Plan kickoff/);
  });
});

test("empty Assets header plus opens the picker and uploads into the project", async () => {
  await withCard(ProjectSideAssetsCard, {}, async ({ harness, find, click, window }) => {
    const plus = find('[data-project-config-action="add"]');
    assert.equal(plus.getAttribute("aria-label"), "上传文件");
    assert.equal(find('[data-project-config-action="open"]'), null);
    const picker = find('input[type="file"]');
    let picked = 0;
    picker.click = () => { picked += 1; };
    await click(plus);
    assert.equal(picked, 1);
    const file = new window.File(["notes"], "brief.txt", { type: "text/plain" });
    Object.defineProperty(picker, "files", { configurable: true, value: [file] });
    await act(async () => picker.dispatchEvent(new window.Event("change", { bubbles: true })));
    assert.equal(harness.calls.length, 1);
    assert.equal(harness.calls[0].projectId, "p-one");
    assert.equal(harness.calls[0].file.name, "brief.txt");
    assert.equal(harness.calls[0].folderId, null);
    assert.match(find("[data-project-side-assets-list]").textContent, /brief\.txt/);
    assert.ok(find('[data-project-config-action="open"]'));
  });
});

test("read-only members cannot add and retain access to populated detail dialogs", async () => {
  for (const [Component, items, detail] of [
    [ProjectSidePlanCard, [{ id: "t", title: "To do", status: "todo" }], "[data-plan-detail]"],
    [ProjectSideAssetsCard, [{ id: "a", name: "brief.txt", kind: "file", size_bytes: 5 }], "[data-assets-detail]"],
  ]) {
    await withCard(Component, { canEdit: false, items }, async ({ find, click }) => {
      assert.equal(find('[data-project-config-action="add"]'), null);
      assert.equal(find('input[type="file"]'), null);
      await click(find('[data-project-config-action="open"]'));
      assert.ok(find('[role="dialog"]'));
      assert.ok(find(detail));
    });
  }
});

test("project creation submits without a category and opens the newly created project", async () => {
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
}
