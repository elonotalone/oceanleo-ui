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
  url: "https://oceanleo.com/",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
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
const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const domainStubUrl = dataModule(`
  export function currentDomainFamily() { return "com"; }
`);
const dialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CreateComputerDialog() { return null; }
  export function ConnectServerDialog() { return null; }
`);
const popoverStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AnchoredPopover({ open, children, attributes }) {
    if (!open) return null;
    return React.createElement("div", { ...(attributes || {}), "data-anchored-popover": "1" }, children);
  }
`);
const navStubUrl = dataModule(`
  export function useRouter() {
    return globalThis.__ccRouter || { push() {}, replace() {}, refresh() {}, back() {} };
  }
`);

let storedMounted = "";
const apiStubUrl = dataModule(`
  export const cloudComputerApi = globalThis.__ccApi;
  export function readMountedComputerId() { return globalThis.__ccMounted || ""; }
  export function writeMountedComputerId(id) { globalThis.__ccMounted = id || ""; }
  export function isMountable(computer) {
    return (computer.status === "active" || computer.status === "running") && Boolean(computer.confirmed_at);
  }
`);

const { ComputerDock } = await import(
  await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
    "../../i18n/ui/useUI": uiTextStubUrl,
    "../../contracts/domain-family": domainStubUrl,
    "../../lib/cloud-computer-api": apiStubUrl,
    "./CreateComputerDialog": dialogStubUrl,
    "./ConnectServerDialog": dialogStubUrl,
    "../anchored-popover": popoverStubUrl,
    "next/navigation": navStubUrl,
  })
);

const { pickMountedId, newShellEnabled } = await import(
  await compileModule("src/shell/cloud-computer/useCloudComputers.ts", {
    "../../lib/cloud-computer-api": apiStubUrl,
  })
);

function pc(overrides = {}) {
  return {
    id: "cc_1",
    name: "新加坡",
    source: "aliyun",
    status: "running",
    edition: "com",
    node_online: true,
    enrolled_at: "2026-09-20T00:00:00Z",
    confirmed_at: "2026-09-20T00:00:00Z",
    created_at: "2026-09-20T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    ...overrides,
  };
}

function makeClient(items, openImpl) {
  return {
    async listComputers() {
      return { items: items.map((item) => ({ ...item })) };
    },
    async openTerminal(id, body) {
      if (openImpl) return openImpl(id, body);
      return { id: "sid_1", task_id: "task_1" };
    },
  };
}

async function flush(count = 6) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function render(computers, client = makeClient(computers)) {
  globalThis.__ccApi = client;
  globalThis.__ccMounted = storedMounted;
  if (!globalThis.__ccRouter) {
    globalThis.__ccRouter = { push() {}, replace() {}, refresh() {}, back() {} };
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ComputerDock, { client, computers }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    button(label) {
      return [...host.querySelectorAll("button")].find(
        (node) => (node.textContent || "").trim() === label,
      );
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("pickMountedId：零台已接入 → 未挂载", () => {
  assert.equal(pickMountedId([], "cc_1"), null);
  assert.equal(pickMountedId([pc({ status: "released" })], null), null);
  assert.equal(
    pickMountedId(
      [pc({ status: "enrolled", confirmed_at: null, enrolled_at: "t" })],
      null,
    ),
    null,
  );
});

test("pickMountedId：恰一台 ready → 自动挂那台", () => {
  const a = pc({ id: "cc_a", node_online: true });
  const b = pc({ id: "cc_b", node_online: false });
  assert.equal(pickMountedId([a, b], "cc_b"), "cc_a");
});

test("pickMountedId：多台 ready → 上次选择，没有则第一台 ready", () => {
  const a = pc({ id: "cc_a", node_online: true });
  const b = pc({ id: "cc_b", node_online: true });
  assert.equal(pickMountedId([a, b], "cc_b"), "cc_b");
  assert.equal(pickMountedId([a, b], null), "cc_a");
  assert.equal(pickMountedId([a, b], "missing"), "cc_a");
});

test("无已接入机器：只渲染接入云电脑，无管理、无待确认角标、无新建 Shell", async () => {
  storedMounted = "";
  const view = await render([]);
  assert.ok(view.host.querySelector("[data-oceanleo-cc-dock-empty]"));
  assert.equal(view.button("接入云电脑")?.textContent.trim(), "接入云电脑");
  assert.equal(view.button("新建 Shell"), undefined);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-manage]"), null);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-pending]"), null);
  view.cleanup();
});

test("pending / enrolled / active 未 enrolled 的行不上坞", async () => {
  storedMounted = "";
  const pending = pc({
    id: "cc_p",
    name: "开通中",
    status: "provisioning",
    enrolled_at: null,
    confirmed_at: null,
    node_online: false,
  });
  const enrolled = pc({
    id: "cc_e",
    name: "待确认机",
    source: "byo",
    status: "enrolled",
    confirmed_at: null,
    node_online: true,
  });
  const leftover = pc({
    id: "cc_legacy",
    name: "遗留",
    source: "byo",
    status: "active",
    enrolled_at: null,
    confirmed_at: null,
    node_online: false,
  });
  assert.equal(pickMountedId([pending, enrolled, leftover], null), null);
  const view = await render([pending, enrolled, leftover]);
  assert.ok(view.host.querySelector("[data-oceanleo-cc-dock-empty]"));
  assert.equal(view.text().includes("开通中"), false);
  assert.equal(view.text().includes("待确认机"), false);
  assert.equal(view.text().includes("遗留"), false);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-manage]"), null);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-pending]"), null);
  await act(async () => {
    view.button("接入云电脑").dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.ok(view.host.querySelector("[data-oceanleo-cc-dock-pending-progress]"));
  assert.match(view.text(), /接入进行中/);
  view.cleanup();
});

test("ready 机器：状态按钮进入服务器页面，且没有新建 Shell", async () => {
  storedMounted = "";
  const pushes = [];
  globalThis.__ccRouter = {
    push(href) {
      pushes.push(href);
    },
    replace() {},
    refresh() {},
    back() {},
  };
  const view = await render([pc({ name: "新加坡一号" })]);
  assert.ok(view.text().includes("新加坡一号"));
  assert.ok(view.text().includes("在线"));
  const mounted = view.host.querySelector("[data-oceanleo-cc-dock-mounted]");
  assert.ok(mounted);
  await act(async () => {
    mounted.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(pushes, ["/computers/cc_1"]);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-new-shell]"), null);
  assert.equal(view.text().includes("新建 Shell"), false);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-manage]"), null);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-empty]"), null);
  view.cleanup();
});

test("offline 机器仍可进入服务器页面看原因，没有新建 Shell", async () => {
  storedMounted = "cc_1";
  const pushes = [];
  globalThis.__ccRouter = {
    push(href) {
      pushes.push(href);
    },
    replace() {},
    refresh() {},
    back() {},
  };
  const view = await render([pc({ node_online: false })]);
  const mounted = view.host.querySelector("[data-oceanleo-cc-dock-mounted]");
  assert.ok(mounted);
  await act(async () => {
    mounted.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(pushes, ["/computers/cc_1"]);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-new-shell]"), null);
  assert.equal(newShellEnabled(pc({ node_online: false })), false);
  view.cleanup();
});

test("多台已接入：箭头只列已接入，切换后状态按钮进入新机器页面", async () => {
  storedMounted = "cc_b";
  const pushes = [];
  globalThis.__ccRouter = {
    push(href) {
      pushes.push(href);
    },
    replace() {},
    refresh() {},
    back() {},
  };
  const items = [
    pc({ id: "cc_a", name: "甲机", node_online: true }),
    pc({ id: "cc_b", name: "乙机", node_online: true }),
    pc({ id: "cc_c", name: "丙机", node_online: false, status: "stopped" }),
    pc({
      id: "cc_pending",
      name: "不该出现",
      source: "byo",
      status: "enrolled",
      confirmed_at: null,
      node_online: true,
    }),
  ];
  const view = await render(items);
  const mounted = view.host.querySelector("[data-oceanleo-cc-dock-mounted]");
  assert.ok(mounted);
  assert.match((mounted.textContent || "").trim(), /乙机/);
  const toggle = view.host.querySelector("[data-oceanleo-cc-switch-toggle]");
  assert.ok(toggle);
  await act(async () => {
    toggle.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  const switchItems = [
    ...view.host.querySelectorAll("[data-oceanleo-cc-switch-item]"),
  ];
  assert.equal(switchItems.length, 3);
  assert.equal(
    switchItems.map((node) => node.getAttribute("data-oceanleo-cc-switch-item")).sort().join(","),
    "cc_a,cc_b,cc_c",
  );
  assert.equal(view.text().includes("不该出现"), false);

  const offline = view.host.querySelector('[data-oceanleo-cc-switch-item="cc_c"]');
  assert.ok(offline);
  await act(async () => {
    offline.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush();
  const mountedOffline = view.host.querySelector("[data-oceanleo-cc-dock-mounted]");
  assert.match((mountedOffline.textContent || "").trim(), /丙机/);
  await act(async () => {
    mountedOffline.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  assert.deepEqual(pushes, ["/computers/cc_c"]);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-new-shell]"), null);
  view.cleanup();
});

async function renderLive(client) {
  globalThis.__ccApi = client;
  globalThis.__ccMounted = storedMounted;
  if (!globalThis.__ccRouter) {
    globalThis.__ccRouter = { push() {}, replace() {}, refresh() {}, back() {} };
  }
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ComputerDock, { client }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    button(label) {
      return [...host.querySelectorAll("button")].find(
        (node) => (node.textContent || "").trim() === label,
      );
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("loading 且本地有上次电脑：不出现接入云电脑；名单返回后显示电脑名和在线", async () => {
  storedMounted = "cc_saved";
  let resolveList = null;
  const client = {
    listComputers() {
      return new Promise((resolve) => {
        resolveList = resolve;
      });
    },
    async openTerminal() {
      return { id: "sid", task_id: "t" };
    },
  };
  const view = await renderLive(client);
  try {
    assert.equal(view.text().includes("接入云电脑"), false);
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-empty]"), null);
    assert.equal(view.host.querySelector("[aria-label='接入云电脑']"), null);
    const waiting = view.host.querySelector("[data-oceanleo-cc-dock-waiting]");
    assert.ok(waiting);
    assert.equal(waiting.getAttribute("data-oceanleo-cc-dock-waiting"), "remembered");
    assert.equal(view.text().includes("…"), true);

    await act(async () => {
      resolveList({
        items: [pc({ id: "cc_saved", name: "新加坡一号", node_online: true })],
      });
    });
    await flush();
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-waiting]"), null);
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-empty]"), null);
    const mounted = view.host.querySelector("[data-oceanleo-cc-dock-mounted]");
    assert.ok(mounted);
    assert.match(mounted.textContent || "", /新加坡一号/);
    assert.match(mounted.textContent || "", /在线/);
    assert.equal(
      view.host.querySelector("[data-oceanleo-cc-online]")?.getAttribute("data-oceanleo-cc-online"),
      "1",
    );
  } finally {
    view.cleanup();
  }
});

test("名单返回且一台都没有：才显示接入云电脑", async () => {
  storedMounted = "cc_gone";
  let resolveList = null;
  const client = {
    listComputers() {
      return new Promise((resolve) => {
        resolveList = resolve;
      });
    },
    async openTerminal() {
      return { id: "sid" };
    },
  };
  const view = await renderLive(client);
  try {
    assert.equal(view.text().includes("接入云电脑"), false);
    await act(async () => {
      resolveList({ items: [] });
    });
    await flush();
    assert.ok(view.host.querySelector("[data-oceanleo-cc-dock-empty]"));
    assert.equal(view.button("接入云电脑")?.textContent.trim(), "接入云电脑");
  } finally {
    view.cleanup();
  }
});

test("点击机器状态只进入服务器页面，不调用 openTerminal 或创建 Shell 任务", async () => {
  storedMounted = "";
  const pushes = [];
  globalThis.__ccRouter = {
    push(href) {
      pushes.push(href);
    },
    replace() {},
    refresh() {},
    back() {},
  };
  let openCalls = 0;
  const client = makeClient([pc({ name: "新加坡一号" })], async () => {
    openCalls += 1;
    return { id: "sid_9", task_id: "task-shell-1" };
  });
  const view = await render([pc({ name: "新加坡一号" })], client);
  const mounted = view.host.querySelector("[data-oceanleo-cc-dock-mounted]");
  assert.ok(mounted);
  await act(async () => {
    mounted.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await flush(12);
  assert.equal(openCalls, 0);
  assert.deepEqual(pushes, ["/computers/cc_1"]);
  assert.equal(view.text().includes("新建 Shell"), false);
  view.cleanup();
});
