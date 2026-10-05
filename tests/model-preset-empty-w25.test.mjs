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
    capability_labels: extra.capability_labels || [],
    status: extra.status || "available",
    selectable: extra.selectable ?? extra.status === "available",
    unpriced: extra.status === "unpriced",
  };
}

function capability(id, label, models, extra = {}) {
  const byProvider = new Map();
  for (const model of models) {
    const list = byProvider.get(model.provider) || [];
    list.push(model);
    byProvider.set(model.provider, list);
  }
  return {
    id,
    label,
    description: extra.description || label,
    providers: [...byProvider.entries()].map(([providerId, providerModels]) => ({
      id: providerId,
      label: providerModels[0]?.provider_label || providerId,
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
        offer("bailian", "qwen-plus", { label: "Qwen-Plus", provider_label: "百炼", status: "available" }),
      ]),
    ]),
    group("image", "图片", [
      capability("text_to_image", "文生图", [
        offer("alibaba_intl", "qwen-image", {
          label: "Qwen Image",
          provider_label: "阿里云国际站",
          category: "image",
          status: "not_opened",
        }),
      ]),
    ]),
    group("video", "视频", [
      capability("text_to_video", "文生视频", [
        offer("openai", "sora", {
          label: "Sora",
          provider_label: "OpenAI",
          category: "video",
          status: "byok_only",
        }),
      ]),
    ]),
    group("threed", "3D", [
      capability("general_3d", "通用 3D 生成", []),
    ]),
  ],
  tier_selection: {
    lite: {
      text: { chat: ["bailian:qwen-plus"] },
      image: { text_to_image: [] },
      video: { text_to_video: [] },
      threed: { general_3d: [] },
    },
    pro: {
      text: { chat: ["bailian:qwen-plus"] },
      image: { text_to_image: [] },
      video: { text_to_video: [] },
      threed: { general_3d: [] },
    },
    max: {
      text: { chat: ["bailian:qwen-plus"] },
      image: { text_to_image: [] },
      video: { text_to_video: [] },
      threed: { general_3d: [] },
    },
  },
};

const { ModelGroupManager, emptyCapabilityReason, emptyCategoryReason } = await import(
  await compileModule("src/pages/ModelCapabilityMarket.tsx", {
    "../lib/auth": dataModule(`
      export const MODEL_GROUP_CHANGED_EVENT = "oceanleo:model-group-changed";
      export async function getModelGroups() {
        return globalThis.__groupsResult;
      }
      export async function setActiveModelGroup() { return { ok: false }; }
      export async function createModelGroup() { return { ok: false }; }
      export async function updateModelGroup() { return { ok: false }; }
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
      export function FloatingMenuItem({ label, onSelect }) {
        return React.createElement("button", { type: "button", role: "menuitem", onClick: onSelect }, label);
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
  globalThis.__groupsResult = {
    ok: true,
    data: {
      groups: options.groups || [],
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
      user: options.user ?? false,
    }));
  });
  await flush();
  return {
    host,
    text: () => host.textContent || "",
    async click(node) {
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

test("emptyCapabilityReason 三种判定", () => {
  assert.equal(
    emptyCapabilityReason(catalog.groups[1].capabilities[0], []),
    "not_opened",
  );
  assert.equal(
    emptyCapabilityReason(catalog.groups[2].capabilities[0], []),
    "byok_only",
  );
  assert.equal(
    emptyCapabilityReason(catalog.groups[2].capabilities[0], ["openai"]),
    "none",
  );
  assert.equal(
    emptyCapabilityReason(catalog.groups[3].capabilities[0], []),
    "none",
  );
  assert.equal(emptyCategoryReason(catalog.groups[1].capabilities, []), "not_opened");
  assert.equal(emptyCategoryReason(catalog.groups[2].capabilities, []), "byok_only");
  assert.equal(emptyCategoryReason(catalog.groups[3].capabilities, []), "none");
});

test("预设空能力写出三种原因，有选中的不写", async () => {
  const view = await render();
  const table = view.host.querySelector("[data-model-group-table]");
  assert.ok(table);
  console.log("W25_HTML_PRESET\n" + table.innerHTML);

  const catReasons = [...view.host.querySelectorAll("[data-empty-cat-reason]")].map((node) => ({
    id: node.getAttribute("data-empty-cat-reason"),
    kind: node.getAttribute("data-empty-reason"),
    text: (node.textContent || "").trim(),
  }));
  assert.deepEqual(
    catReasons,
    [
      { id: "image", kind: "not_opened", text: "这一类暂未开通" },
      { id: "video", kind: "byok_only", text: "这一类需自带 Key" },
      { id: "threed", kind: "none", text: "本版暂无这一类模型" },
    ],
  );
  assert.equal(view.host.querySelector('[data-empty-cat-reason="text"]'), null);
  assert.equal(view.host.querySelector('[data-model-cat="text"] [data-empty-reason]'), null);
  assert.equal(view.host.querySelector("[data-empty-cap-reason]"), null);
  assert.match(view.host.querySelector('[data-model-cap="chat"]').textContent, /对话/);
  assert.match(view.host.querySelector('[data-model-cap="chat"]').textContent, /✓1/);
  assert.doesNotMatch(view.host.querySelector('[data-model-cap="chat"]').textContent, /这一类/);

  await view.click(view.host.querySelector('[data-model-cat="image"]'));
  const imageCap = view.host.querySelector('[data-empty-cap-reason="text_to_image"]');
  assert.ok(imageCap);
  assert.equal(imageCap.getAttribute("data-empty-reason"), "not_opened");
  assert.equal(imageCap.textContent.trim(), "这一类暂未开通");

  await view.click(view.host.querySelector('[data-model-cat="video"]'));
  const videoCap = view.host.querySelector('[data-empty-cap-reason="text_to_video"]');
  assert.ok(videoCap);
  assert.equal(videoCap.getAttribute("data-empty-reason"), "byok_only");
  assert.equal(videoCap.textContent.trim(), "这一类需自带 Key");

  await view.click(view.host.querySelector('[data-model-cat="threed"]'));
  const threeCap = view.host.querySelector('[data-empty-cap-reason="general_3d"]');
  assert.ok(threeCap);
  assert.equal(threeCap.getAttribute("data-empty-reason"), "none");
  assert.equal(threeCap.textContent.trim(), "本版暂无这一类模型");

  const kinds = [
    ...view.host.querySelectorAll("[data-empty-cat-reason]"),
    imageCap,
    videoCap,
    threeCap,
  ].map((node) => node.getAttribute("data-empty-reason"));
  assert.deepEqual([...new Set(kinds)].sort(), ["byok_only", "none", "not_opened"]);
  view.cleanup();
});

test("填了对应自带 key 后 byok 空类改口为本版暂无", async () => {
  const groups = [
    {
      key: "preset:pro",
      id: "pro",
      kind: "preset",
      name: "Pro",
      editable: false,
      selection: catalog.tier_selection.pro,
    },
  ];
  const view = await render({
    user: true,
    groups,
    byok_providers: ["openai"],
  });
  const video = view.host.querySelector('[data-empty-cat-reason="video"]');
  assert.ok(video);
  assert.equal(video.getAttribute("data-empty-reason"), "none");
  assert.equal(video.textContent.trim(), "本版暂无这一类模型");
  view.cleanup();
});
