// SettingsHub 两栏设置中心（W3）。
// 默认 /settings 左列 3 组、右侧通用；tab=account 不含组织文案；tab=org 才有。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
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
  url: "https://oceanleo.com/settings",
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

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\{(\\w+)\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);
const authStubUrl = dataModule(`
  const s = () => globalThis.__authStub;
  export function oceanleoConfigured() { return s().configured; }
  export function browserClient() { return s().configured ? s().client : null; }
  export async function getUserEmail() { return s().email; }
  export async function getCredits() { return s().credits; }
  export async function getCreditHistory() { return s().history; }
  export async function getUsageBySite() { return s().usage; }
  export async function signOutEverywhere() { s().signedOut = true; }
  export function loginUnavailableNotice() {
    return { title: "登录服务尚未配置", detail: "本站还没有接入 OceanLeo 登录服务，请联系管理员。" };
  }
  export function isPasswordResetLanding(href) {
    return /[?&]reset=1(?:[&#]|$)/.test((href || "").trim());
  }
`);
const confirmStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, onConfirm }) {
    return React.createElement("div", { "data-testid": "confirm-dialog" },
      React.createElement("button", { onClick: onConfirm }, title));
  }
`);
const linkStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ href, children, ...rest }) {
    return React.createElement("a", { href, "data-next-link": "1", ...rest }, children);
  }
`);
const navigationStubUrl = dataModule(`
  export function useRouter() {
    return {
      replace(href) {
        const url = new URL(String(href), window.location.origin);
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      },
      push() {}, refresh() {}, back() {}, prefetch() {},
    };
  }
  export function usePathname() { return "/"; }
  export function useSearchParams() { return new URLSearchParams(""); }
`);
const generalStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function GeneralSettingsBody() {
    return React.createElement("div", { "data-testid": "general-body" }, "语言与主题");
  }
  export function GeneralPage() {
    return React.createElement("div", null, "通用页");
  }
`);
const securityStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AccountSecurityPage() {
    return React.createElement("div", { "data-testid": "security-panel" }, "security");
  }
`);
const orgStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function OrgMembership() {
    return React.createElement("div", { "data-testid": "org-membership" },
      "创建组织", "《OceanLeo 企业服务协议》");
  }
`);
const authDialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AuthDialog() {
    return React.createElement("div", { "data-testid": "auth-dialog" });
  }
`);
const resetStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PasswordResetPage() {
    return React.createElement("div", { "data-testid": "reset-page" });
  }
`);
const paneStub = (exportName, testId) => dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ${exportName}() {
    return React.createElement("div", { "data-testid": ${JSON.stringify(testId)} });
  }
`);

const hubUrl = await compileModule("src/pages/settings/SettingsHub.tsx", {
  "next/link": linkStubUrl,
  "next/navigation": navigationStubUrl,
  "../../lib/auth": authStubUrl,
  "../../ui": confirmStubUrl,
  "../../i18n/ui/useUI": uiStubUrl,
  "../AuthDialog": authDialogStubUrl,
  "../PasswordResetPage": resetStubUrl,
  "../GeneralPage": generalStubUrl,
  "../AccountSecurityPage": securityStubUrl,
  "../OrgMembership": orgStubUrl,
  "../ApiPage": paneStub("ApiPage", "pane-api"),
  "../DevicesPage": paneStub("DevicesPage", "pane-devices"),
  "../PluginsPage": paneStub("PluginsPage", "pane-plugins"),
  "./personalization/PersonalizationSection": paneStub("PersonalizationSection", "pane-personalization"),
});
const { SettingsHub } = await import(hubUrl);

const accountUrl = await compileModule("src/pages/AccountPage.tsx", {
  "next/link": linkStubUrl,
  "next/navigation": navigationStubUrl,
  "../lib/auth": authStubUrl,
  "../ui": confirmStubUrl,
  "../i18n/ui/useUI": uiStubUrl,
  "./AuthDialog": authDialogStubUrl,
  "./PasswordResetPage": resetStubUrl,
  "./GeneralPage": generalStubUrl,
  "./AccountSecurityPage": securityStubUrl,
  "./OrgMembership": orgStubUrl,
  "./ApiPage": paneStub("ApiPage", "pane-api"),
  "./DevicesPage": paneStub("DevicesPage", "pane-devices"),
  "./PluginsPage": paneStub("PluginsPage", "pane-plugins"),
  "./settings/personalization/PersonalizationSection": paneStub("PersonalizationSection", "pane-personalization"),
});
const { AccountPage } = await import(accountUrl);

function signedIn() {
  return {
    configured: true,
    email: "designer@oceanleo.com",
    credits: { ok: true, data: { balance_yuan: 12.5 } },
    history: { ok: true, data: { events: [] } },
    usage: { ok: true, data: { total: { requests: 3 } } },
    client: {
      auth: {
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    },
  };
}

async function render(element) {
  globalThis.__authStub = signedIn();
  window.history.replaceState(null, "", "/settings");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
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
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("默认 /settings 渲染左列 3 个分组且右侧是通用", async () => {
  const view = await render(React.createElement(SettingsHub));
  assert.ok(view.host.querySelector("[data-settings-group=settings]"));
  assert.ok(view.host.querySelector("[data-settings-group=capabilities]"));
  assert.ok(view.host.querySelector("[data-settings-group=data]"));
  assert.ok(view.host.querySelector("[data-testid=general-body]"));
  assert.ok(view.text().includes("语言与主题"));
  assert.equal(view.host.querySelector("[data-testid=security-panel]"), null);
  view.cleanup();
});

test("tab=account 有安全内容与退出，不含创建组织或企业服务协议", async () => {
  const view = await render(React.createElement(SettingsHub, { defaultTab: "account" }));
  assert.ok(view.host.querySelector("[data-testid=security-panel]"));
  assert.ok(view.text().includes("退出登录"));
  assert.equal(view.text().includes("创建组织"), false);
  assert.equal(view.text().includes("企业服务协议"), false);
  view.cleanup();
});

test("tab=org 含 OrgMembership", async () => {
  const view = await render(React.createElement(SettingsHub, { defaultTab: "org" }));
  assert.ok(view.host.querySelector("[data-testid=org-membership]"));
  assert.ok(view.text().includes("创建组织"));
  view.cleanup();
});

test("AccountPage 不传 props 时默认 account 栏", async () => {
  const view = await render(React.createElement(AccountPage));
  assert.ok(view.host.querySelector("[data-settings-item=account][aria-current=page]"));
  assert.ok(view.host.querySelector("[data-testid=security-panel]"));
  view.cleanup();
});

test("menu 自定义项出现在能力分组", async () => {
  const view = await render(
    React.createElement(SettingsHub, {
      menu: [{ label: "自定义能力", href: "/workspace", desc: "工作台" }],
    }),
  );
  const cap = view.host.querySelector("[data-settings-group=capabilities] a[href='/workspace']");
  assert.ok(cap);
  assert.ok((cap.textContent || "").includes("自定义能力"));
  view.cleanup();
});

test("AppShell 默认账户链接是 /settings 且 oceanleo 站导航里没有云电脑", () => {
  const src = readFileSync(new URL("../src/shell/AppShell.tsx", import.meta.url), "utf8");
  assert.match(src, /accountHref = "\/settings"/);
  assert.doesNotMatch(src, /CloudComputerNavIcon/);
  assert.doesNotMatch(src, /href: "\/computers"/);
  assert.doesNotMatch(src, /tt\("云电脑"\)/);
});
