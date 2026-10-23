// 网站页签首帧就是完整六格；未就绪四格置灰；manifest 到达后可点；表外 id 追加。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { buildPluginPages } from "../src/shell/plugin-chrome/plugin-pages.ts";

const require = createRequire(import.meta.url);
const ttStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      String(value).replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match,
      );
  }
`);
// D1（2026-10-23）：第二行页签行删除，页签进第一行（PluginPageTabs），行为不变：
// 未就绪页照样露出、点了不切页；红线「不放灰占位」——它不再是 disabled 的灰按钮，
// 点了弹出原因（toast），停在当前页。
const { PluginPageTabs } = await import(
  await compileModule("src/shell/plugin-chrome/PluginPageTabs.tsx", {
    "../../i18n/ui/useUI": ttStubUrl,
    "../../ui/Toast": dataModule(`
      export function useToast() {
        return { info(message) { (globalThis.__w16Toasts ||= []).push(message); } };
      }
    `),
  })
);

// 2026-10-22：网站不再嵌子站，宿主不再有静态附加页登记表。这里只验证页签行
// 对「置灰 / 就绪」附加页的渲染与点击行为（任何编辑器申报的 aux 页都一样）。
const PLUGIN_AUX_PENDING_REASON = "编辑器还在加载";
const WEBSITE_AUX_PAGE_IDS = ["code", "dashboard", "database", "storage"];
const AUX_LABELS = { code: "源码", dashboard: "仪表盘", database: "数据库", storage: "文件存储" };

function pendingAux() {
  return WEBSITE_AUX_PAGE_IDS.map((id) => ({
    id,
    label: AUX_LABELS[id],
    kind: "aux",
    disabled: true,
    unavailableReason: PLUGIN_AUX_PENDING_REASON,
  }));
}

function websiteFirstFrame() {
  return buildPluginPages({ pluginId: "website", aux: pendingAux() });
}

test("网站首帧六个页签，四个附加页置灰", () => {
  const pages = websiteFirstFrame();
  assert.deepEqual(
    pages.map((page) => page.id),
    ["artifact", "pro", ...WEBSITE_AUX_PAGE_IDS],
  );
  const aux = pages.filter((page) => page.kind === "aux");
  assert.equal(aux.length, 4);
  for (const page of aux) {
    assert.equal(page.disabled, true, `${page.id} 首帧应置灰`);
    assert.equal(page.unavailableReason, PLUGIN_AUX_PENDING_REASON);
  }
});

test("manifest 到达后同 id 可点；表外 id 追加", () => {
  const remote = [
    {
      id: "code",
      label: "源码",
      kind: "aux",
      disabled: false,
    },
    {
      id: "dashboard",
      label: "仪表盘",
      kind: "aux",
      disabled: false,
    },
    {
      id: "database",
      label: "数据库",
      kind: "aux",
      disabled: false,
    },
    {
      id: "storage",
      label: "文件存储",
      kind: "aux",
      disabled: false,
    },
    {
      id: "analytics",
      label: "分析",
      kind: "aux",
      disabled: false,
    },
  ];
  const pages = buildPluginPages({
    pluginId: "website",
    aux: remote,
  });
  assert.deepEqual(
    pages.map((page) => page.id),
    ["artifact", "pro", ...WEBSITE_AUX_PAGE_IDS, "analytics"],
  );
  for (const id of WEBSITE_AUX_PAGE_IDS) {
    const page = pages.find((entry) => entry.id === id);
    assert.equal(page.disabled, false, `${id} 就绪后应可点`);
    assert.equal(page.unavailableReason, undefined);
  }
  const extra = pages.find((page) => page.id === "analytics");
  assert.equal(extra.kind, "aux");
  assert.equal(extra.disabled, false);
});

async function withPageRowDom(run) {
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
    url: "https://website.oceanleo.com/workspace/corp-site",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
    restore.push(() => {
      if (had) globalThis[name] = previous;
      else delete globalThis[name];
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  try {
    await run({
      window,
      container,
      async render(pages, onSelectPage = () => {}) {
        await act(async () => {
          root.render(
            React.createElement(PluginPageTabs, {
              pages,
              activePageId: "artifact",
              onSelectPage,
            }),
          );
        });
      },
      async click(node) {
        await act(async () => {
          node.dispatchEvent(
            new window.MouseEvent("click", { bubbles: true, cancelable: true }),
          );
        });
      },
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    restore.forEach((fn) => fn());
  }
}

function readyWebsitePages() {
  return buildPluginPages({
    pluginId: "website",
    aux: WEBSITE_AUX_PAGE_IDS.map((id) => ({
      id,
      label: AUX_LABELS[id],
      kind: "aux",
      disabled: false,
    })),
  });
}

test("未就绪四个页签 aria-disabled、不是灰按钮，点击不切页而是说出原因", async () => {
  await withPageRowDom(async ({ container, render, click }) => {
    const selected = [];
    globalThis.__w16Toasts = [];
    await render(websiteFirstFrame(), (id) => selected.push(id));
    for (const id of WEBSITE_AUX_PAGE_IDS) {
      const tab = container.querySelector(`[data-plugin-page="${id}"]`);
      assert.ok(tab, `${id} 页签不在`);
      assert.equal(tab.disabled, false, `${id} 成了点不动的灰按钮`);
      assert.equal(tab.getAttribute("aria-disabled"), "true");
      assert.match(tab.getAttribute("title") || "", /编辑器还在加载/);
      await click(tab);
    }
    assert.deepEqual(selected, [], "点未就绪页签不该切页");
    assert.equal(globalThis.__w16Toasts.length, WEBSITE_AUX_PAGE_IDS.length, "点了没有看得见的反馈");
    assert.match(globalThis.__w16Toasts[0], /编辑器还在加载/);
    const artifact = container.querySelector('[data-plugin-page="artifact"]');
    assert.equal(artifact.disabled, false);
    assert.equal(artifact.getAttribute("aria-disabled"), null);
  });
});

test("manifest 到达后四个页签不再 disabled / aria-disabled，点击会切页", async () => {
  await withPageRowDom(async ({ container, render, click }) => {
    const selected = [];
    await render(readyWebsitePages(), (id) => selected.push(id));
    for (const id of WEBSITE_AUX_PAGE_IDS) {
      const tab = container.querySelector(`[data-plugin-page="${id}"]`);
      assert.ok(tab, `${id} 页签不在`);
      assert.equal(tab.disabled, false, `${id} 就绪后不应 disabled`);
      assert.equal(tab.getAttribute("aria-disabled"), null);
      await click(tab);
    }
    assert.deepEqual(selected, [...WEBSITE_AUX_PAGE_IDS]);
  });
});
