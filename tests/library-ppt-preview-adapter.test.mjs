import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import ts from "typescript";

import {
  deckPreviewFitGeometry,
  deckPreviewLogicalSize,
} from "../src/shell/doc-editors/deck-preview-geometry.ts";

const viewerPath = new URL(
  "../src/shell/library-viewers.tsx",
  import.meta.url,
);
const viewerSource = readFileSync(viewerPath, "utf8");
const sourceFile = ts.createSourceFile(
  viewerPath.pathname,
  viewerSource,
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.TSX,
);
const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileModule(relativePath, replacements) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries(replacements)) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      fileName: sourcePath,
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
    })
    .outputText.replaceAll(
      'from "react";',
      `from ${JSON.stringify(reactUrl)};`,
    )
    .replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return `${dataModule(compiled)}#${encodeURIComponent(relativePath)}`;
}

function functionSource(name) {
  const declaration = sourceFile.statements.find(
    (statement) =>
      ts.isFunctionDeclaration(statement) &&
      statement.name?.text === name,
  );
  assert.ok(declaration, `${name} declaration`);
  return declaration.getText(sourceFile);
}

test("PPT preview delegates rail, selection and fitted stage to W3 layout", () => {
  const viewer = functionSource("PptViewer");
  assert.match(
    viewerSource,
    /from "\.\/doc-editors\/DeckPreviewLayout"/,
  );
  assert.match(viewer, /<DeckPreviewLayout/);
  assert.match(viewer, /slides=\{layoutSlides\}/);
  assert.match(viewer, /activeSlideId=\{effectiveActiveSlideId\}/);
  assert.match(viewer, /onActiveSlideChange=\{selectSlide\}/);
  assert.match(viewer, /logicalSize=\{logicalSize\}/);
  assert.match(viewer, /stageOverlay=/);
  assert.doesNotMatch(
    viewer,
    /relative min-h-\[520px\] overflow-auto bg-stone-100 p-3/,
  );
});

test("adapter derives the logical page from loaded PPTX dimensions", () => {
  const viewer = functionSource("PptViewer");
  assert.match(
    viewer,
    /const model = await activePreviewer\.load\(arrayBuffer\)/,
  );
  assert.match(
    viewer,
    /deckPreviewLogicalSize\(\s*model\.width \/ model\.height,\s*\)/,
  );
  assert.doesNotMatch(viewer, /getBoundingClientRect\(\)/);
  assert.doesNotMatch(viewer, /\.preview\(arrayBuffer\)/);

  for (const aspectRatio of [16 / 9, 4 / 3]) {
    const logicalSize = deckPreviewLogicalSize(aspectRatio);
    const geometry = deckPreviewFitGeometry({
      viewportWidth: 920,
      viewportHeight: 620,
      logicalSize,
      zoomPercent: 50,
    });
    assert.ok(geometry.width <= geometry.availableWidth);
    assert.ok(geometry.height <= geometry.availableHeight);
    assert.equal(logicalSize.width / logicalSize.height, aspectRatio);
  }
});

test("every parsed slide supplies a real thumbnail and active surface", () => {
  const viewer = functionSource("PptViewer");
  const thumbnail = functionSource("PptxSlideThumbnail");
  const clone = functionSource("clonePptxSlideSurface");
  assert.match(viewer, /model\.slides\.map\(\(slide, index\)/);
  assert.match(viewer, /thumbnail: clonePptxSlideSurface\(rendered, index\)/);
  assert.match(viewer, /<PptxSlideThumbnail/);
  assert.match(viewer, /previewerRef\.current\.renderSingleSlide/);
  assert.match(thumbnail, /node\.replaceChildren\(surface\)/);
  assert.match(thumbnail, /new ResizeObserver\(fit\)/);
  assert.match(clone, /namespacePptxSurfaceIds/);
});

test("adapter destroys imperative preview surfaces and keeps errors truthful", () => {
  const viewer = functionSource("PptViewer");
  assert.match(viewer, /previewer\?\.destroy\(\)/);
  assert.match(viewer, /node\.replaceChildren\(\)/);
  assert.match(viewer, /role="alert"/);
  assert.match(
    viewer,
    /PPT 在线解析失败，正在显示结构化幻灯片快照。/,
  );
  assert.match(viewer, /busy=\{state === "loading"\}/);
});

test("PPT adapter runtime selects real parsed slides through the shared layout", async () => {
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
    url: "https://asset.oceanleo.com/materials",
  });
  const previousGlobals = new Map();
  const runtimeGlobals = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    Event: dom.window.Event,
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
  };
  for (const [name, value] of Object.entries(runtimeGlobals)) {
    previousGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, {
      configurable: true,
      writable: true,
      value,
    });
  }
  const previousActEnvironment = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__pptRenderCalls = [];
  globalThis.__pptDestroyCalls = 0;

  const uiStubUrl = dataModule(`
    const translate = (value) => value;
    export function useUI() { return translate; }
  `);
  const markdownStubUrl = dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function Markdown({ children }) {
      return React.createElement("div", null, children);
    }
  `);
  const purifierStubUrl = dataModule(`
    export default { sanitize(value) { return value; } };
  `);
  const dataStubUrl = dataModule(`
    export function isDurableLibraryItem() { return false; }
    export function threeDSubtypeFor() { return ""; }
  `);
  const renditionStubUrl = dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    const state = {
      url: "",
      loading: false,
      error: "",
      retry() {},
      resourceFailed() {},
    };
    export function useArtifactRendition(item) {
      state.url = item.url || "";
      return state;
    }
    export function withResolvedRendition(item, rendition) {
      return { ...item, url: rendition.url || item.url };
    }
    export function ArtifactRenditionFailure({ message }) {
      return React.createElement("div", { role: "alert" }, message);
    }
  `);
  const officeStubUrl = dataModule(`
    export async function fetchValidatedOfficePackage() {
      return { arrayBuffer: new ArrayBuffer(8) };
    }
    export async function fetchValidatedSpreadsheetSource() {
      return { arrayBuffer: new ArrayBuffer(8) };
    }
    export function officePackageKindForItem() { return null; }
    export function officeViewerRenditionPurposes() { return ["full"]; }
  `);
  const layoutStubUrl = dataModule(`
    import React from ${JSON.stringify(reactUrl)};
    export function deckPreviewLogicalSize(aspectRatio = 16 / 9) {
      const ratio = Number.isFinite(aspectRatio) && aspectRatio > 0
        ? aspectRatio
        : 16 / 9;
      return { width: 960, height: 960 / ratio };
    }
    export function DeckPreviewLayout(props) {
      globalThis.__deckAdapterProps = props;
      return React.createElement(
        "section",
        { "data-deck-preview-layout": "" },
        React.createElement(
          "aside",
          { "data-deck-thumbnail-rail": "" },
          props.slides.map((slide) =>
            React.createElement(
              "button",
              {
                key: slide.id,
                type: "button",
                "data-slide-id": slide.id,
                onClick: () => props.onActiveSlideChange(slide.id),
              },
              slide.thumbnail,
              slide.label,
            ),
          ),
        ),
        React.createElement(
          "main",
          { "data-deck-preview-stage": "" },
          props.children,
          props.stageOverlay,
        ),
      );
    }
  `);
  const pptxStubUrl = dataModule(`
    export function init(node, options) {
      globalThis.__pptInitOptions = options;
      const wrapper = document.createElement("div");
      wrapper.className = "pptx-preview-wrapper";
      node.append(wrapper);
      return {
        options: { ...options },
        wrapper,
        htmlRender: {
          options: {
            viewPort: { width: options.width, height: options.height },
          },
        },
        async load() {
          return {
            width: 720,
            height: 540,
            slides: [{ name: "Opening" }, { name: "Summary" }],
          };
        },
        renderSingleSlide(index) {
          wrapper.replaceChildren();
          const slide = document.createElement("div");
          slide.className =
            "pptx-preview-slide-wrapper pptx-preview-slide-wrapper-" + index;
          slide.textContent = "real-slide-" + index;
          wrapper.append(slide);
          globalThis.__pptRenderCalls.push(index);
        },
        destroy() {
          globalThis.__pptDestroyCalls += 1;
        },
      };
    }
  `);
  const moduleUrl = await compileModule("src/shell/library-viewers.tsx", {
    react: reactUrl,
    dompurify: purifierStubUrl,
    "./Markdown": markdownStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./library-data": dataStubUrl,
    "./ArtifactRendition": renditionStubUrl,
    "./doc-editors/office-file": officeStubUrl,
    "./doc-editors/DeckPreviewLayout": layoutStubUrl,
    "pptx-preview": pptxStubUrl,
  });
  const { LibraryItemViewer } = await import(moduleUrl);
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const item = {
    id: "deck-1",
    title: "Quarterly review",
    kind: "ppt",
    url: "https://signed.test/deck.pptx",
    meta: {
      slides: [{ title: "Opening" }, { title: "Summary" }],
    },
  };
  const flush = async () => {
    await act(async () => {
      await new Promise((resolveFlush) => setImmediate(resolveFlush));
    });
  };
  const waitFor = async (condition, message) => {
    for (let index = 0; index < 40; index += 1) {
      if (condition()) return;
      await flush();
    }
    assert.fail(message);
  };

  try {
    await act(async () =>
      root.render(React.createElement(LibraryItemViewer, { item })),
    );
    await waitFor(
      () =>
        container.querySelectorAll("[data-deck-thumbnail-rail] button")
          .length === 2,
      "parsed PPT slides did not reach the shared thumbnail rail",
    );
    const layout = container.querySelector("[data-deck-preview-layout]");
    assert.ok(layout);
    const buttons = [
      ...container.querySelectorAll("[data-deck-thumbnail-rail] button"),
    ];
    assert.equal(buttons.length, 2);
    assert.equal(globalThis.__deckAdapterProps.logicalSize.width, 960);
    assert.equal(globalThis.__deckAdapterProps.logicalSize.height, 720);
    assert.deepEqual(globalThis.__pptRenderCalls, [0, 1, 0]);
    assert.match(
      container.querySelector(".pptx-preview-wrapper")?.textContent || "",
      /real-slide-0/,
    );

    await act(async () =>
      buttons[1].dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(globalThis.__deckAdapterProps.activeSlideId, "pptx-slide-2");
    assert.match(
      container.querySelector(".pptx-preview-wrapper")?.textContent || "",
      /real-slide-1/,
    );
    await act(async () =>
      root.render(
        React.createElement(LibraryItemViewer, {
          item: {
            ...item,
            id: "image-1",
            kind: "image",
            url: "https://signed.test/image.png",
          },
        }),
      ),
    );
    await waitFor(
      () => globalThis.__pptDestroyCalls === 1,
      "PPT preview instance was not destroyed after viewer replacement",
    );
    assert.equal(globalThis.__pptDestroyCalls, 1);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    delete globalThis.__deckAdapterProps;
    delete globalThis.__pptInitOptions;
    delete globalThis.__pptRenderCalls;
    delete globalThis.__pptDestroyCalls;
    if (previousActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
    for (const [name, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test("library PPT adapter transpiles without diagnostics", () => {
  const result = ts.transpileModule(viewerSource, {
    fileName: viewerPath.pathname,
    reportDiagnostics: true,
    compilerOptions: {
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
  });
  assert.deepEqual(
    result.diagnostics?.map((diagnostic) => diagnostic.messageText) || [],
    [],
  );
});
