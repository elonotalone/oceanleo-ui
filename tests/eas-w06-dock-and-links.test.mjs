// W06 第二段：开通失败不算接入中；坞只有开通失败时写「开通失败」；
// 子站上坞 / 服务器页链到门户，门户上保持相对路径；云电脑页把开通失败单独成组。
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

const PORTAL = "https://oceanleo.com";
const SUBSITE = "https://ppt.oceanleo.com";

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: `${SUBSITE}/`,
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLSelectElement: window.HTMLSelectElement,
  HTMLFormElement: window.HTMLFormElement,
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

function setPageUrl(url) {
  dom.reconfigure({ url });
}

const uiStub = dataModule(`
  export function useUI() {
    return (zh, vars) =>
      vars ? zh.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  }
`);
const dialogStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CreateComputerDialog() { return null; }
  export function ConnectServerDialog() { return null; }
`);
const popoverStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AnchoredPopover({ open, children, attributes }) {
    if (!open) return null;
    return React.createElement("div", { ...(attributes || {}), "data-anchored-popover": "1" }, children);
  }
`);
const linkStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export default function Link({ href, children, prefetch, ...rest }) {
    return React.createElement("a", { href, ...rest }, children);
  }
`);
const apiStub = dataModule(`
  export const cloudComputerApi = globalThis.__w06DockApi;
  export function readMountedComputerId() { return globalThis.__w06Mounted || ""; }
  export function writeMountedComputerId(id) { globalThis.__w06Mounted = id || ""; }
  export function readMountedComputerName() { return ""; }
  export function writeMountedComputerName() {}
  export function isMountable(computer) {
    return (computer.status === "active" || computer.status === "running") && Boolean(computer.confirmed_at);
  }
`);
const pageHeaderStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PageHeader({ title }) {
    return React.createElement("h1", null, title);
  }
`);
const confirmStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog() { return null; }
`);
const navStub = dataModule(`
  export function useRouter() {
    return globalThis.__w06Router || { push() {}, replace() {}, refresh() {}, back() {} };
  }
  export function useSearchParams() {
    return { get(name) { return globalThis.__w06Query?.[name] ?? null; } };
  }
`);
const computersHookStub = dataModule(`
  export function useCloudComputers(options = {}) {
    const items = options.computers || [];
    return {
      computers: items,
      mounted: items.find((item) => item.id === (globalThis.__w06Mounted || items[0]?.id)) || null,
      mountedId: globalThis.__w06Mounted || items[0]?.id || null,
      rememberedId: null,
      setMountedId(id) { globalThis.__w06Mounted = id; },
      loading: false,
      error: null,
      refresh: async () => {},
    };
  }
`);
const acpStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function AcpCard() { return null; }
`);
const cliStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function CliCard() { return null; }
`);
const terminalStub = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function TerminalCard() { return null; }
`);

const { isPendingComputer, computerDisplayState } = await import(
  await compileModule("src/shell/cloud-computer/computer-state.ts")
);
const { serverPageHref } = await import(
  await compileModule("src/shell/cloud-computer/server-page/href.ts")
);
const { ComputerDock } = await import(
  await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../lib/cloud-computer-api": apiStub,
    "./CreateComputerDialog": dialogStub,
    "./ConnectServerDialog": dialogStub,
    "../anchored-popover": popoverStub,
    "next/link": linkStub,
    "next/navigation": navStub,
  })
);
const { CloudComputersPage } = await import(
  await compileModule("src/pages/CloudComputersPage.tsx", {
    "../i18n/ui/useUI": uiStub,
    "../ui": confirmStub,
    "./PageHeader": pageHeaderStub,
    "../shell/cloud-computer/CreateComputerDialog": dialogStub,
    "../shell/cloud-computer/ConnectServerDialog": dialogStub,
  })
);
const { ServerPage } = await import(
  await compileModule("src/shell/cloud-computer/server-page/ServerPage.tsx", {
    "../../../lib/cloud-computer-api": apiStub,
    "../../../i18n/ui/useUI": uiStub,
    "../../../ui": confirmStub,
    "../agent-dialog/AcpCard": acpStub,
    "../terminal-card/CliCard": cliStub,
    "../terminal-card/TerminalCard": terminalStub,
    "../useCloudComputers": computersHookStub,
    "next/navigation": navStub,
  })
);

function row(overrides = {}) {
  return {
    id: "cc_x",
    name: "x",
    source: "aliyun",
    status: "error",
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

const FAILED = row({ id: "cc_fail", name: "新加坡失败" });
const PROVISIONING = row({
  id: "cc_prov",
  name: "新加坡开通中",
  status: "provisioning",
});
const READY = row({
  id: "cc_ready",
  name: "elon",
  status: "running",
  enrolled_at: "2026-09-12T00:00:00Z",
  confirmed_at: "2026-09-12T00:05:00Z",
  node_online: true,
});
const OFFLINE = row({
  id: "cc_off",
  name: "离线机",
  status: "running",
  enrolled_at: "2026-09-12T00:00:00Z",
  confirmed_at: "2026-09-12T00:05:00Z",
  node_online: false,
});

function pageClient(items) {
  return {
    async listComputers() {
      return { items: items.map((item) => ({ ...item })) };
    },
    async listComputerEvents() {
      return { items: [] };
    },
    async getUsage() {
      return null;
    },
    async getNodeInfo() {
      return {
        version: "v1",
        latest_version: "v1",
        update_available: false,
        features: [],
        online: false,
      };
    },
  };
}

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function renderDock(computers) {
  globalThis.__w06DockApi = pageClient(computers);
  globalThis.__w06Mounted = "";
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ComputerDock, { computers }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function openEmptyDock(computers) {
  const view = await renderDock(computers);
  const trigger = view.host.querySelector("[data-oceanleo-cc-dock-empty]");
  assert.ok(trigger, `坞没有空态按钮，写着：${view.text()}`);
  await act(async () => {
    trigger.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  return view;
}

async function renderDevicesPage(computers) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(CloudComputersPage, { client: pageClient(computers) }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function renderServerPage(computers) {
  globalThis.__w06Mounted = computers[0]?.id || "";
  globalThis.__w06Query = {};
  globalThis.__w06Router = { push() {}, replace() {}, refresh() {}, back() {} };
  globalThis.__w06DockApi = pageClient(computers);
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(ServerPage, {
        computerId: computers[0].id,
        client: pageClient(computers),
        computers,
      }),
    );
  });
  await flush();
  return {
    host,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("开通失败不算接入中；开通中仍算", () => {
  assert.equal(computerDisplayState(FAILED), "error");
  assert.equal(isPendingComputer(FAILED), false, "开通失败仍被算进接入中");
  assert.equal(isPendingComputer(PROVISIONING), true);
  assert.equal(isPendingComputer(READY), false);
});

test("坞只有开通失败机器时写「开通失败」，不写「接入进行中」", async () => {
  setPageUrl(`${PORTAL}/`);
  const view = await openEmptyDock([FAILED]);
  try {
    assert.match(view.text(), /开通失败/, `坞写着：${view.text()}`);
    assert.doesNotMatch(view.text(), /接入进行中/, `坞仍在催接入进度：${view.text()}`);
    assert.equal(view.host.querySelector("[data-oceanleo-cc-dock-pending-progress]"), null);
    assert.ok(view.host.querySelector("[data-oceanleo-cc-dock-failed]"));
  } finally {
    view.cleanup();
  }
});

test("子站 origin 下坞与服务器页链接是门户绝对地址，门户 origin 下是相对路径", async () => {
  setPageUrl(`${SUBSITE}/`);
  assert.equal(serverPageHref("cc_ready"), `${PORTAL}/computers/cc_ready`);

  const dockSub = await openEmptyDock([FAILED]);
  try {
    const failedLink = dockSub.host.querySelector("[data-oceanleo-cc-dock-failed]");
    assert.ok(failedLink);
    assert.equal(failedLink.getAttribute("href"), `${PORTAL}/devices?tab=cloud`);
  } finally {
    dockSub.cleanup();
  }

  const mountedSub = await renderDock([READY]);
  try {
    const mounted = mountedSub.host.querySelector("[data-oceanleo-cc-dock-mounted]");
    assert.ok(mounted);
    assert.equal(mounted.getAttribute("href"), `${PORTAL}/computers/cc_ready`);
  } finally {
    mountedSub.cleanup();
  }

  const serverSub = await renderServerPage([OFFLINE]);
  try {
    const link = [...serverSub.host.querySelectorAll("a")].find((node) =>
      (node.textContent || "").includes("查看我的设备"),
    );
    assert.ok(link, "服务器页离线态没有「查看我的设备」");
    assert.equal(link.getAttribute("href"), `${PORTAL}/devices?tab=cloud`);
  } finally {
    serverSub.cleanup();
  }

  setPageUrl(`${PORTAL}/`);
  assert.equal(serverPageHref("cc_ready"), "/computers/cc_ready");

  const dockPortal = await openEmptyDock([PROVISIONING]);
  try {
    const pending = dockPortal.host.querySelector("[data-oceanleo-cc-dock-pending-progress]");
    assert.ok(pending);
    assert.equal(pending.getAttribute("href"), "/devices?tab=cloud");
  } finally {
    dockPortal.cleanup();
  }

  const mountedPortal = await renderDock([READY]);
  try {
    const mounted = mountedPortal.host.querySelector("[data-oceanleo-cc-dock-mounted]");
    assert.ok(mounted);
    assert.equal(mounted.getAttribute("href"), "/computers/cc_ready");
  } finally {
    mountedPortal.cleanup();
  }

  const serverPortal = await renderServerPage([OFFLINE]);
  try {
    const link = [...serverPortal.host.querySelectorAll("a")].find((node) =>
      (node.textContent || "").includes("查看我的设备"),
    );
    assert.ok(link);
    assert.equal(link.getAttribute("href"), "/devices?tab=cloud");
  } finally {
    serverPortal.cleanup();
  }
});

test("CloudComputersPage 把开通失败单独成组，不放在「接入中」标题下", async () => {
  setPageUrl(`${PORTAL}/devices?tab=cloud`);
  const view = await renderDevicesPage([FAILED, PROVISIONING, READY]);
  try {
    const failed = view.host.querySelector('[data-oceanleo-cc-card="cc_fail"]');
    const pending = view.host.querySelector('[data-oceanleo-cc-card="cc_prov"]');
    const ready = view.host.querySelector('[data-oceanleo-cc-card="cc_ready"]');
    assert.ok(failed, `页上没有开通失败卡：${view.text()}`);
    assert.ok(pending);
    assert.ok(ready);
    assert.equal(failed.getAttribute("data-oceanleo-cc-card-kind"), "failed");
    assert.equal(failed.getAttribute("data-oceanleo-cc-display-state"), "error");
    assert.equal(pending.getAttribute("data-oceanleo-cc-card-kind"), "pending");
    assert.equal(ready.getAttribute("data-oceanleo-cc-card-kind"), "connected");
    const failedList = view.host.querySelector("[data-oceanleo-cc-failed-list]");
    const pendingList = view.host.querySelector("[data-oceanleo-cc-pending-list]");
    assert.ok(failedList);
    assert.ok(pendingList);
    assert.ok(failedList.contains(failed));
    assert.ok(pendingList.contains(pending));
    assert.equal(pendingList.contains(failed), false);
    assert.match(failedList.textContent || "", /开通失败/);
    assert.match(pendingList.querySelector("h3")?.textContent || "", /接入中/);
    assert.doesNotMatch(pendingList.textContent || "", /新加坡失败/);
  } finally {
    view.cleanup();
  }
});
