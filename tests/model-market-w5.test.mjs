import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/settings/ai-models",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLButtonElement: window.HTMLButtonElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const reactUrl = pathToFileURL(require.resolve("react")).href;

function offer(provider, id, extra = {}) {
  return {
    key: `${provider}:${id}`,
    id,
    label: extra.label || id,
    provider,
    provider_label: extra.provider_label || provider,
    category: extra.category || "text",
    capability_labels: extra.capability_labels || ["对话"],
    status: extra.status || "available",
    selectable: extra.selectable ?? extra.status === "available",
    unpriced: extra.status === "unpriced",
    key_help_url: extra.key_help_url,
    price: extra.price || {
      billing: "token",
      currency: "USD",
      input_per_m: 1,
      output_per_m: 2,
    },
  };
}

function capability(id, label, models) {
  const byProvider = new Map();
  for (const model of models) {
    const list = byProvider.get(model.provider) || [];
    list.push(model);
    byProvider.set(model.provider, list);
  }
  return {
    id,
    label,
    description: label,
    providers: [...byProvider.entries()].map(([providerId, providerModels]) => ({
      id: providerId,
      label: providerModels[0]?.provider_label || providerId,
      key_help_url: providerId === "alibaba_intl"
        ? "https://modelstudio.console.alibabacloud.com/"
        : "",
      models: providerModels,
    })),
  };
}

function group(id, label, capabilities) {
  return { id, label, providers: [], capabilities };
}

const catalog = {
  groups: [
    group("text", "文本", [
      capability("chat", "对话", [
        offer("alibaba_intl", "qwen3.7-max-2026-05-17", {
          label: "qwen3.7-max-2026-05-17",
          provider_label: "阿里云国际站",
          status: "byok_only",
          selectable: false,
        }),
        offer("alibaba_intl", "qwen3.8-max", {
          label: "qwen3.8-max",
          provider_label: "阿里云国际站",
          status: "byok_only",
          selectable: false,
        }),
        offer("openrouter", "gpt-oss-120b", {
          label: "gpt-oss-120b",
          provider_label: "OpenRouter",
          status: "available",
        }),
        offer("openrouter", "qwen/qwen3.7-max", {
          label: "qwen3.7-max",
          provider_label: "OpenRouter",
          status: "available",
        }),
        offer("azure", "gpt-4o", {
          label: "gpt-4o",
          provider_label: "Azure OpenAI",
          status: "not_opened",
          selectable: false,
        }),
      ]),
    ]),
    group("image", "图片", [
      capability("text_to_image", "文生图", [
        offer("alibaba_intl", "qwen-image", {
          label: "Qwen Image",
          provider_label: "阿里云国际站",
          category: "image",
          status: "byok_only",
          selectable: false,
        }),
      ]),
    ]),
  ],
  status_labels: {
    available: "可用",
    not_opened: "暂未开通",
    byok_only: "需自带 Key",
  },
  tier_selection: {
    lite: { text: { chat: ["openrouter:gpt-oss-120b"] } },
    pro: { text: { chat: ["openrouter:gpt-oss-120b"] } },
    max: { text: { chat: ["openrouter:qwen/qwen3.7-max"] } },
  },
};

const groups = [
  {
    key: "preset:pro",
    id: "pro",
    kind: "preset",
    name: "Pro",
    editable: false,
    selection: catalog.tier_selection.pro,
  },
  {
    key: "custom:test",
    id: "test",
    kind: "custom",
    name: "test",
    editable: true,
    selection: { text: { chat: ["openrouter:gpt-oss-120b"] } },
  },
];

const {
  ModelGroupManager,
  emptyCapabilityReason,
  emptyCategoryReason,
  partitionOfferModels,
} = await import(
  await compileModule("src/pages/ModelCapabilityMarket.tsx", {
    "../lib/auth": dataModule(`
      export const MODEL_GROUP_CHANGED_EVENT = "oceanleo:model-group-changed";
      export async function getModelGroups() {
        return globalThis.__groupsResult;
      }
      export async function getKeyProviders() {
        return {
          ok: true,
          data: {
            providers: [
              { id: "alibaba_intl", key_help_url: "https://modelstudio.console.alibabacloud.com/" },
            ],
          },
        };
      }
      export async function setActiveModelGroup(key) {
        globalThis.__activated = key;
        const data = { ...globalThis.__groupsResult.data, active_group_key: key };
        globalThis.__groupsResult = { ok: true, data };
        return { ok: true, data };
      }
      export async function createModelGroup() { return { ok: false }; }
      export async function updateModelGroup(id, patch) {
        globalThis.__savedPatch = { id, patch };
        if (globalThis.__updateResult) return globalThis.__updateResult;
        const nextGroups = globalThis.__groupsResult.data.groups.map((group) => (
          group.id === id
            ? { ...group, selection: patch.selection || group.selection }
            : group
        ));
        const data = {
          ...globalThis.__groupsResult.data,
          groups: nextGroups,
          group: nextGroups.find((group) => group.id === id),
        };
        globalThis.__groupsResult = { ok: true, data };
        return { ok: true, data };
      }
      export async function deleteModelGroup() { return { ok: false }; }
    `),
    "../lib/money": dataModule(`export function currencySymbol() { return "$"; }`),
    "../i18n/ui/useUI": dataModule(`
      export function useUI() {
        return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
      }
    `),
    "../ui": dataModule(`
      import React from ${JSON.stringify(reactUrl)};
      export function ConfirmDialog({ title }) {
        return React.createElement("div", { "data-confirm": "" }, title);
      }
      export function FloatingMenu({ open, children, ariaLabel }) {
        if (!open) return null;
        return React.createElement("div", { role: "menu", "aria-label": ariaLabel }, children);
      }
      export function FloatingMenuItem({ label, onSelect, danger, disabled }) {
        return React.createElement("button", {
          type: "button",
          role: "menuitem",
          disabled: Boolean(disabled),
          "data-danger": danger ? "true" : undefined,
          onClick: onSelect,
        }, label);
      }
    `),
  })
);

async function flush(count = 8) {
  for (let index = 0; index < count; index += 1) {
    await act(async () => {});
  }
}

async function render(options = {}) {
  globalThis.__activated = "";
  globalThis.__savedPatch = null;
  globalThis.__updateResult = options.updateResult;
  globalThis.__groupsResult = {
    ok: true,
    data: {
      groups: options.groups || groups,
      active_group_key: options.active_group_key || "preset:pro",
      default_group_key: "preset:pro",
      selection: {},
      capability_selection: {},
      byok_providers: options.byok_providers || [],
    },
  };
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ModelGroupManager, {
      catalog: options.catalog || catalog,
      user: options.user ?? true,
      onSetupByok: options.onSetupByok,
    }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    async click(node) {
      if (!node) throw new Error("click target missing");
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function beginEdit(view, key = "custom:test") {
  await view.click(view.host.querySelector(`[data-model-group-chip="${key}"] button`));
  await view.click(view.host.querySelector(`[data-model-group-menu="${key}"]`));
  const edit = [...view.host.querySelectorAll("[role=menuitem]")]
    .find((node) => (node.textContent || "").includes("编辑组合"));
  await view.click(edit);
}

test("zh/en 词典收录平台暂未开通与添加 Key", () => {
  const source = readFileSync(
    new URL("../src/i18n/ui/messages/model-catalog-copy.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /statusPlatformNotOpened: "平台暂未开通"/);
  assert.match(source, /statusPlatformNotOpened: "Not opened on the platform"/);
  assert.match(source, /addKey: "添加 Key"/);
  assert.match(source, /addKey: "Add a key"/);
});

test("partitionOfferModels 把可选排在前面", () => {
  const models = catalog.groups[0].capabilities[0].providers.flatMap((item) => item.models);
  const parts = partitionOfferModels(models, []);
  assert.deepEqual(parts.selectable.map((model) => model.key), [
    "openrouter:gpt-oss-120b",
    "openrouter:qwen/qwen3.7-max",
  ]);
  assert.equal(parts.unavailable.length, 3);
  assert.equal(emptyCapabilityReason(catalog.groups[0].capabilities[0], []), "none");
  assert.equal(emptyCategoryReason(catalog.groups[0].capabilities, []), "none");
  assert.equal(emptyCapabilityReason(catalog.groups[1].capabilities[0], []), "byok_only");
});

test("编辑列表先出现可选模型，不可选收进折叠区且不能点选", async () => {
  const view = await render();
  await beginEdit(view);
  const editList = view.host.querySelector("[data-model-edit-offers]");
  assert.ok(editList);
  const visibleKeys = [...editList.querySelectorAll("[data-model-offer]")]
    .filter((node) => !node.closest("[data-model-unavailable-offers]"))
    .map((node) => node.getAttribute("data-model-offer"));
  assert.deepEqual(visibleKeys, [
    "openrouter:gpt-oss-120b",
    "openrouter:qwen/qwen3.7-max",
  ]);
  const unavailable = view.host.querySelector("[data-model-unavailable]");
  assert.ok(unavailable);
  assert.equal(unavailable.getAttribute("data-model-unavailable-count"), "3");
  assert.equal(unavailable.querySelector("[data-model-unavailable-offers]").hasAttribute("hidden"), true);
  const alibaba = editList.querySelector('[data-model-offer="alibaba_intl:qwen3.8-max"]');
  assert.ok(alibaba);
  assert.equal(alibaba.getAttribute("data-model-offer-disabled"), "true");
  assert.equal(alibaba.disabled, true);
  assert.match(alibaba.textContent, /需自带 Key/);
  await view.click(alibaba);
  assert.equal(view.host.querySelector('[data-model-offer="alibaba_intl:qwen3.8-max"]').getAttribute("data-model-offer-disabled"), "true");
  const azure = editList.querySelector('[data-model-offer="azure:gpt-4o"]');
  assert.match(azure.textContent, /平台暂未开通/);
  view.cleanup();
});

test("供应商芯片写出可选数量，添加 Key 打开已有 key 设置", async () => {
  let setup = 0;
  const view = await render({ onSetupByok: () => { setup += 1; } });
  await beginEdit(view);
  const all = view.host.querySelector('[data-model-provider-chip="__all__"]');
  assert.equal(all.getAttribute("data-model-provider-selectable"), "2");
  const openrouter = view.host.querySelector('[data-model-provider-chip="openrouter"]');
  assert.equal(openrouter.getAttribute("data-model-provider-selectable"), "2");
  const intl = view.host.querySelector('[data-model-provider-chip="alibaba_intl"]');
  assert.equal(intl.getAttribute("data-model-provider-selectable"), "0");
  const addKey = view.host.querySelector('[data-model-add-key="alibaba_intl"]');
  assert.ok(addKey);
  await view.click(addKey);
  assert.equal(setup, 1);
  const help = view.host.querySelector('[data-model-key-help="alibaba_intl"]');
  assert.ok(help);
  assert.equal(help.getAttribute("href"), "https://modelstudio.console.alibabacloud.com/");
  view.cleanup();
});

test("零可选的图片类写出空状态和添加 Key", async () => {
  let setup = 0;
  const view = await render({ onSetupByok: () => { setup += 1; } });
  await view.click(view.host.querySelector('[data-model-cat="image"]'));
  const empty = view.host.querySelector("[data-model-empty-capability]");
  assert.ok(empty);
  assert.equal(empty.getAttribute("data-empty-reason"), "byok_only");
  assert.match(empty.textContent, /这一类暂无可选模型/);
  assert.match(empty.textContent, /需自带 Key/);
  await view.click(empty.querySelector("[data-model-add-key]"));
  assert.equal(setup, 1);
  view.cleanup();
});

test("保存组合后刷新仍看到该自定义组合、所选模型和全站生效标记", async () => {
  const view = await render({ active_group_key: "preset:pro" });
  await beginEdit(view);
  assert.equal(view.host.querySelector("[data-model-group-active]"), null);
  await view.click(view.host.querySelector('[data-model-offer="openrouter:qwen/qwen3.7-max"]'));
  const save = [...view.host.querySelectorAll("button")]
    .find((node) => (node.textContent || "") === "保存组合");
  await view.click(save);
  assert.equal(globalThis.__savedPatch.id, "test");
  assert.deepEqual(globalThis.__savedPatch.patch.selection.text.chat, [
    "openrouter:gpt-oss-120b",
    "openrouter:qwen/qwen3.7-max",
  ]);
  assert.equal(globalThis.__activated, "custom:test");
  assert.ok(view.host.querySelector("[data-model-group-active]"));
  const saved = structuredClone(globalThis.__groupsResult.data);
  view.cleanup();

  const reloaded = await render({
    groups: saved.groups,
    active_group_key: saved.active_group_key,
  });
  const live = reloaded.host.querySelector('[data-model-group-chip="custom:test"]');
  assert.equal(live.getAttribute("data-model-group-live"), "true");
  assert.ok(reloaded.host.querySelector("[data-model-group-active]"));
  assert.match(reloaded.host.querySelector("[data-model-group-table]").textContent, /gpt-oss-120b/);
  assert.match(reloaded.host.querySelector("[data-model-group-table]").textContent, /qwen3.7-max/);
  reloaded.cleanup();
});

test("保存失败时错误可见，不假装成功", async () => {
  const view = await render({
    updateResult: { ok: false, error: "保存模型组合失败" },
  });
  await beginEdit(view);
  const save = [...view.host.querySelectorAll("button")]
    .find((node) => (node.textContent || "") === "保存组合");
  await view.click(save);
  assert.match(view.text(), /保存模型组合失败/);
  assert.equal(globalThis.__activated, "");
  view.cleanup();
});
