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

const catalog = {
  groups: [
    {
      id: "text",
      label: "文本",
      providers: [
        {
          id: "bailian",
          label: "百炼",
          models: [
            {
              key: "bailian:qwen",
              id: "qwen",
              label: "qwen",
              provider: "bailian",
              provider_label: "百炼",
              capability_labels: ["对话"],
            },
          ],
        },
      ],
      capabilities: [
        {
          id: "chat",
          label: "对话",
          description: "日常",
          providers: [
            {
              id: "bailian",
              label: "百炼",
              models: [
                {
                  key: "bailian:qwen",
                  id: "qwen",
                  label: "qwen",
                  provider: "bailian",
                  provider_label: "百炼",
                  capability_labels: ["对话"],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
  tier_selection: {
    lite: { text: { chat: ["bailian:qwen"] } },
    pro: { text: { chat: ["bailian:qwen"] } },
    max: { text: { chat: ["bailian:qwen"] } },
  },
};

const groups = [
  { key: "preset:lite", id: "lite", kind: "preset", name: "Lite", editable: false, selection: catalog.tier_selection.lite },
  { key: "preset:pro", id: "pro", kind: "preset", name: "Pro", editable: false, selection: catalog.tier_selection.pro },
  { key: "preset:max", id: "max", kind: "preset", name: "Max", editable: false, selection: catalog.tier_selection.max },
  { key: "custom:test", id: "test", kind: "custom", name: "test", editable: true, selection: catalog.tier_selection.pro },
];

const { ModelGroupManager } = await import(
  await compileModule("src/pages/ModelCapabilityMarket.tsx", {
    "../shell/byok-status": dataModule('export const BYOK_STATUS_CHANGED_EVENT = "oceanleo:byok-status-changed";'),
    "../lib/auth": dataModule(`
      export const MODEL_GROUP_CHANGED_EVENT = "oceanleo:model-group-changed";
      export async function getModelGroups() {
        return globalThis.__groupsRequest ? globalThis.__groupsRequest() : globalThis.__groupsResult;
      }
      export async function getKeyProviders() {
        return { ok: true, data: { providers: globalThis.__keyProviders || [] } };
      }
      export async function setActiveModelGroup(key) {
        globalThis.__activated = key;
        const data = { ...globalThis.__groupsResult.data, active_group_key: key };
        globalThis.__groupsResult = { ok: true, data };
        return { ok: true, data };
      }
      export async function createModelGroup(name, source) {
        globalThis.__createdFrom = source;
        return globalThis.__createResult || { ok: false };
      }
      export async function updateModelGroup(id, patch) {
        globalThis.__savedPatch = { id, patch };
        if (globalThis.__updateResult) return globalThis.__updateResult;
        const groups = globalThis.__groupsResult.data.groups.map((group) => (
          group.id === id ? { ...group, selection: patch.selection || group.selection, name: patch.name || group.name } : group
        ));
        const data = { ...globalThis.__groupsResult.data, groups, group: groups.find((group) => group.id === id) };
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
  globalThis.__groupsRequest = null;
  globalThis.__activated = "";
  globalThis.__savedPatch = null;
  globalThis.__updateResult = undefined;
  globalThis.__createResult = undefined;
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
      user: true,
      initialMarketQuery: options.initialMarketQuery || "",
    }));
  });
  await flush();
  return {
    host,
    async refreshCatalog(nextCatalog) {
      await act(async () => root.render(React.createElement(ModelGroupManager, { catalog: nextCatalog, user: true })));
      await flush();
    },
    text: () => host.textContent || "",
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
      });
      await flush();
    },
    async type(node, value) {
      await act(async () => {
        const previous = node.value;
        node.value = value;
        if (node._valueTracker) node._valueTracker.setValue(previous);
        node.dispatchEvent(new window.Event("input", { bubbles: true }));
        node.dispatchEvent(new window.Event("change", { bubbles: true }));
      });
      await flush();
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("分组按钮没有说明文案和自定义计数，生效标记在标题旁", async () => {
  const view = await render();
  assert.equal(view.text().includes("在这里管理组合"), false);
  assert.equal(view.text().includes("个自定义组合"), false);
  const live = view.host.querySelector('[data-model-group-chip="preset:pro"]');
  assert.equal(live.getAttribute("data-model-group-live"), "true");
  assert.equal(live.querySelector("[data-model-group-active]"), null);
  assert.doesNotMatch(live.textContent, /当前在所有 OceanLeo 站点使用/);
  const badge = view.host.querySelector("[data-model-group-active]");
  assert.ok(badge);
  assert.match(badge.textContent, /当前在所有 OceanLeo 站点使用/);
  const table = view.host.querySelector("[data-model-group-table]");
  assert.ok(table);
  assert.doesNotMatch(table.textContent, /改名|编辑组合|删除/);
  assert.doesNotMatch(table.textContent, /从上到下依次尝试/);
  assert.equal(view.host.querySelector("[data-model-group-fallback]"), null);
  assert.doesNotMatch(view.text(), /从上到下依次尝试/);
  view.cleanup();
});

test("三点菜单：预设只有设为默认，自定义含改名编辑删除", async () => {
  const view = await render();
  await view.click(view.host.querySelector('[data-model-group-menu="preset:lite"]'));
  const presetItems = [...view.host.querySelectorAll("[role=menuitem]")].map((node) => node.textContent);
  assert.deepEqual(presetItems, ["设为默认"]);
  await view.click(view.host.querySelector('[data-model-group-menu="custom:test"]'));
  const customItems = [...view.host.querySelectorAll("[role=menuitem]")].map((node) => node.textContent);
  assert.deepEqual(customItems, ["设为默认", "改名", "编辑组合", "删除"]);
  await view.click(view.host.querySelector('[data-model-group-menu="preset:lite"]'));
  await view.click([...view.host.querySelectorAll("[role=menuitem]")].find((node) => node.textContent === "设为默认"));
  assert.equal(globalThis.__activated, "preset:lite");
  assert.equal(
    view.host.querySelector('[data-model-group-chip="preset:lite"]').getAttribute("data-model-group-live"),
    "true",
  );
  view.cleanup();
});

test("英文词典收录同名组合与创建配额报错", () => {
  const source = readFileSync(new URL("../src/i18n/ui/messages/recent-model-and-task-copy.ts", import.meta.url), "utf8");
  assert.match(source, /duplicateGroupName: "A model group with this name already exists"/);
  assert.match(source, /emptyGroupName: "Group name cannot be empty"/);
  assert.match(source, /customGroupQuota: "Each account can create up to 30 custom groups"/);
});

function glmOffer(provider, id, extra = {}) {
  return {
    key: `${provider}:${id}`,
    id,
    label: extra.label || "GLM-5.1",
    provider,
    provider_label: extra.provider_label || provider,
    category: "text",
    capability_labels: ["对话"],
    status: extra.status || "available",
    selectable: extra.selectable ?? (extra.status !== "unpriced" && extra.status !== "not_opened"),
    unpriced: extra.status === "unpriced" || extra.unpriced === true,
    checked_at: extra.checked_at || "2026-10-05T03:50:00Z",
    source_url: extra.source_url || `https://example.test/${provider}`,
    price: extra.price || {
      billing: "token",
      currency: "CNY",
      input_per_m: extra.input ?? 1,
      output_per_m: extra.output ?? 4,
      current: extra.current,
      rules: extra.rules,
    },
  };
}

const marketCatalog = {
  groups: [
    {
      id: "text",
      label: "文本",
      providers: [],
      capabilities: [
        {
          id: "chat",
          label: "对话",
          description: "日常",
          providers: [
            {
              id: "bailian",
              label: "百炼",
              models: [glmOffer("bailian", "ZHIPU/GLM-5.1", { provider_label: "百炼", input: 1, output: 4 })],
            },
            {
              id: "volcano",
              label: "火山方舟",
              models: [glmOffer("volcano", "glm-5.1", { provider_label: "火山方舟", input: 2, output: 8 })],
            },
            {
              id: "tencent",
              label: "腾讯云 TokenHub",
              models: [glmOffer("tencent", "z-ai/glm-5.1", { provider_label: "腾讯云 TokenHub", input: 1.2, output: 5 })],
            },
            {
              id: "baidu",
              label: "百度千帆",
              models: [glmOffer("baidu", "glm-5.1-unpriced", {
                label: "GLM-5.1 未公布",
                provider_label: "百度千帆",
                status: "unpriced",
                selectable: false,
                unpriced: true,
              })],
            },
          ],
        },
      ],
    },
  ],
  delisted: [{ key: "bailian:old-glm", label: "旧版 GLM", provider: "bailian", category: "text" }],
  status_labels: {
    available: "可用",
    unpriced: "价未公布",
    delisted: "已下架",
  },
  tier_selection: {
    lite: { text: { chat: ["bailian:ZHIPU/GLM-5.1"] } },
    pro: { text: { chat: ["bailian:ZHIPU/GLM-5.1"] } },
    max: { text: { chat: ["bailian:ZHIPU/GLM-5.1"] } },
  },
};

const marketGroups = [
  ...groups.slice(0, 3),
  {
    key: "custom:test",
    id: "test",
    kind: "custom",
    name: "test",
    editable: true,
    selection: { text: { chat: ["bailian:ZHIPU/GLM-5.1", "bailian:old-glm"] } },
    entries: [{ key: "bailian:old-glm", label: "旧版 GLM", status: "delisted" }],
  },
];

test("搜模型查价：同名合并、不可选禁用、已下架灰显、价未公布", async () => {
  const empty = await render({
    catalog: marketCatalog,
    groups: marketGroups,
    active_group_key: "custom:test",
  });
  assert.ok(empty.host.querySelector("[data-model-price-search-input]"));
  assert.match(empty.text(), /搜模型查价/);
  assert.match(empty.text(), /输入模型名即可查看各家价格与此刻能否选用/);
  assert.equal(empty.host.querySelector("[data-model-price-search-results]"), null);
  empty.cleanup();

  const view = await render({
    catalog: marketCatalog,
    groups: marketGroups,
    active_group_key: "custom:test",
    initialMarketQuery: "glm 5.1",
  });
  const results = view.host.querySelector("[data-model-price-search-results]");
  assert.ok(results);
  const searchHtml = results.innerHTML;
  console.log("W12_HTML_SEARCH\n" + searchHtml);
  assert.match(results.textContent, /百炼/);
  assert.match(results.textContent, /火山方舟/);
  assert.match(results.textContent, /腾讯云 TokenHub/);
  assert.match(results.textContent, /价未公布/);
  assert.ok(results.querySelector('[data-model-offer-disabled="true"]'));

  const selectedHtml = view.host.querySelector("[data-model-group-table]").innerHTML;
  console.log("W12_HTML_SELECTED\n" + selectedHtml);
  const delisted = view.host.querySelector('[data-model-delisted="bailian:old-glm"]');
  assert.ok(delisted);
  assert.match(delisted.textContent, /旧版 GLM · 已下架/);
  assert.equal(view.host.querySelector('[data-model-delisted="bailian:ZHIPU/GLM-5.1"]'), null);
  assert.match(view.host.textContent, /GLM-5.1/);

  await view.click(view.host.querySelector('[data-model-group-menu="custom:test"]'));
  await view.click([...view.host.querySelectorAll("[role=menuitem]")].find((node) => node.textContent === "编辑组合"));
  const editList = view.host.querySelector("[data-model-edit-offers]");
  assert.ok(editList);
  console.log("W12_HTML_EDIT\n" + editList.innerHTML);
  const unpriced = editList.querySelector('[data-model-offer="baidu:glm-5.1-unpriced"]');
  assert.ok(unpriced);
  assert.equal(unpriced.getAttribute("data-model-offer-disabled"), "true");
  assert.match(unpriced.textContent, /价未公布/);
  assert.equal(unpriced.tagName, "BUTTON");
  assert.ok(editList.querySelector('[data-model-edit-row="glm51"]'));
  view.cleanup();
});

test("personal model offers preserve connection alias without unsupported prices or billing labels", async () => {
  const ownCatalog = structuredClone(marketCatalog);
  const alias = {
    ...glmOffer("openai", "connection-opaque", { label: "Writing connection", selectable: true, unpriced: true }),
    connection_id: "opaque", display_name: "Writing connection", auth_type: "api_key",
  };
  ownCatalog.groups[0].capabilities[0].providers = [{ id: "openai", label: "OpenAI", models: [alias] }];
  const view = await render({ catalog: ownCatalog, groups: marketGroups, active_group_key: "custom:test", initialMarketQuery: "Writing connection" });
  const results = view.host.querySelector("[data-model-price-search-results]");
  assert.ok(results);
  assert.match(results.textContent, /Writing connection/);
  assert.doesNotMatch(results.textContent, /自带连接|厂商计费|官方价目|—/);
  assert.equal(results.querySelector("[data-model-price]"), null);
  assert.doesNotMatch(results.textContent, /价未公布|gpt-/);
  assert.match(results.textContent, /connection-opaque/);
  assert.equal(results.querySelector('[data-model-offer-disabled="true"]'), null);
  view.cleanup();
});

test("direct manual model selection binds text and image, refreshes connection metadata without losing unsaved draft", async () => {
  const route = "custom:connection-local~route-one";
  const own = { ...glmOffer("custom", "connection-local~route-one", { label: "Friendly", selectable: true }), key: route, connection_id: "local", route_id: "route-one", model_id: "upstream-actual", connection_name: "My account", protocol: "responses" };
  const ownCatalog = structuredClone(catalog);
  ownCatalog.groups[0].capabilities[0].providers.push({ id: "custom", label: "Custom", models: [own] });
  const image = structuredClone(ownCatalog.groups[0]);
  image.id = "image"; image.label = "图片"; image.capabilities[0].id = "generate";
  ownCatalog.groups.push(image);
  const ownGroups = structuredClone(groups);
  ownGroups[3].selection.image = { generate: ["bailian:qwen"] };
  const view = await render({ catalog: ownCatalog, groups: ownGroups, active_group_key: "custom:test" });
  assert.ok(view.host.querySelector("[data-model-edit-direct]"));
  const offer = () => view.host.querySelector(`[data-model-edit-offers] [data-model-offer="${route}"]`);
  assert.ok(offer(), "candidates visible before opening any menu");
  assert.match(offer().textContent, /My account.*upstream-actual/);
  await view.click(offer());
  await view.click(view.host.querySelector('[data-model-cat="image"]'));
  await view.click(offer());
  await act(async () => { window.dispatchEvent(new window.Event("oceanleo:byok-status-changed")); });
  await flush();
  const edited = structuredClone(ownCatalog);
  for (const group of edited.groups) {
    group.capabilities[0].providers.find(provider => provider.id === "custom").models[0].connection_name = "Renamed account";
  }
  await view.refreshCatalog(edited);
  assert.match(offer().textContent, /Renamed account/);
  assert.match(view.host.querySelector('[data-model-cap="generate"]').textContent, /✓2/);
  await view.click([...view.host.querySelectorAll("button")].find(node => node.textContent === "保存组合"));
  assert.deepEqual(globalThis.__savedPatch.patch.selection.text.chat, ["bailian:qwen", route]);
  assert.deepEqual(globalThis.__savedPatch.patch.selection.image.generate, ["bailian:qwen", route]);
  view.cleanup();
});

test("direct edit clones platform preset and leaves original preset selection unchanged", async () => {
  const view = await render();
  const before = structuredClone(globalThis.__groupsResult.data.groups[1]);
  const copy = { ...structuredClone(groups[3]), key: "custom:copy", id: "copy", name: "Pro copy" };
  globalThis.__createResult = { ok: true, data: { ...globalThis.__groupsResult.data, groups: [...groups, copy], group: copy } };
  await view.click(view.host.querySelector("[data-model-edit-direct]"));
  assert.equal(globalThis.__createdFrom, "preset:pro");
  assert.deepEqual(globalThis.__groupsResult.data.groups[1], before);
  assert.ok([...view.host.querySelectorAll("button")].find(node => node.textContent === "保存组合"));
  view.cleanup();
});

test("custom connection beside unavailable international offer stays selectable, editable and persisted without global prompts", async () => {
  const ownCatalog = structuredClone(marketCatalog);
  const connection = {
    ...glmOffer("custom:opaque", "my-model", { label: "My exact connection name", provider_label: "My connection", selectable: true, unpriced: true }),
    connection_id: "opaque", display_name: "My exact connection name", auth_type: "api_key",
  };
  const unavailable = glmOffer("alibaba_intl", "qwen", {
    status: "byok_only", selectable: false, provider_label: "阿里云国际站",
  });
  ownCatalog.groups[0].capabilities[0].providers.push(
    { id: "custom:opaque", label: "My connection", models: [connection] },
    { id: "alibaba_intl", label: "阿里云国际站", models: [unavailable] },
  );
  const ownGroups = structuredClone(marketGroups);
  ownGroups[3].selection.text.chat = ["bailian:ZHIPU/GLM-5.1"];
  const view = await render({ catalog: ownCatalog, groups: ownGroups, active_group_key: "custom:test", initialMarketQuery: "My exact connection name" });
  const noPrompts = () => {
    assert.equal(view.host.querySelector("[data-model-byok-required], [data-model-add-key], [data-empty-cat-reason], [data-empty-cap-reason]"), null);
    assert.doesNotMatch(view.text(), /这一类需自带 Key|添加 Key|自带连接 · 厂商计费/);
  };
  noPrompts();
  await view.click(view.host.querySelector('[data-model-group-menu="custom:test"]'));
  await view.click([...view.host.querySelectorAll('[role="menuitem"]')].find((node) => node.textContent === "编辑组合"));
  const disabled = view.host.querySelector('[data-model-edit-offers] [data-model-offer="alibaba_intl:qwen"]');
  assert.equal(disabled.disabled, true);
  assert.match(disabled.textContent, /需自带 Key/);
  assert.match(view.host.querySelector('[data-model-edit-offers] [data-model-offer="bailian:ZHIPU/GLM-5.1"]').textContent, /输入 \$1 · 输出 \$4/);
  await view.click(view.host.querySelector('[data-model-provider-chip="connection:opaque"]'));
  noPrompts();
  const custom = view.host.querySelector('[data-model-edit-offers] [data-model-offer="custom:opaque:my-model"]');
  assert.equal(custom.disabled, false);
  assert.equal(custom.querySelector("[data-model-price]"), null);
  assert.doesNotMatch(custom.textContent, /价未公布|—/);
  await view.click(custom);
  const table = view.host.querySelector("[data-model-group-table]");
  const selected = [...table.querySelectorAll("[aria-label='移除']")].at(-1).parentElement.parentElement;
  assert.match(selected.textContent, /My exact connection name/);
  assert.equal(selected.querySelector("[data-model-price]"), null);
  await view.click(selected.querySelector('[aria-label="上移"]'));
  await view.click([...view.host.querySelectorAll("button")].find((node) => node.textContent === "保存组合"));
  assert.deepEqual(globalThis.__savedPatch.patch.selection.text.chat, [connection.key, "bailian:ZHIPU/GLM-5.1"]);
  assert.deepEqual(Object.keys(globalThis.__savedPatch.patch), ["selection"]);
  noPrompts();
  const saved = structuredClone(globalThis.__groupsResult.data);
  view.cleanup();
  const reloaded = await render({ catalog: ownCatalog, groups: saved.groups, active_group_key: saved.active_group_key });
  assert.match(reloaded.host.querySelector("[data-model-group-table]").textContent, /My exact connection name/);
  assert.match(reloaded.host.querySelector('[data-model-cap="chat"]').textContent, /✓2/);
  assert.doesNotMatch(reloaded.text(), /自带连接 · 厂商计费|这一类需自带 Key|添加 Key/);
  reloaded.cleanup();
});

test("same-vendor BYOK accounts have named filters and save the chosen connection without a paid substitute", async () => {
  const ownCatalog = structuredClone(catalog);
  const offers = ["first", "second"].map(id => ({
    ...glmOffer("openai", "shared-model", { selectable: true, label: "Shared model" }),
    key: `openai:connection-${id}~route`, connection_id: id,
    connection_name: `${id} account`, model_id: "shared-model", route_id: "route",
  }));
  ownCatalog.groups[0].capabilities[0].providers.push({ id: "openai", label: "OpenAI", models: offers });
  const view = await render({ catalog: ownCatalog, active_group_key: "custom:test" });
  const first = view.host.querySelector('[data-model-provider-chip="connection:first"]');
  const second = view.host.querySelector('[data-model-provider-chip="connection:second"]');
  assert.match(first.textContent, /first account 1/);
  assert.match(second.textContent, /second account 1/);
  await view.click(second);
  assert.equal(view.host.querySelector('[data-model-edit-offers] [data-model-offer="openai:connection-first~route"]'), null);
  await view.click(view.host.querySelector('[data-model-edit-offers] [data-model-offer="openai:connection-second~route"]'));
  await view.click([...view.host.querySelectorAll("button")].find(node => node.textContent === "保存组合"));
  assert.deepEqual(globalThis.__savedPatch.patch.selection.text.chat, ["bailian:qwen", "openai:connection-second~route"]);
  view.cleanup();
});

test("a slow availability response cannot overwrite a newer saved group", async () => {
  const view = await render({ active_group_key: "custom:test" });
  const old = structuredClone(globalThis.__groupsResult);
  let resolve;
  globalThis.__groupsRequest = () => new Promise(done => { resolve = done; });
  await act(async () => window.dispatchEvent(new window.Event("oceanleo:byok-status-changed")));
  const current = structuredClone(old.data);
  current.groups[3].name = "New saved name";
  await act(async () => window.dispatchEvent(new window.CustomEvent("oceanleo:model-group-changed", { detail: current })));
  await act(async () => resolve(old));
  await flush();
  assert.match(view.host.querySelector('[data-model-group-chip="custom:test"]').textContent, /New saved name/);
  view.cleanup();
});
