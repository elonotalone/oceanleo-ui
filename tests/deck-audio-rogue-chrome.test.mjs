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
  url: "http://localhost/",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
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
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) =>
      value.replace(/\\{(\\w+)\\}/g, (match, key) =>
        vars && key in vars ? String(vars[key]) : match
      );
  }
`);

const toolbarStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function SelectionToolbar({ context }) {
    if (!context) return null;
    return jsx("div", {
      "data-testid": "deck-toolbar",
      children: context.controls.map((control) =>
        jsx(
          "button",
          {
            type: "button",
            "data-selection-control-id": control.id,
            disabled: Boolean(control.disabled),
            "aria-label": control.label,
            children: control.label,
          },
          control.id,
        ),
      ),
    });
  }
`);

const OBJECT_ACTION_IDS = ["edit-text", "lock", "duplicate", "delete"];

const TEXT_ELEMENT = {
  id: "el-title",
  type: "text",
  x: 10,
  y: 20,
  width: 80,
  height: 16,
  rotation: 0,
  order: 1,
  text: "封面标题",
  locked: false,
};

const LOCKED_TEXT = { ...TEXT_ELEMENT, id: "el-locked", locked: true };

const IMAGE_ELEMENT = {
  id: "el-image",
  type: "image",
  x: 20,
  y: 30,
  width: 40,
  height: 40,
  rotation: 0,
  order: 2,
  src: "data:image/png;base64,AA==",
  locked: false,
};

function slideWith(elements) {
  return {
    id: "slide-1",
    title: "封面",
    body: "",
    notes: "",
    layout: "title",
    bullets: [],
    background: "#ffffff",
    elements,
  };
}

function mockEditor({ element = null, elements = element ? [element] : [] } = {}) {
  const slide = slideWith(elements);
  return {
    selectedElement: element,
    selectedElementId: element?.id || "",
    activeSlide: slide,
    activeIndex: 0,
    deck: {
      slides: [slide],
      masters: [
        {
          id: "master-1",
          name: "默认",
          background: "#fff",
          textColor: "#111",
          accentColor: "#4f46e5",
          fontFamily: "Inter",
        },
      ],
      theme: "ocean",
      aspect: "16:9",
    },
    activeMaster: {
      id: "master-1",
      name: "默认",
      background: "#fff",
      textColor: "#111",
      accentColor: "#4f46e5",
      fontFamily: "Inter",
    },
    loading: false,
    sourceFailed: false,
    error: "",
    textEditingElementId: "",
    beginTextEditing() {},
    endTextEditing() {},
    selectElement() {},
    selectSlide() {},
    setCanvasElement() {},
    patchElement() {},
    addSlide() {},
    addInkElement() {},
    duplicateElement() {},
    toggleElementLock() {},
    deleteElement() {},
    reload() {},
  };
}

function mockAudioEditor() {
  return {
    playing: false,
    loading: false,
    error: "",
    currentTime: 0,
    duration: 12,
    selection: null,
    speed: 1,
    volume: 80,
    zoom: 40,
    containerRef: { current: null },
    playPause() {},
    stop() {},
    setPlaybackSpeed() {},
    seekTo() {},
    setVolume() {},
    setWaveformZoom() {},
    importSource() {},
  };
}

async function render(node) {
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(node);
  });
  return {
    container,
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function source(rel) {
  return readFileSync(new URL(rel, import.meta.url), "utf8");
}

test("deck 选中态不再画独立 5 键条，缩放柄还在", async () => {
  const stageSource = source("../src/shell/doc-editors/DeckStage.tsx");
  const chromeSource = source(
    "../src/shell/doc-editors/DeckElementSelectionChrome.tsx",
  );
  assert.doesNotMatch(chromeSource, /top-\[-44px\]/);
  assert.doesNotMatch(chromeSource, /onAskAi|onDuplicate|onBeginTextEditing/);
  assert.doesNotMatch(stageSource, /absolute left-3 top-3 z-40/);
  assert.doesNotMatch(stageSource, /onAskAi/);
  assert.match(chromeSource, /data-deck-resize-handle/);
  assert.match(chromeSource, /data-deck-rotate-handle/);

  const chromeUrl = await compileModule(
    "src/shell/doc-editors/DeckElementSelectionChrome.tsx",
    { react: reactUrl },
  );
  const { DeckElementSelectionChrome } = await import(chromeUrl);
  const handles = [
    { id: "nw", className: "-left-1.5 -top-1.5", cursor: "nwse-resize" },
    { id: "se", className: "-bottom-1.5 -right-1.5", cursor: "nwse-resize" },
  ];
  const mounted = await render(
    React.createElement(DeckElementSelectionChrome, {
      element: TEXT_ELEMENT,
      resizeHandles: handles,
      onStartInteraction() {},
    }),
  );
  try {
    assert.equal(
      mounted.container.querySelectorAll("[data-deck-element-chrome]").length,
      0,
    );
    assert.equal(
      mounted.container.querySelectorAll("[data-deck-resize-handle]").length,
      2,
    );
    assert.equal(
      mounted.container.querySelectorAll("[data-deck-rotate-handle]").length,
      1,
    );
    assert.equal(mounted.container.querySelectorAll("button").length, 0);
  } finally {
    await mounted.unmount();
  }
});

test("DeckContextToolbar 暴露复制 / 锁定 / 删除 / 编辑文字，未选中时禁用", async () => {
  const toolbarUrl = await compileModule(
    "src/shell/doc-editors/DeckContextToolbar.tsx",
    {
      react: reactUrl,
      "../../i18n/ui/useUI": uiStubUrl,
      "../SelectionToolbar": toolbarStubUrl,
    },
  );
  const { DeckContextToolbar } = await import(toolbarUrl);

  const empty = await render(
    React.createElement(DeckContextToolbar, { editor: mockEditor() }),
  );
  try {
    for (const id of OBJECT_ACTION_IDS) {
      const button = empty.container.querySelector(
        `[data-selection-control-id="${id}"]`,
      );
      assert.ok(button, `未选中时必须露出 ${id}`);
      assert.equal(button.disabled, true, `${id} 未选中时必须禁用`);
    }
  } finally {
    await empty.unmount();
  }

  const selected = await render(
    React.createElement(DeckContextToolbar, {
      editor: mockEditor({ element: TEXT_ELEMENT }),
    }),
  );
  try {
    for (const id of OBJECT_ACTION_IDS) {
      const button = selected.container.querySelector(
        `[data-selection-control-id="${id}"]`,
      );
      assert.ok(button, `选中文字后必须露出 ${id}`);
      assert.equal(button.disabled, false, `${id} 选中未锁定文字时应可点`);
    }
  } finally {
    await selected.unmount();
  }

  const locked = await render(
    React.createElement(DeckContextToolbar, {
      editor: mockEditor({ element: LOCKED_TEXT }),
    }),
  );
  try {
    assert.equal(
      locked.container.querySelector('[data-selection-control-id="edit-text"]')
        .disabled,
      true,
    );
    assert.equal(
      locked.container.querySelector('[data-selection-control-id="duplicate"]')
        .disabled,
      true,
    );
    assert.equal(
      locked.container.querySelector('[data-selection-control-id="delete"]')
        .disabled,
      true,
    );
    assert.equal(
      locked.container.querySelector('[data-selection-control-id="lock"]')
        .disabled,
      false,
    );
  } finally {
    await locked.unmount();
  }

  const image = await render(
    React.createElement(DeckContextToolbar, {
      editor: mockEditor({ element: IMAGE_ELEMENT }),
    }),
  );
  try {
    assert.equal(
      image.container.querySelector('[data-selection-control-id="edit-text"]')
        .disabled,
      true,
    );
    assert.equal(
      image.container.querySelector('[data-selection-control-id="duplicate"]')
        .disabled,
      false,
    );
  } finally {
    await image.unmount();
  }
});

test("audio 波形上没有绝对定位播放圆钮，左栏播放键仍在", async () => {
  const audioSource = source("../src/shell/media-editors/AudioWorkbenchView.tsx");
  assert.doesNotMatch(audioSource, /h-14 w-14/);
  assert.doesNotMatch(
    audioSource,
    /absolute left-1\/2 top-1\/2[\s\S]{0,200}playPause/,
  );

  const audioUrl = await compileModule(
    "src/shell/media-editors/AudioWorkbenchView.tsx",
    {
      react: reactUrl,
      "../../i18n/ui/useUI": uiStubUrl,
      "./AudioWorkbench": dataModule(`
        export function useAudioWorkbench() { return null; }
      `),
      "./audio-workbench-utils": dataModule(`
        export function formatAudioTime(value) {
          return String(Math.round(Number(value) || 0)) + "s";
        }
      `),
    },
  );
  const { AudioStage, AudioControls } = await import(audioUrl);
  const editor = mockAudioEditor();
  const mounted = await render(
    React.createElement(
      "div",
      null,
      React.createElement(AudioControls, { editor }),
      React.createElement(AudioStage, { editor, accent: "#4f46e5" }),
    ),
  );
  try {
    const waveform = mounted.container.querySelector("[data-audio-waveform]");
    assert.ok(waveform);
    assert.equal(waveform.querySelector("button"), null);
    const absolutePlay = [...waveform.querySelectorAll("button")].filter((button) =>
      String(button.className).includes("absolute"),
    );
    assert.equal(absolutePlay.length, 0);
    const transport = mounted.container.querySelector("[data-audio-transport]");
    assert.ok(transport);
    const play = transport.querySelector('button[aria-label="播放"]');
    assert.ok(play);
    assert.ok(transport.querySelector('button[aria-label="停止"]'));
  } finally {
    await mounted.unmount();
  }
});
