// W7：账户子路径、左栏仍高亮账户、SettingsNav 用 displayName、首页不再嵌设备块。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/account-settings-routing.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  accountSettingsPath,
  accountSettingsView,
  isSettingsPathname,
  settingsPath,
  tabFromSettingsLocation,
} from "../src/pages/settings/settings-tabs.ts";

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
  url: "https://oceanleo.com/settings/account",
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
  export async function getUserId() {
    if (s().userId !== undefined) return s().userId;
    return s().email ? "user-1" : null;
  }
  export async function getCredits() { return s().credits; }
  export async function getCreditHistory() { return s().history; }
  export async function getUsageBySite() { return s().usage; }
  export async function signOutEverywhere() { s().signedOut = true; }
  export async function getAccountProfile() {
    if (s().profileBox) return s().profileBox;
    return {
      profile: {
        userId: "user-1",
        displayName: s().displayName || "",
        sessionContact: { kind: "email", value: s().email || "", provider: "email" },
        identities: [],
        deviceLabels: {},
      },
    };
  }
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
  export function Modal({ children, labelledBy }) {
    return React.createElement("div", { role: "dialog", "data-modal": "", "aria-labelledby": labelledBy || undefined }, children);
  }
  export function ButtonSpinner() { return null; }
`);
const paneStub = (exportName, testId) => dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ${exportName}() {
    return React.createElement("div", { "data-testid": ${JSON.stringify(testId)} });
  }
`);
const accountHomeStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AccountHome(props) {
    return React.createElement(
      "div",
      { "data-settings-pane": "account", "data-account-home": "" },
      React.createElement("button", { "data-open-sign-in": "", onClick: props.onOpenSignInMethods }, "管理登录"),
      React.createElement("button", { "data-open-devices": "", onClick: props.onOpenDevices }, "管理设备"),
      React.createElement("button", {
        "data-rename": "",
        onClick: () => props.onProfileChange?.({
          ...(props.profile || {}),
          displayName: "Ada",
        }),
      }, "rename"),
    );
  }
  export default AccountHome;
`);
const signInStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function SignInMethodsPage() {
    return React.createElement("div", { "data-sign-in-methods": "" }, "sign-in");
  }
  export default SignInMethodsPage;
`);
const loginDevicesStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function LoginDevicesPage() {
    return React.createElement("div", { "data-login-devices": "" }, "devices");
  }
  export default LoginDevicesPage;
`);
const securityStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AccountSecurityPage(props) {
    return React.createElement("div", {
      "data-testid": "security-panel",
      "data-security-blocks": props.blocks || "all",
    }, "security");
  }
  export function ChangePasswordBlock() {
    return React.createElement("div", { "data-security-section": "password" });
  }
  export function TwoStepBlock() {
    return React.createElement("div", { "data-security-section": "two-step" });
  }
`);

const hubUrl = await compileModule("src/pages/settings/SettingsHub.tsx", {
  "../../lib/auth": authStubUrl,
  "../../ui": confirmStubUrl,
  "../../i18n/ui/useUI": uiStubUrl,
  "../AuthDialog": paneStub("AuthPanel", "auth-panel"),
  "../PasswordResetPage": paneStub("PasswordResetPage", "reset-page"),
  "../GeneralPage": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function GeneralSettingsBody() {
      return React.createElement("div", { "data-testid": "general-body" }, "语言与主题");
    }
  `),
  "../AccountSecurityPage": securityStub,
  "../OrgMembership": paneStub("OrgMembership", "org-membership"),
  "../OrgPage": paneStub("OrgPage", "org-page"),
  "../ApiPage": paneStub("ApiPage", "pane-api"),
  "../DevicesPage": paneStub("DevicesPage", "pane-devices"),
  "../PluginsPage": paneStub("PluginsPage", "pane-plugins"),
  "./personalization/PersonalizationSection": paneStub("PersonalizationSection", "pane-personalization"),
  "./mail/MailSection": paneStub("MailSection", "pane-mail"),
  "./sections/BillingSection": paneStub("BillingSection", "pane-billing"),
  "./sections/UsageDetailsSection": paneStub("UsageDetailsSection", "pane-usage-details"),
  "./sections/TopUpSection": paneStub("TopUpSection", "pane-topup"),
  "../account/AccountHome": accountHomeStub,
  "../account/SignInMethodsPage": signInStub,
  "../account/LoginDevicesPage": loginDevicesStub,
});
const { SettingsHub } = await import(hubUrl);

const navUrl = await compileModule("src/pages/settings/SettingsNav.tsx");
const { SettingsNav } = await import(navUrl);

function signedIn() {
  return {
    configured: true,
    email: "designer@oceanleo.com",
    displayName: "Ada Lovelace",
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

async function renderHub(path = "/settings/account") {
  globalThis.__authStub = signedIn();
  window.history.replaceState(null, "", path);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(SettingsHub, { defaultTab: "account" }));
  });
  for (let i = 0; i < 8; i += 1) await act(async () => {});
  return {
    host,
    text: () => host.textContent || "",
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      for (let i = 0; i < 4; i += 1) await act(async () => {});
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("tabFromSettingsLocation：账户子页的 nav tab 仍是 account", () => {
  assert.equal(
    tabFromSettingsLocation("https://oceanleo.com/settings/account/login-devices"),
    "account",
  );
  assert.equal(
    tabFromSettingsLocation("https://oceanleo.com/settings/account/sign-in-methods"),
    "account",
  );
  assert.equal(
    tabFromSettingsLocation("https://oceanleo.com/settings/account/security"),
    "account",
  );
  assert.equal(tabFromSettingsLocation("https://oceanleo.com/settings/account"), "account");
  assert.equal(tabFromSettingsLocation("https://oceanleo.com/settings/org"), "team");
  assert.equal(tabFromSettingsLocation("https://oceanleo.com/settings/team"), "team");
});

test("accountSettingsView 解析四种子页", () => {
  assert.equal(accountSettingsView("https://oceanleo.com/settings/account"), "home");
  assert.equal(
    accountSettingsView("https://oceanleo.com/settings/account/sign-in-methods"),
    "sign-in-methods",
  );
  assert.equal(
    accountSettingsView("https://oceanleo.com/settings/account/login-devices"),
    "login-devices",
  );
  assert.equal(accountSettingsView("https://oceanleo.com/settings/account/security"), "security");
  assert.equal(accountSettingsView("https://oceanleo.com/settings/billing"), "home");
});

test("settingsPath 与 accountSettingsPath 写出子 path，不把斜杠编成 %2F", () => {
  assert.equal(
    settingsPath("account/login-devices", "https://oceanleo.com/"),
    "/settings/account/login-devices",
  );
  assert.equal(
    settingsPath("account/sign-in-methods", "https://oceanleo.com/"),
    "/settings/account/sign-in-methods",
  );
  assert.equal(accountSettingsPath("home", "https://oceanleo.com/"), "/settings/account");
  assert.equal(
    accountSettingsPath("login-devices", "https://oceanleo.com/"),
    "/settings/account/login-devices",
  );
  assert.equal(
    accountSettingsPath("security", "https://oceanleo.com/?x=1"),
    "/settings/account/security?x=1",
  );
  assert.doesNotMatch(settingsPath("account/login-devices", "https://oceanleo.com/"), /%2F/i);
});

test("isSettingsPathname 接受两段账户子 path", () => {
  assert.equal(isSettingsPathname("/settings/account"), true);
  assert.equal(isSettingsPathname("/settings/account/login-devices"), true);
  assert.equal(isSettingsPathname("/settings/account/sign-in-methods/"), true);
  assert.equal(isSettingsPathname("/settings/ai-models"), true);
  assert.equal(isSettingsPathname("/account"), false);
});

test("settingsPath(account) 规范化时保留当前子页，避免 SettingsModalHost 裁掉 login-devices", () => {
  assert.equal(
    settingsPath("account", "https://oceanleo.com/settings/account/login-devices"),
    "/settings/account/login-devices",
  );
  assert.equal(settingsPath("account", "https://oceanleo.com/"), "/settings/account");
});

test("SettingsNav：displayName 优先，邮箱前缀仅回落", async () => {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const groups = [
    { id: "settings", label: "设置", items: [{ id: "account", group: "settings", label: "账户" }] },
  ];
  await act(async () => {
    root.render(
      React.createElement(SettingsNav, {
        groups,
        activeId: "account",
        onSelect() {},
        displayName: "Ada Lovelace",
        userEmail: "designer@oceanleo.com",
      }),
    );
  });
  assert.equal(host.querySelector("[data-settings-nav-name]").textContent, "Ada Lovelace");
  assert.equal(host.textContent.includes("免费计划"), false);
  await act(async () => {
    root.render(
      React.createElement(SettingsNav, {
        groups,
        activeId: "account",
        onSelect() {},
        displayName: "",
        userEmail: "designer@oceanleo.com",
      }),
    );
  });
  assert.equal(host.querySelector("[data-settings-nav-name]").textContent, "designer");
  act(() => root.unmount());
  host.remove();
});

test("账户子页左栏仍高亮账户，不把 login-devices 做成左栏项，返回键写回 /settings/account", async () => {
  const view = await renderHub("/settings/account/login-devices");
  const accountItem = view.host.querySelector("[data-settings-item=account]");
  assert.equal(accountItem.getAttribute("aria-current"), "page");
  assert.equal(view.host.querySelector("[data-settings-item=login-devices]"), null);
  assert.equal(view.host.querySelector("[data-settings-item=sign-in-methods]"), null);
  assert.ok(view.host.querySelector("[data-login-devices]"));
  assert.ok(view.text().includes("已连接的设备"));
  const back = view.host.querySelector("[data-settings-back]");
  assert.ok(back);
  await view.click(back);
  assert.equal(window.location.pathname, "/settings/account");
  assert.ok(view.host.querySelector("[data-account-home]"));
  view.cleanup();
});

test("从账户首页点管理写出 sign-in-methods，左栏仍是账户，底下接到安全块", async () => {
  const view = await renderHub("/settings/account");
  assert.equal(view.host.querySelector('[data-security-section="devices"]'), null);
  assert.ok(view.host.querySelector("[data-account-home]"));
  await view.click(view.host.querySelector("[data-open-sign-in]"));
  assert.equal(window.location.pathname, "/settings/account/sign-in-methods");
  assert.equal(
    view.host.querySelector("[data-settings-item=account]").getAttribute("aria-current"),
    "page",
  );
  assert.ok(view.host.querySelector("[data-sign-in-methods]"));
  assert.equal(view.host.querySelector("[data-testid=security-panel]").getAttribute("data-security-blocks"), "credentials");
  assert.ok(view.text().includes("管理登录方式"));
  view.cleanup();
});

test("AccountHome 改名立刻反映到设置左上角", async () => {
  const view = await renderHub("/settings/account");
  const name = view.host.querySelector("[data-settings-nav-name]");
  assert.equal(name.textContent, "Ada Lovelace");
  await view.click(view.host.querySelector("[data-rename]"));
  assert.equal(view.host.querySelector("[data-settings-nav-name]").textContent, "Ada");
  view.cleanup();
});

test("产品接线：账户首页不再 import 整页安全堆，安全页 JSX 不再挂设备块", () => {
  const section = readFileSync(new URL("../src/pages/settings/sections/AccountSection.tsx", import.meta.url), "utf8");
  const security = readFileSync(new URL("../src/pages/AccountSecurityPage.tsx", import.meta.url), "utf8");
  assert.match(section, /from "\.\.\/account\/AccountHome"/);
  assert.match(section, /from "\.\.\/account\/SignInMethodsPage"/);
  assert.match(section, /from "\.\.\/account\/LoginDevicesPage"/);
  assert.doesNotMatch(section, /ActiveDevicesBlock/);
  assert.match(security, /export function ChangePasswordBlock/);
  assert.match(security, /export function TwoStepBlock/);
  assert.doesNotMatch(security, /<ActiveDevicesBlock/);
});
