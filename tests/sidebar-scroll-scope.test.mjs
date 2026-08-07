// 侧栏「哪一段跟着手指走」的三类行为（操作员 2026-08-07 原话，父裁决 §A5a）。
//
//   第 1 类 `oceanleo.com` 主站  —— 一行不改。它走自己的 clone-shell，
//                                   根本不吃这个外壳，所以这份用例里没有它。
//   第 2 类 其余 OceanLeo 系列站 —— 导航键一个都不动，只有下方历史区滚动。
//   第 3 类 asset / aitools      —— 整条侧栏一起滚，只有左下角账户按钮不动。
//
// 用例判的是**包含关系**而不是 class 字符串：滚不滚由「在不在那个滚动容器里」决定，
// 换一套 class 名不该让这份用例变绿。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiStubUrl = dataModule("export function useUI(){ return (value) => value; }");
const iconsStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  function Icon(props){ return React.createElement("svg", { ...props, "aria-hidden": "true" }); }
  export const IconCheck = Icon;
  export const IconChevronDown = Icon;
  export const IconGift = Icon;
  export const IconPanel = Icon;
  export const IconSearch = Icon;
`);
const navigationStubUrl = dataModule(`
  export function usePathname(){ return "/"; }
  export function useSearchParams(){ return new URLSearchParams(""); }
`);
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ children, href, ...props }) {
    return React.createElement("a", { ...props, href }, children);
  }
`);

const appShellUrl = await compileModule("src/shell/AppShell.tsx", {
  "next/link": linkStubUrl,
  "next/navigation": navigationStubUrl,
  "./ModelPicker": dataModule("export function ModelGroupPicker(){ return null; }"),
  "./icons": iconsStubUrl,
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
});
const { AppShell } = await import(appShellUrl);

const brand = {
  name: "测试站",
  logo: React.createElement("span", null, "T"),
  accent: "#2563eb",
};

/** 两组导航：一组带小标题，一组不带。分组小标题不许在改法里丢掉。 */
const NAV_GROUPS = [
  {
    heading: "素材类型",
    items: [
      { label: "图片", href: "/", icon: null },
      { label: "矢量图", href: "/vector", icon: null },
      { label: "视频", href: "/video", icon: null },
      { label: "音频", href: "/audio", icon: null },
    ],
  },
  {
    items: [
      { label: "我的素材库", href: "/collection", icon: null },
      { label: "授权说明", href: "/licenses", icon: null },
    ],
  },
];

const RECENT = React.createElement(
  "div",
  { "data-test-recent": "true" },
  "昨天的会话",
);

function renderShell(extraProps = {}) {
  return renderToStaticMarkup(
    React.createElement(
      AppShell,
      {
        brand,
        navGroups: NAV_GROUPS,
        recentSlot: RECENT,
        userEmail: "someone@oceanleo.com",
        credits: 12.5,
        ...extraProps,
      },
      React.createElement("section", null, "Body"),
    ),
  );
}

/**
 * 带某个标记的那个 `<div>` 的完整片段（含自身）。
 *
 * 判「滚不滚」只能判包含关系：一段内容在不在那个 `overflow-y-auto` 容器里，
 * 决定它会不会跟着手指走。按出现顺序判会把「排在滚动区后面」误当成「不在里面」。
 */
function elementHtml(markup, marker) {
  const at = markup.indexOf(marker);
  assert.ok(at >= 0, `渲染结果里没有 ${marker}`);
  const start = markup.lastIndexOf("<div", at);
  assert.ok(start >= 0, `${marker} 不在一个 <div> 上`);
  let depth = 0;
  let cursor = start;
  while (cursor < markup.length) {
    const open = markup.indexOf("<div", cursor + 1);
    const close = markup.indexOf("</div>", cursor + 1);
    assert.ok(close >= 0, `${marker} 的 <div> 没有闭合`);
    if (open >= 0 && open < close) {
      depth += 1;
      cursor = open;
      continue;
    }
    if (depth === 0) return markup.slice(start, close + "</div>".length);
    depth -= 1;
    cursor = close;
  }
  throw new Error(`${marker} 的 <div> 没有闭合`);
}

const NAV_LABELS = NAV_GROUPS.flatMap((group) =>
  group.items.map((item) => item.label),
);
const ACCOUNT_NAME = "someone";
const CREDITS = "¥12.50";

test("第 2 类（默认）：导航键一个都不动，只有下方历史区滚动", () => {
  const html = renderShell();
  const fixedNav = elementHtml(html, "data-oceanleo-pinned-nav");
  const scrollArea = elementHtml(html, "data-oceanleo-scroll-nav");

  // 全部导航键都在不动的那一块里 —— 不再是「只钉前三个」。
  for (const label of NAV_LABELS) {
    assert.ok(fixedNav.includes(label), `导航项「${label}」没有留在固定区`);
    assert.ok(
      !scrollArea.includes(label),
      `导航项「${label}」还在滚动区里，会跟着历史一起上下移动`,
    );
  }
  // 分组小标题不许在改法里丢掉。
  assert.ok(fixedNav.includes("素材类型"));

  // 唯一跟着手指走的是历史区。
  assert.ok(scrollArea.includes('data-test-recent="true"'));
  assert.ok(!scrollArea.includes(ACCOUNT_NAME));
  assert.ok(!scrollArea.includes(CREDITS));
});

test("第 3 类：整条侧栏一起滚，只有左下角账户按钮不动", () => {
  const html = renderShell({ sidebarScroll: "whole", onSearch: () => {} });
  const scrollArea = elementHtml(html, 'data-oceanleo-sidebar-scroll="whole"');

  // 品牌、搜索、全部导航、历史、余额 —— 一整块一起走。
  assert.ok(scrollArea.includes("测试站"), "站名没有跟着侧栏一起滚");
  assert.ok(scrollArea.includes("搜索..."), "搜索框没有跟着侧栏一起滚");
  for (const label of NAV_LABELS) {
    assert.ok(scrollArea.includes(label), `导航项「${label}」没有跟着侧栏一起滚`);
  }
  assert.ok(scrollArea.includes('data-test-recent="true"'));
  assert.ok(scrollArea.includes(CREDITS), "token 余额没有跟着侧栏一起滚");

  // 唯一不动的那一颗：左下角账户按钮，必须留在滚动容器**外面**。
  assert.ok(
    !scrollArea.includes(ACCOUNT_NAME),
    "账户按钮被卷进了滚动区，滚起来就不在左下角了",
  );
  const pinnedAccount = elementHtml(html, "data-oceanleo-pinned-account");
  assert.ok(pinnedAccount.includes(ACCOUNT_NAME));

  // 整体滚动模式下没有第二块固定导航区。
  assert.ok(!html.includes("data-oceanleo-pinned-nav"));
});

test("两类站的账户按钮都还在，退出登录仍然只在账户页里", () => {
  for (const props of [{}, { sidebarScroll: "whole" }]) {
    const html = renderShell(props);
    assert.ok(html.includes(ACCOUNT_NAME));
    assert.ok(!html.includes("退出登录"));
  }
});
