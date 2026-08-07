import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import ts from "typescript";

import {
  deckPreviewFitGeometry,
  deckPreviewLogicalSize,
} from "../src/shell/doc-editors/deck-preview-geometry.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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

/** 被测源码里那条 import 的原文；桩表与断言都按它对齐。 */
const VENDORED_PPTX_SPECIFIER = "../../vendor/pptx-preview/pptx-preview.es.js";

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

test("first paint renders one slide; thumbnails come from a second off-screen instance", () => {
  const viewer = functionSource("PptViewer");
  const pass = functionSource("startPptxThumbnailPass");
  const clone = functionSource("clonePptxSlideSurface");
  const thumbnail = functionSource("PptxSlideThumbnail");

  // 首帧路径上只有一次 renderSingleSlide，而且它不在任何循环里。
  const firstPaintRenders = viewer.match(/renderSingleSlide\(/g) || [];
  assert.equal(
    firstPaintRenders.length,
    2,
    "PptViewer 里应当只剩两处 renderSingleSlide：首帧那一次与 selectSlide",
  );
  assert.match(viewer, /activePreviewer\.renderSingleSlide\(0\)/);
  assert.match(viewer, /previewerRef\.current\.renderSingleSlide/);
  // 舞台实例上不许再有「逐页渲一遍 + 逐页深拷贝」的循环。
  assert.doesNotMatch(viewer, /renderSingleSlide\(index\)/);
  assert.doesNotMatch(viewer, /clonePptxSlideSurface/);
  assert.match(viewer, /thumbnail: null/);
  assert.match(viewer, /setFirstPaintRenders\(1\)/);
  assert.match(viewer, /data-pptx-first-paint-renders=\{firstPaintRenders\}/);

  // 缩略图搬到了后台那一轮，而且用的是自己的宿主，不碰舞台。
  assert.match(viewer, /startPptxThumbnailPass\(\{/);
  assert.match(pass, /document\.createElement\("div"\)/);
  assert.match(pass, /data-pptx-chart-engine/);
  assert.match(pass, /clonePptxSlideSurface\(rendered, index\)/);
  assert.match(pass, /scheduleAfterPaint\(step\)/);
  assert.match(viewer, /<PptxSlideThumbnail/);
  assert.match(viewer, /<PendingSlideThumbnail/);
  assert.match(thumbnail, /node\.replaceChildren\(surface\)/);
  assert.match(thumbnail, /new ResizeObserver\(fit\)/);
  assert.match(clone, /namespacePptxSurfaceIds/);
});

test("parsing shows a picture instead of a blank stage", () => {
  const viewer = functionSource("PptViewer");
  const firstPaint = readFileSync(
    new URL("../src/shell/library-viewer-first-paint.tsx", import.meta.url),
    "utf8",
  );
  assert.match(viewer, /<ViewerParsingPoster item=\{item\}/);
  assert.doesNotMatch(viewer, /z-40 bg-white\/90/);
  assert.match(firstPaint, /export function ViewerParsingPoster/);
  assert.match(firstPaint, /data-library-viewer-parsing=/);
  // 海报必须按媒体类型过滤：货架上 154/161 件 deck 的 thumbnail 就是 pptx 本体。
  assert.match(firstPaint, /export function libraryPosterImageUrl/);
  assert.match(firstPaint, /const poster = libraryPosterImageUrl\(item\)/);
  assert.doesNotMatch(firstPaint, /const poster = item\.thumbUrl \|\| ""/);
});

test("adapter destroys imperative preview surfaces and keeps errors truthful", () => {
  const viewer = functionSource("PptViewer");
  assert.match(viewer, /previewer\?\.destroy\(\)/);
  assert.match(viewer, /stopThumbnailPass\?\.\(\)/);
  assert.match(viewer, /node\.replaceChildren\(\)/);
  assert.match(viewer, /role="alert"/);
  assert.match(
    viewer,
    /PPT 在线解析失败，正在显示结构化幻灯片快照。/,
  );
  assert.match(viewer, /busy=\{state === "loading"\}/);
  // 结构化快照兜底仍然挂在 error 分支上。
  assert.match(viewer, /if \(state === "error"\) \{/);
  assert.match(viewer, /<StructuredSlidePreview/);
});

test("PPT preview no longer pulls echarts into the parse path", () => {
  assert.match(viewerSource, /vendor\/pptx-preview\/pptx-preview\.es\.js/);
  assert.doesNotMatch(viewerSource, /import\("pptx-preview"\)/);

  const bundle = readFileSync(
    new URL("../vendor/pptx-preview/pptx-preview.es.js", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(
    bundle,
    /from\s*["']echarts["']/,
    "vendored bundle must not import echarts statically",
  );
  assert.match(bundle, /import\*as h from"\.\/chart-engine\.js"/);

  const engine = readFileSync(
    new URL("../vendor/pptx-preview/chart-engine.js", import.meta.url),
    "utf8",
  );
  assert.match(engine, /import\("echarts5"\)/);
  assert.doesNotMatch(engine, /^import[\s\S]*?from\s*["']echarts/m);
  // 取库失败不许静默。
  assert.match(engine, /unavailable:/);
  assert.match(engine, /console\.error/);

  const manifest = JSON.parse(
    readFileSync(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.equal(
    manifest.dependencies["pptx-preview"],
    undefined,
    "pptx-preview 只该留在 devDependencies：消费站装的是 vendor/ 里那份副本",
  );
  assert.ok(manifest.devDependencies["pptx-preview"]);
  assert.equal(manifest.dependencies.echarts5, "npm:echarts@^5.6.0");
  assert.ok(manifest.files.includes("vendor"));
  for (const runtime of ["jszip", "lodash", "tslib", "uuid"]) {
    assert.ok(
      manifest.dependencies[runtime],
      `${runtime} 是 vendored bundle 的运行期依赖，必须自己声明`,
    );
  }
});

test("vendored bundle stays byte-identical to upstream apart from the echarts seam", async () => {
  let buildVendoredBundle;
  try {
    require.resolve("pptx-preview/package.json");
    ({ buildVendoredBundle } = await import(
      pathToFileURL(resolve(import.meta.dirname, "../scripts/vendor-pptx-preview.mjs")).href
    ));
  } catch {
    // 上游是 devDependency，消费站装不到它，这条校验只在本仓装了它时跑。
    return;
  }
  const built = buildVendoredBundle();
  const current = readFileSync(
    new URL("../vendor/pptx-preview/pptx-preview.es.js", import.meta.url),
    "utf8",
  );
  assert.equal(
    current,
    built.contents,
    "vendor/pptx-preview/pptx-preview.es.js 与上游对不上 —— 跑 node scripts/vendor-pptx-preview.mjs",
  );
});

async function renderPptAdapter({ slideCount, meta }) {
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
  globalThis.__pptInstances = [];
  globalThis.__pptSlideCount = slideCount;

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
  // 首屏闸门用真实实现：JSDOM 没有 IntersectionObserver，它会走下一帧放行的兜底，
  // 正好证明「闸门缺席不会把预览卡死」。
  const firstPaintUrl = await compileModule(
    "src/shell/library-viewer-first-paint.tsx",
    {
      react: reactUrl,
      "../i18n/ui/useUI": uiStubUrl,
      "./library-data": dataStubUrl,
    },
  );
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
  const artifactClientStubUrl = dataModule(`
    export async function prepareArtifactForAction() {
      return { ok: true, data: null };
    }
  `);
  const artifactContractStubUrl = dataModule(`
    export function isArtifactSourceTreeUrl() { return false; }
  `);
  // 详情插槽只在官方模板目录行上动作；本用例喂的是普通 durable deck，插槽照定义
  // 直接 passthrough。桩在这里，是为了让本用例继续只测 PptViewer 一件事。
  const detailSlotStubUrl = dataModule(`
    export function useMaterialDetailTarget(item) {
      return { status: "passthrough", item };
    }
    export function MaterialDetailUnavailable() { return null; }
    export function GamePlayDetail() { return null; }
    export function gamePlayEmbedHref() { return ""; }
  `);
  // 沙箱站点查看器不在本用例的判据里，但它静态拉着 `lib/media-proxy.ts`，而那份文件用的是
  // 无扩展名的相对 import —— 不挂 `tests/ts-extension-loader.mjs` 直接 `node` 跑就会
  // `ERR_MODULE_NOT_FOUND`。给它一个替身，本文件因此两种跑法都成立。
  const websiteViewerStubUrl = dataModule(`
    export function WebsiteArtifactViewer() { return null; }
  `);
  const sandboxOriginStubUrl = dataModule(`
    export function isTrustedInteractiveViewerUrl() { return false; }
    export function webViewerFrameSandbox() {
      return "allow-scripts allow-forms allow-popups allow-downloads";
    }
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
  // 每个 init() 都登记成一个独立实例，这样「舞台渲了几页」与「缩略图工场渲了几页」
  // 分得开 —— 完成标准 2 要的正是前者恒为 1。
  const pptxStubUrl = dataModule(`
    export function init(node, options) {
      const instance = { host: node, renders: [], destroyed: 0 };
      (globalThis.__pptInstances ||= []).push(instance);
      globalThis.__pptInitOptions = options;
      const wrapper = document.createElement("div");
      wrapper.className = "pptx-preview-wrapper";
      node.append(wrapper);
      const slideCount = globalThis.__pptSlideCount || 2;
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
            slides: Array.from({ length: slideCount }, (unused, index) => ({
              name: index === 0 ? "Opening" : "Summary",
            })),
          };
        },
        renderSingleSlide(index) {
          wrapper.replaceChildren();
          const slide = document.createElement("div");
          slide.className =
            "pptx-preview-slide-wrapper pptx-preview-slide-wrapper-" + index;
          slide.textContent = "real-slide-" + index;
          wrapper.append(slide);
          instance.renders.push(index);
        },
        destroy() {
          instance.destroyed += 1;
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
    "./artifact-client": artifactClientStubUrl,
    "./artifact-contract": artifactContractStubUrl,
    "./editor-sandbox-origin": sandboxOriginStubUrl,
    "./WebsiteArtifactViewer": websiteViewerStubUrl,
    "./doc-editors/office-file": officeStubUrl,
    "./doc-editors/DeckPreviewLayout": layoutStubUrl,
    "./library-viewer-first-paint": firstPaintUrl,
    "./material-detail-slot": detailSlotStubUrl,
    [VENDORED_PPTX_SPECIFIER]: pptxStubUrl,
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
    meta: meta ?? {},
  };
  // 后台补渲走 setTimeout(16)（JSDOM 没有 requestIdleCallback），所以 flush 必须
  // 真的让时间过去，不能只排一次 setImmediate。
  const flush = async () => {
    await act(async () => {
      await new Promise((done) => setTimeout(done, 25));
    });
  };
  const waitFor = async (condition, message) => {
    for (let index = 0; index < 200; index += 1) {
      if (condition()) return;
      await flush();
    }
    assert.fail(message);
  };
  const teardown = async () => {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    delete globalThis.__deckAdapterProps;
    delete globalThis.__pptInitOptions;
    delete globalThis.__pptInstances;
    delete globalThis.__pptSlideCount;
    if (previousActEnvironment === undefined) {
      delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    } else {
      globalThis.IS_REACT_ACT_ENVIRONMENT = previousActEnvironment;
    }
    for (const [name, descriptor] of previousGlobals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  };
  return { dom, container, root, item, flush, waitFor, teardown, LibraryItemViewer };
}

test("PPT adapter runtime selects real parsed slides through the shared layout", async () => {
  const bench = await renderPptAdapter({
    slideCount: 2,
    meta: { slides: [{ title: "Opening" }, { title: "Summary" }] },
  });
  const { dom, container, root, item, flush, waitFor, teardown } = bench;
  try {
    await act(async () =>
      root.render(React.createElement(bench.LibraryItemViewer, { item })),
    );
    await waitFor(
      () => container.querySelector('[data-slide-id="pptx-slide-1"]'),
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

    // 首帧：舞台实例只渲了第 1 页，且只渲一遍。
    const stage = globalThis.__pptInstances[0];
    assert.deepEqual(stage.renders, [0]);
    assert.equal(
      container
        .querySelector("[data-pptx-first-paint-renders]")
        ?.getAttribute("data-pptx-first-paint-renders"),
      "1",
    );
    assert.match(
      container.querySelector(".pptx-preview-wrapper")?.textContent || "",
      /real-slide-0/,
    );

    // 缩略图在首帧之后由第二个实例补上，补完 2/2。
    await waitFor(
      () =>
        container
          .querySelector("[data-pptx-thumbnail-progress]")
          ?.getAttribute("data-pptx-thumbnail-progress") === "2/2",
      "background thumbnail pass never completed",
    );
    assert.equal(globalThis.__pptInstances.length, 2);
    assert.deepEqual(globalThis.__pptInstances[1].renders, [0, 1]);
    assert.notEqual(globalThis.__pptInstances[1].host, stage.host);
    assert.equal(
      globalThis.__pptInstances[1].host.getAttribute("data-pptx-chart-engine"),
      "off",
    );
    // 工场自己拆干净，不留屏幕外的宿主。
    assert.equal(
      dom.window.document.querySelectorAll("[data-pptx-thumbnail-workshop]")
        .length,
      0,
    );
    // 舞台实例在整轮补渲里一次都没被动过。
    assert.deepEqual(stage.renders, [0]);

    await act(async () =>
      buttons[1].dispatchEvent(
        new dom.window.MouseEvent("click", { bubbles: true }),
      ),
    );
    assert.equal(globalThis.__deckAdapterProps.activeSlideId, "pptx-slide-2");
    assert.deepEqual(stage.renders, [0, 1]);
    assert.match(
      container.querySelector(".pptx-preview-wrapper")?.textContent || "",
      /real-slide-1/,
    );

    await act(async () =>
      root.render(
        React.createElement(bench.LibraryItemViewer, {
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
      () => stage.destroyed === 1,
      "PPT preview instance was not destroyed after viewer replacement",
    );
    assert.equal(stage.destroyed, 1);
    await flush();
  } finally {
    await teardown();
  }
});

// 完成标准 2：首帧所需的 renderSingleSlide 次数不随页数增长。
// 8 页与 40 页给出同一个数，这就是「可测」的形式。
for (const slideCount of [8, 40]) {
  test(`first paint stays at one renderSingleSlide for a ${slideCount}-slide deck`, async () => {
    const bench = await renderPptAdapter({ slideCount });
    const { container, root, item, waitFor, teardown } = bench;
    try {
      await act(async () =>
        root.render(React.createElement(bench.LibraryItemViewer, { item })),
      );
      await waitFor(
        () => container.querySelector('[data-slide-id="pptx-slide-1"]'),
        `${slideCount}-slide deck never reached first paint`,
      );
      const stage = globalThis.__pptInstances[0];
      assert.deepEqual(
        stage.renders,
        [0],
        `${slideCount} 页的 deck 在首帧渲了 ${stage.renders.length} 页`,
      );
      assert.equal(
        container
          .querySelector("[data-pptx-first-paint-renders]")
          ?.getAttribute("data-pptx-first-paint-renders"),
        "1",
      );
      assert.equal(
        container.querySelectorAll("[data-deck-thumbnail-rail] button").length,
        slideCount,
      );
    } finally {
      await teardown();
    }
  });
}

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
