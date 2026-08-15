import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
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
  url: "https://oceanleo.com/devices",
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
  InputEvent: window.InputEvent,
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);
const pageHeaderStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function PageHeader({ title }) {
    return React.createElement("h1", null, title);
  }
`);
const confirmDialogStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function ConfirmDialog({ title, body, confirmLabel, onConfirm, onCancel }) {
    return React.createElement(
      "div",
      { "data-testid": "confirm-dialog" },
      React.createElement("h2", null, title),
      React.createElement("p", null, body),
      React.createElement("button", { onClick: onConfirm }, confirmLabel),
      React.createElement("button", { onClick: onCancel }, "取消"),
    );
  }
`);
const facadeStubUrl = dataModule(`
  export const devicesFacade = globalThis.__defaultDevicesClient;
`);

const { DevicesPage } = await import(
  await compileModule("src/pages/DevicesPage.tsx", {
    "../facades/devices": facadeStubUrl,
    "../i18n/ui/useUI": uiTextStubUrl,
    "../ui": confirmDialogStubUrl,
    "./PageHeader": pageHeaderStubUrl,
  })
);

function makeDevice(overrides = {}) {
  return {
    device_id: "d-1",
    platform: "windows",
    device_name: "家里的电脑",
    online: true,
    local_exec_enabled: true,
    granted_kinds: ["read", "write"],
    last_seen_at: "2026-08-15T00:00:00Z",
    ...overrides,
  };
}

function makeClient(initialDevices, overrides = {}) {
  let devices = initialDevices.map((device) => ({ ...device }));
  const calls = { list: 0, pair: [], rename: [], revoke: [] };
  return {
    calls,
    async listDevices() {
      calls.list += 1;
      return { ok: true, data: devices.map((device) => ({ ...device })) };
    },
    async pairDevice(code) {
      calls.pair.push(code);
      return { ok: true, data: null };
    },
    async renameDevice(deviceId, deviceName) {
      calls.rename.push([deviceId, deviceName]);
      devices = devices.map((device) =>
        device.device_id === deviceId ? { ...device, device_name: deviceName } : device,
      );
      return { ok: true, data: null };
    },
    async revokeDevice(deviceId) {
      calls.revoke.push(deviceId);
      devices = devices.filter((device) => device.device_id !== deviceId);
      return { ok: true, data: null };
    },
    ...overrides,
  };
}

async function flush(count = 4) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

async function render(client) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(DevicesPage, { client }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    button(label) {
      return [...host.querySelectorAll("button")].find(
        (button) => (button.textContent || "").trim() === label,
      );
    },
    async click(node) {
      assert.ok(node, "expected clickable element");
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    async setInput(input, value) {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      ).set;
      await act(async () => {
        setter.call(input, value);
        input.dispatchEvent(
          new window.InputEvent("input", {
            bubbles: true,
            data: value,
            inputType: "insertText",
          }),
        );
        input.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      await flush(2);
    },
    async submit(form) {
      await act(async () => {
        form.dispatchEvent(new window.Event("submit", { bubbles: true, cancelable: true }));
      });
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("没有任何设备时显示独立空态和客户端配对入口", async () => {
  const view = await render(makeClient([]));
  assert.ok(view.text().includes("你还没有把任何电脑连上来"));
  assert.ok(view.text().includes("下载客户端后，客户端会显示一个配对码"));
  assert.ok(view.host.querySelector('input[aria-label="8 位配对码"]'));
  view.cleanup();
});

test("设备全部离线时说明任务会按设备名排队等待", async () => {
  const view = await render(makeClient([makeDevice({ online: false })]));
  assert.ok(
    view.text().includes("家里的电脑现在离线，需要它执行的步骤会排队等它上线"),
  );
  assert.equal(view.host.querySelector('[data-all-offline="true"]') !== null, true);
  view.cleanup();
});

test("设备在线但总开关关闭时明确说明只能在那台电脑上打开", async () => {
  const view = await render(
    makeClient([makeDevice({ local_exec_enabled: false, device_name: "工作电脑" })]),
  );
  assert.ok(
    view.text().includes(
      "工作电脑在线，但它还没允许云端下发任务。这个开关只能在那台电脑上打开（托盘图标里）。",
    ),
  );
  assert.ok(view.text().includes("允许云端下发关着"));
  view.cleanup();
});

test("pair_code_invalid 显示指定中文文案", async () => {
  const client = makeClient([], {
    async pairDevice(code) {
      client.calls.pair.push(code);
      return { ok: false, error: "pair_code_invalid", status: 400 };
    },
  });
  const view = await render(client);
  const input = view.host.querySelector('input[aria-label="8 位配对码"]');
  await view.setInput(input, "abcd1234");
  await view.submit(view.host.querySelector("form"));
  assert.deepEqual(client.calls.pair, ["abcd1234"]);
  assert.ok(view.text().includes("配对码无效或已过期，请在客户端里重新获取"));
  view.cleanup();
});

test("撤销必须先显示后果说明，确认后才调用接口并刷新列表", async () => {
  const client = makeClient([makeDevice()]);
  const view = await render(client);
  await view.click(view.button("撤销设备"));
  const dialog = view.host.querySelector('[data-testid="confirm-dialog"]');
  assert.ok(dialog);
  assert.ok(dialog.textContent.includes("撤销后这台电脑立刻不再接收任何任务，需要重新配对。"));
  assert.deepEqual(client.calls.revoke, []);

  await view.click(view.button("确认撤销"));
  assert.deepEqual(client.calls.revoke, ["d-1"]);
  assert.ok(client.calls.list >= 2);
  assert.ok(view.text().includes("你还没有把任何电脑连上来"));
  view.cleanup();
});

test("页面安全说明只承诺设备侧能改的三项权限", async () => {
  const view = await render(makeClient([]));
  assert.ok(
    view.text().includes(
      "网页端只能给设备下单。打开开关、放宽授权目录、配对新设备，这三件事只能在那台电脑上做。即使有人拿到你的账号，也改不了这三样，而且那台电脑上会留下记录。",
    ),
  );
  view.cleanup();
});

test("devices API 使用协议端点、用户 Bearer 凭据和字段名", async () => {
  const authStubUrl = dataModule(`export async function accessToken() { return "user-token"; }`);
  const configStubUrl = dataModule(`export const GATEWAY_BASE = "https://api.oceanleo.com";`);
  const api = await import(
    await compileModule("src/api/devices.ts", {
      "../lib/auth/client": authStubUrl,
      "../lib/auth/config": configStubUrl,
    })
  );
  const requests = [];
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    requests.push({ url, init });
    return new Response("null", {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await api.listDevices();
    await api.pairDevice("ABCD1234");
    await api.renameDevice("device/id", "书房电脑");
    await api.revokeDevice("device/id");
  } finally {
    globalThis.fetch = previousFetch;
  }

  assert.deepEqual(
    requests.map(({ url, init }) => [url, init.method || "GET"]),
    [
      ["https://api.oceanleo.com/v1/devices", "GET"],
      ["https://api.oceanleo.com/v1/devices/pair", "POST"],
      ["https://api.oceanleo.com/v1/devices/device%2Fid", "PATCH"],
      ["https://api.oceanleo.com/v1/devices/device%2Fid/revoke", "POST"],
    ],
  );
  for (const { init } of requests) {
    assert.equal(init.headers.Authorization, "Bearer user-token");
  }
  assert.deepEqual(JSON.parse(requests[1].init.body), { code: "ABCD1234" });
  assert.deepEqual(JSON.parse(requests[2].init.body), { device_name: "书房电脑" });
});

test("源码没有生成配对码、远程改总开关或请求设备密钥的路径", async () => {
  const files = [
    "src/api/devices.ts",
    "src/facades/devices.ts",
    "src/pages/DevicesPage.tsx",
  ];
  const source = (
    await Promise.all(files.map((file) => readFile(resolve(file), "utf8")))
  ).join("\n");
  assert.ok(!source.includes("生成配对码"));
  assert.ok(!source.includes("device_secret"));
  assert.ok(!source.includes("JSON.stringify({ local_exec_enabled"));
  assert.ok(!source.includes("JSON.stringify({ granted_kinds"));
  assert.ok(!source.includes("/pair-code"));
});
