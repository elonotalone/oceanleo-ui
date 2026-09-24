// 网站页签首帧就是完整六格；未就绪四格置灰；manifest 到达后可点；表外 id 追加。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  PLUGIN_AUX_PENDING_REASON,
  WEBSITE_AUX_PAGE_IDS,
  mergePluginAuxPages,
} from "../src/shell/plugin-chrome/plugin-page-registry.ts";
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
const { PluginPageRow } = await import(
  await compileModule("src/shell/plugin-chrome/PluginPageRow.tsx", {
    "../../i18n/ui/useUI": ttStubUrl,
  })
);

function websiteFirstFrame() {
  return buildPluginPages({ pluginId: "website" });
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
    aux: mergePluginAuxPages("website", remote),
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

test("EmbeddedRoute 首帧就把静态表交给页签行", () => {
  const route = readFileSync(
    new URL("../src/shell/advanced-routes/EmbeddedRoute.tsx", import.meta.url),
    "utf8",
  );
  assert.match(route, /mergePluginAuxPages\(\s*embeddedAdapterId/);
  assert.match(route, /aux: remoteAuxPages/);
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
            React.createElement(PluginPageRow, {
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
    aux: mergePluginAuxPages(
      "website",
      WEBSITE_AUX_PAGE_IDS.map((id) => ({
        id,
        label:
          id === "code"
            ? "源码"
            : id === "dashboard"
              ? "仪表盘"
              : id === "database"
                ? "数据库"
                : "文件存储",
        kind: "aux",
        disabled: false,
      })),
    ),
  });
}

test("未就绪四个页签按钮 disabled + aria-disabled，点击不切页", async () => {
  await withPageRowDom(async ({ container, render, click }) => {
    const selected = [];
    await render(websiteFirstFrame(), (id) => selected.push(id));
    for (const id of WEBSITE_AUX_PAGE_IDS) {
      const tab = container.querySelector(`[data-plugin-page="${id}"]`);
      assert.ok(tab, `${id} 页签不在`);
      assert.equal(tab.disabled, true, `${id} 应 disabled`);
      assert.equal(tab.getAttribute("aria-disabled"), "true");
      assert.match(tab.getAttribute("title") || "", /编辑器还在加载/);
      await click(tab);
    }
    assert.deepEqual(selected, [], "点未就绪页签不该切页");
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
