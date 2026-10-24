// W10 · 右列三张小卡片（动态 / 计划 / 资产）真渲染。
//
// 卡片在门户仓里（oceanleo/components/project/ProjectSide*.tsx），共享 UI 的编译台
// （tests/helpers/module-bench.mjs）能把它们就地编出来，外框与弹窗用共享 UI 的真件，
// 接口、翻译、提示、页签组件换成替身。这样验的是**会不会跑、点了会发生什么**，
// 不是源码里写没写某个词。门户不在身边时整份跳过。
//
// 版面几何（输入框只在左列、无白色通栏）见 tests/lbp-w10-project-layout.test.mjs。
//
// 2026-10-24（skills-overhaul W13，仲裁 A-23）：卡片按 D8/D9 改成整卡可点、点开是统一
// 大弹窗 ConfigDialogShell（不再是 ProjectModal），就地「添加待办 / 上传文件」移进弹窗
// 工具条。替身里的 `@oceanleo/ui/shell` 因此除了 project-workspace.tsx 还要带 kit 的
// ConfigDialogShell / ConfigToolbar / 图标；页签替身按真组件的 `renderFrame` 合同把
// 工具条与正文交给卡片的大弹窗。断言逐条改成新形态，语义（只读成员看不到写操作、
// 空态文案、读失败可重试、关弹窗后三卡重读）保留。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORTAL = resolve(REPO, "..", "oceanleo");
const HAVE_PORTAL = existsSync(join(PORTAL, "components/project/ProjectSidePlanCard.tsx"));
const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const h = React.createElement;

// 替身共用一块全局白板：测试里改它，替身读它。
globalThis.__w10 = { React, api: {}, toasts: [] };

const i18nStub = dataModule(`
  export function useUI() {
    return (zh, vars) => zh.replace(/\\{(\\w+)\\}/g, (m, k) => (vars && k in vars ? String(vars[k]) : m));
  }
`);
const sonnerStub = dataModule(`
  export const toast = {
    error: (m) => globalThis.__w10.toasts.push(["error", m]),
    success: (m) => globalThis.__w10.toasts.push(["success", m]),
  };
`);
const projectsStub = dataModule(`
  const api = () => globalThis.__w10.api;
  export const listProjectFeed = (...a) => api().listProjectFeed(...a);
  export const listProjectTodos = (...a) => api().listProjectTodos(...a);
  export const createProjectTodo = (...a) => api().createProjectTodo(...a);
  export const listProjectAssets = (...a) => api().listProjectAssets(...a);
  export const uploadProjectAsset = (...a) => api().uploadProjectAsset(...a);
`);
const iconsStub = dataModule(`export const IconPlus = () => null;`);
const uiStub = dataModule(`export const timeAgo = (iso) => "ago:" + iso;`);
const tabStub = (name, attr, extra = "") =>
  dataModule(`
    ${extra}
    export function ${name}(props) {
      const h = globalThis.__w10.React.createElement;
      const body = h("div", {
        "data-stub-tab": "${name}",
        "data-project": props.projectId,
        "data-can-edit": String(props.canEdit),
      }, "${attr}");
      // Same contract as the real tabs: toolbar + body handed to the card's dialog.
      if (!props.renderFrame) return body;
      return props.renderFrame({
        toolbar: h("div", { "data-stub-toolbar": "${name}" }),
        body,
        holdOpen: Boolean(globalThis.__w10.holdOpen),
      });
    }
  `);

/** 容器测试用的小卡片替身：把收到的 props 记下来，渲染出顺序标记。 */
const cardProbe = (exportName, key) =>
  dataModule(`
    export function ${exportName}(props) {
      globalThis.__w10.cards = globalThis.__w10.cards || {};
      globalThis.__w10.cards["${key}"] = props;
      return globalThis.__w10.React.createElement("div", {
        "data-card": "${key}",
        "data-refresh": String(props.refreshKey),
        "data-can-edit": String(props.canEdit),
        "data-project": props.projectId,
      });
    }
  `);

let modules = null;
async function load() {
  if (modules) return modules;
  const useUIStub = dataModule("export function useUI(){ return (value) => value; }");
  const workspaceUrl = await compileModule("src/shell/project-workspace.tsx", {
    "../i18n/ui/useUI": useUIStub,
    "react-dom": reactDomUrl,
  });
  const kit = (file) =>
    compileModule(`src/shell/skills/kit/${file}`, {
      "../../../i18n/ui/useUI": useUIStub,
      "react-dom": reactDomUrl,
    });
  const frameUrl = dataModule(
    [
      workspaceUrl,
      await kit("ConfigDialogShell.tsx"),
      await kit("ConfigToolbar.tsx"),
      await kit("kit-icons.tsx"),
    ]
      .map((url) => `export * from ${JSON.stringify(url)};`)
      .join("\n"),
  );
  const card = (name) => join(PORTAL, "components/project", name);
  const resourceUrl = await compileModule(card("ProjectSideResource.ts"), { react: reactUrl });
  const common = {
    "@oceanleo/ui/i18n": i18nStub,
    "@oceanleo/ui/shell": frameUrl,
    "@/lib/projects": projectsStub,
    "@/components/project/ProjectSideResource": resourceUrl,
    "@/components/project/ProjectSidePreview": realModule(card("ProjectSidePreview.ts")),
    "@/components/project/ProjectSideActivityText": realModule(card("ProjectSideActivityText.ts")),
    sonner: sonnerStub,
    "@/app/_components/icons": iconsStub,
    "@/app/_components/ui": uiStub,
  };
  modules = {
    Plan: (
      await import(
        await compileModule(card("ProjectSidePlanCard.tsx"), {
          ...common,
          "@/components/project/ProjectPlanTab": tabStub("ProjectPlanTab", "plan tab"),
        })
      )
    ).ProjectSidePlanCard,
    Assets: (
      await import(
        await compileModule(card("ProjectSideAssetsCard.tsx"), {
          ...common,
          "@/components/project/ProjectAssetsTab": tabStub("ProjectAssetsTab", "assets tab"),
        })
      )
    ).ProjectSideAssetsCard,
    Activity: (
      await import(
        await compileModule(card("ProjectSideActivityCard.tsx"), {
          ...common,
          "@/components/project/ProjectFeedTab": tabStub(
            "ProjectFeedTab",
            "feed tab",
            // The card draws its timeline bubbles with the feed tab's icon component.
            `export function ActivityBubble(props) {
              return globalThis.__w10.React.createElement("span", { "data-bubble": props.category });
            }`,
          ),
        })
      )
    ).ProjectSideActivityCard,
    Cards: (
      await import(
        await compileModule(card("ProjectSideCards.tsx"), {
          "@oceanleo/ui/i18n": i18nStub,
          "@oceanleo/ui/shell": frameUrl,
          "@/components/project/ProjectSideActivityCard": cardProbe("ProjectSideActivityCard", "activity"),
          "@/components/project/ProjectSidePlanCard": cardProbe("ProjectSidePlanCard", "plan"),
          "@/components/project/ProjectSideAssetsCard": cardProbe("ProjectSideAssetsCard", "assets"),
        })
      )
    ).ProjectSideCards,
  };
  return modules;
}

async function withDom(run) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://agent.oceanleo.com/projects/p1",
  });
  const { window } = dom;
  window.matchMedia = (query) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent() {
      return true;
    },
  });
  window.scrollTo = () => {};

  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const previousRaf = globalThis.requestAnimationFrame;
  const previousCaf = globalThis.cancelAnimationFrame;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__w10.toasts = [];

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const settle = () => act(async () => { await new Promise((resolveTimer) => setTimeout(resolveTimer, 20)); });
  const renderRoot = async (node) => {
    await act(async () => root.render(node));
    await settle();
  };
  const find = (selector) => window.document.querySelector(selector);
  const findAll = (selector) => [...window.document.querySelectorAll(selector)];
  const text = () => window.document.body.textContent.replace(/\s+/g, " ");
  const click = async (target) => {
    const node = typeof target === "string" ? find(target) : target;
    assert.ok(node, `missing click target: ${target}`);
    await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true })));
    await settle();
  };
  const type = async (input, value) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
    await act(async () => {
      setter.call(input, value);
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };
  const submit = async (form) => {
    await act(async () => form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true })));
    await settle();
  };
  const wait = (ms) => act(async () => { await new Promise((resolveTimer) => setTimeout(resolveTimer, ms)); });

  try {
    await run({ window, renderRoot, find, findAll, text, click, type, submit, settle, wait });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousCaf === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCaf;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

const ok = (data) => Promise.resolve({ ok: true, data });
const todo = (id, status, title = id) => ({ id, status, title, project_id: "p1", description: "", position: 0 });
const skipPortal = { skip: !HAVE_PORTAL && "portal checkout not next to oceanleo-ui" };

// ---------------------------------------------------------------------------
// 计划
// ---------------------------------------------------------------------------

test("计划卡 · 空、编辑者：一句话 + 右上 +；点 + 或整卡都打开计划大弹窗（添加待办在弹窗工具条里）", skipPortal, async () => {
  const { Plan } = await load();
  await withDom(async ({ renderRoot, find, text, click, wait }) => {
    let created = 0;
    globalThis.__w10.api = {
      listProjectTodos: () => ok({ items: [], sources: [], assignees: [] }),
      createProjectTodo: () => {
        created += 1;
        return ok({ todo: todo("x", "todo") });
      },
    };
    await renderRoot(h(Plan, { projectId: "p1", canEdit: true }));
    assert.match(text(), /还没有待办。把项目目标拆成可以逐条完成的步骤。/);
    const card = find("[data-project-config-card]");
    assert.equal(card.getAttribute("role"), "button", "the whole card opens");
    assert.equal(find('[data-project-config-action="open"]'), null, "no big open button any more");
    assert.equal(find("[data-project-config-count]"), null);
    const plus = find('[data-project-config-action="add"]');
    assert.equal(plus.getAttribute("aria-label"), "添加待办");

    await click(plus);
    const dialog = find("[data-config-dialog]");
    assert.ok(dialog, "+ opens the plan dialog");
    assert.equal(dialog.getAttribute("data-testid"), "project-plan-dialog");
    const tab = dialog.querySelector('[data-stub-tab="ProjectPlanTab"]');
    assert.equal(tab.getAttribute("data-can-edit"), "true");
    assert.ok(dialog.querySelector('[data-stub-toolbar="ProjectPlanTab"]'), "the tab's toolbar sits in the dialog header");
    assert.equal(created, 0, "the card itself writes nothing; todos are added in the dialog");

    await click("[data-config-dialog-close]");
    await wait(400);
    assert.equal(find("[data-config-dialog]"), null);
    await click(card);
    assert.ok(find("[data-config-dialog]"), "clicking the card opens the same dialog");
  });
});

test("计划卡 · 空、只读成员：只有说明，没有任何写操作按钮；仍能打开看计划", skipPortal, async () => {
  const { Plan } = await load();
  await withDom(async ({ renderRoot, find, text, click }) => {
    globalThis.__w10.api = { listProjectTodos: () => ok({ items: [], sources: [], assignees: [] }) };
    await renderRoot(h(Plan, { projectId: "p1", canEdit: false }));
    assert.match(text(), /还没有待办。有编辑权限的成员添加后会显示在这里。/);
    assert.equal(find("[data-project-config-action]"), null);
    assert.equal(find("form"), null);
    await click("[data-project-config-card]");
    const tab = find('[data-config-dialog] [data-stub-tab="ProjectPlanTab"]');
    assert.ok(tab, "view members can still open the plan");
    assert.equal(tab.getAttribute("data-can-edit"), "false");
  });
});

test("计划卡 · 有待办：计数、进度条（已完成/总数）、前 3 条（进行中在前）、大弹窗里是计划页，关掉通知重读", skipPortal, async () => {
  const { Plan } = await load();
  await withDom(async ({ renderRoot, find, findAll, text, click, wait }) => {
    globalThis.__w10.api = {
      listProjectTodos: () =>
        ok({
          items: [
            todo("a", "done", "已做完的"),
            todo("b", "todo", "待做一"),
            todo("c", "in_progress", "正在做的"),
            todo("d", "todo", "待做二"),
            todo("e", "cancelled", "取消的"),
          ],
          sources: [],
          assignees: [],
        }),
    };
    let closed = 0;
    await renderRoot(h(Plan, { projectId: "p1", canEdit: true, onDialogClosed: () => (closed += 1) }));

    assert.equal(find("[data-project-config-count]").textContent, "5");
    assert.match(text(), /待处理 2 · 进行中 1 · 已完成 1/);
    const bar = find('[data-project-side-plan-progress] [role="progressbar"]');
    assert.equal(bar.getAttribute("aria-valuenow"), "1");
    assert.equal(bar.getAttribute("aria-valuemax"), "5");
    assert.match(text(), /已完成 1 \/ 5/);
    const rows = findAll("[data-project-side-plan-list] li").map((li) => li.textContent);
    assert.equal(rows.length, 3);
    assert.match(rows[0], /正在做的.*进行中/);
    assert.match(rows[1], /待做一.*待处理/);
    assert.match(rows[2], /待做二.*待处理/);
    assert.equal(find('[data-project-config-action="open"]'), null);

    await click("[data-project-config-card]");
    const dialog = find("[data-config-dialog]");
    assert.ok(dialog, "dialog opened");
    assert.equal(dialog.getAttribute("data-size"), "lg");
    const tab = dialog.querySelector('[data-stub-tab="ProjectPlanTab"]');
    assert.equal(tab.getAttribute("data-project"), "p1");
    assert.equal(tab.getAttribute("data-can-edit"), "true");

    await click("[data-config-dialog-close]");
    await wait(400);
    assert.equal(find("[data-config-dialog]"), null, "dialog closed");
    assert.equal(closed, 1, "the owner is told the dialog closed (so every card re-reads)");
  });
});

test("计划卡 · 读取失败：说明 + 重试", skipPortal, async () => {
  const { Plan } = await load();
  await withDom(async ({ renderRoot, find, text, click }) => {
    let calls = 0;
    globalThis.__w10.api = {
      listProjectTodos: () => {
        calls += 1;
        return calls === 1
          ? Promise.resolve({ ok: false, error: "网关忙" })
          : ok({ items: [todo("a", "todo", "一条")], sources: [], assignees: [] });
      },
    };
    await renderRoot(h(Plan, { projectId: "p1", canEdit: true }));
    assert.match(text(), /网关忙/);
    await click(find('[role="alert"] button'));
    assert.match(text(), /一条/);
    assert.equal(find("[data-config-dialog]"), null, "retry does not open the dialog");
  });
});

// ---------------------------------------------------------------------------
// 资产
// ---------------------------------------------------------------------------

const asset = (id, kind, updated_at, extra = {}) => ({
  id,
  kind,
  name: id,
  size_bytes: kind === "folder" ? 0 : 2048,
  updated_at,
  created_at: updated_at,
  project_id: "p1",
  parent_id: null,
  mime_type: null,
  ...extra,
});

test("资产卡 · 空、编辑者：一句话 + 右上 +「添加资产」，打开资产大弹窗（上传在弹窗 Add ▾ 里）", skipPortal, async () => {
  const { Assets } = await load();
  await withDom(async ({ renderRoot, find, text, click }) => {
    let uploads = 0;
    globalThis.__w10.api = {
      listProjectAssets: () => ok({ items: [], usage: { used_bytes: 0, limit_bytes: 1024 ** 3 } }),
      uploadProjectAsset: () => {
        uploads += 1;
        return ok({});
      },
    };
    await renderRoot(h(Assets, { projectId: "p1", canEdit: true }));
    assert.match(text(), /还没有文件。上传或从 Library 导入资料，团队成员都能看到。/);
    assert.equal(find('input[type="file"]'), null, "the card no longer carries its own file input");
    assert.equal(find('[data-project-config-action="open"]'), null);
    const plus = find('[data-project-config-action="add"]');
    assert.equal(plus.getAttribute("aria-label"), "添加资产");
    await click(plus);
    const dialog = find("[data-config-dialog]");
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("data-testid"), "project-assets-dialog");
    assert.equal(dialog.getAttribute("data-size"), "xl");
    assert.equal(dialog.querySelector('[data-stub-tab="ProjectAssetsTab"]').getAttribute("data-can-edit"), "true");
    assert.equal(uploads, 0);
  });
});

test("资产卡 · 弹窗里有子弹窗或上传进行中（holdOpen）时，✕ 不关大弹窗（A-14）", skipPortal, async () => {
  const { Assets } = await load();
  await withDom(async ({ renderRoot, find, click, wait }) => {
    globalThis.__w10.api = { listProjectAssets: () => ok({ items: [], usage: { used_bytes: 0, limit_bytes: 10 } }) };
    let closed = 0;
    globalThis.__w10.holdOpen = true;
    try {
      await renderRoot(h(Assets, { projectId: "p1", canEdit: true, onDialogClosed: () => (closed += 1) }));
      await click("[data-project-config-card]");
      await click("[data-config-dialog-close]");
      await wait(400);
      assert.ok(find("[data-config-dialog]"), "held open while the tab is busy");
      assert.equal(closed, 0);
    } finally {
      globalThis.__w10.holdOpen = false;
    }
  });
});

test("资产卡 · 空、只读成员：没有上传入口，也没有 +；仍能打开看资产", skipPortal, async () => {
  const { Assets } = await load();
  await withDom(async ({ renderRoot, find, text, click }) => {
    globalThis.__w10.api = { listProjectAssets: () => ok({ items: [], usage: { used_bytes: 0, limit_bytes: 10 } }) };
    await renderRoot(h(Assets, { projectId: "p1", canEdit: false }));
    assert.match(text(), /还没有文件。有编辑权限的成员上传后会显示在这里。/);
    assert.equal(find('input[type="file"]'), null);
    assert.equal(find("[data-project-config-action]"), null);
    await click("[data-project-config-card]");
    assert.equal(find('[data-config-dialog] [data-stub-tab="ProjectAssetsTab"]').getAttribute("data-can-edit"), "false");
  });
});

test("资产卡 · 有文件：根层条目数、用量、最近改动的 3 个，整卡打开资产大弹窗", skipPortal, async () => {
  const { Assets } = await load();
  await withDom(async ({ renderRoot, find, findAll, text, click }) => {
    globalThis.__w10.api = {
      listProjectAssets: () =>
        ok({
          items: [
            asset("旧.txt", "file", "2026-01-01T00:00:00Z"),
            asset("新.pdf", "file", "2026-10-22T00:00:00Z", { size_bytes: 5 * 1024 * 1024 }),
            asset("资料", "folder", "2026-10-20T00:00:00Z"),
            asset("中.png", "file", "2026-05-01T00:00:00Z"),
          ],
          usage: { used_bytes: 5 * 1024 * 1024, limit_bytes: 1024 ** 3 },
        }),
    };
    await renderRoot(h(Assets, { projectId: "p1", canEdit: true }));
    assert.equal(find("[data-project-config-count]").textContent, "4");
    assert.match(text(), /3 个文件 · 1 个文件夹/);
    assert.match(text(), /已用 5\.0 MB \/ 1\.00 GB/);
    const rows = findAll("[data-project-side-assets-list] li").map((li) => li.textContent);
    assert.equal(rows.length, 3);
    assert.match(rows[0], /新\.pdf.*5\.0 MB/);
    assert.match(rows[1], /资料.*文件夹/);
    assert.match(rows[2], /中\.png/);

    await click("[data-project-config-card]");
    const tab = find('[data-config-dialog] [data-stub-tab="ProjectAssetsTab"]');
    assert.ok(tab);
    assert.equal(tab.getAttribute("data-can-edit"), "true");
  });
});

// ---------------------------------------------------------------------------
// 动态
// ---------------------------------------------------------------------------

const event = (id, summary, label = "小李") => ({
  id,
  kind: "task",
  actor: { user_id: "u", label },
  summary,
  occurred_at: `2026-10-2${id}T00:00:00Z`,
  target_id: id,
  target_type: "task",
  mine: true,
});

test("动态卡 · 空：一句话，没有「查看全部」", skipPortal, async () => {
  const { Activity } = await load();
  await withDom(async ({ renderRoot, find, text }) => {
    globalThis.__w10.api = { listProjectFeed: () => ok({ items: [] }) };
    await renderRoot(h(Activity, { projectId: "p1" }));
    assert.match(text(), /项目里的任务、待办、资产和成员变化会显示在这里。/);
    assert.equal(find("[data-project-config-action]"), null);
    assert.equal(find("[data-project-side-activity-all]"), null);
  });
});

test("动态卡 · 最近 3 条（读的是全员动态），句子按模板认回来，「查看全部」文字链接打开动态大弹窗", skipPortal, async () => {
  const { Activity } = await load();
  await withDom(async ({ renderRoot, find, findAll, text, click, wait }) => {
    const scopes = [];
    globalThis.__w10.api = {
      listProjectFeed: (projectId, scope) => {
        scopes.push([projectId, scope]);
        return ok({
          items: [
            event("5", "任务“写周报”状态为 running"),
            event("4", "待办“订机票”状态为 todo", "小王"),
            event("3", "文件“报价.pdf”已更新"),
            event("2", "成员加入项目，角色为 edit"),
          ],
        });
      },
    };
    let closed = 0;
    await renderRoot(h(Activity, { projectId: "p1", onDialogClosed: () => (closed += 1) }));
    assert.deepEqual(scopes[0], ["p1", "members"]);
    const rows = findAll("[data-project-side-activity-list] li").map((li) => li.textContent);
    assert.equal(rows.length, 3, "only the latest three");
    assert.match(rows[0], /小李.*任务“写周报”状态为 进行中.*ago:/);
    assert.match(rows[1], /小王.*待办“订机票”状态为 待处理/);
    assert.match(rows[2], /文件“报价\.pdf”已更新/);
    assert.doesNotMatch(text(), /成员加入项目/);
    assert.equal(find('[data-project-config-action="open"]'), null, "no big indigo button");

    const link = find("[data-project-side-activity-all]");
    assert.equal(link.textContent, "查看全部");
    await click(link);
    const dialog = find("[data-config-dialog]");
    assert.ok(dialog.querySelector('[data-stub-tab="ProjectFeedTab"]'), "the feed lives in the dialog");
    assert.equal(dialog.getAttribute("data-testid"), "project-activity-dialog");
    await click("[data-config-dialog-close]");
    await wait(400);
    assert.equal(find("[data-config-dialog]"), null);
    assert.equal(closed, 1);
  });
});

test("读取失败后被通知重读：先显示读取中，不闪一句还不成立的空态；已有内容则原样留着", skipPortal, async () => {
  const { Activity } = await load();
  await withDom(async ({ renderRoot, find, findAll, text, settle }) => {
    let release;
    let calls = 0;
    globalThis.__w10.api = {
      listProjectFeed: () => {
        calls += 1;
        if (calls === 1) return Promise.resolve({ ok: false, error: "网关忙" });
        if (calls === 2) return new Promise((resolveFeed) => (release = () => resolveFeed({ ok: true, data: { items: [event("5", "任务“甲”状态为 done")] } })));
        return new Promise(() => {});
      },
    };
    await renderRoot(h(Activity, { projectId: "p1", refreshKey: 0 }));
    assert.match(text(), /网关忙/);

    // Another card's dialog closed: the owner bumps refreshKey while the second read is in flight.
    await renderRoot(h(Activity, { projectId: "p1", refreshKey: 1 }));
    assert.ok(find('[role="status"]'), "loading placeholder while the read is in flight");
    assert.doesNotMatch(text(), /项目里的任务、待办、资产和成员变化会显示在这里。/, "no premature empty state");
    assert.doesNotMatch(text(), /网关忙/);

    await act(async () => release());
    await settle();
    assert.equal(findAll("[data-project-side-activity-list] li").length, 1);

    // Content on screen stays while a later read is pending.
    await renderRoot(h(Activity, { projectId: "p1", refreshKey: 2 }));
    assert.equal(findAll("[data-project-side-activity-list] li").length, 1, "old rows stay during a quiet re-read");
    assert.equal(find('[role="status"]'), null, "no skeleton flash over existing content");
  });
});

// ---------------------------------------------------------------------------
// 容器：顺序 + 任一弹窗关掉，三张卡一起重读
// ---------------------------------------------------------------------------

test("三张卡的顺序是 动态、计划、资产；任一弹窗关掉，三张一起重读", skipPortal, async () => {
  const { Cards } = await load();
  await withDom(async ({ renderRoot, findAll }) => {
    globalThis.__w10.cards = {};
    await renderRoot(h(Cards, { projectId: "p1", canEdit: false }));
    const cards = () => findAll("[data-card]");
    assert.deepEqual(cards().map((node) => node.getAttribute("data-card")), ["activity", "plan", "assets"]);
    assert.deepEqual(cards().map((node) => node.getAttribute("data-refresh")), ["0", "0", "0"]);
    assert.deepEqual(cards().map((node) => node.getAttribute("data-project")), ["p1", "p1", "p1"]);
    // 只读成员：canEdit=false 原样交给需要它的两张卡（动态卡不需要）。
    assert.equal(cards()[1].getAttribute("data-can-edit"), "false");
    assert.equal(cards()[2].getAttribute("data-can-edit"), "false");

    await act(async () => globalThis.__w10.cards.plan.onDialogClosed());
    assert.deepEqual(cards().map((node) => node.getAttribute("data-refresh")), ["1", "1", "1"]);
    await act(async () => globalThis.__w10.cards.assets.onDialogClosed());
    assert.deepEqual(cards().map((node) => node.getAttribute("data-refresh")), ["2", "2", "2"]);
  });
});
