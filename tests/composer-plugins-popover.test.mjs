import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
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

const visualViewport = new window.EventTarget();
Object.assign(visualViewport, {
  width: 1_024,
  height: 768,
  offsetLeft: 0,
  offsetTop: 0,
});
Object.defineProperty(window, "visualViewport", {
  configurable: true,
  value: visualViewport,
});
Object.defineProperty(window, "innerWidth", {
  configurable: true,
  value: 1_024,
});
Object.defineProperty(window, "scrollTo", {
  configurable: true,
  value() {},
});

class PopoverResizeObserver {
  constructor() {
    this.targets = new Set();
  }
  observe(target) {
    this.targets.add(target);
  }
  disconnect() {
    this.targets.clear();
  }
}
globalThis.ResizeObserver = PopoverResizeObserver;
window.ResizeObserver = PopoverResizeObserver;

window.HTMLElement.prototype.getBoundingClientRect = function getRect() {
  return {
    x: 24,
    y: 640,
    left: 24,
    top: 640,
    right: 48,
    bottom: 664,
    width: 24,
    height: 24,
    toJSON() {
      return this;
    },
  };
};

const reactUrl = pathToFileURL(require.resolve("react")).href;
const adminOrg = {
  id: "o-admin",
  name: "AdminOrg",
  role: "admin",
  canViewOrgPage: true,
  canViewAllTasks: true,
  currency: "CNY",
};
const memberOrg = {
  id: "o-member",
  name: "MemberOrg",
  role: "member",
  canViewOrgPage: false,
  canViewAllTasks: false,
  currency: "CNY",
};

const fixtureItems = [
  { code: "github", name: "GitHub", detail_url: "https://oauth.example/github" },
  { code: "gmail", name: "Gmail", description: "Mail Beta" },
  { code: "slack", name: "Slack" },
];
const fixtureConnections = [
  {
    orgId: "o-admin",
    orgName: "AdminOrg",
    connectorId: "gmail",
    label: "Gmail",
    icon: "✉️",
    toolsCount: 4,
    enabled: true,
    memberVisible: true,
    forwardMemberIdentity: false,
  },
  {
    orgId: "o-member",
    orgName: "MemberOrg",
    connectorId: "slack",
    label: "Slack",
    icon: "💬",
    toolsCount: 2,
    enabled: true,
    memberVisible: true,
    forwardMemberIdentity: false,
  },
];

const catalogStub = dataModule(`
  const g = () => globalThis.__W5_PLUGINS_CATALOG__;
  export function canManageOrgMcp(role){ return role === "owner" || role === "admin"; }
  export function normalizeOrgMcpConnections(){ return []; }
  export function shouldRenderOrgSection(){ return false; }
  export async function quietOrg(run){ try { return await run(); } catch { return null; } }
  export function buildPopoverConnectors(input){
    return g().buildPopoverConnectors(input);
  }
  export function usePluginsCatalog(){
    return g().state;
  }
`);

const authStub = dataModule(`
  export async function getUserEmail(){
    return "__W5_PLUGINS_EMAIL__" in globalThis
      ? globalThis.__W5_PLUGINS_EMAIL__
      : "op@example.com";
  }
`);

const uiStub = dataModule(`
  export function useUI(){
    return (zh, vars) => vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);

const lazyStub = dataModule(
  "const noop = () => undefined;\n" +
    "export default new Proxy(noop, { get: () => noop });\n" +
    "export const __stub = true;\n",
);

const { buildPopoverConnectors } = await import(
  await compileModule("src/shell/usePluginsCatalog.ts", {
    "../i18n/ui/useUI": uiStub,
    "../lib/database": dataModule(
      "export async function getMcpCatalog(){ return { ok: true, data: { items: [] } }; }",
    ),
    "../lib/org-api": dataModule(`
      export async function listMyOrgs(){ return []; }
      export async function listInheritedMcp(){ return { connections: [] }; }
      export async function listOrgMcpConnections(){ return { connections: [] }; }
      export async function patchOrgMcpConnection(){ return {}; }
      export async function deleteOrgMcpConnection(){ return {}; }
      export async function setOrgMcpForwardIdentity(){ return {}; }
    `),
  }, { missingPackageStub: lazyStub })
);

const { LeoComposer } = await import(
  await compileModule(
    "src/shell/LeoComposer.tsx",
    {
      "../i18n/ui/useUI": uiStub,
      "./usePluginsCatalog": catalogStub,
      "../lib/auth": authStub,
      "../pages/AuthDialog": dataModule(
        "export function AuthDialog(){ return null; }",
      ),
      "./cloud-computer/ComputerDock": dataModule(
        "export function ComputerDock(){ return null; }",
      ),
      "./ModelPicker": dataModule(
        "export function ModelGroupPicker(){ return null; }",
      ),
      "./PayerSelector": dataModule(
        "export function PayerSelector(){ return null; }",
      ),
      "./mcp-apps": dataModule(
        "export function ComposerAppsBar(){ return null; }",
      ),
      "./PromptHighlightArea": dataModule(`
        import { createElement, forwardRef } from "${reactUrl}";
        export const PromptHighlightArea = forwardRef(function PromptHighlightArea(props, _ref){
          return createElement("textarea", {
            placeholder: props.placeholder,
            defaultValue: props.value || "",
            readOnly: true,
          });
        });
        export const TemplateFillArea = PromptHighlightArea;
      `),
    },
    { missingPackageStub: lazyStub },
  )
);

function catalogState(extra = {}) {
  const patchCalls = [];
  return {
    items: fixtureItems,
    loading: false,
    error: null,
    reload() {},
    orgs: [adminOrg, memberOrg],
    orgConnections: fixtureConnections,
    refreshOrgConnections: async () => {},
    busyConnector: "",
    patchConnection: async (row, patch) => {
      patchCalls.push({ row, patch });
    },
    removeConnection: async () => {},
    setForwardIdentity: async () => {},
    patchCalls,
    ...extra,
  };
}

async function mountComposer(props = {}) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(LeoComposer, {
        value: "",
        onChange() {},
        ...props,
      }),
    );
  });
  await act(
    () =>
      new Promise((resolve) => window.requestAnimationFrame(resolve)),
  );
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("buildPopoverConnectors：未连接走连接，可管已连接走开关，成员已连接走灰字", () => {
  const rows = buildPopoverConnectors({
    items: fixtureItems,
    connections: fixtureConnections,
    orgs: [adminOrg, memberOrg],
  });
  assert.equal(rows.find((row) => row.id === "github")?.kind, "connect");
  assert.equal(rows.find((row) => row.id === "gmail")?.kind, "toggle");
  assert.equal(rows.find((row) => row.id === "slack")?.kind, "connected");
  assert.equal(rows.find((row) => row.id === "gmail")?.beta, true);
});

test("插件按钮渲染 SVG 不是 img；点击后浮层 portal 到 body 并列出连接 / 开关 / 添加连接器", async () => {
  globalThis.__W5_PLUGINS_EMAIL__ = "op@example.com";
  globalThis.__W5_PLUGINS_CATALOG__ = {
    state: catalogState(),
    buildPopoverConnectors,
  };
  const mounted = await mountComposer();
  try {
    const button = document.querySelector("[data-composer-plugins-button]");
    assert.ok(button);
    assert.equal(button.querySelector("svg")?.tagName, "svg");
    assert.equal(button.querySelector("img"), null);

    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(
      () =>
        new Promise((resolve) => window.requestAnimationFrame(resolve)),
    );

    const panel = document.querySelector("[data-plugins-popover]");
    assert.ok(panel);
    assert.equal(panel.parentElement, document.body);
    assert.equal(window.getComputedStyle(panel).position || panel.style.position, "fixed");
    assert.equal(panel.style.position, "fixed");

    const github = panel.querySelector('[data-connector-row="github"]');
    const gmail = panel.querySelector('[data-connector-row="gmail"]');
    const slack = panel.querySelector('[data-connector-row="slack"]');
    assert.ok(github);
    assert.ok(gmail);
    assert.ok(slack);
    assert.ok(github.querySelector("[data-connector-connect]"));
    assert.equal(
      github.querySelector("[data-connector-connect]").textContent.trim(),
      "连接",
    );
    assert.ok(gmail.querySelector("[data-connector-toggle][role='switch']"));
    assert.ok(slack.textContent.includes("已连接"));
    assert.ok(slack.querySelector("[data-connector-manage]"));

    const add = panel.querySelector("[data-plugins-add-connector]");
    assert.ok(add);
    assert.equal(add.getAttribute("href"), "/plugins");
    assert.match(add.textContent, /添加连接器/);
  } finally {
    await mounted.unmount();
    delete globalThis.__W5_PLUGINS_CATALOG__;
    delete globalThis.__W5_PLUGINS_EMAIL__;
  }
});

test("传 onOpenPlugins 时不开浮层，只调回调", async () => {
  globalThis.__W5_PLUGINS_EMAIL__ = "op@example.com";
  globalThis.__W5_PLUGINS_CATALOG__ = {
    state: catalogState(),
    buildPopoverConnectors,
  };
  let calls = 0;
  const mounted = await mountComposer({
    onOpenPlugins() {
      calls += 1;
    },
  });
  try {
    const button = document.querySelector("[data-composer-plugins-button]");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(calls, 1);
    assert.equal(document.querySelector("[data-plugins-popover]"), null);
  } finally {
    await mounted.unmount();
    delete globalThis.__W5_PLUGINS_CATALOG__;
    delete globalThis.__W5_PLUGINS_EMAIL__;
  }
});

test("未登录显示登录后可用；Esc 关闭已打开的浮层", async () => {
  globalThis.__W5_PLUGINS_EMAIL__ = null;
  globalThis.__W5_PLUGINS_CATALOG__ = {
    state: catalogState(),
    buildPopoverConnectors,
  };
  const mounted = await mountComposer();
  try {
    const button = document.querySelector("[data-composer-plugins-button]");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(
      () =>
        new Promise((resolve) => window.requestAnimationFrame(resolve)),
    );
    const panel = document.querySelector("[data-plugins-popover]");
    assert.ok(panel);
    assert.ok(panel.querySelector("[data-plugins-signin]"));
    assert.match(panel.textContent, /登录后可用/);

    await act(async () => {
      document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    assert.equal(
      document.querySelector("[data-plugins-popover]")?.getAttribute("data-leo-overlay-state"),
      "closed",
    );
  } finally {
    await mounted.unmount();
    delete globalThis.__W5_PLUGINS_CATALOG__;
    delete globalThis.__W5_PLUGINS_EMAIL__;
  }
});
