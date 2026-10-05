// 设置左栏身份卡片：点开切换个人/团队；没有别的身份时出现创建团队。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

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
  url: "https://oceanleo.com/settings/account",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  localStorage: window.localStorage,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
  StorageEvent: window.StorageEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
const visualViewport = new window.EventTarget();
Object.assign(visualViewport, { width: 1024, height: 768, offsetLeft: 0, offsetTop: 0 });
Object.defineProperty(window, "visualViewport", { configurable: true, value: visualViewport });
Object.defineProperty(window, "innerWidth", { configurable: true, value: 1024 });
Object.defineProperty(window, "scrollTo", { configurable: true, value() {} });
class StillResizeObserver {
  observe() {}
  disconnect() {}
}
globalThis.ResizeObserver = StillResizeObserver;
window.ResizeObserver = StillResizeObserver;
window.HTMLElement.prototype.getBoundingClientRect = function rect() {
  return { x: 16, y: 80, left: 16, top: 80, right: 220, bottom: 124, width: 204, height: 44, toJSON() { return this; } };
};

globalThis.__orgsStub = [];

const reactUrl = pathToFileURL(require.resolve("react")).href;

const { SettingsIdentityCard } = await import(
  await compileModule("src/pages/settings/SettingsIdentityCard.tsx", {
    "../../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
    "../../lib/org-api": dataModule(`
      export async function listMyOrgs() {
        return Array.isArray(globalThis.__orgsStub) ? globalThis.__orgsStub : [];
      }
    `),
  })
);

const { OrgSection } = await import(
  await compileModule("src/pages/settings/sections/OrgSection.tsx", {
    "../../../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
    "../../OrgMembership": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function OrgMembership(props) {
        return React.createElement("div", { "data-org-only": props.only || "" }, props.only === "create" ? "创建团队表单" : "加入团队");
      }
    `),
    "../../OrgPage": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function OrgPage() {
        return React.createElement("div", { "data-testid": "org-page" }, "组织看板");
      }
    `),
  })
);

const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");

function itemLabel(item) {
  const copy = item.cloneNode(true);
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy.textContent.trim();
}

async function mountCard(props = {}) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const created = [];
  await act(async () => {
    root.render(
      React.createElement(SettingsIdentityCard, {
        displayName: "Ada Lovelace",
        userEmail: "designer@oceanleo.com",
        onCreateOrganization: () => created.push("team"),
        ...props,
      }),
    );
  });
  for (let i = 0; i < 4; i += 1) await act(async () => {});
  return {
    created,
    host: container,
    async open() {
      const trigger = container.querySelector("[data-settings-identity]");
      assert.ok(trigger, "身份卡片没画出来");
      await act(async () => {
        trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await act(() => new Promise((resolve) => window.requestAnimationFrame(resolve)));
      for (let i = 0; i < 4; i += 1) await act(async () => {});
      const menu = window.document.querySelector('[role="menu"][aria-label="个人"]');
      assert.ok(menu, "点身份卡片之后菜单没有打开");
      return menu;
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("合上时只显示名字和当前身份，不出现创建团队", async () => {
  globalThis.__orgsStub = [];
  const view = await mountCard();
  try {
    assert.equal(view.host.querySelector("[data-settings-nav-name]").textContent, "Ada Lovelace");
    assert.equal(view.host.querySelector("[data-settings-identity-kind]").textContent, "个人");
    assert.equal(view.host.textContent.includes("创建团队"), false);
    assert.equal(window.document.body.textContent.includes("创建团队"), false);
  } finally {
    await view.unmount();
  }
});

test("没有别的身份时点开菜单出现创建团队，点了通知设置去建团队", async () => {
  globalThis.__orgsStub = [];
  const view = await mountCard();
  try {
    const menu = await view.open();
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    assert.ok(items.some((item) => itemLabel(item) === "个人"));
    const create = items.find((item) => itemLabel(item).includes("创建团队"));
    assert.ok(create, "没有别的身份时必须出现创建团队");
    assert.equal(
      items.some((item) => item !== create && itemLabel(item).includes("团队")),
      false,
      "没有加入任何团队时，身份菜单里不该出现团队名",
    );
    await act(async () => {
      create.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.deepEqual(view.created, ["team"]);
  } finally {
    await view.unmount();
  }
});

test("有团队时能改身份，菜单里仍然能创建团队", async () => {
  globalThis.__orgsStub = [{ id: "org-1", name: "海狮设计", role: "owner" }];
  window.localStorage.clear();
  const view = await mountCard();
  try {
    const menu = await view.open();
    const items = [...menu.querySelectorAll('[role="menuitem"]')];
    const org = items.find((item) => itemLabel(item).includes("海狮设计"));
    assert.ok(org);
    assert.ok(items.find((item) => itemLabel(item).includes("创建团队")));
    await act(async () => {
      org.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    for (let i = 0; i < 4; i += 1) await act(async () => {});
    assert.equal(view.host.querySelector("[data-settings-identity-kind]").textContent, "海狮设计");
    assert.equal(window.localStorage.getItem("oceanleo.payer.last"), "org-1");
  } finally {
    await view.unmount();
    window.localStorage.clear();
  }
});

test("OrgSection initialPane=create 直接打开创建团队栏", async () => {
  const { createRoot } = await import("react-dom/client");
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(OrgSection, { initialPane: "create" }));
  });
  assert.ok(host.querySelector("[data-org-settings-block=create]"));
  assert.ok(host.textContent.includes("创建团队表单"));
  await act(async () => root.unmount());
  host.remove();
});

test("英文创建团队；源码写创建团队，不再写创建组织", () => {
  assert.equal(UI_MESSAGES.en["创建团队"], "Create a team");
  const files = [
    "src/shell/AccountMenu.tsx",
    "src/pages/settings/SettingsIdentityCard.tsx",
    "src/i18n/ui/messages/enterprise-copy-western.ts",
  ];
  for (const relative of files) {
    const source = readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
    assert.doesNotMatch(source, /创建组织|Create an organization|Create organization"/);
  }
  const menu = readFileSync(new URL("../src/shell/AccountMenu.tsx", import.meta.url), "utf8");
  const card = readFileSync(new URL("../src/pages/settings/SettingsIdentityCard.tsx", import.meta.url), "utf8");
  const hub = readFileSync(new URL("../src/pages/settings/SettingsHub.tsx", import.meta.url), "utf8");
  assert.match(menu, /tt\("创建团队"\)/);
  assert.match(card, /tt\("创建团队"\)/);
  assert.match(hub, /onCreateOrganization=\{\(\) => selectTab\("team", \{ orgPane: "create" \}\)\}/);
});

test("设置窗里的身份菜单盖过设置窗，焦点不被设置窗抢回去", () => {
  const card = readFileSync(new URL("../src/pages/settings/SettingsIdentityCard.tsx", import.meta.url), "utf8");
  const modal = readFileSync(new URL("../src/pages/settings/SettingsModal.tsx", import.meta.url), "utf8");
  assert.match(card, /zClassName="z-\[180\]"/);
  assert.match(card, /data-settings-identity-switch/);
  assert.match(modal, /data-anchored-popover/);
  assert.match(modal, /data-settings-frame/);
});
