// 设置卡：用量与账单页内三页签（总览 / 用量明细 / 充值），AI 模型栏 id 是 ai-models。
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
  export async function getUserId() { return "user-1"; }
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
const usageDetailsStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function UsageDetailsSection() {
    return React.createElement("div", {
      "data-settings-pane": "usage-details",
      "data-usage-history": "",
    }, React.createElement("table", { "data-testid": "usage-table" },
      React.createElement("caption", null, "用量记录")));
  }
`);
const topUpStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function TopUpSection({ wallet }) {
    return React.createElement("div", {
      "data-settings-pane": "topup",
      "data-billing-wallet-page": "",
    }, wallet);
  }
`);

const {
  isSettingsPathname,
  resolveSettingsTab,
  settingsPath,
  SETTINGS_BUILTIN_TABS,
  SETTINGS_TAB_ALIASES,
  billingViewFromRaw,
  openSettingsModal,
} = await import(await compileModule("src/pages/settings/settings-tabs.ts"));

const { SettingsHub } = await import(
  await compileModule("src/pages/settings/SettingsHub.tsx", {
    "next/link": linkStub,
    "next/navigation": navigationStub,
    "../../lib/auth": authStub,
    "../../ui": confirmStub,
    "../../i18n/ui/useUI": uiStub,
    "../AuthDialog": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function AuthDialog() {
        return React.createElement("div", { "data-testid": "auth-dialog" });
      }
      export function AuthPanel() {
        return React.createElement("div", { "data-testid": "auth-panel", "data-auth-panel": "" });
      }
    `),
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
  "./mail/MailSection": paneStub("MailSection", "pane-mail"),
    "./sections/AccountSection": paneStub("AccountSection", "pane-account"),
    "./sections/MessagesSection": paneStub("MessagesSection", "pane-messages"),
    "./UsageDetailsSection": usageDetailsStub,
    "./TopUpSection": topUpStub,
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
    "./UsageDetailsSection": usageDetailsStub,
    "./TopUpSection": topUpStub,
  })
);

const { UsageDetailsSection } = await import(
  await compileModule("src/pages/settings/sections/UsageDetailsSection.tsx", {
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

test("isSettingsPathname / resolve / settingsPath：ai-models 是设置栏，api/models 落到它", () => {
  assert.equal(isSettingsPathname("/settings/ai-models"), true);
  assert.equal(isSettingsPathname("/settings/api"), true);
  assert.equal(resolveSettingsTab("models"), "ai-models");
  assert.equal(resolveSettingsTab("api"), "ai-models");
  assert.match(settingsPath("models", "https://oceanleo.com/"), /\/settings\/ai-models/);
  assert.match(settingsPath("api", "https://oceanleo.com/"), /\/settings\/ai-models/);
  assert.equal(SETTINGS_TAB_ALIASES.models, "ai-models");
  assert.equal(SETTINGS_TAB_ALIASES.api, "ai-models");
  assert.equal(SETTINGS_TAB_ALIASES.knowledge, "personalization");
  assert.equal(SETTINGS_TAB_ALIASES.memory, "personalization");
  assert.equal(SETTINGS_TAB_ALIASES.org, "team");
  assert.ok(SETTINGS_BUILTIN_TABS.includes("team"));
  assert.equal(SETTINGS_BUILTIN_TABS.includes("org"), false);
  assert.equal(SETTINGS_BUILTIN_TABS.includes("usage-details"), false);
  assert.equal(SETTINGS_BUILTIN_TABS.includes("topup"), false);
  assert.ok(SETTINGS_BUILTIN_TABS.includes("ai-models"));
  assert.ok(SETTINGS_BUILTIN_TABS.includes("mail"));
  assert.ok(SETTINGS_BUILTIN_TABS.includes("messages"));
  assert.equal(SETTINGS_TAB_ALIASES.cost, "billing");
  assert.equal(SETTINGS_TAB_ALIASES["usage-details"], "billing");
  assert.equal(SETTINGS_TAB_ALIASES.topup, "billing");
  assert.equal(resolveSettingsTab("cost"), "billing");
  assert.equal(resolveSettingsTab("usage-details"), "billing");
  assert.equal(resolveSettingsTab("topup"), "billing");
  assert.match(settingsPath("cost", "https://oceanleo.com/"), /\/settings\/billing/);
  assert.match(settingsPath("topup", "https://oceanleo.com/"), /\/settings\/billing/);
  assert.equal(billingViewFromRaw("cost"), "usage-details");
  assert.equal(billingViewFromRaw("topup"), "topup");
  assert.equal(SETTINGS_BUILTIN_TABS.includes("cost"), false);
  assert.equal(SETTINGS_BUILTIN_TABS.includes("api"), false);
  assert.equal(SETTINGS_BUILTIN_TABS.includes("models"), false);
});

test("SettingsHub 打开用量与账单 / 用量明细 / 充值", async () => {
  const billing = await render(
    React.createElement(SettingsHub, {
      defaultTab: "billing",
      wallet: React.createElement("div", { "data-testid": "wallet-slot" }, "wallet"),
    }),
    "/settings/billing",
  );
  assert.ok(billing.host.querySelector('[data-settings-pane="billing"]'), "billing 栏要在");
  assert.ok(billing.host.querySelector("[data-usage-chart]"), "用量与账单里要有近 30 天柱状图");
  assert.equal(billing.host.querySelector("[data-usage-history]"), null);
  assert.equal(billing.host.querySelector("[data-testid=wallet-slot]"), null, "充值不能摊在用量页里");
  assert.equal(billing.host.querySelector('[data-settings-item="usage-details"]'), null, "用量明细不占左栏");
  assert.equal(billing.host.querySelector('[data-settings-item="topup"]'), null, "充值不占左栏");
  const pane = billing.host.querySelector('[data-settings-pane="billing"]');
  const chart = pane.querySelector("[data-usage-chart]");
  const stats = pane.querySelector(".grid");
  assert.ok(stats && chart);
  assert.equal(Boolean(stats.compareDocumentPosition(chart) & window.Node.DOCUMENT_POSITION_FOLLOWING), true, "数字在柱状图上面");
  const tabs = billing.host.querySelector("[data-billing-settings-tabs]");
  assert.ok(tabs, "用量与账单用和个性化一样的页签");
  assert.equal(tabs.getAttribute("role"), "tablist");
  assert.equal(billing.host.querySelector("[data-billing-settings-tab=overview]").getAttribute("aria-selected"), "true");
  assert.equal(billing.host.querySelector("[data-billing-settings-tab=usage-details]").textContent, "用量明细");
  const topUp = billing.host.querySelector("[data-billing-settings-tab=topup]");
  assert.ok(topUp, "充值是页签");
  assert.equal(billing.host.querySelector("[data-billing-usage-details-button]"), null);
  assert.equal(billing.host.querySelector("[data-settings-back]"), null);
  await billing.click(topUp);
  assert.ok(billing.host.querySelector('[data-settings-pane="topup"]'), "点充值打开充值页");
  assert.equal(billing.host.querySelector("[data-usage-chart]"), null, "充值页不含柱状图");
  assert.ok(billing.host.querySelector("[data-testid=wallet-slot]"));
  assert.equal(billing.host.querySelector("h2")?.textContent, "用量与账单");
  assert.equal(window.location.pathname, "/settings/billing", "页签不换地址");
  billing.cleanup();

  const details = await render(React.createElement(SettingsHub, { defaultTab: "cost" }), "/settings/cost");
  assert.ok(details.host.querySelector('[data-settings-pane="usage-details"]'), "旧费用地址打开用量明细");
  assert.ok(details.host.querySelector("[data-usage-history]"), "用量明细栏是用量记录");
  assert.equal(details.host.querySelector("[data-usage-chart]"), null, "用量明细栏不要柱状图");
  assert.equal(details.host.querySelector("[data-settings-back]"), null, "不再用返回键");
  assert.equal(details.host.querySelector('[data-settings-item="usage-details"]'), null, "用量明细不占左栏");
  assert.equal(details.host.querySelector("h2")?.textContent, "用量与账单");
  assert.equal(details.host.querySelector("[data-billing-settings-tab=usage-details]").getAttribute("aria-selected"), "true");
  assert.equal(window.location.pathname, "/settings/billing", "旧费用地址收成 billing");
  await details.click(details.host.querySelector("[data-billing-settings-tab=overview]"));
  assert.equal(window.location.pathname, "/settings/billing");
  details.cleanup();

  const inbound = await render(React.createElement(SettingsHub, { defaultTab: "topup" }), "/settings/topup");
  assert.equal(inbound.host.querySelector("[data-billing-settings-tab=topup]").getAttribute("aria-selected"), "true");
  assert.ok(inbound.host.querySelector('[data-settings-pane="topup"]'));
  assert.equal(window.location.pathname, "/settings/billing");
  inbound.cleanup();
});

test("openSettingsModal(topup) 打开用量与账单并记住充值页签", () => {
  window.history.replaceState(null, "", "/agent");
  openSettingsModal("topup");
  assert.equal(window.location.pathname, "/settings/billing");
  assert.equal(window.history.state.settingsBillingView, "topup");
});

test("BillingSection 只有数字和柱状图，不含钱包", async () => {
  const view = await render(
    React.createElement(BillingSection, {
      stats: [{ value: "1", label: "token 余额" }],
      wallet: React.createElement("div", { "data-testid": "wallet-slot" }, "wallet"),
    }),
  );
  const pane = view.host.querySelector('[data-settings-pane="billing"]');
  assert.ok(pane);
  assert.ok(pane.querySelector("[data-usage-chart]"));
  assert.equal(pane.querySelector("[data-testid=wallet-slot]"), null);
  assert.equal(pane.querySelector("[data-billing-topup-button]"), null);
  assert.equal(view.host.querySelector('a[href="/cost"]'), null);
  view.cleanup();
});

test("UsageDetailsSection 只有用量表、没有柱状图", async () => {
  const view = await render(React.createElement(UsageDetailsSection), "/settings/usage-details");
  assert.ok(view.host.querySelector('[data-settings-pane="usage-details"]'));
  assert.ok(view.host.querySelector("[data-usage-history]"));
  assert.ok(view.host.querySelector("[data-testid=usage-table]"));
  assert.equal(view.host.querySelector("[data-usage-chart]"), null);
  view.cleanup();
});

test("ApiPage pane：模型选择 | BYOK，?guide=1 打开 BYOK（不再嵌厂商指导文档）", async () => {
  const market = await render(React.createElement(ApiPage, { variant: "pane" }), "/settings/ai-models");
  const tabs = market.host.querySelector("[data-api-settings-tabs]");
  assert.ok(tabs, "pane 要有模型选择 / BYOK 页签");
  assert.equal(tabs.querySelectorAll("[role=tab]").length, 2);
  assert.equal(market.host.querySelector("[data-api-settings-tab=selection]").getAttribute("aria-selected"), "true");
  assert.equal(market.host.querySelector("[data-api-guide]"), null);
  assert.ok(market.host.querySelector("[data-testid=model-market]"));
  assert.equal(market.host.querySelector("[data-testid=byok-keys]"), null);
  await market.click(market.host.querySelector("[data-api-settings-tab=byok]"));
  assert.ok(market.host.querySelector("[data-testid=byok-keys]"), "点 BYOK 后要渲染自带 key");
  assert.equal(market.host.querySelector("[data-api-guide]"), null, "设置页不再嵌厂商指导文档");
  assert.match(window.location.search, /pane=byok/);
  market.cleanup();

  const guide = await render(React.createElement(ApiPage, { variant: "pane" }), "/settings/ai-models?guide=1");
  assert.equal(guide.host.querySelector("[data-api-settings-tab=byok]").getAttribute("aria-selected"), "true");
  assert.ok(guide.host.querySelector("[data-testid=byok-keys]"), "?guide=1 仍打开自带密钥页签");
  assert.equal(guide.host.querySelector("[data-api-guide]"), null);
  assert.equal(guide.host.querySelector("[data-testid=model-market]"), null);
  guide.cleanup();
});

test("ApiPage 默认页签是模型选择，不含 token 余额", async () => {
  const view = await render(React.createElement(ApiPage, { variant: "pane" }), "/settings/ai-models");
  assert.equal(view.host.textContent.includes("token 余额"), false);
  assert.ok(view.host.querySelector("[data-testid=model-market]"));
  assert.ok(view.host.querySelector("[data-api-selection]"));
  assert.equal(view.host.querySelector("[data-testid=byok-keys]"), null);
  view.cleanup();
});
