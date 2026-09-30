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
  HTMLSelectElement: window.HTMLSelectElement,
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

function money(amount_minor, currency = "USD") {
  return { cny: amount_minor / 100, amount_minor, currency };
}

function tier(partial) {
  return {
    instance_type: partial.id,
    vcpu: 2,
    memory_gb: 4,
    label: partial.id,
    available: true,
    recommended: false,
    hourly: money(20),
    monthly_estimate: money(14400),
    ...partial,
  };
}

function catalogFor(regionId = "ap-southeast-1") {
  const regions = [
    {
      id: "ap-southeast-1",
      zone_id: "ap-southeast-1b",
      label: "Singapore",
      recommended: true,
    },
    {
      id: "ap-northeast-1",
      zone_id: "ap-northeast-1a",
      label: "Tokyo",
      recommended: false,
    },
  ];
  const shared = {
    regions,
    recommended_region_id:
      regionId === "ap-northeast-1" ? "ap-northeast-1" : "ap-southeast-1",
    disk: {
      min_gb: 40,
      max_gb: 100,
      step_gb: 10,
      hourly_per_gb: { cny: 0.01, amount_minor: 1, currency: "USD" },
    },
    traffic: { per_gb: { cny: 0.1, amount_minor: 10, currency: "USD" } },
    image: { id: "img", label: "Ubuntu 24.04" },
    cny_per_usd: 7.2,
  };
  if (regionId === "ap-northeast-1") {
    return {
      ...shared,
      tiers: [
        tier({ id: "ecs.tokyo-1", label: "东京推荐", recommended: true, vcpu: 2, memory_gb: 4 }),
        tier({ id: "ecs.tokyo-2", label: "东京二", recommended: true, vcpu: 2, memory_gb: 8 }),
        tier({ id: "ecs.tokyo-3", label: "东京三", recommended: true, vcpu: 4, memory_gb: 16 }),
        tier({ id: "ecs.tokyo-4", label: "东京四", recommended: true, vcpu: 8, memory_gb: 32 }),
        tier({ id: "ecs.tokyo-5", label: "东京大五", recommended: false, vcpu: 16, memory_gb: 64 }),
      ],
    };
  }
  return {
    ...shared,
    tiers: [
      tier({ id: "ecs.t1", label: "入门", recommended: true, vcpu: 2, memory_gb: 4 }),
      tier({ id: "ecs.t2", label: "推荐二", recommended: true, vcpu: 2, memory_gb: 8 }),
      tier({ id: "ecs.t3", label: "推荐三", recommended: true, vcpu: 4, memory_gb: 16 }),
      tier({ id: "ecs.t4", label: "推荐四", recommended: true, vcpu: 8, memory_gb: 32 }),
      tier({
        id: "ecs.t5",
        label: "无报价",
        recommended: false,
        vcpu: 1,
        memory_gb: 1,
        hourly: null,
        monthly_estimate: null,
      }),
      tier({ id: "ecs.t6", label: "大规格", recommended: false, vcpu: 16, memory_gb: 64 }),
    ],
  };
}

function makeClient(overrides = {}) {
  const log = { create: [], catalog: [] };
  return {
    log,
    async getCatalog(regionId) {
      log.catalog.push(regionId ?? null);
      return catalogFor(regionId || "ap-southeast-1");
    },
    async createAliyunComputer(body) {
      log.create.push(body);
      if (overrides.createError) throw overrides.createError;
      return { id: "cc_new", name: body.name, source: "aliyun", status: "provisioning" };
    },
  };
}

async function changeSelect(host, selector, value) {
  const select = host.querySelector(selector);
  assert.ok(select, selector);
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLSelectElement.prototype,
      "value",
    )?.set;
    setter.call(select, value);
    select.dispatchEvent(new window.Event("change", { bubbles: true }));
  });
  await flush(12);
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
  assert.equal(client.log.create[0].region_id, "ap-southeast-1");
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

test("假目录含两地超过四档，推荐置顶，换地域会再拉 catalog", async () => {
  const client = makeClient();
  const view = await render({
    client,
    loadCredits: async () => ({
      ok: true,
      data: { balance_minor: 50_000, currency: "USD" },
    }),
  });
  assert.deepEqual(client.log.catalog, [null]);
  const tiers = [...view.host.querySelectorAll("[data-oceanleo-cc-tier]")];
  assert.ok(tiers.length > 4);
  assert.equal(tiers.length, 6);
  assert.equal(
    [...view.host.querySelectorAll("[data-oceanleo-cc-tier-recommended]")].length,
    4,
  );
  assert.equal(tiers[0].getAttribute("data-oceanleo-cc-tier"), "ecs.t1");
  assert.equal(tiers[3].getAttribute("data-oceanleo-cc-tier"), "ecs.t4");
  assert.equal(tiers[4].getAttribute("data-oceanleo-cc-tier"), "ecs.t5");
  assert.ok(view.host.querySelector("[data-oceanleo-cc-tier-list]"));
  assert.equal(view.host.querySelector("[data-oceanleo-cc-region]").value, "ap-southeast-1");
  await changeSelect(view.host, "[data-oceanleo-cc-region]", "ap-northeast-1");
  assert.deepEqual(client.log.catalog, [null, "ap-northeast-1"]);
  assert.ok(view.host.querySelector('[data-oceanleo-cc-tier="ecs.tokyo-1"]'));
  assert.equal(view.host.querySelector('[data-oceanleo-cc-tier="ecs.t1"]'), null);
  assert.equal(
    [...view.host.querySelectorAll("[data-oceanleo-cc-tier]")].length,
    5,
  );
  view.cleanup();
});

test("换地域后下单 POST 带新 region_id，默认选该地推荐可买档", async () => {
  const client = makeClient();
  const view = await render({
    client,
    loadCredits: async () => ({
      ok: true,
      data: { balance_minor: 50_000, currency: "USD" },
    }),
  });
  await changeSelect(view.host, "[data-oceanleo-cc-region]", "ap-northeast-1");
  await fillName(view.host, "东京机");
  await view.click(view.button("下一步：费用确认"));
  await view.click(view.button("确认支付并创建"));
  assert.equal(client.log.create.length, 1);
  assert.equal(client.log.create[0].region_id, "ap-northeast-1");
  assert.equal(client.log.create[0].tier_id, "ecs.tokyo-1");
  assert.equal(client.log.create[0].name, "东京机");
  view.cleanup();
});

test("hourly 为空仍能选，文案是选中后显示价格", async () => {
  const client = makeClient();
  const view = await render({
    client,
    loadCredits: async () => ({
      ok: true,
      data: { balance_minor: 50_000, currency: "USD" },
    }),
  });
  const unquoted = view.host.querySelector('[data-oceanleo-cc-tier="ecs.t5"]');
  assert.ok(unquoted);
  assert.match(unquoted.textContent || "", /选中后显示价格/);
  assert.equal(unquoted.disabled, false);
  await view.click(unquoted);
  await fillName(view.host, "无价机");
  await view.click(view.button("下一步：费用确认"));
  assert.equal(view.step(), "checkout");
  assert.match(view.text(), /选中后显示价格/);
  assert.ok(view.button("确认支付并创建"));
  view.cleanup();
});

test("核数内存筛选默认不过滤，提高门槛后只留大规格", async () => {
  const client = makeClient();
  const view = await render({ client });
  assert.equal(view.host.querySelectorAll("[data-oceanleo-cc-tier]").length, 6);
  await changeSelect(view.host, "[data-oceanleo-cc-vcpu-filter]", "8");
  const afterVcpu = [...view.host.querySelectorAll("[data-oceanleo-cc-tier]")].map(
    (node) => node.getAttribute("data-oceanleo-cc-tier"),
  );
  assert.deepEqual(afterVcpu, ["ecs.t4", "ecs.t6"]);
  await changeSelect(view.host, "[data-oceanleo-cc-memory-filter]", "32");
  const afterMem = [...view.host.querySelectorAll("[data-oceanleo-cc-tier]")].map(
    (node) => node.getAttribute("data-oceanleo-cc-tier"),
  );
  assert.deepEqual(afterMem, ["ecs.t4", "ecs.t6"]);
  await changeSelect(view.host, "[data-oceanleo-cc-vcpu-filter]", "");
  await changeSelect(view.host, "[data-oceanleo-cc-memory-filter]", "32");
  assert.deepEqual(
    [...view.host.querySelectorAll("[data-oceanleo-cc-tier]")].map((node) =>
      node.getAttribute("data-oceanleo-cc-tier"),
    ),
    ["ecs.t4", "ecs.t6"],
  );
  view.cleanup();
});
