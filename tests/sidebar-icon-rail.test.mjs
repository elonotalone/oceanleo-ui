// 收起侧栏必须变成图标轨：栏目图标留下、文字收起；点「我的任务」自动展开。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const appShell = readFileSync(
  new URL("../src/shell/AppShell.tsx", import.meta.url),
  "utf8",
);

test("桌面收起是 w-14 图标轨，不再是 w-0 空白", () => {
  assert.match(appShell, /data-oceanleo-sidebar-mode=\{collapsed \? "rail" : "expanded"\}/);
  assert.match(appShell, /collapsed \? "w-14" : "w-\[256px\]"/);
  assert.match(appShell, /data-oceanleo-sidebar-rail-nav/);
  assert.doesNotMatch(
    appShell,
    /collapsed \? "w-0/,
    "收起后再写成 w-0，左侧又会留下一块空白",
  );
});

test("图标轨只画栏目图标，点「我的任务」会展开侧栏并打开任务列表", () => {
  assert.match(appShell, /function renderNavItem\([^)]*rail = false/);
  assert.match(appShell, /data-oceanleo-nav-icon/);
  assert.match(appShell, /data-oceanleo-nav-disclosure=\{rail \? "rail" : "expanded"\}/);
  assert.match(
    appShell,
    /if \(rail\) \{\s*toggleCollapsed\(false\);\s*setOpenDisclosures\(\(current\) => \(\{\s*\.\.\.current,\s*\[key\]: true,/,
  );
  assert.match(appShell, /\{!rail && item\.disclosure && \(/);
  assert.match(
    appShell,
    /\{!rail && includeDisclosure && item\.disclosure && \(/,
  );
  assert.match(appShell, /\{!rail && \(\s*<span className="flex-1 truncate">\{labelText\}<\/span>/);
});

test("折叠轨顶上一颗键：默认站标，悬停换成展开，不再并排两颗", () => {
  const globals = readFileSync(
    new URL("../src/theme/globals.css", import.meta.url),
    "utf8",
  );
  assert.match(appShell, /data-oceanleo-sidebar-expand/);
  assert.match(appShell, /data-oceanleo-rail-brand/);
  assert.match(appShell, /data-oceanleo-rail-expand-icon/);
  assert.doesNotMatch(
    appShell,
    /renderBrandMark\(true\)/,
    "折叠态不许再单独画一颗站标键，再在下面叠一颗展开键",
  );
  const railStart = appShell.indexOf("if (rail) {\n      return (");
  const railEnd = appShell.indexOf("\n    }\n    return (", railStart);
  assert.ok(railStart > 0 && railEnd > railStart, "必须切得到折叠头");
  const railBranch = appShell.slice(railStart, railEnd);
  assert.match(railBranch, /data-oceanleo-sidebar-expand/);
  assert.match(railBranch, /\{brand\.logo\}/);
  assert.match(railBranch, /<IconPanel \/>/);
  assert.equal(
    (railBranch.match(/<button/g) || []).length,
    2,
    "折叠头只该有展开键 + 可选搜索键，不能再多一颗站标键",
  );
  assert.match(
    globals,
    /\[data-oceanleo-sidebar-expand\]:hover \[data-oceanleo-rail-brand\]/,
  );
  assert.match(
    globals,
    /\[data-oceanleo-sidebar-expand\]:hover \[data-oceanleo-rail-expand-icon\]/,
  );
  assert.match(railBranch, /data-oceanleo-rail-tip=\{tt\("展开侧栏"\)\}/);
  assert.doesNotMatch(
    railBranch,
    /title=\{tt\("展开侧栏"\)\}/,
    "折叠顶键不许再用浏览器自带 title，必须走黑底浮层",
  );
  assert.match(appShell, /<SidebarRailTipLayer \/>/);
  assert.match(globals, /\[data-oceanleo-rail-tip-bubble\]/);
  assert.match(globals, /background: #171717;/);
});

test("手机抽屉仍用完整侧栏，不被桌面收起态带成窄轨", () => {
  assert.match(appShell, /\{collapsed \? railBody : sidebarBody\}/);
  const drawerAt = appShell.indexOf("leo-safe-drawer");
  assert.ok(drawerAt > 0, "必须还有手机抽屉");
  const drawer = appShell.slice(drawerAt, appShell.indexOf("</aside>", drawerAt) + 8);
  assert.match(drawer, /\{sidebarBody\}/);
  assert.doesNotMatch(drawer, /railBody/);
});

test("收起后真画出图标轨，点「我的任务」会展开并露出任务列表", async () => {
  const require = createRequire(import.meta.url);
  const reactUrl = pathToFileURL(require.resolve("react")).href;
  const uiStubUrl = dataModule("export function useUI(){ return (value) => value; }");
  const iconsStubUrl = dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    function Icon(props){ return React.createElement("svg", { ...props, "aria-hidden": "true" }); }
    export const IconGift = Icon;
    export const IconPanel = Icon;
    export const IconSearch = Icon;
  `);
  const appShellUrl = await compileModule("src/shell/AppShell.tsx", {
    "next/link": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export default function Link({ children, href, ...props }) {
        return React.createElement("a", { ...props, href }, children);
      }
    `),
    "next/navigation": dataModule(`
      export function usePathname(){ return "/"; }
      export function useSearchParams(){ return new URLSearchParams(""); }
      export function useRouter(){
        return { push(){}, replace(){}, prefetch(){}, back(){}, forward(){}, refresh(){} };
      }
    `),
    "./ModelPicker": dataModule("export function ModelGroupPicker(){ return null; }"),
    "./icons": iconsStubUrl,
    "./account/SidebarAccountCluster": dataModule("export function SidebarAccountCluster(){ return null; }"),
    "./account/SettingsModalHost": dataModule("export function SettingsModalHost(){ return null; } export function openSettingsModal(){}"),
    "./messages/MessagesHost": dataModule("export function MessagesHost(){ return null; }"),
    "./WorkspaceSelection": dataModule(
      "export function WorkspaceSelectionProvider({ children }){ return children; }",
    ),
    "../theme": dataModule("export function ThemeSwitcher(){ return null; }"),
    "../i18n/LanguageSwitcher": dataModule(
      "export function LanguageSwitcher(){ return null; }",
    ),
    "../i18n/config": dataModule('export const LOCALES = ["en", "zh"];'),
    "../i18n/ui/useUI": uiStubUrl,
    "../lib/presence": dataModule("export function usePresenceHeartbeat(){}"),
    "../ui": dataModule(
      "export function ToastProvider({ children }){ return children; }\n" +
        "export function ButtonSpinner({ label }){ return label ?? null; }",
    ),
    "./MyAppsRail": dataModule("export function MyAppsRail(){ return null; }"),
  });
  const { AppShell } = await import(appShellUrl);

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
    url: "https://image.oceanleo.com/",
  });
  const { window } = dom;
  window.localStorage.setItem("oceanleo_sidebar_collapsed", "1");
  window.matchMedia = () => ({
    matches: true,
    addEventListener() {},
    removeEventListener() {},
  });
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
    getComputedStyle: window.getComputedStyle.bind(window),
    localStorage: window.localStorage,
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
      } else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const nav = [
    {
      label: "新建",
      href: "/",
      icon: React.createElement("span", { "data-icon": "home" }),
    },
    {
      label: "我的任务",
      href: "/history",
      icon: React.createElement("span", { "data-icon": "history" }),
      disclosure: {
        defaultOpen: false,
        render: () =>
          React.createElement("div", { "data-task-list": "true" }, "任务甲"),
      },
    },
  ];

  try {
    await act(async () =>
      root.render(
        React.createElement(
          AppShell,
          {
            brand: { name: "测试站", logo: React.createElement("span", null, "T"), accent: "#2563eb" },
            nav,
          },
          React.createElement("section", null, "正文"),
        ),
      ),
    );

    const aside = container.querySelector("[data-oceanleo-sidebar-mode]");
    assert.equal(aside?.getAttribute("data-oceanleo-sidebar-mode"), "rail");
    assert.ok(container.querySelector("[data-oceanleo-sidebar-rail-nav]"));
    const expand = container.querySelector("[data-oceanleo-sidebar-expand]");
    assert.ok(expand, "折叠轨顶上必须有展开键");
    assert.ok(
      expand.querySelector("[data-oceanleo-rail-brand]"),
      "展开键默认必须还带着站标",
    );
    assert.ok(
      expand.querySelector("[data-oceanleo-rail-expand-icon]"),
      "展开键里必须藏着展开图标，悬停才露出来",
    );
    assert.equal(
      aside.querySelectorAll("[data-oceanleo-sidebar-expand]").length,
      1,
      "折叠轨顶上只能有一颗展开键",
    );
    assert.equal(expand.getAttribute("title"), null);
    await act(async () =>
      expand.dispatchEvent(new window.Event("pointerover", { bubbles: true })),
    );
    const bubble = window.document.body.querySelector(
      "[data-oceanleo-rail-tip-bubble]",
    );
    assert.ok(bubble, "悬停必须出现黑底浮层，不能只靠浏览器 title");
    assert.equal(bubble.textContent, "展开侧栏");
    await act(async () =>
      expand.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
    assert.equal(
      container
        .querySelector("[data-oceanleo-sidebar-mode]")
        ?.getAttribute("data-oceanleo-sidebar-mode"),
      "expanded",
      "点顶上那颗合成键必须展开侧栏",
    );
    const collapse = [...container.querySelectorAll("button")].find(
      (el) => el.getAttribute("title") === "收起侧栏",
    );
    assert.ok(collapse, "展开后必须还能收起");
    await act(async () =>
      collapse.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );
    assert.equal(
      container
        .querySelector("[data-oceanleo-sidebar-mode]")
        ?.getAttribute("data-oceanleo-sidebar-mode"),
      "rail",
    );
    assert.ok(container.querySelector('[data-icon="home"]'));
    assert.ok(container.querySelector('[data-icon="history"]'));
    assert.equal(container.querySelector("[data-task-list]"), null);
    assert.equal(
      [...container.querySelectorAll("a,button")].some(
        (el) => el.textContent.trim() === "新建",
      ),
      false,
      "图标轨不该再画出栏目文字",
    );

    const history = container.querySelector(
      '[data-oceanleo-nav-disclosure="rail"]',
    );
    assert.ok(history, "我的任务必须还在图标轨上");
    await act(async () =>
      history.dispatchEvent(new window.MouseEvent("click", { bubbles: true })),
    );

    assert.equal(
      container
        .querySelector("[data-oceanleo-sidebar-mode]")
        ?.getAttribute("data-oceanleo-sidebar-mode"),
      "expanded",
    );
    assert.ok(
      container.querySelector("[data-task-list]"),
      "展开后必须露出任务列表",
    );
    assert.match(container.textContent, /任务甲/);
  } finally {
    await act(async () => root.unmount());
    for (const fn of restore.reverse()) fn();
  }
});
