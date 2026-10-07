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
  export async function getUserId() {
    if (s().userId !== undefined) return s().userId;
    return s().email ? "user-1" : null;
  }
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
  export function Modal({ children, labelledBy }) {
    return React.createElement("div", { role: "dialog", "data-modal": "", "aria-labelledby": labelledBy || undefined }, children);
  }
  export function ButtonSpinner() { return null; }
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
  export function OrgMembership(props) {
    const only = props && props.only;
    const copy = only === "create"
      ? "创建团队《OceanLeo 企业服务协议》"
      : only === "join"
        ? "加入团队"
        : "谁看过我";
    return React.createElement("div", { "data-testid": "org-membership", "data-org-only": only || "" }, copy);
  }
`);
const orgPageStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function OrgPage() {
    return React.createElement("div", { "data-testid": "org-page" }, "组织看板");
  }
`);
const authDialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AuthDialog() {
    return React.createElement("div", { "data-testid": "auth-dialog" });
  }
  export function AuthPanel() {
    return React.createElement("div", { "data-testid": "auth-panel", "data-auth-panel": "" });
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
const accountSectionStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AccountSection() {
    return React.createElement(
      "div",
      { "data-settings-pane": "account" },
      React.createElement("button", { type: "button", "data-account-sign-out": "", "aria-label": "退出登录" }, "退出登录"),
    );
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
  "../OrgPage": orgPageStubUrl,
  "../ApiPage": paneStub("ApiPage", "pane-api"),
  "../DevicesPage": paneStub("DevicesPage", "pane-devices"),
  "../PluginsPage": paneStub("PluginsPage", "pane-plugins"),
  "./personalization/PersonalizationSection": paneStub("PersonalizationSection", "pane-personalization"),
  "./mail/MailSection": paneStub("MailSection", "pane-mail"),
  "./sections/AccountSection": accountSectionStub,
  "./sections/BillingSection": paneStub("BillingSection", "pane-billing"),
  "./sections/MessagesSection": paneStub("MessagesSection", "pane-messages"),
  "./sections/UsageDetailsSection": paneStub("UsageDetailsSection", "pane-usage-details"),
  "./sections/TopUpSection": paneStub("TopUpSection", "pane-topup"),
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
  "./OrgPage": orgPageStubUrl,
  "./ApiPage": paneStub("ApiPage", "pane-api"),
  "./DevicesPage": paneStub("DevicesPage", "pane-devices"),
  "./PluginsPage": paneStub("PluginsPage", "pane-plugins"),
  "./settings/personalization/PersonalizationSection": paneStub("PersonalizationSection", "pane-personalization"),
  "./settings/mail/MailSection": paneStub("MailSection", "pane-mail"),
  "./settings/sections/AccountSection": accountSectionStub,
  "./settings/sections/BillingSection": paneStub("BillingSection", "pane-billing"),
  "./settings/sections/MessagesSection": paneStub("MessagesSection", "pane-messages"),
  "./settings/sections/UsageDetailsSection": paneStub("UsageDetailsSection", "pane-usage-details"),
  "./settings/sections/TopUpSection": paneStub("TopUpSection", "pane-topup"),
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

test("tab=account 有账户首页与退出，不含创建团队或企业服务协议", async () => {
  const view = await render(React.createElement(SettingsHub, { defaultTab: "account" }));
  assert.ok(view.host.querySelector("[data-settings-pane=account]"));
  assert.ok(view.text().includes("退出登录"));
  assert.equal(view.host.querySelector("[data-testid=security-panel]"), null);
  assert.equal(view.text().includes("创建团队"), false);
  assert.equal(view.text().includes("企业服务协议"), false);
  assert.ok(view.host.querySelector("[data-settings-identity]"));
  view.cleanup();
});

test("tab=org 含 OrgPage 与加入/创建", async () => {
  const view = await render(React.createElement(SettingsHub, { defaultTab: "team" }));
  assert.ok(view.host.querySelector("[data-testid=org-page]"));
  assert.ok(view.host.querySelector("[data-org-settings-block=mine]"));
  assert.ok(view.host.querySelector("[data-org-settings-tabs]"));
  assert.equal(view.host.querySelector("[data-org-settings-tab=mine]").getAttribute("aria-selected"), "true");
  assert.equal(view.host.querySelector("[data-org-settings-block=create]"), null);
  assert.equal(view.host.querySelector("[data-org-settings-block=join]"), null);
  await act(async () => {
    view.host.querySelector("[data-org-settings-tab=create]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.ok(view.host.querySelector("[data-org-settings-block=create]"));
  assert.ok(view.text().includes("创建团队"));
  await act(async () => {
    view.host.querySelector("[data-org-settings-tab=join]").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.ok(view.host.querySelector("[data-org-settings-block=join]"));
  assert.ok(view.text().includes("加入团队"));
  view.cleanup();
});

test("左栏宽卡等宽浅灰选中、身份箭头靠右、窄屏仍是横滑标签", async () => {
  const src = readFileSync(new URL("../src/pages/settings/SettingsNav.tsx", import.meta.url), "utf8");
  const hub = readFileSync(new URL("../src/pages/settings/SettingsHub.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../src/pages/settings/SettingsIdentityCard.tsx", import.meta.url), "utf8");
  const chrome = readFileSync(new URL("../src/theme/globals.css", import.meta.url), "utf8");
  assert.match(src, /settingsNavIcon/);
  assert.match(src, /data-settings-nav-tabs/);
  assert.match(src, /data-settings-identity-wrap/);
  assert.match(src, /inline-flex w-fit/);
  assert.match(src, /md:w-full md:gap-2 md:rounded-lg md:border-b-0/);
  assert.match(src, /md:bg-neutral-100/);
  assert.match(src, /font-semibold text-neutral-900/);
  assert.doesNotMatch(src, /md:bg-neutral-900 md:text-white/);
  assert.doesNotMatch(src, /flex w-full min-w-0 items-center gap-2 rounded-lg/);
  assert.match(hub, /data-settings-nav-rail/);
  assert.match(hub, /md:flex-row/);
  assert.match(hub, /md:w-60/);
  assert.match(hub, /md:pl-5 md:pr-0\.5/);
  assert.match(chrome, /\[data-settings-nav-rail\] \{[\s\S]*?padding-right: 0\.125rem;/);
  assert.match(hub, /md:border-r md:border-neutral-200/);
  assert.match(hub, /data-settings-pane-title=""/);
  assert.match(hub, /text-\[24px\] font-semibold tracking-tight/);
  assert.doesNotMatch(hub, /pt-14/);
  assert.doesNotMatch(hub, /md:pt-14/);
  assert.doesNotMatch(hub, /sm:flex-row/);
  assert.doesNotMatch(hub, /min-w-0 shrink-0 md:flex md:h-full md:w-52/);
  assert.match(card, /data-settings-identity-switch/);
  assert.match(card, /inline-flex w-auto max-w-full/);
  assert.match(card, /ml-4\.5 flex size-5/);
  assert.match(card, /pr-5 /);
  assert.doesNotMatch(card, /flex w-full min-w-0 items-center gap-2\.5/);
  assert.match(chrome, /\[data-settings-identity-switch\]/);
  assert.match(chrome, /width: fit-content/);
  assert.match(chrome, /\[data-settings-nav-rail\] \[data-settings-nav\] \{\s*width: 100%;/);
  assert.match(chrome, /scrollbar-gutter: stable;/);
  assert.match(chrome, /\[data-settings-nav-scroll\] \{\s*align-items: stretch;\s*overflow-x: hidden;/);
  assert.match(chrome, /\[data-settings-nav-scroll\] \[data-settings-item\] \{\s*width: 100%;/);
  assert.match(chrome, /html\.dark \[data-settings-nav-scroll\] \[data-settings-item\]\[aria-current="page"\]/);
  assert.match(chrome, /html\.dark \.md\\:bg-neutral-100/);
  assert.match(chrome, /html\.dark \.md\\:text-neutral-700/);
  assert.doesNotMatch(src, /md:w-60/);
  const view = await render(React.createElement(SettingsHub, { defaultTab: "account" }));
  assert.ok(view.host.querySelector("[data-settings-identity-wrap]"));
  assert.ok(view.host.querySelector("[data-settings-identity-switch]"));
  assert.equal(view.host.querySelectorAll("[data-settings-item=account]").length, 1, "窄屏标签和左列必须是同一套按键，不能各画一份");
  const rail = [...view.host.querySelectorAll("[data-settings-nav-scroll] [data-settings-item]")];
  assert.ok(rail.length >= 6, "桌面左栏应当有设置项");
  for (const item of rail) {
    assert.ok(item.querySelector("[data-settings-item-icon] svg"), `${item.getAttribute("data-settings-item")} 缺少左侧图标`);
    assert.ok(item.className.includes("md:w-full"), `${item.getAttribute("data-settings-item")} 宽卡必须等宽`);
  }
  const account = view.host.querySelector("[data-settings-item=account]");
  assert.ok(account.className.includes("md:bg-neutral-100"), "选中底应是浅灰");
  assert.ok(account.className.includes("font-semibold"), "选中字应略加粗");
  assert.equal(account.className.includes("md:bg-neutral-900"), false);
  const identity = view.host.querySelector("[data-settings-identity]");
  assert.ok(identity.className.includes("w-auto"), "身份卡片仍按名字收窄");
  assert.ok(identity.className.includes("pr-5"), "上下箭头要离开名字一点");
  const sw = view.host.querySelector("[data-settings-identity-switch]");
  assert.ok(sw.className.includes("ml-4.5"), "上下箭头应再向右");
  const title = view.host.querySelector("[data-settings-pane-title]");
  assert.ok(title);
  assert.ok(title.className.includes("text-[24px]"));
  view.cleanup();
});

test("OrgSection 嵌入 OrgPage 与三个页签，不再链到独立 /org", () => {
  const src = readFileSync(new URL("../src/pages/settings/sections/OrgSection.tsx", import.meta.url), "utf8");
  assert.match(src, /<OrgPage embedded/);
  assert.match(src, /only="create"/);
  assert.match(src, /only="join"/);
  assert.match(src, /only="views"/);
  assert.match(src, /data-org-settings-tabs/);
  assert.doesNotMatch(src, /href=\{orgHref\}|href="\/org"/);
});

test("AccountPage 不传 props 时默认 account 栏", async () => {
  const view = await render(React.createElement(AccountPage));
  assert.ok(view.host.querySelector("[data-settings-item=account][aria-current=page]"));
  assert.ok(view.host.querySelector("[data-settings-pane=account]"));
  assert.equal(view.host.querySelector("[data-testid=security-panel]"), null);
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

test("登录成功不得 location.reload（开发版 overlay 经不起刷新）", () => {
  const src = readFileSync(
    new URL("../src/pages/settings/SettingsHub.tsx", import.meta.url),
    "utf8",
  );
  assert.match(src, /function handleSignedIn/);
  assert.match(src, /loadAccountRef\.current/);
  assert.match(src, /event === "SIGNED_OUT"/);
  assert.match(src, /checked && !signedIn/);
  assert.doesNotMatch(src, /window\.location\.reload/);
  assert.doesNotMatch(src, /checked && !email/);
});

test("没有邮箱的已登录会话也进设置，不回 Sign in", async () => {
  globalThis.__authStub = {
    ...signedIn(),
    email: null,
    userId: "phone-user",
  };
  window.history.replaceState(null, "", "/settings/account");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(SettingsHub, { defaultTab: "account" }));
  });
  for (let i = 0; i < 8; i += 1) await act(async () => {});
  assert.equal(host.querySelector("[data-auth-panel]"), null, "手机登录后不得回到登录门");
  assert.ok(host.querySelector("[data-settings-hub]"));
  act(() => root.unmount());
  host.remove();
});

test("未登录才出登录门", async () => {
  globalThis.__authStub = {
    ...signedIn(),
    email: null,
    userId: null,
  };
  window.history.replaceState(null, "", "/settings/account");
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(SettingsHub, { defaultTab: "account", guestPrompt: "auth" }));
  });
  for (let i = 0; i < 8; i += 1) await act(async () => {});
  assert.ok(host.querySelector("[data-auth-panel]"), "未登录应看到登录门");
  act(() => root.unmount());
  host.remove();
});
