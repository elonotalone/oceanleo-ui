import assert from "node:assert/strict";
import { createRequire, register } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

register(new URL("./ts-extension-loader.mjs", import.meta.url), import.meta.url);

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
const uiStub = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const domainStub = dataModule(`
  export function currentDomainFamily() { return "com"; }
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
const navStub = dataModule(`
  export function useRouter() {
    return { push() {}, replace() {}, refresh() {}, back() {} };
  }
`);
const apiStub = dataModule(`
  export const cloudComputerApi = globalThis.__ccApi;
  export function readMountedComputerId() { return globalThis.__ccMountedId || ""; }
  export function writeMountedComputerId(id) { globalThis.__ccMountedId = id || ""; }
  export function readMountedComputerName() { return globalThis.__ccMountedName || ""; }
  export function writeMountedComputerName(name) { globalThis.__ccWrittenName = name || ""; }
  export function isMountable(computer) {
    return (computer.status === "active" || computer.status === "running") && Boolean(computer.confirmed_at);
  }
`);

const { noticeCopy } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/notice.ts")
);
const { applyDialog, initialDialogState } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/reduce.ts")
);
const { MessageList } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/MessageList.tsx", {
    "../../../i18n/ui/useUI": uiStub,
  })
);
const { ComputerDock } = await import(
  await compileModule("src/shell/cloud-computer/ComputerDock.tsx", {
    "../../i18n/ui/useUI": uiStub,
    "../../contracts/domain-family": domainStub,
    "../../lib/cloud-computer-api": apiStub,
    "./CreateComputerDialog": dialogStub,
    "./ConnectServerDialog": dialogStub,
    "../anchored-popover": popoverStub,
    "next/navigation": navStub,
  })
);

const DID_NOT_START = "对话没有启动。";
const UNSUPPORTED = "这个程序不接受 acp 子命令，对话起不来。";
const STILL_NEEDS_INSTALL = "这个程序的对话组件还没就绪。安装会一并补齐。";
const tt = (zh) => zh;

function pc(overrides = {}) {
  return {
    id: "cc_1",
    name: "elon",
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

async function flush(count = 6) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function renderDock(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ComputerDock, props));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    async cleanup() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("acp_start_failed 的默认句是「对话没有启动。」，不含请再发一次", () => {
  const copy = noticeCopy(tt, "acp_start_failed");
  assert.equal(copy, DID_NOT_START);
  assert.equal(copy.includes("请再发一次"), false);
  assert.equal(noticeCopy(tt, "acp_start_failed", true), DID_NOT_START);
  assert.equal(noticeCopy(tt, "acp_unavailable", true), DID_NOT_START);
  assert.equal(noticeCopy(tt, "acp_unavailable", true).includes("请再发一次"), false);
  assert.equal(noticeCopy(tt, "acp_unavailable", true).includes("安装会一并补齐"), false);
  assert.equal(noticeCopy(tt, "acp_unavailable", false), STILL_NEEDS_INSTALL);
});

test("错误帧的 text 留在 notice 上，有 text 就显示这句", async () => {
  let state = initialDialogState();
  state = applyDialog(state, {
    type: "frame",
    frame: { t: "error", code: "acp_start_failed", program: "cursor", text: UNSUPPORTED },
  });
  const notice = state.messages.find((message) => message.kind === "notice");
  assert.equal(notice.text, UNSUPPORTED);

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(MessageList, {
        dialog: {
          program: "cursor",
          messages: [notice],
          programs: [],
          install: {
            open: false,
            program: null,
            dir: "",
            running: false,
            lines: [],
            donePath: "",
            failedText: "",
          },
          openLogin() {},
          openInstall() {},
          retryConnect() {},
        },
      }),
    );
  });
  try {
    const node = host.querySelector("[data-oceanleo-cc-notice='acp_start_failed'] p");
    assert.equal(node.textContent, UNSUPPORTED);
    assert.equal((host.textContent || "").includes("请再发一次"), false);
  } finally {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  }
});

test("loading 且记住了名字 elon：显示 elon，不显示接入云电脑", async () => {
  globalThis.__ccMountedName = "elon";
  globalThis.__ccMountedId = "cc_1";
  globalThis.__ccWrittenName = "";
  globalThis.__ccApi = {
    listComputers() {
      return new Promise(() => {});
    },
  };
  const view = await renderDock({ client: globalThis.__ccApi });
  try {
    assert.equal(view.text().includes("elon"), true);
    assert.equal(view.text().includes("接入云电脑"), false);
  } finally {
    await view.cleanup();
  }
});

test("loading 且没有记住名字：只显示省略号，不显示接入云电脑", async () => {
  globalThis.__ccMountedName = "";
  globalThis.__ccMountedId = "";
  globalThis.__ccApi = {
    listComputers() {
      return new Promise(() => {});
    },
  };
  const view = await renderDock({ client: globalThis.__ccApi });
  try {
    assert.equal(view.text().includes("…"), true);
    assert.equal(view.text().includes("接入云电脑"), false);
    assert.equal(view.text().includes("elon"), false);
  } finally {
    await view.cleanup();
  }
});

test("名单选定电脑后记下这台的名字", async () => {
  globalThis.__ccMountedName = "";
  globalThis.__ccMountedId = "";
  globalThis.__ccWrittenName = "";
  globalThis.__ccApi = {
    async listComputers() {
      return { items: [] };
    },
  };
  const view = await renderDock({
    client: globalThis.__ccApi,
    computers: [pc({ id: "cc_1", name: "elon" })],
  });
  try {
    assert.equal(globalThis.__ccWrittenName, "elon");
  } finally {
    await view.cleanup();
  }
});
