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

test("真实包装响应在 HTTP 边界解包为数组并供设备页渲染", async () => {
  const authStubUrl = dataModule(`export async function accessToken() { return "user-token"; }`);
  const configStubUrl = dataModule(`export const GATEWAY_BASE = "https://api.oceanleo.com";`);
  const api = await import(
    await compileModule("src/api/devices.ts", {
      "../lib/auth/client": authStubUrl,
      "../lib/auth/config": configStubUrl,
    })
  );
  const fixture = { devices: [makeDevice({ device_name: "真实响应电脑" })] };
  const previousFetch = globalThis.fetch;
  let view;
  globalThis.fetch = async () =>
    new Response(JSON.stringify(fixture), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  try {
    const result = await api.listDevices();
    assert.equal(result.ok, true);
    assert.ok(Array.isArray(result.data));
    assert.deepEqual(result.data, fixture.devices);

    view = await render(api);
    assert.ok(view.text().includes("真实响应电脑"));
    assert.ok(view.text().includes("1 台在线"));
  } finally {
    view?.cleanup();
    globalThis.fetch = previousFetch;
  }
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

const copy = await import(await compileModule("src/api/device-error-copy.ts"));

/** 06-code-contract.md §1 全表，逐字照抄；改一个字这条就红。 */
const CONTRACT_COPY = [
  ["device_offline", "任务已排队，等书房电脑上线后这一步会自动继续。"],
  [
    "local_exec_disabled",
    "书房电脑还没允许云端下发。这个开关只能在那台电脑上打开（托盘图标里）。",
  ],
  ["grant_missing", "书房电脑还没授权这类操作。需要在那台电脑上授权后重新发起。"],
  [
    "path_outside_grant",
    "这个路径不在书房电脑已授权的目录范围内。请在那台电脑上选择已授权目录，或由电脑前的人调整授权。",
  ],
  ["confirm_timeout", "书房电脑上没有人在 90 秒内确认，这一步已取消。请回到那台电脑上重新发起。"],
  ["revoked", "书房电脑已被撤销，需要在那台电脑上重新配对。"],
  ["pair_code_invalid", "配对码无效或已过期，请在客户端里重新获取"],
  ["action_kind_unknown", "这个本机操作暂不受支持，请刷新页面后再试。"],
  ["user_denied", "你在书房电脑上拒绝了这一步。"],
  ["command_unsupported", "这条命令包含管道或重定向，本机执行不支持；请拆成单条命令。"],
  ["quota_paired_devices", "已连接的电脑达到上限（20台）。撤销一台再连新的。"],
  ["quota_unfinished_tasks", "还有100个任务没跑完，等它们结束再下单。"],
  ["quota_rate", "下单太频繁了，过一会儿再试。"],
  ["quota_pair_codes", "配对码请求太频繁了，过一会儿再试。"],
  ["payload_field_missing", "这一步缺少必要参数，请刷新页面后重试。"],
  ["payload_field_unknown", "这一步的参数不被支持，请刷新页面后重试。"],
  ["payload_field_type_invalid", "这一步的参数格式不对，请刷新页面后重试。"],
  [
    "payload_path_not_absolute",
    "请填写完整的绝对路径，例如 /Users/你/文档 或 C:\\Users\\你\\Documents。",
  ],
];

test("协议 §7 的 18 个码逐个有契约规定的中文，一个英文 token 都不外泄", () => {
  assert.equal(CONTRACT_COPY.length, 18);
  assert.deepEqual(
    CONTRACT_COPY.map(([code]) => code).sort(),
    [...copy.DEVICE_ERROR_CODES].sort(),
  );
  for (const [code, expected] of CONTRACT_COPY) {
    assert.equal(
      copy.deviceErrorCopy(code, { deviceName: "书房电脑" }),
      expected,
      `${code} 的文案必须与 06-code-contract.md §1 逐字一致`,
    );
    assert.doesNotMatch(
      copy.deviceErrorCopy(code, { deviceName: "书房电脑" }),
      /[a-z]+_[a-z_]+/,
      `${code} 的文案里不许出现下划线英文 token`,
    );
  }
});

test("配额上限由后端说了算，后端不说才退回 0179 里的数", () => {
  assert.equal(
    copy.deviceErrorCopy("quota_paired_devices", { limit: 3 }),
    "已连接的电脑达到上限（3台）。撤销一台再连新的。",
  );
  assert.equal(
    copy.deviceErrorCopy("quota_unfinished_tasks", { limit: 7 }),
    "还有7个任务没跑完，等它们结束再下单。",
  );
  assert.equal(copy.DEVICE_QUOTA_FALLBACK_LIMITS.quota_paired_devices, 20);
  assert.equal(copy.DEVICE_QUOTA_FALLBACK_LIMITS.quota_unfinished_tasks, 100);
});

test("未知码在页面上落到兜底文案，不会把英文原文摆给用户", async () => {
  for (const unknown of [
    "device_quota_paired_devices_per_user_exceeded",
    "device_quota_rate_exceeded",
    "internal_server_error",
    "HTTP 500",
  ]) {
    assert.equal(copy.deviceErrorCopy(unknown), "这一步没有完成，请稍后重试。");
    const client = makeClient([], {
      async pairDevice(code) {
        client.calls.pair.push(code);
        return { ok: false, error: unknown, status: 429 };
      },
    });
    const view = await render(client);
    const input = view.host.querySelector('input[aria-label="8 位配对码"]');
    await view.setInput(input, "abcd1234");
    await view.submit(view.host.querySelector("form"));
    assert.ok(view.text().includes("这一步没有完成，请稍后重试。"));
    assert.doesNotMatch(view.text(), /[a-z]+_[a-z_]+/);
    assert.ok(!view.text().includes(unknown));
    view.cleanup();
  }
});

test("第 21 台电脑配对失败时页面上是中文上限提示，不是数据库 token", async () => {
  const client = makeClient([], {
    async pairDevice(code) {
      client.calls.pair.push(code);
      return { ok: false, error: "quota_paired_devices", status: 429, limit: 20 };
    },
  });
  const view = await render(client);
  const input = view.host.querySelector('input[aria-label="8 位配对码"]');
  await view.setInput(input, "abcd1234");
  await view.submit(view.host.querySelector("form"));
  assert.ok(view.text().includes("已连接的电脑达到上限（20台）。撤销一台再连新的。"));
  assert.doesNotMatch(view.text(), /[a-z]+_[a-z_]+/);
  view.cleanup();
});

test("配对码请求太频繁时不说「重试」，因为重试再吃一次配额", async () => {
  const client = makeClient([], {
    async pairDevice(code) {
      client.calls.pair.push(code);
      return { ok: false, error: "quota_pair_codes", status: 429 };
    },
  });
  const view = await render(client);
  const input = view.host.querySelector('input[aria-label="8 位配对码"]');
  await view.setInput(input, "abcd1234");
  await view.submit(view.host.querySelector("form"));
  assert.ok(view.text().includes("配对码请求太频繁了，过一会儿再试。"));
  assert.ok(!view.text().includes("请检查网络后重试"));
  view.cleanup();
});

test("shell 不再是可授权类别：类型与标签里都没有它", async () => {
  const [api, page] = await Promise.all([
    readFile(resolve("src/api/devices.ts"), "utf8"),
    readFile(resolve("src/pages/DevicesPage.tsx"), "utf8"),
  ]);
  const grantKind = api.match(/export type DeviceGrantKind =[^;]*;/);
  assert.ok(grantKind, "DeviceGrantKind 应当仍然存在");
  assert.ok(!grantKind[0].includes("shell"));
  const labels = page.match(/const GRANT_LABELS[\s\S]*?\n};/);
  assert.ok(labels, "GRANT_LABELS 应当仍然存在");
  assert.ok(!labels[0].includes("shell"));
  assert.ok(!labels[0].includes("Shell"));

  const view = await render(makeClient([makeDevice({ granted_kinds: ["read", "python"] })]));
  assert.ok(view.text().includes("读取、Python"));
  assert.ok(!view.text().includes("Shell"));
  view.cleanup();
});

test("下单被配额挡住时，页面上换成的是契约中文而不是「请检查网络后重试」", async () => {
  const { LocalTaskLauncher } = await import(
    await compileModule("src/shell/LocalTaskLauncher.tsx", {
      "./local-task-client": dataModule(`
        export class LocalTaskApiError extends Error {
          constructor(code, status, limit){ super(code); this.code=code; this.status=status; this.limit=limit; }
        }
        export async function createLocalTask(){
          throw new LocalTaskApiError("quota_unfinished_tasks", 429, 100);
        }
      `),
    })
  );
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(LocalTaskLauncher, {
        deviceId: "device-1",
        deviceName: "书房电脑",
        actionKind: "fs.list",
        payload: { path: "/allowed" },
        label: "列出目录",
        onCreated() {},
      }),
    );
  });
  await act(async () => {
    host
      .querySelector("button")
      .dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
  await flush();
  assert.ok(host.textContent.includes("还有100个任务没跑完，等它们结束再下单。"));
  assert.ok(!host.textContent.includes("请检查网络后重试"));
  assert.doesNotMatch(host.textContent, /[a-z]+_[a-z_]+/);
  act(() => root.unmount());
  host.remove();
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
