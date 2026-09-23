import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

import { LOCALES } from "../src/i18n/config.ts";
import { ACP_CARD_MESSAGES } from "../src/i18n/ui/messages/acp-card-copy.ts";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { noticeAction, noticeCopy } from "../src/shell/cloud-computer/agent-dialog/notice.ts";
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
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  HTMLInputElement: window.HTMLInputElement,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const DID_NOT_START = "对话没有启动。";
const STILL_NEEDS_INSTALL = "这个程序的对话组件还没就绪。安装会一并补齐。";
const tt = (zh, vars) => {
  if (!vars) return zh;
  return zh.replace(/\{(\w+)\}/g, (token, key) => (key in vars ? String(vars[key]) : token));
};

const uiStub = dataModule(`
  export function useUI() {
    return (value, vars) => {
      if (!vars) return value;
      return value.replace(/\\{(\\w+)\\}/g, (token, key) => (key in vars ? String(vars[key]) : token));
    };
  }
`);

const { InstallSheet } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/InstallSheet.tsx", {
    "../../../i18n/ui/useUI": uiStub,
  })
);
const { MessageList } = await import(
  await compileModule("src/shell/cloud-computer/agent-dialog/MessageList.tsx", {
    "../../../i18n/ui/useUI": uiStub,
  })
);

function programRow(installed) {
  return {
    id: "cursor",
    installed,
    path: installed ? "/opt/leo/cursor" : "",
    version: "",
    logged_in: null,
    dir_capability: "full",
    running: false,
  };
}

function sheetDialog(install, hooks = {}) {
  return {
    programs: [],
    closeInstall: hooks.close ?? (() => {}),
    setInstallDir() {},
    startInstall: hooks.start ?? (() => {}),
    install: {
      open: true,
      program: "cursor",
      dir: "/opt/leo",
      running: false,
      lines: [],
      donePath: "",
      failedText: "",
      ...install,
    },
  };
}

function noticeDialog({ code, installed = null, donePath = "", failedText = "" }) {
  return {
    program: "cursor",
    messages: [{ kind: "notice", id: "n1", code, program: "cursor" }],
    programs: installed === null ? [] : [programRow(installed)],
    install: {
      open: false,
      program: donePath ? "cursor" : null,
      dir: "",
      running: false,
      lines: [],
      donePath,
      failedText,
    },
    openLogin() {},
    openInstall() {},
    retryConnect() {},
  };
}

async function render(node) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(node);
  });
  return {
    host,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

function buttonText(host, selector) {
  const node = host.querySelector(selector);
  return node ? node.textContent : null;
}

test("装完：主按钮是完成，点它关掉面板，绿色路径还在", async () => {
  let closed = 0;
  let started = 0;
  const view = await render(
    createElement(InstallSheet, {
      dialog: sheetDialog(
        { donePath: "/opt/leo/cursor" },
        {
          close() {
            closed += 1;
          },
          start() {
            started += 1;
          },
        },
      ),
    }),
  );
  try {
    assert.equal(buttonText(view.host, "[data-oceanleo-cc-install-done]"), "完成");
    assert.equal(buttonText(view.host, "[data-oceanleo-cc-install-start]"), null);
    assert.equal(view.host.querySelector("[data-oceanleo-cc-install-path]").textContent, "已装到 /opt/leo/cursor");
    assert.equal(view.host.textContent.includes("开始安装"), false);
    await act(async () => {
      view.host.querySelector("[data-oceanleo-cc-install-done]").click();
    });
    assert.equal(closed, 1);
    assert.equal(started, 0);
  } finally {
    await view.unmount();
  }
});

test("还没装完：主按钮仍是开始安装", async () => {
  let started = 0;
  const view = await render(
    createElement(InstallSheet, {
      dialog: sheetDialog(
        {},
        {
          start() {
            started += 1;
          },
        },
      ),
    }),
  );
  try {
    assert.equal(buttonText(view.host, "[data-oceanleo-cc-install-start]"), "开始安装");
    assert.equal(buttonText(view.host, "[data-oceanleo-cc-install-done]"), null);
    await act(async () => {
      view.host.querySelector("[data-oceanleo-cc-install-start]").click();
    });
    assert.equal(started, 1);
  } finally {
    await view.unmount();
  }
});

test("还在跑或已经失败时，不把主按钮写成完成", async () => {
  const running = await render(
    createElement(InstallSheet, {
      dialog: sheetDialog({ running: true, donePath: "/opt/leo/cursor" }),
    }),
  );
  try {
    assert.equal(buttonText(running.host, "[data-oceanleo-cc-install-done]"), null);
    assert.equal(buttonText(running.host, "[data-oceanleo-cc-install-start]"), null);
  } finally {
    await running.unmount();
  }
  const failed = await render(
    createElement(InstallSheet, {
      dialog: sheetDialog({ failedText: "安装没有完成", donePath: "/opt/leo/cursor" }),
    }),
  );
  try {
    assert.equal(buttonText(failed.host, "[data-oceanleo-cc-install-retry]"), "重试");
    assert.equal(buttonText(failed.host, "[data-oceanleo-cc-install-done]"), null);
    assert.equal(buttonText(failed.host, "[data-oceanleo-cc-install-start]"), null);
  } finally {
    await failed.unmount();
  }
});

test("acp_start_failed：一句话，没有安装按钮", () => {
  assert.equal(noticeCopy(tt, "acp_start_failed"), DID_NOT_START);
  assert.equal(noticeCopy(tt, "acp_start_failed", false), DID_NOT_START);
  assert.equal(noticeAction("acp_start_failed", false), null);
  assert.equal(noticeAction("acp_start_failed", true), null);
});

test("acp_unavailable：只有尚未安装才带安装按钮；已知已安装则与启动失败同一句", () => {
  assert.equal(noticeCopy(tt, "acp_unavailable", false), STILL_NEEDS_INSTALL);
  assert.equal(noticeAction("acp_unavailable", false), "install");
  assert.equal(noticeCopy(tt, "acp_unavailable", true), DID_NOT_START);
  assert.equal(noticeAction("acp_unavailable", true), null);
  assert.equal(noticeCopy(tt, "acp_unavailable", null), STILL_NEEDS_INSTALL);
  assert.equal(noticeAction("acp_unavailable", null), null);
  assert.equal(noticeAction("program_missing", null), "install");
});

test("黄字：名单或刚装完的路径能证明已安装时，不再给安装按钮", async () => {
  const installed = await render(
    createElement(MessageList, { dialog: noticeDialog({ code: "acp_unavailable", installed: true }) }),
  );
  try {
    const notice = installed.host.querySelector("[data-oceanleo-cc-notice='acp_unavailable']");
    assert.equal(notice.querySelector("p").textContent, DID_NOT_START);
    assert.equal(notice.querySelector("button"), null);
  } finally {
    await installed.unmount();
  }

  const justInstalled = await render(
    createElement(MessageList, {
      dialog: noticeDialog({ code: "acp_unavailable", installed: false, donePath: "/opt/leo/cursor" }),
    }),
  );
  try {
    const notice = justInstalled.host.querySelector("[data-oceanleo-cc-notice='acp_unavailable']");
    assert.equal(notice.querySelector("p").textContent, DID_NOT_START);
    assert.equal(notice.querySelector("button"), null);
  } finally {
    await justInstalled.unmount();
  }

  const missing = await render(
    createElement(MessageList, { dialog: noticeDialog({ code: "acp_unavailable", installed: false }) }),
  );
  try {
    const notice = missing.host.querySelector("[data-oceanleo-cc-notice='acp_unavailable']");
    assert.equal(notice.querySelector("p").textContent, STILL_NEEDS_INSTALL);
    assert.equal(notice.querySelector("button").textContent, "安装");
  } finally {
    await missing.unmount();
  }

  const failedStart = await render(
    createElement(MessageList, { dialog: noticeDialog({ code: "acp_start_failed", installed: false }) }),
  );
  try {
    const notice = failedStart.host.querySelector("[data-oceanleo-cc-notice='acp_start_failed']");
    assert.equal(notice.querySelector("p").textContent, DID_NOT_START);
    assert.equal(notice.querySelector("button"), null);
  } finally {
    await failedStart.unmount();
  }
});

test("对话没启动这句在 17 种语言里都有译文", () => {
  assert.equal(LOCALES.length, 17);
  for (const locale of LOCALES) {
    const value = ACP_CARD_MESSAGES[locale][DID_NOT_START] ?? UI_MESSAGES[locale][DID_NOT_START];
    assert.equal(typeof value, "string", locale);
    assert.equal(value.length > 0, true, locale);
  }
  assert.equal(ACP_CARD_MESSAGES.en[DID_NOT_START], UI_MESSAGES.en[DID_NOT_START]);
  assert.equal(UI_MESSAGES.en[DID_NOT_START], "The dialog did not start.");
});
