import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const marketStubUrl = dataModule(`
  let apps = [];
  let listError = null;
  let uninstallCalls = [];
  let uninstallGate = null;

  export function __reset() {
    apps = [];
    listError = null;
    uninstallCalls = [];
    uninstallGate = null;
  }
  export function __setApps(next) {
    apps = next.map((app) => ({ ...app }));
  }
  export function __setListError(next) {
    listError = next;
  }
  export function __uninstallCalls() {
    return [...uninstallCalls];
  }
  export function __holdUninstall() {
    let release;
    uninstallGate = new Promise((resolve) => {
      release = resolve;
    });
    return () => {
      release();
      uninstallGate = null;
    };
  }
  export async function listMyApps() {
    if (listError) throw listError;
    return apps.map((app) => ({ ...app }));
  }
  export async function uninstallApp(appId) {
    uninstallCalls.push(appId);
    if (uninstallGate) await uninstallGate;
  }
  export function sortMyApps(items) {
    return items
      .map((app, index) => ({ app, index }))
      .sort((left, right) => left.app.sort_order - right.app.sort_order || left.index - right.index)
      .map(({ app }) => app);
  }
  export function marketAppOpenUrl(app) {
    const siteUrl = (app.site_url || "").trim();
    const appKey = (app.app_key || "").trim();
    const openPath = (app.open_path || "").trim() || (appKey ? "/workspace/" + appKey : "");
    if (!openPath) return siteUrl;
    return siteUrl.replace(/\\/+$/, "") + "/" + openPath.replace(/^\\/+/, "");
  }
`);

const uiStubUrl = dataModule(
  "export function useUI(){ return (value) => value; }",
);
const iconStubUrl = dataModule(
  "export function appIconThumbSrc(){ return \"\"; }",
);
const railUrl = await compileModule("src/shell/MyAppsRail.tsx", {
  "../lib/app-market": marketStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/app-icon-image": iconStubUrl,
});
const {
  MY_APPS_MARKET_HREF,
  MyAppsRail,
  marketAppOpenHref,
  sortMyApps,
} = await import(railUrl);
const marketApi = await import(marketStubUrl);

function app(id, sortOrder, overrides = {}) {
  return {
    app_id: `site.${id}`,
    site_id: "site",
    app_key: id,
    name: `应用 ${id}`,
    tagline: `${id} 的说明`,
    icon: "✨",
    category: "创作",
    scenes: ["日常"],
    site_url: "https://image.oceanleo.com/",
    open_path: `/workspace/${id}`,
    sort_order: sortOrder,
    installed: true,
    ...overrides,
  };
}

const INSTALLED = [
  app("ten", 10),
  app("two-a", 2),
  app("one", 1),
  app("two-b", 2),
  app("three", 3),
  app("four", 4),
  app("five", 5),
  app("six", 6),
  app("seven", 7),
  app("eight", 8),
];

async function installDom() {
  // jsdom 经 fabric 的依赖树可见；加载期间给缺失的 canvas 原生绑定一个空替身。
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
    url: "https://oceanleo.com/",
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
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  restore.push(() => {
    if (previousActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
  });

  return {
    window,
    restore() {
      for (const undo of restore.reverse()) undo();
      window.close();
    },
  };
}

async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

test("排序稳定，打开地址按 site_url + open_path 拼接", () => {
  assert.deepEqual(
    sortMyApps([INSTALLED[0], INSTALLED[1], INSTALLED[2], INSTALLED[3]]).map(
      (item) => item.app_id,
    ),
    ["site.one", "site.two-a", "site.two-b", "site.ten"],
  );
  assert.equal(
    marketAppOpenHref(INSTALLED[2]),
    "https://image.oceanleo.com/workspace/one",
  );
  assert.equal(
    marketAppOpenHref({
      site_url: "https://word.oceanleo.com/",
      open_path: "",
    }),
    "https://word.oceanleo.com/",
  );
  assert.match(MY_APPS_MARKET_HREF, /playground\?.*view=mine/);
});

test("未登录整块不渲染；登录后的首帧是骨架", () => {
  const signedOut = renderToStaticMarkup(
    React.createElement(MyAppsRail, { signedIn: false }),
  );
  assert.equal(signedOut, "");

  const loading = renderToStaticMarkup(
    React.createElement(MyAppsRail, { signedIn: true }),
  );
  assert.match(loading, /data-my-apps-loading/);
  assert.match(loading, /aria-busy="true"/);
});

test("首页不再有「我的应用」这一块", async () => {
  const source = await readFile("src/shell/HomeAppCards.tsx", "utf8");
  assert.equal(
    source.includes("MyAppsRail"),
    false,
    "首页是办公站的门面，加入工作台的 app 不出现在首页也不出现在侧栏",
  );
});

test("AppShell 侧栏不再挂已加入的 app", async () => {
  const source = await readFile("src/shell/AppShell.tsx", "utf8");
  assert.equal(
    source.includes("MyAppsRail"),
    false,
    "加入工作台的 app 只出现在主站工作台，不许再插进各站侧栏",
  );
});

test("侧栏展示服务端列表且限八个；移除立即生效并二次确认", async () => {
  const { window, restore } = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  async function render(props) {
    await act(async () => {
      root.render(React.createElement(MyAppsRail, props));
    });
    await settle();
  }

  try {
    marketApi.__reset();
    marketApi.__setApps(INSTALLED);

    await render({ signedIn: true });
    const items = [
      ...container.querySelectorAll(
        '[data-my-apps-rail="sidebar"] [data-my-apps-item]',
      ),
    ];
    assert.deepEqual(
      items.map((item) => item.getAttribute("data-my-apps-item")),
      [
        "site.one",
        "site.two-a",
        "site.two-b",
        "site.three",
        "site.four",
        "site.five",
        "site.six",
        "site.seven",
      ],
      "侧栏按排序取前八个",
    );
    const firstOpen = items[0].querySelector("[data-my-apps-open]");
    assert.equal(
      firstOpen.getAttribute("href"),
      "https://image.oceanleo.com/workspace/one",
    );
    assert.equal(firstOpen.getAttribute("target"), "_blank");
    assert.equal(firstOpen.getAttribute("rel"), "noopener noreferrer");

    const seeAll = container.querySelector(
      '[data-my-apps-rail="sidebar"] [data-my-apps-market]',
    );
    assert.ok(seeAll);
    assert.equal(seeAll.getAttribute("href"), MY_APPS_MARKET_HREF);
    assert.match(seeAll.textContent, /查看全部/);

    const releaseUninstall = marketApi.__holdUninstall();
    // W05 把这一步从 window.confirm 换成了 ConfirmDialog（原生弹窗阻塞主线程、
    // 样式不可控、移动端尤其糟）。二次确认这条**意图没变**，验法跟着机制变：
    // 原来读被 stub 的 confirm 文案，现在读真的渲染出来的对话框。
    // 顺手把「压根不许再调原生弹窗」钉死：调了就当场炸，不是静默走过去。
    window.confirm = () => {
      throw new Error("不许再调用 window.confirm（W05 已迁到 ConfirmDialog）");
    };
    const remove = container.querySelector(
      '[data-my-apps-remove="site.one"]',
    );
    await act(async () => {
      remove.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      await Promise.resolve();
    });
    await settle();

    // 只点「移除」还什么都不该发生——这比原来那版更严：
    // 原来 confirm 被 stub 成恒真，「没确认就不动手」其实没被验过。
    assert.deepEqual(
      marketApi.__uninstallCalls(),
      [],
      "还没确认就已经发了 DELETE",
    );
    assert.ok(
      container.querySelector('[data-my-apps-item="site.one"]'),
      "还没确认就已经把应用从列表里摘了",
    );

    // 对话框走 Modal 的 portal，挂在 document.body 上，不在 container 里。
    const dialog = window.document.body.querySelector('[role="dialog"]');
    assert.ok(dialog, "点「移除」没有弹出确认对话框");
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    assert.match(dialog.textContent, /确定.*移除.*应用 one/);

    const dialogButtons = [...dialog.querySelectorAll("button")];
    const confirmButton = dialogButtons.find((button) =>
      /移除/.test(button.textContent),
    );
    assert.ok(confirmButton, "确认键上没有「移除」字样");
    assert.ok(
      dialogButtons.some((button) => /取消/.test(button.textContent)),
      "对话框没有给退路（取消键）",
    );

    await act(async () => {
      confirmButton.dispatchEvent(
        new window.MouseEvent("click", { bubbles: true }),
      );
      await Promise.resolve();
    });
    await settle();

    assert.deepEqual(marketApi.__uninstallCalls(), ["site.one"]);
    assert.equal(
      container.querySelector('[data-my-apps-item="site.one"]'),
      null,
      "DELETE 尚未返回时，列表已立即移除该应用",
    );
    releaseUninstall();
    await settle();
  } finally {
    await act(async () => root.unmount());
    container.remove();
    restore();
  }
});

test("空列表整块不渲染；加载失败给重试；鉴权失败则隐藏", async () => {
  const { window, restore } = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  async function render(props) {
    await act(async () => {
      root.render(React.createElement(MyAppsRail, props));
    });
    await settle();
  }

  try {
    marketApi.__reset();
    marketApi.__setApps([]);
    await render({ signedIn: true });
    assert.equal(
      container.querySelector("[data-my-apps-rail]"),
      null,
      "一个应用都没装时不许留一句「还没有装过应用」占着位置",
    );

    marketApi.__setListError(new Error("gateway down"));
    await render({ signedIn: false });
    await render({ signedIn: true });
    const failure = container.querySelector("[data-my-apps-error]");
    assert.ok(failure);
    assert.match(failure.textContent, /加载失败/);

    marketApi.__setListError(null);
    marketApi.__setApps([app("retry-ok", 1)]);
    await act(async () => {
      failure
        .querySelector("[data-my-apps-retry]")
        .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await settle();
    assert.ok(
      container.querySelector('[data-my-apps-item="site.retry-ok"]'),
      "重试后重新向服务端取数并显示结果",
    );

    const authError = new Error("not signed in");
    authError.name = "MarketAuthError";
    marketApi.__setListError(authError);
    await render({ signedIn: false });
    await render({});
    assert.equal(container.querySelector("[data-my-apps-rail]"), null);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    restore();
  }
});
