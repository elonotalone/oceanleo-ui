// 已连接的设备页（account-manus-layout W4）。
//
// 对着 Manus Connected devices：当前设备一张卡（Chrome 图标、Chrome · Windows、
// 上次活动、图钉城市、右侧蓝胶囊「当前设备」），其他设备一个描边框；空态不是旧句。
// 当前这台没有移除。完整 IP 不进 DOM。
//
// 跑法：
//   node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test \
//        tests/login-devices-page.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const reactUrl = pathToFileURL(require.resolve("react")).href;

const NOW = Date.parse("2026-10-01T12:00:06.000Z");
const SIX_SEC_AGO = "2026-10-01T12:00:00.000Z";
const FULL_IPV4 = "203.0.113.77";
const FULL_IPV6 = "2001:db8:85a3:0:0:8a2e:370:7334";

const uiStubUrl = dataModule(`
  const tt = (zh, vars) =>
    vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  export function useUI() { return tt; }
`);

const identityStubUrl = dataModule(`
  export async function updateDeviceLabel(sessionId, label) {
    const g = globalThis.__LOGIN_DEVICES__;
    if (g && g.labels) g.labels[sessionId] = label;
    return {};
  }
`);

const securityStubUrl = dataModule(`
  export async function getSecuritySessions() {
    const g = globalThis.__LOGIN_DEVICES__ || {};
    return { ok: true, status: 200, data: g.sessions || [] };
  }
  export async function revokeSecuritySession(sessionId) {
    const g = globalThis.__LOGIN_DEVICES__ || {};
    g.revoked = sessionId;
    g.sessions = (g.sessions || []).filter((s) => s.id !== sessionId);
    return { ok: true, data: { ok: true } };
  }
`);

const confirmStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }) {
    return React.createElement(
      "div",
      { "data-confirm-dialog": "" },
      React.createElement("p", { "data-confirm-title": "" }, title),
      body ? React.createElement("p", { "data-confirm-body": "" }, body) : null,
      React.createElement("button", { type: "button", "data-confirm-ok": "", onClick: onConfirm }, confirmLabel),
      React.createElement("button", { type: "button", "data-confirm-cancel": "", onClick: onCancel }, "取消"),
    );
  }
`);

const pageUrl = await compileModule("src/pages/settings/account/LoginDevicesPage.tsx", {
  "../../../i18n/ui/useUI": uiStubUrl,
  "../../../lib/auth/account-identity": identityStubUrl,
  "../../../lib/auth/account-security": securityStubUrl,
  "../../../ui": confirmStubUrl,
  "react-dom": reactDomUrl,
});

const { LoginDevicesPage, default: LoginDevicesPageDefault } = await import(pageUrl);

assert.equal(
  LoginDevicesPageDefault,
  LoginDevicesPage,
  "合同钉默认导出 LoginDevicesPage",
);

async function withDom(run, { sessions = [] } = {}) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];

  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://ppt.oceanleo.com/settings/account/login-devices",
    virtualConsole,
  });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLInputElement: window.HTMLInputElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
  globalThis.__LOGIN_DEVICES__ = { labels: {}, sessions: [...sessions] };

  const previousNow = Date.now;
  Date.now = () => NOW;

  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);

  const render = async (Component, props) => {
    await act(async () => root.render(React.createElement(Component, props)));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  };
  const find = (selector) => window.document.querySelector(selector);
  const html = () => window.document.body.innerHTML;
  const text = () => window.document.body.textContent || "";
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `点不到 ${selector}`);
    return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  };

  try {
    await run({ window, render, find, html, text, click });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    Date.now = previousNow;
    delete globalThis.__LOGIN_DEVICES__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

const currentChrome = {
  id: "here",
  createdAt: "2026-09-30T08:00:00Z",
  lastSeenAt: SIX_SEC_AGO,
  ipMasked: FULL_IPV4,
  deviceLabel: "Chrome · Windows",
  current: true,
  location: "Singapore",
};

test("当前设备卡：Chrome·Windows、新加坡、6 秒前、蓝胶囊；其他设备空框与说明句", async () => {
  await withDom(
    async ({ render, find, text, html }) => {
      await render(LoginDevicesPage, {});
      assert.ok(find("[data-login-devices]"), "根节点 data-login-devices");
      assert.ok(find("[data-current-device]"), "当前设备卡");
      assert.equal(find('[data-browser-icon="chrome"]')?.getAttribute("data-browser-icon"), "chrome");
      const body = text();
      assert.ok(body.includes("Chrome · Windows"), `没有设备名：${body}`);
      assert.ok(body.includes("上次活动 6 秒前"), `相对时间不对：${body}`);
      assert.doesNotMatch(body, /刚刚/);
      assert.equal(find("[data-device-location]")?.textContent, "Singapore");
      assert.equal(find("[data-device-meta-sep]")?.textContent?.trim(), "•");
      assert.ok(find("[data-current-device-pill]"), "右侧当前设备胶囊");
      assert.ok(find("[data-current-device-pill]")?.textContent.includes("当前设备"));
      const pillClass = find("[data-current-device-pill]")?.getAttribute("class") || "";
      assert.doesNotMatch(pillClass, /emerald|green/, "当前设备必须是蓝胶囊不是绿徽章");
      assert.ok(find("[data-other-devices]"), "其他设备分组框");
      assert.ok(
        (find("[data-other-devices-hint]")?.textContent || "").includes(
          "如果无法识别某台设备，请将其移除并更改登录方式。",
        ),
      );
      assert.equal(find("[data-other-devices-empty]")?.textContent?.trim(), "没有其他已登录的设备。");
      assert.doesNotMatch(body, /现在没有别的设备登录。/);
      assert.equal(find("[data-login-device-revoke]"), null, "当前设备不能有移除");
      assert.ok(find('[data-device-rename="here"]'), "当前设备名称旁要有铅笔");
      const rendered = html();
      assert.doesNotMatch(rendered, /203\.0\.113\.77/, "完整 IPv4 进了 DOM");
      assert.doesNotMatch(rendered, /\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/, "DOM 里出现了四段完整地址");
    },
    { sessions: [currentChrome] },
  );
});

test("其它设备有一条时出现移除；当前这台没有", async () => {
  await withDom(
    async ({ render, find, click, text, html }) => {
      await render(LoginDevicesPage, {});
      assert.equal(find('[data-login-device-revoke="here"]'), null, "当前设备不给移除");
      assert.ok(find('[data-login-device-revoke="there"]'), "其它设备必须有移除");
      assert.ok((find('[data-login-device-revoke="there"]')?.textContent || "").includes("移除"));
      assert.equal(find("[data-other-devices-empty]"), null, "有其它设备时不显示空态");
      await click('[data-login-device-revoke="there"]');
      assert.ok(find("[data-confirm-dialog]"), "移除要走确认框");
      assert.equal(find("[data-confirm-title]")?.textContent, "退出这台设备");
      const rendered = html();
      assert.doesNotMatch(rendered, /8a2e:370:7334/, "完整 IPv6 进了 DOM");
      assert.doesNotMatch(text(), /刚刚/);
    },
    {
      sessions: [
        currentChrome,
        {
          id: "there",
          createdAt: "2026-09-29T08:00:00Z",
          lastSeenAt: "2026-10-01T11:56:06.000Z",
          ipMasked: FULL_IPV6,
          deviceLabel: "Safari · macOS",
          current: false,
          location: "",
        },
      ],
    },
  );
});

test("getSecuritySessions 追加读取 location，完整 IP 先 maskIp", async () => {
  const securityUrl = await compileModule("src/lib/auth/account-security.ts", {
    "./client": dataModule(`export async function accessToken() { return "t"; }`),
  });
  const { getSecuritySessions, maskIp } = await import(securityUrl);
  assert.equal(maskIp(FULL_IPV4), "203.0.*.*");
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      sessions: [
        {
          id: "s1",
          created_at: "2026-01-01T00:00:00Z",
          last_seen_at: "2026-01-01T00:00:00Z",
          ip_masked: FULL_IPV4,
          device_label: "Chrome · Windows",
          current: true,
          location: "Singapore",
        },
      ],
    }),
  });
  try {
    const result = await getSecuritySessions();
    assert.equal(result.ok, true);
    assert.equal(result.data?.[0]?.location, "Singapore");
    assert.equal(result.data?.[0]?.ipMasked, "203.0.*.*");
    assert.equal(result.data?.[0]?.deviceLabel, "Chrome · Windows");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("location 为空不画假城市，不出现位置未知", async () => {
  await withDom(
    async ({ render, find, text }) => {
      await render(LoginDevicesPage, {});
      assert.equal(find("[data-device-location]"), null, "没有 location 就不画图钉段");
      assert.doesNotMatch(text(), /Singapore|位置未知/);
    },
    {
      sessions: [
        {
          ...currentChrome,
          location: "",
        },
      ],
    },
  );
});
