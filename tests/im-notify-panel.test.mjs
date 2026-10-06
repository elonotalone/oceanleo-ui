// W03：提醒设置面板（六个开关 + 推送一行）与桌面通知。jsdom 渲染，网络与浏览器推送全部替身。
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
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

function installDom(url) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url });
  const { window } = dom;
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    CustomEvent: window.CustomEvent,
    MouseEvent: window.MouseEvent,
  })) {
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  return window;
}

// ---- 替身：网关调用、推送流程、文案 ---------------------------------------
const ctl = {
  settings: null,
  pushConfig: { enabled: true, vapid_public_key: "KEY", portal_origin: "https://oceanleo.com" },
  loadOk: true,
  saveOk: true,
  saved: [],
  enableResult: { ok: true },
  enableCalls: 0,
  disableCalls: 0,
  loadCalls: 0,
};
globalThis.__imNotifyCtl = ctl;

const notifyApiStub = dataModule(`
  const c = () => globalThis.__imNotifyCtl;
  export const DEFAULT_IM_SETTINGS = {
    presence_invisible: false, email_reminders: true, push_enabled: false,
    desktop_notifications: true, sound: true, show_exact_times_in_replays: false,
  };
  export async function fetchImSettings() {
    c().loadCalls += 1;
    return c().loadOk ? { ok: true, data: { ...c().settings } } : { ok: false, status: 503, code: "unavailable" };
  }
  export async function fetchPushConfig() { return { ok: true, data: c().pushConfig }; }
  export async function saveImSettings(patch) {
    c().saved.push(patch);
    if (!c().saveOk) return { ok: false, status: 503, code: "unavailable" };
    c().settings = { ...c().settings, ...patch };
    return { ok: true, data: { ...c().settings } };
  }
`);
const pushStub = dataModule(`
  const c = () => globalThis.__imNotifyCtl;
  export function pushSupported() { return true; }
  export function isPortalOrigin(origin) { return origin === globalThis.window.location.origin; }
  export async function enablePush() { c().enableCalls += 1; return c().enableResult; }
  export async function disablePush() { c().disableCalls += 1; return true; }
`);
const useUiStub = dataModule(`export function useUI() { return (text) => text; }`);

const { NotifySettingsPanel } = await import(
  await compileModule("src/shell/messages/notify/NotifySettingsPanel.tsx", {
    "../../../lib/im/notify-api": notifyApiStub,
    "./push-subscribe": pushStub,
    "../../../i18n/ui/useUI": useUiStub,
  })
);

async function mount() {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(NotifySettingsPanel));
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(el) {
  await act(async () => {
    el.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const DEFAULTS = {
  presence_invisible: false,
  email_reminders: true,
  push_enabled: false,
  desktop_notifications: true,
  sound: true,
  show_exact_times_in_replays: false,
};

function reset(overrides = {}) {
  Object.assign(ctl, {
    settings: { ...DEFAULTS },
    pushConfig: { enabled: true, vapid_public_key: "KEY", portal_origin: "https://oceanleo.com" },
    loadOk: true,
    saveOk: true,
    saved: [],
    enableResult: { ok: true },
    enableCalls: 0,
    disableCalls: 0,
    loadCalls: 0,
    ...overrides,
  });
}

const switches = (container) => [...container.querySelectorAll('[role="switch"]')];
const switchByLabel = (container, label) => switches(container).find((el) => el.getAttribute("aria-label") === label);

test("门户域：六个开关按设置显示，推送开关可点", async () => {
  installDom("https://oceanleo.com/?im=inbox");
  reset({ settings: { ...DEFAULTS, sound: false, presence_invisible: true } });
  const view = await mount();
  assert.equal(switches(view.container).length, 6);
  assert.equal(switchByLabel(view.container, "隐身模式").getAttribute("aria-checked"), "true");
  assert.equal(switchByLabel(view.container, "提示音").getAttribute("aria-checked"), "false");
  assert.equal(switchByLabel(view.container, "邮件提醒").getAttribute("aria-checked"), "true");
  const pushSwitch = switchByLabel(view.container, "在这台电脑开启推送");
  assert.ok(pushSwitch, "门户域里推送开关的名字是「在这台电脑开启推送」");
  assert.equal(pushSwitch.disabled, false);
  assert.equal(view.container.querySelector("a"), null, "门户域不出现「去 oceanleo.com 开启」");
  await view.unmount();
});

test("拨动开关：把那一项存给网关，界面跟着变", async () => {
  installDom("https://oceanleo.com/");
  reset();
  const view = await mount();
  await click(switchByLabel(view.container, "邮件提醒"));
  assert.deepEqual(ctl.saved, [{ email_reminders: false }]);
  assert.equal(switchByLabel(view.container, "邮件提醒").getAttribute("aria-checked"), "false");
  await click(switchByLabel(view.container, "回放里显示精确时刻"));
  assert.deepEqual(ctl.saved[1], { show_exact_times_in_replays: true });
  assert.equal(switchByLabel(view.container, "回放里显示精确时刻").getAttribute("aria-checked"), "true");
  await view.unmount();
});

test("保存失败：开关退回原状并提示", async () => {
  installDom("https://oceanleo.com/");
  reset({ saveOk: false });
  const view = await mount();
  await click(switchByLabel(view.container, "提示音"));
  assert.equal(switchByLabel(view.container, "提示音").getAttribute("aria-checked"), "true");
  assert.match(view.container.querySelector('[role="status"]').textContent, /没能保存/);
  await view.unmount();
});

test("在门户域点推送：走订阅流程，成功后开关为开；再点关闭", async () => {
  installDom("https://oceanleo.com/");
  reset();
  const view = await mount();
  await click(switchByLabel(view.container, "在这台电脑开启推送"));
  assert.equal(ctl.enableCalls, 1);
  const on = switchByLabel(view.container, "在这台电脑关闭推送");
  assert.ok(on);
  assert.equal(on.getAttribute("aria-checked"), "true");
  await click(on);
  assert.equal(ctl.disableCalls, 1);
  assert.equal(switchByLabel(view.container, "在这台电脑开启推送").getAttribute("aria-checked"), "false");
  await view.unmount();
});

test("推送被浏览器拒绝：开关保持关，给出人话提示", async () => {
  installDom("https://oceanleo.com/");
  reset({ enableResult: { ok: false, reason: "denied" } });
  const view = await mount();
  await click(switchByLabel(view.container, "在这台电脑开启推送"));
  assert.equal(switchByLabel(view.container, "在这台电脑开启推送").getAttribute("aria-checked"), "false");
  assert.match(view.container.querySelector('[role="status"]').textContent, /拒绝了通知权限/);
  await view.unmount();
});

test("不在门户域：只给「去 oceanleo.com 开启」链接，推送开关关着时点不了", async () => {
  installDom("https://image.oceanleo.com/");
  reset();
  const view = await mount();
  const link = view.container.querySelector("a");
  assert.ok(link);
  assert.equal(link.textContent, "去 oceanleo.com 开启");
  assert.equal(link.getAttribute("href"), "https://oceanleo.com/?im=inbox");
  assert.equal(link.getAttribute("target"), "_blank");
  assert.match(link.getAttribute("rel"), /noopener/);
  assert.match(link.getAttribute("rel"), /noreferrer/);
  const pushSwitch = switchByLabel(view.container, "浏览器推送");
  assert.equal(pushSwitch.disabled, true);
  await click(pushSwitch);
  assert.equal(ctl.enableCalls, 0);
  await view.unmount();
});

test("不在门户域但推送已开：可以从这里关掉", async () => {
  installDom("https://image.oceanleo.com/");
  reset({ settings: { ...DEFAULTS, push_enabled: true } });
  const view = await mount();
  const pushSwitch = switchByLabel(view.container, "浏览器推送");
  assert.equal(pushSwitch.disabled, false);
  await click(pushSwitch);
  assert.equal(ctl.disableCalls, 1);
  assert.equal(switchByLabel(view.container, "浏览器推送").getAttribute("aria-checked"), "false");
  await view.unmount();
});

test("加载失败：显示重试，点了重新拉取", async () => {
  installDom("https://oceanleo.com/");
  reset({ loadOk: false });
  const view = await mount();
  assert.equal(switches(view.container).length, 0);
  assert.match(view.container.textContent, /没能加载出来/);
  ctl.loadOk = true;
  const callsBefore = ctl.loadCalls;
  await click(view.container.querySelector("button"));
  assert.equal(ctl.loadCalls, callsBefore + 1);
  assert.equal(switches(view.container).length, 6);
  await view.unmount();
});

test("开桌面通知时浏览器还没授权 → 弹授权请求", async () => {
  installDom("https://oceanleo.com/");
  const asked = [];
  globalThis.Notification = class {
    static permission = "default";
    static async requestPermission() {
      asked.push(true);
      return "granted";
    }
  };
  reset({ settings: { ...DEFAULTS, desktop_notifications: false } });
  const view = await mount();
  await click(switchByLabel(view.container, "桌面通知"));
  assert.equal(asked.length, 1);
  assert.deepEqual(ctl.saved.at(-1), { desktop_notifications: true });
  await view.unmount();
  delete globalThis.Notification;
});

// ---- 桌面通知 -------------------------------------------------------------
const notifyState = { settings: null, refreshed: 0 };
globalThis.__desktopCtl = notifyState;
const desktopNotifyStubs = {
  "../../../lib/im/notify-api": dataModule(`
    const c = () => globalThis.__desktopCtl;
    export const DEFAULT_IM_SETTINGS = { desktop_notifications: true };
    export function cachedImSettings() { return c().settings; }
    export function refreshImSettingsInBackground() { c().refreshed += 1; }
  `),
  "./push-subscribe": dataModule(`
    export const IM_OPEN_EVENT = "oceanleo:im-open";
    export function dispatchImOpen(detail) {
      globalThis.window.dispatchEvent(new globalThis.CustomEvent(IM_OPEN_EVENT, { detail }));
    }
    export function installImOpenBridge() { globalThis.__bridgeInstalled = (globalThis.__bridgeInstalled || 0) + 1; return () => {}; }
  `),
};

test("桌面通知：只有后台 + 设置允许 + 已授权才弹，同会话同 tag，点击回到页面并打开会话", async () => {
  const win = installDom("https://oceanleo.com/");
  const shown = [];
  globalThis.Notification = class {
    static permission = "granted";
    constructor(title, options) {
      this.title = title;
      this.options = options;
      this.closed = false;
      shown.push(this);
    }
    close() {
      this.closed = true;
    }
  };
  const focused = [];
  win.focus = () => focused.push(true);
  const opened = [];
  win.addEventListener("oceanleo:im-open", (event) => opened.push(event.detail));
  const { maybeShowDesktopNotification } = await import(
    await compileModule("src/shell/messages/notify/desktop-notify.ts", desktopNotifyStubs)
  );
  assert.equal(globalThis.__bridgeInstalled, 1, "模块加载时接上 Service Worker 的 im.open 消息桥");

  const input = { title: "小明 · 周会群", body: "明天十点开会", conversationId: "c1", icon: "https://x.test/a.png" };
  const hidden = (value) => Object.defineProperty(win.document, "hidden", { configurable: true, value });

  hidden(false);
  notifyState.settings = null;
  maybeShowDesktopNotification(input);
  assert.equal(shown.length, 0, "页面在前台不弹");

  hidden(true);
  notifyState.settings = { desktop_notifications: false };
  maybeShowDesktopNotification(input);
  assert.equal(shown.length, 0, "设置里关了不弹");

  notifyState.settings = null; // 还没取到设置：按默认（开）并后台去取
  maybeShowDesktopNotification(input);
  assert.equal(shown.length, 1);
  assert.ok(notifyState.refreshed >= 1);
  assert.equal(shown[0].options.tag, "im:c1");
  assert.equal(shown[0].options.body, "明天十点开会");
  assert.equal(shown[0].options.icon, "https://x.test/a.png");

  notifyState.settings = { desktop_notifications: true };
  maybeShowDesktopNotification({ ...input, icon: "javascript:alert(1)" });
  assert.equal(shown[1].options.icon, undefined, "只认 https 图标");
  assert.equal(shown[1].options.tag, "im:c1", "同一会话用同一个 tag，浏览器据此覆盖旧通知");

  shown[1].onclick();
  assert.equal(focused.length, 1);
  assert.equal(shown[1].closed, true);
  assert.deepEqual(opened, [{ conversationId: "c1" }]);

  globalThis.Notification.permission = "denied";
  maybeShowDesktopNotification(input);
  assert.equal(shown.length, 2, "没授权不弹");
  delete globalThis.Notification;
  assert.doesNotThrow(() => maybeShowDesktopNotification(input), "浏览器没有 Notification 也不抛");
});
