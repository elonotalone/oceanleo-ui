// skills-overhaul W10（2026-10-24，合同 D3 / A7）：设置中心「技能」「连接器」两栏。
//   ① 两个栏目（AI 模型之后），旧 id plugins（/settings/plugins、#settings/plugins、openSettingsModal("plugins")）落到技能；
//   ② 技能栏：一行说明 + 「浏览官方技能库」，主体是个人范围的 SkillsManager；没有旧副标题；
//   ③ 连接器栏：没有「可一键授权」开关；「+ 添加连接器 ▾」= 目录 + 自定义 MCP；国内版阿里云市场并进目录弹窗；
//   ④ /plugins#connect=<id> 重定向过来时落连接器栏并把 id 交给连接器栏；
//   ⑤ LeoAgent 站「技能」字样清理；旧 agent_knowledge 技能已删。
// 跑：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//       --experimental-loader ./tests/ts-extension-loader.mjs --test tests/sko-w10-settings.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
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
  url: "https://oceanleo.com/settings/general",
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
  export function ${exportName}(props) {
    return React.createElement("div", {
      "data-testid": ${JSON.stringify(testId)},
      "data-initial-connector": (props && props.initialConnectorId) || "",
    });
  }
`);

const HUB_STUBS = {
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
  "./SkillsSettingsPane": paneStub("SkillsSettingsPane", "pane-skills"),
  "./ConnectorsSettingsPane": paneStub("ConnectorsSettingsPane", "pane-connectors"),
  "./personalization/PersonalizationSection": paneStub("PersonalizationSection", "pane-personalization"),
  "./mail/MailSection": paneStub("MailSection", "pane-mail"),
  "./sections/AutomationSettingsSection": paneStub("AutomationSettingsSection", "pane-automation"),
  "./sections/AccountSection": paneStub("AccountSection", "pane-account"),
  "./sections/BillingSection": paneStub("BillingSection", "pane-billing"),
  "./sections/MessagesSection": paneStub("MessagesSection", "pane-messages"),
};
const { SettingsHub, settingsHubTabAlias } = await import(
  await compileModule("src/pages/settings/SettingsHub.tsx", HUB_STUBS)
);
const tabs = await import(await compileModule("src/pages/settings/settings-tabs.ts"));

const managerStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function SkillsManager(props) {
    globalThis.__W10_MANAGER_PROPS__ = props;
    return React.createElement("div", { "data-testid": "skills-manager", "data-scope": props.scope && props.scope.kind });
  }
  export function OfficialSkillLibraryDialog(props) {
    globalThis.__W10_LIBRARY_PROPS__ = props;
    return props.open ? React.createElement("div", { "data-testid": "official-library" }) : null;
  }
`);
const { SkillsSettingsPane } = await import(
  await compileModule("src/pages/settings/SkillsSettingsPane.tsx", {
    "../../i18n/ui/useUI": uiStubUrl,
    "../../shell/skills/manager": managerStubUrl,
  })
);

function signedIn() {
  return {
    configured: true,
    email: "accept@oceanleo.internal",
    credits: { ok: true, data: { balance_yuan: 1 } },
    history: { ok: true, data: { events: [] } },
    usage: { ok: true, data: { total: { requests: 0 } } },
    client: { auth: { onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }) } },
  };
}

async function settle(n = 8) {
  for (let i = 0; i < n; i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
}

async function mount(element, path) {
  globalThis.__authStub = signedIn();
  window.history.replaceState(null, "", path);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  await settle();
  return {
    host,
    find: (sel) => host.querySelector(sel),
    async click(node) {
      assert.ok(node, "点不到目标");
      await act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
      await settle();
    },
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test("settings-tabs：skills / connectors 是内置栏目，plugins 是别名落到 skills", () => {
  assert.ok(tabs.SETTINGS_BUILTIN_TABS.includes("skills"));
  assert.ok(tabs.SETTINGS_BUILTIN_TABS.includes("connectors"));
  assert.ok(!tabs.SETTINGS_BUILTIN_TABS.includes("plugins"), "plugins 不再是内置栏目");
  const order = [...tabs.SETTINGS_BUILTIN_TABS];
  assert.equal(order.indexOf("skills"), order.indexOf("ai-models") + 1, "技能紧跟 AI 模型");
  assert.equal(order.indexOf("connectors"), order.indexOf("skills") + 1, "连接器紧跟技能");
  assert.equal(tabs.resolveSettingsTab("plugins"), "skills");
  assert.equal(tabs.settingsPath("plugins", "https://oceanleo.com/"), "/settings/skills");
  assert.equal(tabs.tabFromSettingsLocation("https://oceanleo.com/settings/plugins"), "skills");
  assert.equal(tabs.tabFromSettingsLocation("https://oceanleo.com/agent#settings/plugins"), "skills");
  assert.equal(tabs.tabFromSettingsLocation("https://oceanleo.com/settings?tab=plugins"), "skills");
  assert.equal(tabs.tabFromSettingsLocation("https://oceanleo.com/settings/connectors"), "connectors");
  assert.equal(tabs.isReservedSettingsTab("plugins"), true, "站点 extraSections 用旧 id plugins 仍让位给内置");
  assert.equal(settingsHubTabAlias("plugins"), "skills");
  assert.equal(settingsHubTabAlias("connectors"), "connectors");
});

test("设置中心：能力组里「技能」「连接器」两项紧跟「AI 模型」，没有「插件与连接器」", async () => {
  const view = await mount(React.createElement(SettingsHub), "/settings/skills");
  try {
    const items = [...view.host.querySelectorAll('[data-settings-group="capabilities"] [data-settings-item]')].map(
      (node) => node.getAttribute("data-settings-item"),
    );
    assert.deepEqual(items.slice(0, 3), ["ai-models", "skills", "connectors"]);
    assert.ok(!items.includes("plugins"));
    assert.ok(!(view.host.textContent || "").includes("插件与连接器"));
    assert.ok(view.find('[data-testid="pane-skills"]'), "/settings/skills 打开技能栏");
    assert.equal(view.find("[data-settings-pane-title]")?.textContent, "技能");
    await view.click(view.find('[data-settings-item="connectors"]'));
    assert.ok(view.find('[data-testid="pane-connectors"]'), "点「连接器」切到连接器栏");
    assert.equal(view.find("[data-settings-pane-title]")?.textContent, "连接器");
    assert.equal(window.location.pathname, "/settings/connectors");
  } finally {
    await view.cleanup();
  }
});

test("旧地址 /settings/plugins 不 404：落在技能栏", async () => {
  const view = await mount(React.createElement(SettingsHub), "/settings/plugins");
  try {
    assert.ok(view.find('[data-testid="pane-skills"]'));
    assert.equal(
      view.find('[data-settings-item="skills"]')?.getAttribute("aria-current"),
      "page",
    );
  } finally {
    await view.cleanup();
  }
});

test("/plugins#connect=github 重定向过来（/settings/skills#connect=github）：落连接器栏并把 id 交给连接器栏", async () => {
  const view = await mount(React.createElement(SettingsHub), "/settings/skills#connect=github");
  try {
    const pane = view.find('[data-testid="pane-connectors"]');
    assert.ok(pane, "#connect= 改落连接器栏");
    assert.equal(pane.getAttribute("data-initial-connector"), "github");
    assert.equal(window.location.pathname, "/settings/connectors", "地址写成这一栏");
    await view.click(view.find('[data-settings-item="skills"]'));
    assert.ok(view.find('[data-testid="pane-skills"]'), "之后手动点技能照常切过去，不再被拽回连接器");
  } finally {
    await view.cleanup();
  }
});

test("弹窗形态：initialTab=plugins 落技能；initialTab=connectors 落连接器", async () => {
  for (const [initialTab, testId] of [["plugins", "pane-skills"], ["connectors", "pane-connectors"]]) {
    const view = await mount(
      React.createElement(SettingsHub, { variant: "modal", initialTab, onTabChange() {} }),
      "/agent",
    );
    try {
      assert.ok(view.find(`[data-testid="${testId}"]`), `initialTab=${initialTab} → ${testId}`);
    } finally {
      await view.cleanup();
    }
  }
});

test("技能栏：一行说明 +「浏览官方技能库」；主体是个人范围的 SkillsManager；没有旧副标题；只有一个官方库弹窗", async () => {
  delete globalThis.__W10_MANAGER_PROPS__;
  const view = await mount(React.createElement(SkillsSettingsPane), "/settings/skills");
  try {
    const hint = view.find("[data-skills-pane-hint]");
    assert.ok(hint);
    assert.match(hint.textContent || "", /在输入框输入 \/ 使用已添加的技能/);
    assert.match(hint.textContent || "", /浏览官方技能库/);
    assert.ok(!(view.host.textContent || "").includes("技能、连接器与 MCP 服务器"), "没有旧副标题");
    assert.equal(view.find('[data-testid="skills-manager"]')?.getAttribute("data-scope"), "personal");
    assert.ok(view.find("[data-plugins-skills]"), "根节点仍带 data-plugins-skills");
    assert.equal(view.find('[data-testid="official-library"]'), null);
    await view.click(view.find("[data-skills-open-official]"));
    assert.ok(view.find('[data-testid="official-library"]'), "「浏览官方技能库」打开官方库弹窗");
    assert.equal(typeof globalThis.__W10_MANAGER_PROPS__.onOpenOfficialLibrary, "function", "面板里的「从官方库添加」与链接共用同一个弹窗");
    assert.equal(view.find("h2"), null, "设置窗里标题由设置中心画，面板自己不画");
  } finally {
    await view.cleanup();
    delete globalThis.__W10_MANAGER_PROPS__;
    delete globalThis.__W10_LIBRARY_PROPS__;
  }
});

const read = (rel) => readFileSync(new URL(`../${rel}`, import.meta.url), "utf8");

test("源码：没有副标题、没有「可一键授权」开关；连接器添加菜单有目录与自定义 MCP；阿里云市场并进目录弹窗", () => {
  const plugins = read("src/pages/PluginsPage.tsx");
  const connectors = read("src/pages/settings/ConnectorsSettingsPane.tsx");
  const catalog = read("src/pages/plugins/ConnectorCatalogDialog.tsx");
  const skills = read("src/pages/settings/SkillsSettingsPane.tsx");
  for (const [name, text] of [["PluginsPage", plugins], ["ConnectorsSettingsPane", connectors], ["ConnectorCatalogDialog", catalog], ["SkillsSettingsPane", skills]]) {
    assert.ok(!text.includes("技能、连接器与 MCP 服务器"), `${name} 不得再有旧副标题`);
    assert.ok(!text.includes("可一键授权"), `${name} 不得再有「可一键授权」`);
    assert.doesNotMatch(text, /oauthOnly/, `${name} 不得再有一键授权筛选`);
  }
  assert.match(connectors, /id: "catalog"/);
  assert.match(connectors, /id: "custom"/);
  assert.match(connectors, /自定义 MCP 服务器/);
  assert.match(catalog, /CATALOG_MARKETPLACE/);
  assert.match(catalog, /去阿里云开通 ↗/);
  assert.doesNotMatch(plugins, /usePluginsCatalog\(|data-mcp-catalog/, "PluginsPage 不再自己平铺阿里云市场");
});

test("旧 agent_knowledge 技能已删；LeoAgent 站「技能」字样清理", () => {
  assert.equal(existsSync(new URL("../src/pages/plugins/SkillsSection.tsx", import.meta.url)), false);
  assert.equal(existsSync(new URL("../src/pages/plugins/skills-api.ts", import.meta.url)), false);
  for (const rel of ["src/pages/PluginsPage.tsx", "src/pages/settings/SkillsSettingsPane.tsx", "src/pages/settings/ConnectorsSettingsPane.tsx"]) {
    assert.ok(!read(rel).includes("agent_knowledge"), `${rel} 不再碰 agent_knowledge`);
  }
  assert.ok(!read("src/shell/SiteSkillDirectory.tsx").includes('tt("按技能")'));
  assert.ok(read("src/shell/SiteSkillDirectory.tsx").includes('tt("按分类")'));
  assert.ok(!read("src/shell/Playground.tsx").includes('tt("按技能")'));
  assert.ok(read("src/shell/Playground.tsx").includes('tt("按分类")'));
  assert.ok(!read("src/shell/OrgCanvas.tsx").includes('tt("有技能")'));
  assert.ok(read("src/shell/OrgCanvas.tsx").includes('tt("有专长")'));
});

test("入口：输入框浮层「添加连接器」去连接器栏；账号菜单「技能」去技能栏", () => {
  assert.match(read("src/shell/PluginsPopover.tsx"), /openSettingsModal\("connectors"\)/);
  assert.match(read("src/shell/usePluginsCatalog.ts"), /PLUGINS_SETTINGS_HREF = "\/settings\/connectors"/);
  assert.match(read("src/shell/AccountMenu.tsx"), /label=\{tt\("技能"\)\} onSelect=\{\(\) => settings\("skills"\)\}/);
});
