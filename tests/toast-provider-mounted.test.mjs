// ============================================================================
// 判据 ① —— 全站的 toast 真的有人渲染（W45，2026-09-01）
// ----------------------------------------------------------------------------
// `src/ui/Toast.tsx` 从 `4433e00` 起就在库里，也从 `@oceanleo/ui/ui` 露了出来，
// 但在本判据之前**没有任何地方挂载它**：toast 照常进 store、没人渲染、
// dev 下 warn 一次（原语刻意不假装成功）⇒ 全站的 toast 一条都不会出现在屏幕上。
//
// 所以这份判据锁的不是「Toast 组件对不对」（那是 `toast-primitive` 的活），
// 而是**挂载点在不在**：AppShell 是 31 个站唯一共用的应用根。
//
// 为什么必须是真渲染而不是读源码找那一行：`_COMMON.md §7b⑧` 说的结构性假绿——
// 断言字符串在源码里出现过，不等于运行期真有一个 viewport。这里的做法是
// 在 jsdom 里挂 AppShell、往 store 推一条 toast、去 DOM 里把它读出来。
// 顺带把原语的 `console.warn`（「没人渲染」的那句）当第二道读数：挂载点缺席时
// 它必然响，所以它沉默本身就是证据。
//
// 编译台的桩表**两次调用完全一致**，这样 `AppShell` 拿到的 `../ui` 与本文件
// import 的是同一份实例（`module-bench.mjs:521` 的既定口径），store 不分叉。
// 刻意**不**给 `../ui` 打桩：打了桩就变成「测我自己写的替身」，
// 真正要验的「`../ui` 到底有没有把 `ToastProvider` 露出来」会被替身盖住。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiTranslateStubUrl = dataModule(`
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
const modelPickerStubUrl = dataModule(`
  export function ModelGroupPicker() {
    return null;
  }
`);
const navigationStubUrl = dataModule(`
  export function usePathname() {
    return "/workspace";
  }
  export function useSearchParams() {
    return new URLSearchParams("");
  }
  export function useRouter() {
    return {
      push() {}, replace() {}, prefetch() {},
      back() {}, forward() {}, refresh() {},
    };
  }
`);
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ children, href, ...props }) {
    return React.createElement("a", { ...props, href }, children);
  }
`);
const workspaceSelectionStubUrl = dataModule(`
  export function WorkspaceSelectionProvider({ children }) {
    return children;
  }
`);
const themeStubUrl = dataModule("export function ThemeSwitcher(){ return null; }");
const languageStubUrl = dataModule(
  "export function LanguageSwitcher(){ return null; }",
);
const localeStubUrl = dataModule(`
  export const LOCALES = ["en", "zh"];
`);
const presenceStubUrl = dataModule("export function usePresenceHeartbeat(){}");
const appMarketStubUrl = dataModule(`
  export async function listMyApps() { return []; }
  export async function uninstallApp() {}
`);

/** 两次 `compileModule` 必须拿到同一张桩表，否则上下文分叉、store 也就分叉。 */
const STUBS = {
  "next/link": linkStubUrl,
  "next/navigation": navigationStubUrl,
  "./ModelPicker": modelPickerStubUrl,
  "./icons": iconsStubUrl,
  "./WorkspaceSelection": workspaceSelectionStubUrl,
  "../theme": themeStubUrl,
  "../i18n/LanguageSwitcher": languageStubUrl,
  "../i18n/config": localeStubUrl,
  "../i18n/ui/useUI": uiTranslateStubUrl,
  "../lib/presence": presenceStubUrl,
  "../lib/app-market": appMarketStubUrl,
};

const { AppShell } = await import(
  await compileModule("src/shell/AppShell.tsx", STUBS)
);
const uiBarrel = await import(await compileModule("src/ui/index.tsx", STUBS));
const { resetToastStoreForTests } = await import(
  await compileModule("src/ui/Toast.tsx", STUBS)
);

const brand = {
  name: "Test",
  logo: React.createElement("span", null, "T"),
  accent: "#2563eb",
};

function shellWith(child, props = {}) {
  return React.createElement(
    AppShell,
    { brand, userEmail: "a@oceanleo.com", ...props },
    child ?? React.createElement("section", null, "Body"),
  );
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
    url: "https://oceanleo.com/workspace",
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    localStorage: window.localStorage,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
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
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  resetToastStoreForTests();

  try {
    await run({
      window,
      root,
      render: (element) => act(async () => root.render(element)),
      viewports: () => [
        ...window.document.querySelectorAll("[data-leo-toast-viewport]"),
      ],
      toasts: () => [...window.document.querySelectorAll("[data-leo-toast-id]")],
    });
  } finally {
    await act(async () => root.unmount());
    resetToastStoreForTests();
    if (previousActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
    for (const undo of restore.reverse()) undo();
    window.close();
  }
}

test("`../ui` 确实把 ToastProvider 露了出来（挂载点的前提）", () => {
  assert.equal(
    typeof uiBarrel.ToastProvider,
    "function",
    "@oceanleo/ui/ui 不再导出 ToastProvider —— 挂载点就没得挂了",
  );
  assert.equal(typeof uiBarrel.useToast, "function");
});

test("应用根部挂了 ToastProvider：一条 toast 真的进得了 DOM", async () => {
  await withDom(async ({ render, viewports, toasts, window }) => {
    await render(shellWith(null));
    assert.equal(
      viewports().length,
      1,
      "AppShell 渲染完之后屏幕上没有 toast viewport —— 全站 toast 一条都出不来",
    );

    // 原语在「没人渲染」时会 warn 一次（它刻意不假装成功）。挂对了就必须沉默，
    // 所以这行读数是与 DOM 断言互相独立的第二个证据。
    const warnings = [];
    const realWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(" "));
    try {
      await act(async () => {
        uiBarrel.useToast().success("已保存", "改动已经落到云端");
      });
    } finally {
      console.warn = realWarn;
    }

    const rendered = toasts();
    assert.equal(rendered.length, 1, "toast 进了 store 却没渲染出来");
    assert.match(
      rendered[0].textContent,
      /已保存/,
      `渲染出来的那条不是刚推的：${rendered[0].textContent}`,
    );
    assert.match(rendered[0].textContent, /改动已经落到云端/);
    assert.deepEqual(
      warnings.filter((line) => line.includes("ToastProvider")),
      [],
      "原语报「没有任何 ToastProvider / ToastViewport 在渲染它」——挂载点没生效",
    );

    // viewport 不许挡点击：它包在整个应用外面，`pointer-events` 走的是那条
    // 注入样式。这里验的是 DOM 结构上它没有把 children 吞掉。
    assert.match(window.document.body.textContent, /Body/);
  });
});

test("套几层 AppShell 都只有一个 viewport（不会右下角摞两摞）", async () => {
  await withDom(async ({ render, viewports, toasts }) => {
    await render(
      shellWith(
        shellWith(React.createElement("section", null, "Nested body"), {
          brand: { ...brand, name: "Nested" },
        }),
      ),
    );
    assert.equal(
      viewports().length,
      1,
      "内层 AppShell 又挂了一个 viewport —— 同一条 toast 会在屏幕上出现两次",
    );
    await act(async () => {
      uiBarrel.useToast().info("只该出现一次");
    });
    assert.equal(toasts().length, 1);
  });
});


test("SSR 首帧就带着 viewport 容器（aria-live 区域要先存在才播报得了）", () => {
  const markup = renderToStaticMarkup(shellWith(null));
  assert.equal(
    markup.split("data-leo-toast-viewport").length - 1,
    1,
    "服务端首帧没有 viewport 容器：屏幕阅读器不会播报之后插进来的 toast",
  );
});

test("挂载点自己不许引第三方 toast 库（红线 7）", async () => {
  const { readFileSync } = await import("node:fs");
  const source = readFileSync("src/shell/AppShell.tsx", "utf8");
  assert.equal(
    /\bsonner\b/.test(source),
    false,
    "AppShell 里出现了 sonner —— 它在本包里是 optional peer，31 个站不一定装",
  );
  assert.match(
    source,
    /import \{ ToastProvider \} from "\.\.\/ui"/,
    "挂载点必须走第一方原语的公共子路径",
  );
});
