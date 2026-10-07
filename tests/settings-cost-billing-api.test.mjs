// 设置卡：用量柱状图在 billing、记录表在 cost、AI 模型栏 id 是 api（含指导文档页签）。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/settings-cost-billing-api.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/settings",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  PopStateEvent: window.PopStateEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const authStub = dataModule(`
  const event = {
    kind: "usage",
    created_at: "2026-09-30T12:00:00.000Z",
    amount_major: -0.02,
    currency: "CNY",
    meta: { model: "demo", prompt_tokens: 2, completion_tokens: 1, price: 0.02, tokens: 3 },
  };
  export function oceanleoConfigured() { return true; }
  export function browserClient() {
    return {
      auth: {
        getUser: async () => ({ data: { user: { email: "designer@oceanleo.com" } } }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      },
    };
  }
  export async function getUserEmail() { return "designer@oceanleo.com"; }
  export async function getCredits() { return { ok: true, data: { balance: 12.5, currency: "CNY" } }; }
  export async function getCreditHistory() { return { ok: true, data: { events: [event] } }; }
  export async function getUsageBySite() { return { ok: true, data: { total: { requests: 3 } } }; }
  export async function getModelCatalog() { return { ok: true, data: { providers: [], model_count: 0 } }; }
  export function pricingDocUrl() { return "#"; }
  export function getAudit() { return Promise.resolve({ ok: true, data: null }); }
  export async function signOutEverywhere() {}
  export function loginUnavailableNotice() { return null; }
  export function isPasswordResetLanding() { return false; }
`);
const linkStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ href, children, ...rest }) {
    return React.createElement("a", { href, "data-next-link": "1", ...rest }, children);
  }
`);
const navigationStub = dataModule(`
  export function useRouter() {
    return { replace() {}, push() {}, refresh() {}, back() {}, prefetch() {} };
  }
  export function usePathname() { return "/settings"; }
  export function useSearchParams() { return new URLSearchParams(window.location.search); }
`);
const confirmStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog() {
    return React.createElement("div", { "data-testid": "confirm-dialog" });
  }
  export function Modal({ children }) {
    return React.createElement("div", { role: "dialog", "data-modal": "" }, children);
  }
  export function ButtonSpinner() { return null; }
`);
const paneStub = (exportName, testId) => dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ${exportName}() {
    return React.createElement("div", { "data-testid": ${JSON.stringify(testId)} });
  }
`);

const {
  isSettingsPathname,
  resolveSettingsTab,
  settingsPath,
  SETTINGS_BUILTIN_TABS,
  SETTINGS_TAB_ALIASES,
} = await import(await compileModule("src/pages/settings/settings-tabs.ts"));

const { SettingsHub } = await import(
  await compileModule("src/pages/settings/SettingsHub.tsx", {
    "next/link": linkStub,
    "next/navigation": navigationStub,
    "../../lib/auth": authStub,
    "../../ui": confirmStub,
    "../../i18n/ui/useUI": uiStub,
    "../AuthDialog": paneStub("AuthDialog", "auth-dialog"),
    "../PasswordResetPage": paneStub("PasswordResetPage", "reset-page"),
    "../GeneralPage": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function GeneralSettingsBody() {
        return React.createElement("div", { "data-testid": "general-body" });
      }
    `),
    "../AccountSecurityPage": paneStub("AccountSecurityPage", "security-panel"),
    "../OrgMembership": paneStub("OrgMembership", "org-membership"),
    "../OrgPage": paneStub("OrgPage", "org-page"),
    "../ApiPage": paneStub("ApiPage", "pane-api"),
    "../DevicesPage": paneStub("DevicesPage", "pane-devices"),
    "../PluginsPage": paneStub("PluginsPage", "pane-plugins"),
    "./personalization/PersonalizationSection": paneStub("PersonalizationSection", "pane-personalization"),
  })
);

const { ApiPage } = await import(
  await compileModule("src/pages/ApiPage.tsx", {
    "../lib/auth": authStub,
    "../i18n/ui/useUI": uiStub,
    "./ByokKeys": paneStub("ByokKeys", "byok-keys"),
    "./ModelCapabilityMarket": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function ModelGroupManager() {
        return React.createElement("div", { "data-testid": "model-market" });
      }
    `),
    "./PageHeader": paneStub("PageHeader", "page-header"),
  })
);

const { BillingSection } = await import(
  await compileModule("src/pages/settings/sections/BillingSection.tsx", {
    "../../../lib/auth": authStub,
    "../../../i18n/ui/useUI": uiStub,
  })
);

const { CostSection } = await import(
  await compileModule("src/pages/settings/sections/CostSection.tsx", {
    "../../../lib/auth": authStub,
    "../../../i18n/ui/useUI": uiStub,
    "../../UsageHistory": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function UsageHistory() {
        return React.createElement("table", { "data-testid": "usage-table" },
          React.createElement("caption", null, "用量记录"));
      }
    `),
  })
);

async function render(element, path = "/settings") {
  window.history.replaceState(null, "", path);
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  for (let i = 0; i < 8; i += 1) await act(async () => {});
  return {
    host,
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
      for (let i = 0; i < 3; i += 1) await act(async () => {});
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("isSettingsPathname / resolve / settingsPath：api 是设置栏，models 落到 api", () => {
  assert.equal(isSettingsPathname("/settings/api"), true);
  assert.equal(resolveSettingsTab("models"), "api");
  assert.match(settingsPath("models", "https://oceanleo.com/"), /\/settings\/api/);
  assert.equal(SETTINGS_TAB_ALIASES.models, "api");
  assert.equal(SETTINGS_TAB_ALIASES.org, "team");
  assert.ok(SETTINGS_BUILTIN_TABS.includes("cost"));
  assert.ok(SETTINGS_BUILTIN_TABS.includes("api"));
  assert.ok(SETTINGS_BUILTIN_TABS.includes("team"));
  assert.equal(SETTINGS_BUILTIN_TABS.includes("org"), false);
  assert.equal(SETTINGS_BUILTIN_TABS.includes("models"), false);
  const billingAt = SETTINGS_BUILTIN_TABS.indexOf("billing");
  assert.equal(SETTINGS_BUILTIN_TABS[billingAt + 1], "bay");
  assert.equal(SETTINGS_BUILTIN_TABS[billingAt + 2], "cost");
  assert.ok(SETTINGS_BUILTIN_TABS.includes("bay"));
});

test("SettingsHub 打开用量与账单 / 费用两栏", async () => {
  const billing = await render(React.createElement(SettingsHub, { defaultTab: "billing" }), "/settings/billing");
  assert.ok(billing.host.querySelector('[data-settings-pane="billing"]'), "billing 栏要在");
  assert.ok(billing.host.querySelector("[data-usage-chart]"), "用量与账单里要有近 30 天柱状图");
  assert.equal(billing.host.querySelector("[data-usage-history]"), null);
  billing.cleanup();

  const cost = await render(React.createElement(SettingsHub, { defaultTab: "cost" }), "/settings/cost");
  assert.ok(cost.host.querySelector('[data-settings-pane="cost"]'), "cost 栏要在");
  assert.ok(cost.host.querySelector("[data-usage-history]"), "费用栏是用量记录");
  assert.equal(cost.host.querySelector("[data-usage-chart]"), null, "费用栏不要柱状图");
  cost.cleanup();
});

test("BillingSection 先图后可选钱包，不再链到 /cost", async () => {
  const view = await render(
    React.createElement(BillingSection, {
      stats: [{ value: "1", label: "token 余额" }],
      wallet: React.createElement("div", { "data-testid": "wallet-slot" }, "wallet"),
    }),
  );
  const pane = view.host.querySelector('[data-settings-pane="billing"]');
  assert.ok(pane);
  assert.ok(pane.querySelector("[data-usage-chart]"));
  assert.ok(pane.querySelector("[data-testid=wallet-slot]"));
  assert.equal(view.host.querySelector('a[href="/cost"]'), null);
  view.cleanup();
});

test("CostSection 只有用量表、没有柱状图", async () => {
  const view = await render(React.createElement(CostSection));
  assert.ok(view.host.querySelector('[data-settings-pane="cost"]'));
  assert.ok(view.host.querySelector("[data-usage-history]"));
  assert.ok(view.host.querySelector("[data-testid=usage-table]"));
  assert.equal(view.host.querySelector("[data-usage-chart]"), null);
  view.cleanup();
});

test("ApiPage pane：模型市场 | 指导文档，?guide=1 打开指导文档", async () => {
  const market = await render(React.createElement(ApiPage, { variant: "pane" }), "/settings/api");
  const tabs = market.host.querySelector("[data-api-settings-tabs]");
  assert.ok(tabs, "pane 要有两个板块的 tablist");
  assert.equal(tabs.querySelectorAll("[role=tab]").length, 2);
  assert.equal(market.host.querySelector("[data-api-settings-tab=models]").getAttribute("aria-selected"), "true");
  assert.equal(market.host.querySelector("[data-api-guide]"), null);
  assert.ok(market.host.querySelector("[data-testid=model-market]"));
  await market.click(market.host.querySelector("[data-api-settings-tab=guide]"));
  assert.ok(market.host.querySelector("[data-api-guide]"), "点指导文档后要渲染指导文档根");
  assert.match(window.location.search, /guide=1/);
  market.cleanup();

  const guide = await render(React.createElement(ApiPage, { variant: "pane" }), "/settings/api?guide=1");
  assert.equal(guide.host.querySelector("[data-api-settings-tab=guide]").getAttribute("aria-selected"), "true");
  assert.ok(guide.host.querySelector("[data-api-guide]"), "?guide=1 打开指导文档根");
  assert.equal(guide.host.querySelector("[data-testid=model-market]"), null);
  guide.cleanup();
});

test("ApiPage 充值默认指向设置卡 /settings/billing", async () => {
  const view = await render(React.createElement(ApiPage, { variant: "pane" }), "/settings/api");
  const topUp = [...view.host.querySelectorAll("a")].find((node) => node.textContent === "充值");
  assert.ok(topUp);
  assert.equal(topUp.getAttribute("href"), "/settings/billing");
  view.cleanup();
});
