// PPT 快速编辑左侧页轨：缩略图必须是那一页本身（文本框 / 图片 / 形状），
// 不能再只画 7px 标题 + 5px 摘要。可视区外占位，改一页只重画那一页。
//
// 跑法：
//   bash /opt/cursor-workspaces/oceandino/scripts/agent-io-guard.sh run-light -- \
//     node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//          --experimental-loader ./tests/ts-extension-loader.mjs --test \
//          tests/eas-w22-deck-rail-thumbnails.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule } from "./helpers/module-bench.mjs";
import {
  createDeckMaster,
  deckTheme,
} from "../src/shell/doc-editors/deck-schema.ts";
import {
  DECK_RAIL_THUMB_CONTENT_WIDTH_PX,
  deckRailFirstPaintCount,
} from "../src/shell/doc-editors/deck-rail-visibility.ts";

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
  url: "https://ppt.oceanleo.com/advanced/deck",
});
const { window } = dom;
class ImmediateIO {
  constructor(callback) {
    this.callback = callback;
  }
  observe(node) {
    this.callback([{ isIntersecting: true, target: node }], this);
  }
  unobserve() {}
  disconnect() {}
}
class ManualIO {
  static instances = [];
  constructor(callback, options) {
    this.callback = callback;
    this.options = options;
    this.node = null;
    ManualIO.instances.push(this);
  }
  observe(node) {
    this.node = node;
  }
  unobserve() {}
  disconnect() {}
  trigger(isIntersecting) {
    this.callback(
      [{ isIntersecting, target: this.node }],
      this,
    );
  }
}
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  IntersectionObserver: ImmediateIO,
  ResizeObserver: class {
    observe() {}
    disconnect() {}
  },
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const theme = deckTheme("ocean");
const master = createDeckMaster("ocean", "测试母版", "master-test");

function elementSlide(id, text) {
  return {
    id,
    title: "示意标题",
    body: "示意摘要只应出现在兜底示意图里",
    bullets: [],
    notes: "",
    layout: "title-body",
    background: "#f8fafc",
    elements: [
      {
        id: `${id}-text`,
        type: "text",
        x: 8,
        y: 10,
        width: 84,
        height: 18,
        rotation: 0,
        order: 1,
        text,
      },
      {
        id: `${id}-image`,
        type: "image",
        x: 8,
        y: 36,
        width: 40,
        height: 40,
        rotation: 0,
        order: 2,
        src: "https://cdn.example/slide-pic.png",
        alt: "配图",
      },
      {
        id: `${id}-shape`,
        type: "shape",
        x: 56,
        y: 36,
        width: 32,
        height: 32,
        rotation: 0,
        order: 3,
        shape: "rect",
        fill: "rgb(239, 68, 68)",
      },
    ],
  };
}

async function loadThumbnailModule() {
  const url = await compileModule(
    "src/shell/doc-editors/DeckSlideThumbnail.tsx",
  );
  return import(url);
}

async function loadVisibilityModule() {
  const url = await compileModule(
    "src/shell/doc-editors/deck-rail-visibility.ts",
  );
  return import(url);
}

async function render(element) {
  const host = window.document.createElement("div");
  window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  return {
    host,
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async close() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test("改前：示意组件只画标题和摘要，elements 进不了 DOM", async () => {
  const miniUrl = await compileModule("src/shell/doc-editors/DeckMiniSlide.tsx");
  const { DeckMiniSlide } = await import(miniUrl);
  const slide = elementSlide("legacy", "真实文本框");
  const view = await render(
    React.createElement(DeckMiniSlide, {
      slide,
      number: 1,
      active: false,
      theme,
      master,
    }),
  );
  try {
    assert.match(view.host.textContent, /示意标题/);
    assert.match(view.host.textContent, /示意摘要/);
    assert.equal(view.host.textContent.includes("真实文本框"), false);
    assert.equal(view.host.querySelector('img[src="https://cdn.example/slide-pic.png"]'), null);
    const faded = view.host.querySelector("img");
    if (faded) {
      assert.ok((faded.getAttribute("class") || "").includes("opacity-35"));
    }
  } finally {
    await view.close();
  }
});

test("编辑器页轨改用真实缩略图，不再挂示意组件", () => {
  const stage = readFileSync(
    new URL("../src/shell/doc-editors/DeckStage.tsx", import.meta.url),
    "utf8",
  );
  const layout = readFileSync(
    new URL("../src/shell/doc-editors/DeckPreviewLayout.tsx", import.meta.url),
    "utf8",
  );
  const mini = readFileSync(
    new URL("../src/shell/doc-editors/DeckMiniSlide.tsx", import.meta.url),
    "utf8",
  );
  assert.match(stage, /<DeckSlideThumbnail/);
  assert.doesNotMatch(stage, /<DeckMiniSlide/);
  assert.match(stage, /from "\.\/DeckSlideThumbnail"/);
  assert.match(layout, /useDeckRailVisibility/);
  assert.match(layout, /data-deck-thumb-placeholder/);
  assert.match(layout, /attachShadow\(\{ mode: "open" \}\)/);
  assert.match(layout, /createPortal\(children, mountNode\)/);
  assert.doesNotMatch(mini, /from "\.\/DeckElementContent"/);
  assert.doesNotMatch(mini, /<MiniDeckElementLayer/);
});

test("含文本框 / 图片 / 形状的页，缩略图 DOM 里有对应元素，缩放 = 缩略图宽 / 页宽", async () => {
  const { DeckSlideThumbnail } = await loadThumbnailModule();
  const slide = elementSlide("s-real", "真实文本框");
  const view = await render(
    React.createElement(DeckSlideThumbnail, {
      slide,
      number: 2,
      theme,
      master,
      pageWidth: 960,
      pageHeight: 540,
      thumbWidth: 144,
    }),
  );
  try {
    const thumb = view.host.querySelector("[data-deck-slide-thumbnail]");
    assert.ok(thumb);
    assert.equal(thumb.getAttribute("data-deck-slide-scale"), "0.15");
    assert.equal(view.host.textContent.includes("真实文本框"), true);
    assert.ok(
      view.host.querySelector('img[src="https://cdn.example/slide-pic.png"]'),
    );
    const shape = view.host.querySelector('[data-element-type="shape"]');
    assert.ok(shape);
    assert.match(shape.getAttribute("style") || "", /rgb\(239, 68, 68\)|#ef4444/i);
    const scaled = view.host.querySelector("[data-deck-slide-scaled]");
    assert.equal(scaled.getAttribute("aria-hidden"), "true");
    assert.match(scaled.getAttribute("style") || "", /scale\(0\.15\)/);
    assert.equal(view.host.querySelector("[data-deck-slide-paint]")?.getAttribute("data-deck-slide-paint"), "elements");
  } finally {
    await view.close();
  }
});

test("不可见的缩略图不渲染元素，进入可视区后渲染", async () => {
  const previous = globalThis.IntersectionObserver;
  ManualIO.instances = [];
  globalThis.IntersectionObserver = ManualIO;
  const { useDeckRailVisibility } = await loadVisibilityModule();

  function Probe() {
    const ref = React.useRef(null);
    const visible = useDeckRailVisibility(ref);
    return React.createElement(
      "div",
      { "data-deck-thumbnail-rail": "", style: { height: "200px" } },
      React.createElement(
        "div",
        { ref, "data-probe": "" },
        visible
          ? React.createElement("span", { "data-paint": "" }, "真实文本框")
          : React.createElement("span", { "data-deck-thumb-placeholder": "" }),
      ),
    );
  }

  const view = await render(React.createElement(Probe));
  try {
    assert.equal(view.host.querySelector("[data-paint]"), null);
    assert.ok(view.host.querySelector("[data-deck-thumb-placeholder]"));
    assert.equal(ManualIO.instances.length, 1);
    await act(async () => {
      ManualIO.instances[0].trigger(true);
    });
    assert.ok(view.host.querySelector("[data-paint]"));
    assert.equal(view.host.textContent.includes("真实文本框"), true);
    assert.equal(view.host.querySelector("[data-deck-thumb-placeholder]"), null);
    await act(async () => {
      ManualIO.instances[0].trigger(false);
    });
    assert.equal(view.host.querySelector("[data-paint]"), null);
    assert.ok(view.host.querySelector("[data-deck-thumb-placeholder]"));
  } finally {
    await view.close();
    globalThis.IntersectionObserver = previous;
  }
});

test("改一页只重画这一页", async () => {
  const {
    DeckSlideThumbnail,
    resetDeckSlidePaintRenderCounts,
    deckSlidePaintRenderCounts,
    hashDeckSlideContent,
  } = await loadThumbnailModule();

  const slides = [
    elementSlide("s1", "第一页文本"),
    elementSlide("s2", "第二页文本"),
    elementSlide("s3", "第三页文本"),
  ];
  resetDeckSlidePaintRenderCounts();

  function Rail({ items }) {
    return React.createElement(
      "div",
      null,
      items.map((slide, index) =>
        React.createElement(DeckSlideThumbnail, {
          key: slide.id,
          slide,
          number: index + 1,
          theme,
          master,
          pageWidth: 960,
          pageHeight: 540,
          thumbWidth: 144,
        }),
      ),
    );
  }

  const view = await render(React.createElement(Rail, { items: slides }));
  try {
    assert.deepEqual(
      [1, 2, 3].map((n) => deckSlidePaintRenderCounts.get(`s${n}`)),
      [1, 1, 1],
    );
    const unchangedHash = hashDeckSlideContent(slides[0]);
    const next = slides.map((slide, index) =>
      index === 1
        ? {
            ...slide,
            elements: slide.elements.map((element, elementIndex) =>
              elementIndex === 0
                ? { ...element, text: "第二页已改" }
                : element,
            ),
          }
        : { ...slide, elements: slide.elements.map((element) => ({ ...element })) },
    );
    assert.equal(hashDeckSlideContent(next[0]), unchangedHash);
    assert.notEqual(hashDeckSlideContent(next[1]), hashDeckSlideContent(slides[1]));
    await view.rerender(React.createElement(Rail, { items: next }));
    assert.deepEqual(
      [1, 2, 3].map((n) => deckSlidePaintRenderCounts.get(`s${n}`)),
      [1, 2, 1],
    );
    assert.equal(view.host.textContent.includes("第二页已改"), true);
    assert.equal(view.host.textContent.includes("第一页文本"), true);
  } finally {
    await view.close();
  }
});

test("50 页时首屏（含一屏余量）只画有限几张", () => {
  // 验收桌面舞台约 547px，页轨标题 32px，滚动区 ≈ 515px。
  const firstPaint = deckRailFirstPaintCount(50, 515, {
    thumbWidthPx: DECK_RAIL_THUMB_CONTENT_WIDTH_PX,
    aspectRatio: 16 / 9,
  });
  assert.equal(firstPaint, 12);
  assert.ok(firstPaint < 50);
});
