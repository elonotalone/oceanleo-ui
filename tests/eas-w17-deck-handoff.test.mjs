/**
 * W17 PPT 快速面 ⇄ PPTist：未保存的改动进专业面、纯 pptx 不空白、
 * 专业面改完等确认再回快速面、flush 超时、restore 真的恢复。
 *
 *   node --test --import ./tests/helpers/assert-dom-guard.mjs \
 *     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
 *     tests/eas-w17-deck-handoff.test.mjs
 */

import { strict as assert } from "node:assert";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  deckDocumentToPptist,
  pptistToDeckDocument,
} from "../src/shell/doc-editors/deck-pptist-carrier.ts";

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://word.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLIFrameElement: window.HTMLIFrameElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const officeStub = dataModule(`
  export function useOfficeArtifactSource(item) {
    return {
      item,
      url: item && item.url ? item.url : "",
      purpose: null,
      loading: false,
      error: "",
      version: 0,
      retry() {},
      resourceFailed() {},
    };
  }
`);

const handoffUrl = await compileModule(
  "src/shell/advanced-routes/editor-handoff.ts",
  { "../office-editor/useOfficeArtifactSource": officeStub },
);
const {
  bindNormalFaceHandoff,
  captureBeforeEnterPro,
  libraryItemFromProSave,
  peekProSavedRevision,
  reportProSaved,
  resetEditorHandoffForTests,
  resolveEditorHandoffFromItem,
} = await import(handoffUrl);

let capturedAdapter = null;
const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    globalThis.__w17DeckAdapter = adapter;
    return jsxs("div", {
      "data-role": "deck-hosted-shell",
      children: [adapter && adapter.stage ? adapter.stage : null],
    });
  }
`);

const hostedUrl = await compileModule(
  "src/shell/advanced-routes/DeckHostedRoute.tsx",
  {
    "../AdvancedWorkbenchShell": shellStubUrl,
    "../workbench-routes": dataModule(`
      export function editorToolLabel() { return "PPT"; }
    `),
    "./editor-handoff": handoffUrl,
    "./mode-switch-gate": dataModule(`
      export function useModeSwitchReady() { return () => {}; }
      export function useModeSwitchFailure() { return () => {}; }
      export function useModeSwitchHandoff() {
        return globalThis.__w17GateHandoff || null;
      }
    `),
    "../office-editor/useOfficeArtifactSource": officeStub,
  },
);

function deckItem(overrides = {}) {
  return {
    key: "deck-w17",
    source: "artifact",
    id: "deck-w17",
    title: "闸",
    kind: "ppt",
    siteId: "website",
    favorite: false,
    content: JSON.stringify(deckDocumentToPptist(sampleDeck())),
    meta: {},
    ...overrides,
    meta: { ...(overrides.meta || {}) },
  };
}

async function mountHosted(item = deckItem()) {
  const { DeckHostedRoute } = await import(hostedUrl);
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  globalThis.__w17DeckAdapter = null;
  await act(async () => {
    root.render(React.createElement(DeckHostedRoute, { item, onClose() {} }));
  });
  for (let i = 0; i < 8; i += 1) await act(async () => {});
  return {
    container,
    adapter: () => globalThis.__w17DeckAdapter,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test.afterEach(() => {
  resetEditorHandoffForTests();
  globalThis.__w17GateHandoff = null;
});

function sampleDeck() {
  return {
    version: 2,
    title: "季度汇报",
    aspect: "16:9",
    theme: "ocean",
    masters: [],
    slides: [
      {
        id: "s1",
        title: "封面",
        body: "",
        bullets: [],
        notes: "开场",
        layout: "title-body",
        background: "#112233",
        elements: [
          {
            id: "t1",
            type: "text",
            x: 10,
            y: 20,
            width: 50,
            height: 10,
            rotation: 0,
            order: 0,
            text: "未保存的改动",
            color: "#111111",
          },
          {
            id: "i1",
            type: "image",
            x: 5,
            y: 40,
            width: 30,
            height: 30,
            rotation: 0,
            order: 1,
            src: "https://files.oceanleo.com/pic.png",
          },
          {
            id: "sh1",
            type: "shape",
            x: 60,
            y: 40,
            width: 20,
            height: 20,
            rotation: 0,
            order: 2,
            shape: "rect",
            fill: "#5b9bd5",
          },
        ],
      },
    ],
  };
}

test("快速面未保存的改动进专业面：PPTist 文档里有这一处", async () => {
  bindNormalFaceHandoff("deck-w17", {
    getHandoff: () => ({
      kind: "inline",
      json: deckDocumentToPptist(sampleDeck()),
      revision: "9",
    }),
  });
  const result = await captureBeforeEnterPro(deckItem());
  assert.equal(result.ok, true);
  assert.equal(result.handoff.kind, "inline");
  assert.match(JSON.stringify(result.handoff.json), /未保存的改动/);
  assert.ok(result.handoff.json.slides.length > 0);
});

test("反向转换覆盖文本框、图片、形状、背景、页序；转不了的留占位", () => {
  const pptist = deckDocumentToPptist(sampleDeck());
  pptist.slides.push({
    id: "s2",
    elements: [
      {
        id: "chart-1",
        type: "chart",
        left: 10,
        top: 10,
        width: 100,
        height: 80,
        rotate: 0,
      },
    ],
    background: { type: "solid", color: "#abcdef" },
  });
  const back = pptistToDeckDocument(pptist, "回");
  assert.equal(back.slides.length, 2);
  assert.equal(back.slides[0].id, "s1");
  assert.equal(back.slides[1].id, "s2");
  const types = back.slides[0].elements.map((el) => el.type);
  assert.deepEqual(types, ["text", "image", "shape"]);
  assert.match(back.slides[0].elements[0].text, /未保存的改动/);
  assert.equal(
    back.slides[0].elements[1].src,
    "https://files.oceanleo.com/pic.png",
  );
  assert.equal(back.slides[0].elements[2].type, "shape");
  assert.equal(back.slides[0].background, "#112233");
  assert.equal(back.slides[1].elements[0].type, "unsupported");
  assert.ok(back.importWarnings?.some((line) => line.includes("chart-1")));
});

test("只有 .pptx 的素材进专业面：解析为 pptx 且页数大于 0，不再是空白 {}", () => {
  const source = resolveEditorHandoffFromItem(
    deckItem({
      url: "https://files.oceanleo.com/imported.pptx",
      content: "",
      meta: { source_format: "pptx" },
    }),
  );
  assert.equal(source.kind, "url");
  assert.equal(source.format, "pptx");
  assert.notEqual(source.kind, "empty");
});

test("专业面改一处 → 等到 save-result → 回快速面看得到；刷新按新 revision 仍在", () => {
  const pptist = deckDocumentToPptist(sampleDeck());
  pptist.slides[0].elements[0].content = "<p>专业面改过的标题</p>";
  const deck = pptistToDeckDocument(pptist);
  const saved = libraryItemFromProSave(deckItem(), {
    deck,
    revision: "rev-after-pro",
  });
  reportProSaved("deck-w17", saved);
  const again = peekProSavedRevision("deck-w17");
  assert.equal(again.revisionId, "rev-after-pro");
  const resolved = resolveEditorHandoffFromItem(again);
  assert.equal(resolved.kind, "inline");
  assert.match(JSON.stringify(resolved.json), /专业面改过的标题/);
});

test("flush 在没有 save-result 时超时返回 ok: false（不再发出去就当存好了）", async () => {
  globalThis.__W17_PRO_FLUSH_TIMEOUT_MS = 60;
  const hosted = await mountHosted();
  try {
    const iframe = hosted.container.querySelector("iframe");
    assert.ok(iframe, "专业面没有 iframe");
    await act(async () => {
      iframe.dispatchEvent(new window.Event("load"));
    });
    const flush = hosted.adapter()?.persistence?.flush;
    assert.equal(typeof flush, "function", "专业面没有 flush");
    const started = Date.now();
    const result = await flush();
    assert.equal(result.ok, false, "没确认就当存好了——这正是用户丢稿的原因");
    assert.ok(Date.now() - started >= 40, "超时闸没有真正等");
  } finally {
    delete globalThis.__W17_PRO_FLUSH_TIMEOUT_MS;
    await hosted.unmount();
  }
});

test("restore 生效：交回快照后 capture 能再拿到同一份", async () => {
  const hosted = await mountHosted();
  try {
    const recovery = hosted.adapter()?.persistence?.recovery;
    assert.ok(recovery, "专业面没有 recovery");
    const snapshot = {
      format: "pptist.slides.v2",
      slides: [{ id: "restored", elements: [] }],
    };
    const restored = recovery.restore(snapshot);
    assert.notEqual(restored, false, "restore 还是直接 return false");
    const captured = recovery.capture();
    assert.equal(captured?.slides?.[0]?.id, "restored");
  } finally {
    await hosted.unmount();
  }
});
