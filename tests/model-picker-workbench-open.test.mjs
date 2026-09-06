// ============================================================================
// 右上角「模型组合」在编辑器 / 详情面板打开时必须让位（plugin-chrome X4，规范 v2 §5）
// ----------------------------------------------------------------------------
// 操作员现场：website /history/<task> 页里点开「我的库」的一件素材，编辑器叠在同一条
// 路由上，选择框按「/history/<id> 是对话页」的路由规则留在右上角，压住素材库面板的
// 页签「我的库」。路由不知道覆盖层的事，所以有了 `workbench-open-store.ts`：任一
// 编辑器 / 详情面板挂上就登记，`ModelPicker` 看到登记就不渲染。
//
// 三层判据：
//   1. 纯函数：`shouldShowModelPicker(pathname, search, { workbenchOpen: true })`
//      在原本显示的每一条路由上都返回 false；不传 / false 时行为一字不变。
//   2. store 本体：计数器语义（两处登记、放掉一处仍算打开）、重复注销幂等、订阅推送。
//   3. 真渲染（jsdom + act）：AppShell 挂在 /history/session-1 上，子树里一处
//      `useWorkbenchOpenClaim(true)` 挂上 → 槽位消失；卸下 → 槽位回来。
//      SSR（renderToStaticMarkup）首帧固定不受登记影响，不制造 hydration 不一致。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

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
  url: "https://website.oceanleo.com/history/session-1",
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
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
if (!window.matchMedia) {
  window.matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  });
}

const reactUrl = pathToFileURL(require.resolve("react")).href;

// store 是纯 `.ts`、只 import react：编译台把它挂成 `file://` 真模块，
// 这里直接 import 的与 AppShell / ModelPicker 链过去的是**同一份实例**。
const store = await import("../src/shell/workbench-open-store.ts");
const { shouldShowModelPicker } = await import(
  "../src/shell/model-picker-visibility.ts"
);

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const iconsStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  function Icon(props) {
    return React.createElement("svg", { ...props, "aria-hidden": "true" });
  }
  export const IconCheck = Icon;
  export const IconChevronDown = Icon;
  export const IconGift = Icon;
  export const IconPanel = Icon;
  export const IconSearch = Icon;
`);
const accountStubUrl = dataModule(`
  export const MODEL_GROUP_CHANGED_EVENT = "model-groups-changed";
  export async function getModelGroups() {
    return { ok: false, status: 401 };
  }
  export async function setActiveModelGroup() {
    return { ok: false, status: 401 };
  }
`);
const modelPickerUrl = await compileModule("src/shell/ModelPicker.tsx", {
  "../lib/auth/account": accountStubUrl,
  "./icons": iconsStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
});
const navigationStubUrl = dataModule(`
  let pathname = "/history/session-1";
  let search = "";
  export function setRoute(nextPathname, nextSearch = "") {
    pathname = nextPathname;
    search = nextSearch;
  }
  export function usePathname() { return pathname; }
  export function useSearchParams() { return new URLSearchParams(search); }
  export function useRouter() {
    return {
      push(href) {
        const [nextPathname, nextSearch = ""] = String(href).split("?");
        setRoute(nextPathname, nextSearch);
      },
      replace(href) { this.push(href); },
      prefetch() {}, back() {}, forward() {}, refresh() {},
    };
  }
`);
const navigation = await import(navigationStubUrl);
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ children, href, ...props }) {
    return React.createElement("a", { ...props, href }, children);
  }
`);
const workspaceSelectionStubUrl = dataModule(`
  export function WorkspaceSelectionProvider({ children }) { return children; }
`);
const themeStubUrl = dataModule(`export function ThemeSwitcher() { return null; }`);
const languageStubUrl = dataModule(`export function LanguageSwitcher() { return null; }`);
const localeStubUrl = dataModule(`
  export const LOCALES = [
    "de", "en", "es", "es-419", "fr", "it", "pt-BR", "pt-PT", "vi",
    "tr", "zh", "zh-TW", "ja", "ko", "ar", "th", "hi"
  ];
`);
const presenceStubUrl = dataModule(`export function usePresenceHeartbeat() {}`);
const appShellUrl = await compileModule("src/shell/AppShell.tsx", {
  "next/link": linkStubUrl,
  "next/navigation": navigationStubUrl,
  "./ModelPicker": modelPickerUrl,
  "./icons": iconsStubUrl,
  "./WorkspaceSelection": workspaceSelectionStubUrl,
  "../theme": themeStubUrl,
  "../i18n/LanguageSwitcher": languageStubUrl,
  "../i18n/config": localeStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "../lib/presence": presenceStubUrl,
});
const { AppShell } = await import(appShellUrl);
const { ModelGroupPicker } = await import(modelPickerUrl);

const brand = {
  name: "Test",
  logo: React.createElement("span", null, "T"),
  accent: "#2563eb",
};
const PICKER_SLOT = "[data-oceanleo-model-picker-slot]";

/** 模拟一处编辑器 / 详情面板：挂着就登记。 */
function OpenEditor({ active = true }) {
  store.useWorkbenchOpenClaim(active);
  return React.createElement("div", { "data-fake-editor": true }, "editor");
}

// ------------------------------------------------------------- 1. 纯函数

test("workbenchOpen 一律优先于路由：原本显示的每一条路由都变成不显示", () => {
  const shownByRoute = [
    ["/", ""],
    ["/home", ""],
    ["/tasks/task-1", ""],
    ["/history/session-1", ""],
    ["/history", "?task=task-1"],
    ["/zh-TW/history/session-1", ""],
    ["/s/image/history/session-1", ""],
  ];
  for (const [pathname, search] of shownByRoute) {
    assert.equal(
      shouldShowModelPicker(pathname, search),
      true,
      `前提：${pathname}${search} 按路由本该显示`,
    );
    assert.equal(
      shouldShowModelPicker(pathname, search, { workbenchOpen: true }),
      false,
      `${pathname}${search}：编辑器开着还显示 = 压面板页签`,
    );
  }
});

test("不传 context / workbenchOpen=false 时行为与旧签名逐字相同", () => {
  const routes = [
    ["/", "", true],
    ["/history/session-1", "", true],
    ["/workspace/poster", "", false],
    ["/advanced", "", false],
    ["/projects/11", "", false],
  ];
  for (const [pathname, search, expected] of routes) {
    assert.equal(shouldShowModelPicker(pathname, search), expected);
    assert.equal(shouldShowModelPicker(pathname, search, {}), expected);
    assert.equal(
      shouldShowModelPicker(pathname, search, { workbenchOpen: false }),
      expected,
    );
  }
});

// ------------------------------------------------------------- 2. store 本体

test("store 是计数器：两处登记放掉一处仍算打开；重复注销幂等；订阅只在翻转时推送", () => {
  store.resetWorkbenchOpenForTests();
  const seen = [];
  const unsubscribe = store.subscribeWorkbenchOpen(() =>
    seen.push(store.workbenchOpenSnapshot()),
  );
  assert.equal(store.workbenchOpenSnapshot(), false);

  const releaseA = store.claimWorkbenchOpen("a");
  const releaseB = store.claimWorkbenchOpen("b");
  assert.equal(store.workbenchOpenSnapshot(), true);
  assert.deepEqual(seen, [true], "第二处登记不该再推一次（没有翻转）");

  releaseA();
  assert.equal(store.workbenchOpenSnapshot(), true, "还有 b 开着");
  releaseA();
  releaseA();
  assert.equal(store.workbenchOpenSnapshot(), true, "重复注销 a 不许把 b 清掉");

  releaseB();
  assert.equal(store.workbenchOpenSnapshot(), false);
  assert.deepEqual(seen, [true, false]);
  unsubscribe();
  store.claimWorkbenchOpen("c");
  assert.deepEqual(seen, [true, false], "退订之后不再收推送");
  store.resetWorkbenchOpenForTests();
});

// ------------------------------------------------------------- 3. 真渲染

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function shellWith(children) {
  return React.createElement(
    AppShell,
    { brand, layout: "sidebar" },
    React.createElement("section", { "aria-label": "Route content" }, children),
  );
}

test("/history 对话页：库编辑器一挂上，模型组合槽位消失；卸下就回来", async () => {
  store.resetWorkbenchOpenForTests();
  navigation.setRoute("/history/session-1", "");
  const mounted = await mount(shellWith(null));
  try {
    assert.equal(
      mounted.container.querySelectorAll(PICKER_SLOT).length,
      1,
      "前提：纯对话页显示选择框",
    );

    await mounted.rerender(shellWith(React.createElement(OpenEditor)));
    assert.equal(store.workbenchOpenSnapshot(), true);
    assert.equal(
      mounted.container.querySelectorAll(PICKER_SLOT).length,
      0,
      "编辑器开着，选择框还在 = 压住面板页签",
    );
    assert.equal(
      mounted.container.querySelector('[title="选择全站通用的模型组合"]'),
      null,
    );

    await mounted.rerender(shellWith(null));
    assert.equal(store.workbenchOpenSnapshot(), false);
    assert.equal(
      mounted.container.querySelectorAll(PICKER_SLOT).length,
      1,
      "关掉编辑器回到对话页，选择框要回来",
    );
  } finally {
    await mounted.unmount();
    store.resetWorkbenchOpenForTests();
  }
});

test("claim 的 active 翻成 false 也算关闭（详情面板收起，不必卸载组件）", async () => {
  store.resetWorkbenchOpenForTests();
  navigation.setRoute("/history/session-1", "");
  const mounted = await mount(
    shellWith(React.createElement(OpenEditor, { active: true })),
  );
  try {
    assert.equal(mounted.container.querySelectorAll(PICKER_SLOT).length, 0);
    await mounted.rerender(
      shellWith(React.createElement(OpenEditor, { active: false })),
    );
    assert.equal(mounted.container.querySelectorAll(PICKER_SLOT).length, 1);
  } finally {
    await mounted.unmount();
    store.resetWorkbenchOpenForTests();
  }
});

test("不走 AppShell、直接挂 ModelGroupPicker 的宿主同样让位（同一个事实源）", async () => {
  store.resetWorkbenchOpenForTests();
  const mounted = await mount(
    React.createElement(
      "div",
      null,
      React.createElement(ModelGroupPicker, { apiHref: "/api" }),
    ),
  );
  try {
    assert.ok(
      mounted.container.querySelector('[title="选择全站通用的模型组合"]'),
      "前提：没有编辑器时正常渲染",
    );
    await mounted.rerender(
      React.createElement(
        "div",
        null,
        React.createElement(ModelGroupPicker, { apiHref: "/api" }),
        React.createElement(OpenEditor),
      ),
    );
    assert.equal(
      mounted.container.querySelector('[title="选择全站通用的模型组合"]'),
      null,
      "编辑器开着，组件层也不许渲染",
    );
  } finally {
    await mounted.unmount();
    store.resetWorkbenchOpenForTests();
  }
});

test("SSR 首帧不受登记影响（服务端没有打开的编辑器），避免 hydration 不一致", () => {
  store.resetWorkbenchOpenForTests();
  navigation.setRoute("/history/session-1", "");
  const release = store.claimWorkbenchOpen("ssr-probe");
  try {
    const markup = renderToStaticMarkup(shellWith(null));
    assert.equal(
      markup.split("data-oceanleo-model-picker-slot").length - 1,
      1,
      "SSR 用 getServerSnapshot=false，槽位照旧",
    );
  } finally {
    release();
    store.resetWorkbenchOpenForTests();
  }
});
