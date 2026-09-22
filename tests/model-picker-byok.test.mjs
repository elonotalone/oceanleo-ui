import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const picker = readFileSync(
  fileURLToPath(new URL("../src/shell/ModelPicker.tsx", import.meta.url)),
  "utf8",
);
const status = readFileSync(
  fileURLToPath(new URL("../src/shell/byok-status.ts", import.meta.url)),
  "utf8",
);

test("模型组合弹出层不再展示我的模型 / 自带 key", () => {
  assert.doesNotMatch(picker, /fetchByokStatusLite/);
  assert.doesNotMatch(picker, /我的模型 · 自带 key/);
  assert.doesNotMatch(picker, /已配置 \{n\} 家/);
  assert.doesNotMatch(picker, /tt\("管理 →"\)/);
  assert.match(picker, /\["lite", "pro", "max"\]/);
  assert.match(picker, /tt\("管理模型组合 →"\)/);
});

test("byok-status sends the sealed cookie and never reads localStorage", () => {
  assert.match(status, /credentials:\s*"include"/);
  assert.doesNotMatch(status, /localStorage/);
});

test("byok.count > 0 时弹出层仍不出现我的模型", async () => {
  const { createRequire } = await import("node:module");
  const { pathToFileURL } = await import("node:url");
  const React = (await import("react")).default;
  const { act } = await import("react");
  const { createRoot } = await import("react-dom/client");
  const { compileModule, dataModule } = await import("./helpers/module-bench.mjs");

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
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
  })) {
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const reactUrl = pathToFileURL(require.resolve("react")).href;
  const { ModelGroupPicker } = await import(
    await compileModule("src/shell/ModelPicker.tsx", {
      "../i18n/ui/useUI": dataModule("export function useUI(){ return (s) => String(s); }"),
      "../lib/auth/account": dataModule(`
        export const MODEL_GROUP_CHANGED_EVENT = "x";
        export async function getModelGroups(){
          return {
            ok: true,
            data: {
              active_group_key: "preset:pro",
              groups: [
                { key: "preset:lite", id: "lite", kind: "preset", name: "Lite", editable: false, selection: {} },
                { key: "preset:pro", id: "pro", kind: "preset", name: "Pro", editable: false, selection: {} },
                { key: "preset:max", id: "max", kind: "preset", name: "Max", editable: false, selection: {} },
              ],
            },
          };
        }
        export async function setActiveModelGroup(){ return { ok: false }; }
      `),
      "./workbench-open-store": dataModule("export function useWorkbenchOpen(){ return false; }"),
      "./icons": dataModule(
        "export function IconCheck(){ return null; }\nexport function IconChevronDown(){ return null; }",
      ),
      "./byok-status": dataModule(`
        export async function fetchByokStatusLite(){
          globalThis.__byokReads = (globalThis.__byokReads || 0) + 1;
          return { enabled: true, count: 2, providers: ["Cursor", "OpenAI"] };
        }
      `),
      "./anchored-popover": dataModule(`
        import React from ${JSON.stringify(reactUrl)};
        export function AnchoredPopover({ open, children, attributes }) {
          if (!open) return null;
          return React.createElement("div", { ...(attributes || {}), "data-model-picker-popover": "1" }, children);
        }
      `),
    })
  );

  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(ModelGroupPicker, { apiHref: "/api" }));
  });
  const trigger = host.querySelector("button");
  assert.ok(trigger);
  await act(async () => {
    trigger.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
  await act(async () => {});
  const panel = document.querySelector("[data-model-picker-popover]");
  assert.ok(panel);
  const text = panel.textContent || "";
  assert.equal(text.includes("我的模型"), false);
  assert.equal(text.includes("自带 key"), false);
  assert.equal(text.includes("Cursor"), false);
  assert.equal(text.includes("已配置"), false);
  assert.equal(text.includes("Lite"), true);
  assert.equal(text.includes("Pro"), true);
  assert.equal(text.includes("Max"), true);
  assert.equal(text.includes("管理模型组合"), true);
  act(() => root.unmount());
  host.remove();
});
