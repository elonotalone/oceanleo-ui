// AccountPage / SettingsPage 判据（W11）。
//
// 这两个组件是 36 个 consumer 的单一事实源，且刚从 32 站 302 行分叉吸收成超集。
// 所以断言全部**按值**做：数到第三格统计的文案与数字、按 target 属性区分外链、
// 点「登录」后必须出现登录框而不是跳首页。变异验证见文件末尾注释。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

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
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/account",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  InputEvent: window.InputEvent,
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

const reactUrl = pathToFileURL(require.resolve("react")).href;

// 词典对 W11 是只读的（i18n 归 W10），这里用恒等 tt 让断言直接读中文原文。
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);

// 全部 auth 读经由 globalThis.__authStub，单测之间可换场景。
const authStubUrl = dataModule(`
  const s = () => globalThis.__authStub;
  export function oceanleoConfigured() { return s().configured; }
  export function browserClient() { return s().configured ? s().client : null; }
  export async function getUserEmail() { return s().email; }
  export async function getCredits() { return s().credits; }
  export async function getCreditHistory(limit) {
    s().creditHistoryLimit = limit;
    return s().history;
  }
  export async function getUsageBySite(days) {
    s().usageDays = days;
    s().usageCalls = (s().usageCalls || 0) + 1;
    return s().usage;
  }
  export async function signOutEverywhere() { s().signedOut = true; }
  // 「登不上时说什么」的单一事实源（真身在 src/lib/auth/config.ts）。桩按场景给：
  // 不给就退回真身在非 cn 家族下的那两句。
  export function loginUnavailableNotice() {
    return s().notice === undefined
      ? { title: "登录服务尚未配置", detail: "本站还没有接入 OceanLeo 登录服务，请联系管理员。" }
      : s().notice;
  }
`);

const confirmStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, body, onConfirm }) {
    return React.createElement(
      "div",
      { "data-testid": "confirm-dialog" },
      React.createElement("p", null, title),
      React.createElement("p", null, body),
      React.createElement("button", { onClick: onConfirm }, "confirm"),
    );
  }
`);

// W10 的 AuthDialog 由本仓 src/pages/AuthDialog.tsx 提供；这里只按契约 stub
// （onClose / onSuccess），绝不复制其实现。
const authDialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AuthDialog({ onClose, onSuccess }) {
    globalThis.__authDialogMounts = (globalThis.__authDialogMounts || 0) + 1;
    return React.createElement(
      "div",
      { "data-testid": "auth-dialog" },
      React.createElement("button", { onClick: onSuccess }, "ok"),
      React.createElement("button", { onClick: onClose }, "close"),
    );
  }
`);

const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ href, children, ...rest }) {
    return React.createElement("a", { href, "data-next-link": "1", ...rest }, children);
  }
`);

const pageHeaderStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PageHeader({ title }) {
    return React.createElement("h1", null, title);
  }
`);

const COMPONENT_STUBS = {
  "next/link": linkStubUrl,
  "../lib/auth": authStubUrl,
  "../ui": confirmStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./AuthDialog": authDialogStubUrl,
  "./PageHeader": pageHeaderStubUrl,
};

/** 本文件所有组件共用这套替身；每次调用还能再补几条。 */
const compileComponent = (relativePath, additional = {}) =>
  compileModule(relativePath, { ...COMPONENT_STUBS, ...additional });

const { AccountPage } = await import(await compileComponent("src/pages/AccountPage.tsx"));
const { SettingsPage } = await import(await compileComponent("src/pages/SettingsPage.tsx"));

function signedInStub(overrides = {}) {
  return {
    configured: true,
    email: "designer@oceanleo.com",
    credits: { ok: true, data: { balance_yuan: 12.5 } },
    history: {
      ok: true,
      data: {
        events: [
          { amount_yuan: -3.25, created_at: new Date().toISOString() },
          { amount_yuan: 100, created_at: new Date().toISOString() },
        ],
      },
    },
    usage: { ok: true, data: { total: { requests: 1234 } } },
    client: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
    ...overrides,
  };
}

async function render(element, stub) {
  globalThis.__authStub = stub;
  globalThis.__authDialogMounts = 0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  // 冲刷组件内串行的 await 链（email → credits → history → usage）。
  for (let i = 0; i < 6; i += 1) await act(async () => {});
  return {
    host,
    text: () => host.textContent || "",
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      for (let i = 0; i < 3; i += 1) await act(async () => {});
    },
    buttonByText(label) {
      return [...host.querySelectorAll("button")].find(
        (b) => (b.textContent || "").trim() === label,
      );
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/* ---------- 超集第 1 项：第三格统计「近 30 天请求」 ---------- */

test("三格统计的第三格是「近 30 天请求」，取 getUsageBySite(30) 的真实值", async () => {
  const stub = signedInStub();
  const view = await render(React.createElement(AccountPage), stub);
  const cards = [...view.host.querySelectorAll(".grid > div")];
  assert.equal(cards.length, 3);
  assert.equal(cards[0].textContent, "¥12.50token 余额");
  assert.equal(cards[1].textContent, "¥3.25本月消耗");
  assert.equal(cards[2].textContent, "1,234近 30 天请求");
  assert.equal(stub.usageDays, 30);
  view.cleanup();
});

test("showRequestStat=false 时第三格让位给 extraStats（主站的「任务数」）", async () => {
  const stub = signedInStub();
  const view = await render(
    React.createElement(AccountPage, {
      showRequestStat: false,
      extraStats: [{ value: 42, label: "任务数" }],
    }),
    stub,
  );
  const cards = [...view.host.querySelectorAll(".grid > div")];
  assert.equal(cards.length, 3);
  assert.equal(cards[2].textContent, "42任务数");
  assert.ok(!view.text().includes("近 30 天请求"));
  // 关掉就不该再打这个网关请求。
  assert.equal(stub.usageCalls ?? 0, 0);
  view.cleanup();
});

/* ---------- 超集第 2 项：用户卡片「免费计划」 ---------- */

test("用户卡片默认带「免费计划」标签，planLabel=null 才隐藏", async () => {
  const shown = await render(React.createElement(AccountPage), signedInStub());
  assert.ok(shown.text().includes("免费计划"));
  shown.cleanup();

  const hidden = await render(
    React.createElement(AccountPage, { planLabel: null }),
    signedInStub(),
  );
  assert.ok(!hidden.text().includes("免费计划"));
  hidden.cleanup();
});

/* ---------- 超集第 3 项：菜单项 external 外链 ---------- */

test("菜单项 external 走原生 <a target=_blank>，内链走 next/link", async () => {
  const view = await render(
    React.createElement(AccountPage, {
      menuItems: [
        { label: "账户设置", href: "/settings", desc: "个人资料" },
        {
          label: "插件与连接器",
          href: "https://oceanleo.com/plugins",
          desc: "技能、连接器与 MCP 服务器",
          external: true,
        },
      ],
    }),
    signedInStub(),
  );
  const internal = view.host.querySelector('a[href="/settings"]');
  const external = view.host.querySelector('a[href="https://oceanleo.com/plugins"]');
  assert.equal(internal.getAttribute("data-next-link"), "1");
  assert.equal(internal.getAttribute("target"), null);
  assert.equal(external.getAttribute("data-next-link"), null);
  assert.equal(external.getAttribute("target"), "_blank");
  assert.equal(external.getAttribute("rel"), "noopener noreferrer");
  view.cleanup();
});

/* ---------- 超集第 4 项：oceanleoConfigured() 为假 ---------- */

test("登不上时说明原因，而不是渲染一个必然失败的登录入口", async () => {
  const view = await render(
    React.createElement(AccountPage),
    signedInStub({ configured: false }),
  );
  assert.ok(view.text().includes("登录服务尚未配置"));
  assert.equal(view.buttonByText("登录"), undefined);
  assert.equal(view.host.querySelector('[data-testid="auth-dialog"]'), null);
  view.cleanup();
});

// 2026-08-19 操作员截图 oceanleo.cn/account：页面上是「缺少 Supabase 环境变量」。
// 境内登不上不是故障（境内版按「暂不开放注册」上线），所以文案由
// loginUnavailableNotice() 按家族给，这一页只管照它渲染 —— 一个字都不许再提环境变量。
test("境内版给的是「还没开放」这句人话，不提环境变量", async () => {
  const view = await render(
    React.createElement(AccountPage),
    signedInStub({
      configured: false,
      notice: {
        title: "境内版还没有开放注册和登录",
        detail: "现在可以照常浏览公开内容；开放注册要等备案与审核走完，开放时会在首页说明。",
      },
    }),
  );
  const text = view.text();
  assert.ok(text.includes("境内版还没有开放注册和登录"));
  assert.ok(text.includes("现在可以照常浏览公开内容"));
  assert.equal(text.includes("Supabase"), false);
  assert.equal(text.includes("环境变量"), false);
  view.cleanup();
});

/* ---------- 操作员点名的缺陷：登录按钮必须就地起作用 ---------- */

test("未登录且没传 onSignInClick 时，点「登录」就地打开 AuthDialog，不跳首页", async () => {
  const view = await render(
    React.createElement(AccountPage),
    signedInStub({ email: null }),
  );
  assert.ok(view.text().includes("尚未登录"));
  // 死路的两个形态：跳首页的 CTA、以及点了什么都不发生。
  assert.ok(!view.text().includes("返回首页登录"));
  assert.equal(view.host.querySelector('a[href="/"]'), null);

  const button = view.buttonByText("登录");
  assert.ok(button);
  assert.equal(view.host.querySelector('[data-testid="auth-dialog"]'), null);
  await view.click(button);
  assert.ok(view.host.querySelector('[data-testid="auth-dialog"]'));
  assert.equal(globalThis.__authDialogMounts > 0, true);
  view.cleanup();
});

test("传了 onSignInClick 时用站点自己的实现，不再叠一个共享登录框", async () => {
  let calls = 0;
  const view = await render(
    React.createElement(AccountPage, { onSignInClick: () => { calls += 1; } }),
    signedInStub({ email: null }),
  );
  await view.click(view.buttonByText("登录"));
  assert.equal(calls, 1);
  assert.equal(view.host.querySelector('[data-testid="auth-dialog"]'), null);
  view.cleanup();
});

test("登录成功后回调 onSignedIn（站点据此刷新，而不是留在空态）", async () => {
  let signedIn = 0;
  const view = await render(
    React.createElement(AccountPage, { onSignedIn: () => { signedIn += 1; } }),
    signedInStub({ email: null }),
  );
  await view.click(view.buttonByText("登录"));
  const ok = [...view.host.querySelectorAll('[data-testid="auth-dialog"] button')][0];
  await view.click(ok);
  assert.equal(signedIn, 1);
  assert.equal(view.host.querySelector('[data-testid="auth-dialog"]'), null);
  view.cleanup();
});

/* ---------- 退出登录 ---------- */

test("退出登录走 signOutEverywhere（全家桶一起退），并回调 onSignedOut", async () => {
  const stub = signedInStub();
  let out = 0;
  const view = await render(
    React.createElement(AccountPage, { onSignedOut: () => { out += 1; } }),
    stub,
  );
  await view.click(view.buttonByText("退出登录"));
  const dialog = view.host.querySelector('[data-testid="confirm-dialog"]');
  assert.ok(dialog.textContent.includes("这将退出全部 OceanLeo 站点。"));
  await view.click(dialog.querySelector("button"));
  assert.equal(stub.signedOut, true);
  assert.equal(out, 1);
  view.cleanup();
});

/* ---------- SettingsPage 与 AccountSettings.tsx(121 行) 对齐 ---------- */

test("SettingsPage 登不上时说明原因", async () => {
  const view = await render(
    React.createElement(SettingsPage),
    signedInStub({ configured: false }),
  );
  assert.ok(view.text().includes("登录服务尚未配置"));
  assert.ok(!view.text().includes("个人资料"));
  view.cleanup();
});

test("SettingsPage 未登录时给明确提示，而不是一张邮箱为「—」的空卡片", async () => {
  const view = await render(
    React.createElement(SettingsPage),
    signedInStub({ email: null }),
  );
  assert.ok(view.text().includes("请先登录后再管理账户设置。"));
  assert.ok(!view.text().includes("个人资料"));
  view.cleanup();
});

test("SettingsPage 默认带「知识库」入口，knowledgeBaseLink=false 时让位给 extraSections", async () => {
  const withLink = await render(React.createElement(SettingsPage), signedInStub());
  assert.ok(withLink.text().includes("前往主站管理知识库 →"));
  assert.ok(withLink.text().includes("designer@oceanleo.com"));
  withLink.cleanup();

  const own = await render(
    React.createElement(SettingsPage, {
      knowledgeBaseLink: false,
      extraSections: React.createElement("section", null, "主站真·知识库"),
    }),
    signedInStub(),
  );
  assert.ok(!own.text().includes("前往主站管理知识库 →"));
  assert.ok(own.text().includes("主站真·知识库"));
  own.cleanup();
});

// ---------------------------------------------------------------------------
// 变异验证（2026-07-29 实跑，每条改完必须复原）：
//   1. AccountPage 的 showRequestStat 默认值改成 false
//      → 「三格统计的第三格是「近 30 天请求」」失败：cards.length 2 !== 3
//   2. 把 onSignInClick ?? (() => setShowAuth(true)) 改回裸 onSignInClick
//      → 「点「登录」就地打开 AuthDialog」失败：auth-dialog 仍为 null
//   3. 把 resolvedPlanLabel 改成恒等于 planLabel（丢默认「免费计划」）
//      → 「用户卡片默认带「免费计划」标签」失败
//   4. 把 external 分支删掉、统一走 Link
//      → 「菜单项 external 走原生 <a target=_blank>」失败：target 为 null
//   5. 去掉 SettingsPage 的 !configured 早返回
//      → 「SettingsPage 未配置 Supabase 时说明原因」失败
// ---------------------------------------------------------------------------
