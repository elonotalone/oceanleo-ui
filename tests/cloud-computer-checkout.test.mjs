import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { CloudComputerError } from "../src/lib/cloud-computer-api.ts";

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
const modalStubUrl = dataModule(`
  import React from ${JSON.stringify(reactUrl)};
  export function Modal({ children }) {
    return React.createElement("div", { "data-testid": "modal" }, children);
  }
`);

const { CreateComputerDialog } = await import(
  await compileModule("src/shell/cloud-computer/CreateComputerDialog.tsx", {
    "../../i18n/ui/useUI": uiTextStubUrl,
    "../../ui": modalStubUrl,
  })
);

function catalog() {
  return {
    regions: [{ id: "ap-southeast-1", zone_id: "a", label: "新加坡" }],
    tiers: [
      {
        id: "ecs.t1",
        instance_type: "ecs.t1",
        vcpu: 2,
        memory_gb: 2,
        label: "入门",
        available: true,
        hourly: { cny: 0.2, amount_minor: 20, currency: "USD" },
        monthly_estimate: { amount_minor: 14400, currency: "USD" },
      },
    ],
    disk: {
      min_gb: 40,
      max_gb: 100,
      step_gb: 10,
      hourly_per_gb: { cny: 0.01, amount_minor: 1, currency: "USD" },
    },
    traffic: { per_gb: { cny: 0.1, amount_minor: 10, currency: "USD" } },
    image: { id: "img", label: "Ubuntu" },
    cny_per_usd: 7,
  };
}

function makeClient(overrides = {}) {
  const log = { create: [] };
  return {
    log,
    async getCatalog() {
      return catalog();
    },
    async createAliyunComputer(body) {
      log.create.push(body);
      if (overrides.createError) throw overrides.createError;
      return { id: "cc_new", name: body.name, source: "aliyun", status: "provisioning" };
    },
  };
}

async function flush(count = 8) {
  for (let i = 0; i < count; i += 1) await act(async () => {});
}

async function fillName(host, value) {
  const input = host.querySelector('input[aria-label="名字"]');
  assert.ok(input);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;
    setter.call(input, value);
    input.dispatchEvent(new window.Event("input", { bubbles: true }));
    input.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
}

async function render(props) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const closed = { n: 0, created: 0 };
  await act(async () => {
    root.render(
      React.createElement(CreateComputerDialog, {
        onClose() {
          closed.n += 1;
        },
        onCreated() {
          closed.created += 1;
        },
        ...props,
      }),
    );
  });
  await flush();
  return {
    host,
    closed,
    text: () => host.textContent || "",
    step() {
      return host
        .querySelector("[data-oceanleo-cc-create-step]")
        ?.getAttribute("data-oceanleo-cc-create-step");
    },
    button(label) {
      return [...host.querySelectorAll("button")].find(
        (node) => (node.textContent || "").trim() === label,
      );
    },
    async click(node) {
      assert.ok(node, "expected clickable element");
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
        await Promise.resolve();
        await Promise.resolve();
      });
      await flush(12);
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("选档位后必须进入费用确认，目录步没有确认支付并创建", async () => {
  const client = makeClient();
  const view = await render({
    client,
    loadCredits: async () => ({
      ok: true,
      data: { balance_minor: 10_000, currency: "USD" },
    }),
  });
  assert.equal(view.step(), "catalog");
  assert.equal(view.button("确认支付并创建"), undefined);
  assert.ok(view.button("下一步：费用确认"));
  await fillName(view.host, "测试机");
  await view.click(view.button("下一步：费用确认"));
  assert.equal(view.step(), "checkout");
  assert.deepEqual(client.log.create, []);
  assert.ok(view.host.querySelector("[data-oceanleo-cc-checkout]"));
  assert.ok(view.text().includes("开通时至少需要 24 小时的费用作为预留"));
  view.cleanup();
});

test("余额不足只有去充值指向 /cost，没有确认支付并创建", async () => {
  const client = makeClient();
  const view = await render({
    client,
    loadCredits: async () => ({
      ok: true,
      data: { balance_minor: 10, currency: "USD" },
    }),
  });
  await fillName(view.host, "穷机");
  await view.click(view.button("下一步：费用确认"));
  assert.equal(view.step(), "checkout");
  assert.ok(view.host.querySelector("[data-oceanleo-cc-insufficient-balance]"));
  const topup = view.host.querySelector("[data-oceanleo-cc-checkout-topup]");
  assert.ok(topup);
  assert.equal(topup.getAttribute("href"), "/cost");
  assert.equal((topup.textContent || "").trim(), "去充值");
  assert.equal(view.button("确认支付并创建"), undefined);
  assert.equal(view.host.querySelector("[data-oceanleo-cc-checkout-pay]"), null);
  assert.deepEqual(client.log.create, []);
  view.cleanup();
});

test("余额够则确认支付并创建会调用 createAliyunComputer", async () => {
  const client = makeClient();
  const view = await render({
    client,
    loadCredits: async () => ({
      ok: true,
      data: { balance_minor: 50_000, currency: "USD" },
    }),
  });
  await fillName(view.host, "富机");
  await view.click(view.button("下一步：费用确认"));
  assert.equal(view.step(), "checkout");
  assert.ok(view.button("确认支付并创建"));
  assert.equal(view.host.querySelector("[data-oceanleo-cc-checkout-topup]"), null);
  await view.click(view.button("确认支付并创建"));
  assert.equal(client.log.create.length, 1);
  assert.equal(client.log.create[0].name, "富机");
  assert.equal(client.log.create[0].tier_id, "ecs.t1");
  assert.equal(client.log.create[0].disk_gb, 40);
  assert.equal(view.closed.created, 1);
  assert.equal(view.step(), "result");
  assert.ok(view.text().includes("正在开通，几分钟后出现在我的设备里"));
  view.cleanup();
});

test("网关 409 insufficient_balance 回到费用确认并只留去充值", async () => {
  const client = makeClient({
    createError: new CloudComputerError("insufficient_balance", "余额不足", 409),
  });
  const view = await render({
    client,
    loadCredits: async () => ({
      ok: true,
      data: { balance_minor: 50_000, currency: "USD" },
    }),
  });
  await fillName(view.host, "差点");
  await view.click(view.button("下一步：费用确认"));
  await view.click(view.button("确认支付并创建"));
  assert.equal(view.step(), "checkout");
  assert.ok(view.host.querySelector("[data-oceanleo-cc-insufficient-balance]"));
  assert.ok(view.host.querySelector("[data-oceanleo-cc-checkout-topup]"));
  assert.equal(view.button("确认支付并创建"), undefined);
  view.cleanup();
});
