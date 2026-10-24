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
      capability("design", "海报与创意设计", [
        offer("bailian", "wanx-wordart", {
          label: "艺术字",
          provider_label: "百炼",
          category: "image",
          status: "no_adapter",
        }),
        offer("alibaba_intl", "wordart-v2", {
          label: "WordArt",
          provider_label: "阿里云国际站",
          category: "image",
          status: "no_adapter",
        }),
      ]),
    ]),
    group("video", "视频", [
      capability("keyframe_to_video", "首尾帧生视频", [
        offer("bailian", "wanx-kf2v", {
          label: "首尾帧",
          provider_label: "百炼",
          category: "video",
          status: "no_adapter",
        }),
        offer("alibaba_intl", "kf2v-pro", {
          label: "KF2V",
          provider_label: "阿里云国际站",
          category: "video",
          status: "not_opened",
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
      image: { design: [] },
      video: { keyframe_to_video: [] },
      threed: { general_3d: [] },
    },
    pro: {
      text: { chat: ["bailian:qwen-plus"] },
      image: { design: [] },
      video: { keyframe_to_video: [] },
      threed: { general_3d: [] },
    },
    max: {
      text: { chat: ["bailian:qwen-plus"] },
      image: { design: [] },
      video: { keyframe_to_video: [] },
      threed: { general_3d: [] },
    },
  },
};

const { ModelGroupManager, emptyCapabilityReason, emptyCategoryReason } = await import(
  await compileModule("src/pages/ModelCapabilityMarket.tsx", {
    "../shell/byok-status": dataModule('export const BYOK_STATUS_CHANGED_EVENT = "oceanleo:byok-status-changed";'),
    "../lib/auth": dataModule(`
      export const MODEL_GROUP_CHANGED_EVENT = "oceanleo:model-group-changed";
      export async function getModelGroups() {
        return globalThis.__groupsResult;
      }
      export async function getKeyProviders() {
        return { ok: true, data: { providers: [] } };
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

test("emptyCapabilityReason：全是 no_adapter / 混有 not_opened / 空能力", () => {
  assert.equal(
    emptyCapabilityReason(catalog.groups[1].capabilities[0], []),
    "no_adapter",
  );
  assert.equal(
    emptyCapabilityReason(catalog.groups[2].capabilities[0], []),
    "not_opened",
  );
  assert.equal(
    emptyCapabilityReason(catalog.groups[3].capabilities[0], []),
    "none",
  );
  assert.equal(emptyCategoryReason(catalog.groups[1].capabilities, []), "no_adapter");
  assert.equal(emptyCategoryReason(catalog.groups[2].capabilities, []), "not_opened");
  assert.equal(emptyCategoryReason(catalog.groups[3].capabilities, []), "none");
});

test("预设空能力：分类和能力不重复不可用原因，保留简洁空状态", async () => {
  const view = await render();
  const image = view.host.querySelector('[data-empty-cat-reason="image"]');
  assert.equal(image, null);

  const video = view.host.querySelector('[data-empty-cat-reason="video"]');
  assert.equal(video, null);

  const three = view.host.querySelector('[data-empty-cat-reason="threed"]');
  assert.equal(three, null);

  await view.click(view.host.querySelector('[data-model-cat="image"]'));
  const imageCap = view.host.querySelector('[data-empty-cap-reason="design"]');
  assert.equal(imageCap, null);
  assert.equal(view.host.querySelector("[data-model-empty-capability]").textContent.trim(), "这一类暂无可选模型");
  assert.equal(view.host.querySelector("[data-model-empty-capability]").getAttribute("data-empty-reason"), "no_adapter");

  await view.click(view.host.querySelector('[data-model-cat="video"]'));
  const videoCap = view.host.querySelector('[data-empty-cap-reason="keyframe_to_video"]');
  assert.equal(videoCap, null);
  assert.equal(view.host.querySelector("[data-model-empty-capability]").textContent.trim(), "这一类暂无可选模型");

  await view.click(view.host.querySelector('[data-model-cat="threed"]'));
  const threeCap = view.host.querySelector('[data-empty-cap-reason="general_3d"]');
  assert.equal(threeCap, null);
  assert.equal(view.host.querySelector("[data-model-empty-capability]").textContent.trim(), "这一类暂无可选模型");

  view.cleanup();
});
