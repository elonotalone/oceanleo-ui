// 侧栏「我的设备」小窗：机器状态只有 computer-state 一个口径。
// 操作员账号的真实形状（2026-09-24 只读 SELECT）：14 台「连接我的服务器」从没确认、已 removed，
// 2 台阿里云从没确认、已 released，1 台确认过又 removed，1 台 elon 已接入且节点在线。
// 小窗曾把前 16 台算成「16 台接入中」。
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
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://ppt.oceanleo.com/",
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
  MouseEvent: window.MouseEvent,
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

const GATEWAY = "https://gw.test";
const PORTAL = "https://oceanbizs.com";
const reactUrl = pathToFileURL(require.resolve("react")).href;

const STUBS = {
  "../../lib/auth/config": dataModule(`export const GATEWAY_BASE = ${JSON.stringify(GATEWAY)};`),
  "../../lib/auth/client": dataModule(`export async function accessToken() { return "t"; }`),
  "../../api/devices": dataModule(`
    export async function listDevices() {
      return { ok: true, data: globalThis.__w06Devices || [] };
    }
  `),
  "../../i18n/ui/useUI": dataModule(`
    export function useUI() {
      return (zh, vars) =>
        vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
    }
  `),
  "../../contracts/domain-family": dataModule(`
    export function currentDomainFamily() { return "com"; }
    export function currentDomainProfile() { return { portalOrigin: ${JSON.stringify(PORTAL)} }; }
  `),
  "./AnchoredFixedPopover": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function AnchoredFixedPopover({ open, children }) {
      return open ? React.createElement("div", { "data-anchored": "1" }, children) : null;
    }
  `),
  "next/link": dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export default function Link({ href, children, ...rest }) {
      return React.createElement("a", { href, ...rest }, children);
    }
  `),
};

const { buildDeviceStatusView } = await import(
  await compileModule("src/shell/account/device-status-api.ts", STUBS)
);
const { DeviceStatusPopover } = await import(
  await compileModule("src/shell/account/DeviceStatusPopover.tsx", STUBS)
);
const { computerDisplayState } = await import(
  await compileModule("src/shell/cloud-computer/computer-state.ts")
);

const ENROLLED = "2026-09-12T00:00:00Z";
const CONFIRMED = "2026-09-12T00:05:00Z";
const RELEASED = "2026-09-21T08:00:00Z";

function row(overrides) {
  return {
    id: "cc_x",
    name: "x",
    source: "byo",
    status: "active",
    edition: "com",
    charge_status: "ok",
    node_online: false,
    enrolled_at: null,
    confirmed_at: null,
    released_at: null,
    created_at: "2026-09-10T00:00:00Z",
    updated_at: "2026-09-10T00:00:00Z",
    ...overrides,
  };
}

const OPERATOR_ROWS = [
  ...Array.from({ length: 14 }, (_, i) =>
    row({ id: `cc_removed_${i}`, name: `我的服务器 ${i + 1}`, status: "removed", released_at: RELEASED }),
  ),
  ...Array.from({ length: 2 }, (_, i) =>
    row({
      id: `cc_released_${i}`,
      name: `阿里云 ${i + 1}`,
      source: "aliyun",
      status: "released",
      released_at: RELEASED,
    }),
  ),
  row({
    id: "cc_removed_confirmed",
    name: "旧服务器",
    status: "removed",
    enrolled_at: ENROLLED,
    confirmed_at: CONFIRMED,
    released_at: RELEASED,
  }),
  row({
    id: "cc_elon",
    name: "elon",
    status: "active",
    enrolled_at: ENROLLED,
    confirmed_at: CONFIRMED,
    node_online: true,
  }),
];

const EVERY_STATE_ROWS = [
  row({ id: "cc_ready", name: "ready", enrolled_at: ENROLLED, confirmed_at: CONFIRMED, node_online: true }),
  row({ id: "cc_offline", name: "offline", enrolled_at: ENROLLED, confirmed_at: CONFIRMED }),
  row({
    id: "cc_stopped",
    name: "stopped",
    source: "aliyun",
    status: "stopped",
    enrolled_at: ENROLLED,
    confirmed_at: CONFIRMED,
  }),
  row({
    id: "cc_unpaid",
    name: "unpaid",
    source: "aliyun",
    status: "running",
    charge_status: "unpaid",
    enrolled_at: ENROLLED,
    confirmed_at: CONFIRMED,
    node_online: true,
  }),
  row({ id: "cc_error", name: "error", source: "aliyun", status: "error" }),
  row({ id: "cc_provisioning", name: "provisioning", source: "aliyun", status: "provisioning" }),
  row({ id: "cc_install", name: "pending_install", status: "pending" }),
  row({ id: "cc_confirm", name: "pending_confirm", status: "enrolled", enrolled_at: ENROLLED }),
  row({
    id: "cc_releasing",
    name: "releasing",
    source: "aliyun",
    status: "releasing",
    enrolled_at: ENROLLED,
    confirmed_at: CONFIRMED,
  }),
  row({ id: "cc_released", name: "released", source: "aliyun", status: "released", released_at: RELEASED }),
  row({
    id: "cc_removed",
    name: "removed",
    status: "removed",
    enrolled_at: ENROLLED,
    confirmed_at: CONFIRMED,
    released_at: RELEASED,
  }),
];

const requests = [];
globalThis.fetch = async (url) => {
  requests.push(String(url));
  const items = (globalThis.__w06Computers || []).map((item) => ({ ...item }));
  return { ok: true, json: async () => ({ items }) };
};

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function openPopover({ computers, devices = [] }) {
  globalThis.__w06Computers = computers;
  globalThis.__w06Devices = devices;
  requests.length = 0;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(DeviceStatusPopover));
  });
  const button = host.querySelector('button[aria-label="我的设备"]');
  assert.ok(button, "侧栏没有「我的设备」按钮");
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  const panel = host.querySelector("[data-oceanleo-device-status-panel]");
  assert.ok(panel, "点了按钮没有弹出小窗");
  return {
    panel,
    text: () => panel.textContent || "",
    rows: () => [...panel.querySelectorAll("li")].map((li) => li.textContent),
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("操作员那 18 行：0 台接入中，只列 elon 且在线", () => {
  const view = buildDeviceStatusView([], OPERATOR_ROWS);
  assert.equal(view.pendingCount, 0, `小窗会写「${view.pendingCount} 台接入中」`);
  assert.deepEqual(
    view.computers.map(({ name, state }) => ({ name, state })),
    [{ name: "elon", state: "ready" }],
  );
  assert.equal(view.empty, false);
});

test("小窗打开后：不出现「台接入中」，已移除 / 已释放的机器一台都不列，elon 显示在线", async () => {
  const view = await openPopover({ computers: OPERATOR_ROWS });
  try {
    assert.doesNotMatch(view.text(), /台接入中/, `小窗写着：${view.text()}`);
    assert.deepEqual(view.rows(), ["elon在线"]);
    for (const gone of ["我的服务器", "阿里云", "旧服务器"]) {
      assert.ok(!view.text().includes(gone), `已移除 / 已释放的「${gone}」出现在小窗里`);
    }
    assert.deepEqual(requests, [`${GATEWAY}/v1/computers`]);
  } finally {
    view.cleanup();
  }
});

test("每种状态都按 computer-state 归组：接入中只含开通中 / 待装命令 / 待确认，gone 哪里都没有", () => {
  const view = buildDeviceStatusView([], EVERY_STATE_ROWS);
  assert.equal(view.pendingCount, 3);
  assert.deepEqual(
    view.computers.map(({ name, state }) => ({ name, state })),
    [
      { name: "ready", state: "ready" },
      { name: "offline", state: "offline" },
      { name: "stopped", state: "stopped" },
      { name: "unpaid", state: "unpaid" },
      { name: "error", state: "error" },
    ],
  );
  const byName = new Map(EVERY_STATE_ROWS.map((item) => [item.name, item]));
  for (const shown of view.computers) {
    assert.equal(shown.state, computerDisplayState(byName.get(shown.name)), shown.name);
  }
});

test("小窗里每种状态的文案与设备页、坞一致；接入中那一行链到门户设备页", async () => {
  const view = await openPopover({ computers: EVERY_STATE_ROWS });
  try {
    assert.deepEqual(view.rows(), [
      "ready在线",
      "offline离线",
      "stopped已停机",
      "unpaid欠费",
      "error开通失败",
    ]);
    const pending = [...view.panel.querySelectorAll("a")].find((a) =>
      /台接入中/.test(a.textContent || ""),
    );
    assert.ok(pending, `小窗写着：${view.text()}`);
    assert.equal(pending.textContent, "3 台接入中");
    assert.equal(pending.getAttribute("href"), `${PORTAL}/devices?tab=cloud`);
    for (const gone of ["releasing", "released", "removed"]) {
      assert.ok(!view.rows().some((text) => text.startsWith(gone)), gone);
    }
  } finally {
    view.cleanup();
  }
});

test("只有开通中的机器、还没有任何已接入设备时，也看得到「1 台接入中」", async () => {
  const view = await openPopover({
    computers: [row({ id: "cc_new", name: "新加坡", source: "aliyun", status: "provisioning" })],
  });
  try {
    assert.match(view.text(), /还没有连接任何设备/);
    assert.match(view.text(), /1 台接入中/, `小窗写着：${view.text()}`);
  } finally {
    view.cleanup();
  }
});
