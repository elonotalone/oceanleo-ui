// Playground 跨站 app 市场合同：
// 搜索 / 场景筛选、装卸乐观更新与回滚、卡片落点、未登录引导、250ms 网关防抖。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useState } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const uiStubUrl = dataModule(`
  export function useUI() {
    return (text, values) => text.replace(/{(\\w+)}/g, (whole, key) =>
      values && key in values ? String(values[key]) : whole
    );
  }
`);
const authStubUrl = dataModule(`
  export async function accessToken() {
    return globalThis.__marketToken ?? null;
  }
`);
const authConfigStubUrl = dataModule(
  'export const GATEWAY_BASE = "https://gateway.test";',
);

const marketClientUrl = await compileModule("src/lib/app-market.ts", {
  "./auth/client": authStubUrl,
  "./auth/config": authConfigStubUrl,
});
const marketComponentUrl = await compileModule("src/shell/AppMarket.tsx", {
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/app-market": marketClientUrl,
});

const { listMarketApps } = await import(marketClientUrl);
const { AppMarket, appMarketOpenUrl } = await import(marketComponentUrl);

const APPS = [
  {
    app_id: "resume-maker",
    site_id: "resume",
    app_key: "resume",
    name: "简历生成器",
    tagline: "把经历整理成专业求职简历",
    icon: "📄",
    category: "文档",
    scenes: ["职场", "求职"],
    site_url: "https://resume.oceanleo.com",
    open_path: "/workspace?app=resume",
    sort_order: 1,
    installed: false,
  },
  {
    app_id: "poster-maker",
    site_id: "image",
    app_key: "poster",
    name: "营销海报",
    tagline: "生成商品活动海报",
    icon: "🖼️",
    category: "图像",
    scenes: ["营销"],
    site_url: "https://image.oceanleo.com",
    open_path: "/workspace?app=poster",
    sort_order: 2,
    installed: false,
  },
  {
    app_id: "meeting-notes",
    site_id: "word",
    app_key: "minutes",
    name: "会议纪要",
    tagline: "把录音要点整理成纪要",
    icon: "✍️",
    category: "文档",
    scenes: ["办公"],
    site_url: "https://word.oceanleo.com",
    open_path: "",
    sort_order: 3,
    installed: true,
  },
];

function MarketHarness({ onLogin = () => {} } = {}) {
  const [items, setItems] = useState(APPS);
  const [query, setQuery] = useState("");
  const [scene, setScene] = useState("");
  const [siteId, setSiteId] = useState("");
  return React.createElement(AppMarket, {
    items,
    total: 37,
    scenes: [
      { scene: "职场", count: 1 },
      { scene: "营销", count: 1 },
      { scene: "办公", count: 1 },
    ],
    siteIds: ["image", "resume", "word"],
    loading: false,
    error: null,
    query,
    scene,
    siteId,
    accent: "#2563eb",
    onQueryChange: setQuery,
    onSceneChange: setScene,
    onSiteChange: setSiteId,
    onInstalledChange(appId, installed) {
      setItems((current) =>
        current.map((app) => (app.app_id === appId ? { ...app, installed } : app)),
      );
    },
    onRequestLogin: onLogin,
  });
}

async function withDom(run) {
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
    url: "https://oceanleo.com/playground",
  });
  const { window } = dom;
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
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) {
        Object.defineProperty(globalThis, name, {
          configurable: true,
          writable: true,
          value: previous,
        });
      } else {
        delete globalThis[name];
      }
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }

  const previousRaf = globalThis.requestAnimationFrame;
  const previousCancelRaf = globalThis.cancelAnimationFrame;
  const previousFetch = globalThis.fetch;
  const previousToken = globalThis.__marketToken;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__marketToken = "test-token";

  const fetchCalls = [];
  let nextFetch = { ok: true, status: 200, body: {} };
  globalThis.fetch = async (url, init = {}) => {
    fetchCalls.push({ url: String(url), init });
    const response = nextFetch;
    nextFetch = { ok: true, status: 200, body: {} };
    return {
      ok: response.ok,
      status: response.status,
      async json() {
        return response.body;
      },
    };
  };

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const click = async (node) => {
    assert.ok(node, "missing click target");
    await act(async () => {
      node.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true, cancelable: true }),
      );
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const input = async (node, value) => {
    assert.ok(node, "missing input target");
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      setter.call(node, value);
      node.dispatchEvent(new window.Event("input", { bubbles: true }));
    });
  };

  try {
    await run({
      window,
      container,
      fetchCalls,
      render: (element) => act(async () => root.render(element)),
      click,
      input,
      failNext(body = { detail: "网关繁忙" }) {
        nextFetch = { ok: false, status: 500, body };
      },
    });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    for (const undo of restore.reverse()) undo();
    if (previousRaf === undefined) delete globalThis.requestAnimationFrame;
    else globalThis.requestAnimationFrame = previousRaf;
    if (previousCancelRaf === undefined) delete globalThis.cancelAnimationFrame;
    else globalThis.cancelAnimationFrame = previousCancelRaf;
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete globalThis.__marketToken;
    else globalThis.__marketToken = previousToken;
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("公开列表把搜索与场景拼进真实网关请求，不依赖在线后端", async () => {
  const previousFetch = globalThis.fetch;
  const previousToken = globalThis.__marketToken;
  const calls = [];
  globalThis.__marketToken = null;
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    return {
      ok: true,
      status: 200,
      async json() {
        return { items: [APPS[0]], total: 1 };
      },
    };
  };
  try {
    const result = await listMarketApps({
      q: "简历",
      scene: "职场",
      siteId: "resume",
      limit: 20,
      offset: 0,
    });
    assert.equal(result.total, 1);
    assert.equal(result.items[0].name, "简历生成器");
    const url = new URL(calls[0].url);
    assert.equal(url.pathname, "/v1/apps");
    assert.equal(url.searchParams.get("q"), "简历");
    assert.equal(url.searchParams.get("scene"), "职场");
    assert.equal(url.searchParams.get("site_id"), "resume");
    assert.equal(calls[0].init.headers.Authorization, undefined);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete globalThis.__marketToken;
    else globalThis.__marketToken = previousToken;
  }
});

test("搜索与横排场景标签会真的缩小卡片结果", async () => {
  await withDom(async ({ container, render, click, input }) => {
    await render(React.createElement(MarketHarness));
    assert.match(container.textContent, /平台一共有 37 个现成的活/);
    assert.equal(container.querySelectorAll("[data-market-app]").length, 3);

    await input(container.querySelector("[data-app-market-search]"), "简历");
    assert.equal(container.querySelectorAll("[data-market-app]").length, 1);
    assert.match(container.textContent, /简历生成器/);
    assert.doesNotMatch(container.textContent, /营销海报/);

    await input(container.querySelector("[data-app-market-search]"), "");
    const scene = [...container.querySelectorAll("[data-app-market-scenes] button")]
      .find((button) => button.textContent.includes("营销"));
    await click(scene);
    assert.equal(container.querySelectorAll("[data-market-app]").length, 1);
    assert.match(container.textContent, /营销海报/);
  });
});

test("点装会 POST、立即变已装，且按钮不会顺带打开卡片", async () => {
  await withDom(async ({ window, container, fetchCalls, render, click }) => {
    const opened = [];
    window.open = (...args) => opened.push(args);
    await render(React.createElement(MarketHarness));

    await click(container.querySelector('[data-market-app-install="resume-maker"]'));
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].url, "https://gateway.test/v1/apps/mine");
    assert.equal(fetchCalls[0].init.method, "POST");
    assert.deepEqual(JSON.parse(fetchCalls[0].init.body), { app_id: "resume-maker" });
    assert.equal(fetchCalls[0].init.headers.Authorization, "Bearer test-token");
    assert.equal(
      container.querySelector('[data-market-app-install="resume-maker"]').textContent,
      "已装",
    );
    assert.equal(opened.length, 0, "装按钮必须 stopPropagation，不能打开 app");
  });
});

test("安装失败回滚成未装并给人话", async () => {
  await withDom(async ({ container, render, click, failNext }) => {
    await render(React.createElement(MarketHarness));
    failNext();
    await click(container.querySelector('[data-market-app-install="resume-maker"]'));

    assert.equal(
      container.querySelector('[data-market-app-install="resume-maker"]').textContent,
      "装到我的",
    );
    assert.match(
      container.querySelector('[data-app-market-notice="error"]').textContent,
      /状态已恢复/,
    );
  });
});

test("卡片打开 site_url + open_path；空 open_path 回站点首页", async () => {
  assert.equal(
    appMarketOpenUrl(APPS[0]),
    "https://resume.oceanleo.com/workspace?app=resume",
  );
  assert.equal(appMarketOpenUrl(APPS[2]), "https://word.oceanleo.com");

  await withDom(async ({ window, container, render, click }) => {
    const opened = [];
    window.open = (...args) => opened.push(args);
    await render(React.createElement(MarketHarness));
    await click(
      container.querySelector(
        '[data-market-app="resume-maker"] [data-market-app-open]',
      ),
    );
    assert.deepEqual(opened[0], [
      "https://resume.oceanleo.com/workspace?app=resume",
      "_blank",
      "noopener,noreferrer",
    ]);
  });
});

test("未登录点装不打网关，回滚并走登录引导", async () => {
  await withDom(async ({ container, fetchCalls, render, click }) => {
    globalThis.__marketToken = null;
    let loginRequests = 0;
    await render(
      React.createElement(MarketHarness, {
        onLogin: () => {
          loginRequests += 1;
        },
      }),
    );
    await click(container.querySelector('[data-market-app-install="resume-maker"]'));

    assert.equal(fetchCalls.length, 0);
    assert.equal(loginRequests, 1);
    assert.equal(
      container.querySelector('[data-market-app-install="resume-maker"]').textContent,
      "装到我的",
    );
    assert.match(
      container.querySelector('[data-app-market-notice="auth"]').textContent,
      /请先登录/,
    );
  });
});

test("已装 app 要二次确认才会 DELETE", async () => {
  await withDom(async ({ container, fetchCalls, render, click }) => {
    await render(React.createElement(MarketHarness));
    const button = container.querySelector(
      '[data-market-app-install="meeting-notes"]',
    );
    await click(button);
    assert.equal(button.textContent, "确认卸掉");
    assert.equal(fetchCalls.length, 0);
    await click(button);
    assert.equal(fetchCalls.length, 1);
    assert.equal(fetchCalls[0].init.method, "DELETE");
    assert.equal(
      fetchCalls[0].url,
      "https://gateway.test/v1/apps/mine/meeting-notes",
    );
    assert.equal(button.textContent, "装到我的");
  });
});

test("Playground 以平行 hook 挂市场并对搜索请求做 250ms 防抖", async () => {
  const source = await readFile(resolve("src/shell/Playground.tsx"), "utf8");
  assert.match(source, /function useMarketApps\(\)/);
  assert.match(source, /setDebouncedQuery\(query\.trim\(\)\), 250/);
  assert.match(source, /if \(tab === "app"\)[\s\S]*?<AppMarket/);
  assert.doesNotMatch(
    source.match(/function useAgents[\s\S]*?return \{ agents, loading \};\n\}/)?.[0] ?? "",
    /listMarketApps|listMarketScenes/,
    "市场必须与私有 useAgents 平行，不能篡改旧 hook",
  );
});
