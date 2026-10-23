// 10-23 编辑器整改 W06：PDF 编辑器（D4）。单实例查看器的桥、✓/✗ 记号、签名本机存储、
// 统一编辑栏投影前的控件、agent 指令面、查看器配置与路由接线。
//
// 查看器本身（PDFium WASM + Preact shadow root）在 node 里跑不起来，这里用照
// `@embedpdf/plugin-*` 2.15.0 d.ts 搭的假 registry 钉住我们这一侧的行为；真渲染、真批注
// 落盘在浏览器场景里验（`docs/work-logs/2026-10-23-editor-overhaul/evidence/W06/`）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  PDF_SUBTYPE,
  PDF_VIEWER_ALWAYS_DISABLED,
  PDF_VIEWER_BASIC_HIDDEN,
  createPdfViewerBridge,
} from "../src/shell/media-editors/pdf-viewer-bridge.ts";
import {
  PDF_MARK_TOOL_IDS,
  pdfMarkAnnotation,
  pdfMarkStrokes,
  pdfMarkTools,
} from "../src/shell/media-editors/pdf-mark-tools.ts";
import {
  PDF_SIGNATURE_LIMIT,
  pdfSignatureStorageKey,
  readPdfSignatures,
  removePdfSignature,
  savePdfSignature,
} from "../src/shell/media-editors/pdf-signature-store.ts";
import { buildPdfViewerConfig } from "../src/shell/media-editors/pdf-viewer-config.ts";
import { isVendorCdnUrl } from "../src/shell/media-editors/pdf-next-runtime.ts";
import {
  PDF_COMMAND_SPECS,
  buildPdfCommandSurface,
} from "../src/shell/media-editors/pdf-command-surface.ts";

const read = (relative) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 假 registry（形状照 2.15.0 d.ts；只记调用）

const task = (value) => ({ toPromise: () => Promise.resolve(value) });

export function fakeViewerRegistry({ pages = 3 } = {}) {
  const calls = [];
  const log = (name) => (...args) => {
    calls.push([name, ...args]);
  };
  const hooks = { history: [], annotation: [], zoom: [], page: [], opened: [], thumbs: [] };
  const hook = (name) => (listener) => {
    hooks[name].push(listener);
    return () => {
      hooks[name] = hooks[name].filter((entry) => entry !== listener);
    };
  };
  let active = "doc-1";
  let seq = 1;
  const state = { activeToolId: null, selectedUids: [] };
  let selected = null;
  const pageList = () =>
    Array.from({ length: pages }, (_, index) => ({ index, size: { width: 600, height: 800 }, rotation: 0 }));
  const plugins = {
    ui: {
      forDocument: (id) => ({
        setActiveToolbar: (...args) => calls.push(["setActiveToolbar", id, ...args]),
        getActiveToolbar: () => null,
        closeToolbarSlot: (...args) => calls.push(["closeToolbarSlot", id, ...args]),
        isToolbarOpen: () => false,
        closeSidebarSlot: (...args) => calls.push(["closeSidebarSlot", id, ...args]),
        closeModal: log("closeModal"),
        closeAllMenus: log("closeAllMenus"),
      }),
      setDisabledCategories: log("ui.setDisabledCategories"),
      getSchema: () => ({ toolbars: { "main-toolbar": { id: "main-toolbar", permanent: true } } }),
      mergeSchema: log("ui.mergeSchema"),
    },
    commands: { setDisabledCategories: log("commands.setDisabledCategories") },
    annotation: {
      forDocument: () => ({
        getState: () => state,
        getSelectedAnnotation: () => (selected ? { object: selected } : null),
        getAnnotations: () => [],
        setActiveTool: (toolId) => {
          state.activeToolId = toolId;
          calls.push(["setActiveTool", toolId]);
        },
        createAnnotation: log("createAnnotation"),
        updateAnnotation: log("updateAnnotation"),
        deleteAnnotation: log("deleteAnnotation"),
        selectAnnotation: (pageIndex, id) => {
          state.selectedUids = [id];
          calls.push(["selectAnnotation", pageIndex, id]);
        },
        deselectAnnotation: log("deselectAnnotation"),
        setLocked: log("setLocked"),
        commit: () => {
          calls.push(["commit"]);
          return task(true);
        },
      }),
      setToolDefaults: log("setToolDefaults"),
      getTool: () => ({ defaults: { strokeColor: "#123456" } }),
      onStateChange: hook("annotation"),
    },
    "document-manager": {
      getActiveDocumentId: () => active,
      getActiveDocument: () => ({ pages: pageList() }),
      openDocumentBuffer: (options) => {
        const documentId = `doc-${++seq}`;
        calls.push(["openDocumentBuffer", documentId, options.autoActivate, options.buffer.byteLength]);
        return task({ documentId, task: task(undefined) });
      },
      closeDocument: (id) => {
        calls.push(["closeDocument", id]);
        return task(undefined);
      },
      setActiveDocument: (id) => {
        active = id;
        calls.push(["setActiveDocument", id]);
      },
      onDocumentOpened: hook("opened"),
    },
    export: {
      forDocument: () => ({
        saveAsCopy: () => {
          calls.push(["saveAsCopy"]);
          return task(new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer);
        },
      }),
    },
    history: {
      forDocument: () => ({ canUndo: () => true, canRedo: () => false, undo: log("undo"), redo: log("redo") }),
      onHistoryChange: hook("history"),
    },
    zoom: {
      forDocument: () => ({ requestZoom: log("requestZoom"), getState: () => ({ currentZoomLevel: 1.25 }) }),
      onZoomChange: hook("zoom"),
    },
    scroll: {
      forDocument: () => ({
        getCurrentPage: () => 2,
        getTotalPages: () => pages,
        scrollToPage: log("scrollToPage"),
        getMetrics: () => ({ pageVisibilityMetrics: [] }),
      }),
      onPageChange: hook("page"),
    },
    thumbnail: {
      forDocument: () => ({ renderThumb: () => task(new Blob(["x"])) }),
      onRefreshPages: hook("thumbs"),
    },
  };
  return {
    calls,
    hooks,
    state,
    select: (annotation) => {
      selected = annotation;
      state.selectedUids = annotation ? [annotation.id] : [];
    },
    active: () => active,
    registry: { getPlugin: (id) => (plugins[id] ? { provides: () => plugins[id] } : null) },
  };
}

const named = (calls, name) => calls.filter((call) => call[0] === name);

// ---------------------------------------------------------------------------
// 桥：同一实例上的两档

test("basic hides the official chrome and pro shows it, on the same document without reloading", () => {
  const fake = fakeViewerRegistry();
  const bridge = createPdfViewerBridge(fake.registry, "a.pdf");
  assert.equal(bridge.ready, true);
  // 换进来的文档不再自动打开官方主工具栏（专业档由我们开）。
  assert.deepEqual(named(fake.calls, "ui.mergeSchema")[0][1], {
    toolbars: { "main-toolbar": { id: "main-toolbar", permanent: false } },
  });

  bridge.setChrome("basic");
  const closed = named(fake.calls, "closeToolbarSlot").map((call) => call[3]);
  assert.deepEqual(closed.sort(), ["main", "secondary"]);
  assert.equal(named(fake.calls, "closeSidebarSlot").length, 2);
  const basicUi = named(fake.calls, "ui.setDisabledCategories").at(-1)[1];
  for (const category of [...PDF_VIEWER_ALWAYS_DISABLED, ...PDF_VIEWER_BASIC_HIDDEN]) {
    assert.ok(basicUi.includes(category), `basic must hide ${category}`);
  }
  // 基础档 Ctrl+F 不许打开官方查找侧栏。
  assert.ok(named(fake.calls, "commands.setDisabledCategories").at(-1)[1].includes("panel"));

  fake.calls.length = 0;
  bridge.setChrome("pro");
  assert.deepEqual(named(fake.calls, "setActiveToolbar")[0].slice(1), ["doc-1", "top", "main", "main-toolbar"]);
  assert.deepEqual(named(fake.calls, "ui.setDisabledCategories")[0][1], [...PDF_VIEWER_ALWAYS_DISABLED]);
  // 切档清掉正开着的工具，但不换文档、不重载。
  assert.deepEqual(named(fake.calls, "setActiveTool"), [["setActiveTool", null]]);
  assert.equal(named(fake.calls, "openDocumentBuffer").length, 0);
  assert.equal(named(fake.calls, "closeDocument").length, 0);
  assert.equal(fake.active(), "doc-1");
  assert.equal(bridge.mode, "pro");
});

test("file-level viewer commands stay off in both modes; view rotation and fullscreen too", () => {
  for (const category of [
    "document-open",
    "document-close",
    "document-print",
    "document-export",
    "document-protect",
    "document-capture",
    "document-menu",
    "document-fullscreen",
    "rotate",
  ]) {
    assert.ok(PDF_VIEWER_ALWAYS_DISABLED.includes(category), category);
  }
});

test("page edits swap bytes inside the same viewer: load in background, activate, close the old one", async () => {
  const fake = fakeViewerRegistry();
  const bridge = createPdfViewerBridge(fake.registry, "a.pdf");
  bridge.setChrome("basic");
  fake.calls.length = 0;
  await bridge.replaceDocument(new Uint8Array([1, 2, 3, 4, 5]), 2);
  const order = fake.calls.map((call) => call[0]);
  assert.deepEqual(named(fake.calls, "openDocumentBuffer")[0].slice(1), ["doc-2", false, 5]);
  assert.ok(order.indexOf("setActiveDocument") > order.indexOf("openDocumentBuffer"));
  assert.ok(order.indexOf("closeDocument") > order.indexOf("setActiveDocument"));
  assert.deepEqual(named(fake.calls, "closeDocument"), [["closeDocument", "doc-1"]]);
  // 新文档也是基础档的样子，页码回到原来那页。
  assert.ok(named(fake.calls, "closeToolbarSlot").every((call) => call[1] === "doc-2"));
  assert.deepEqual(named(fake.calls, "scrollToPage").at(-1)[1], { pageNumber: 2, behavior: "instant" });
});

test("thumbnails of pages that no longer exist reject instead of throwing into React", async () => {
  const fake = fakeViewerRegistry({ pages: 2 });
  const bridge = createPdfViewerBridge(fake.registry, "a.pdf");
  // 删页那一拍：栏里还画着第 3 页。旧码同步抛，打崩整个编辑器（浏览器实测）。
  const stale = bridge.renderThumb(2, 1);
  assert.ok(stale instanceof Promise);
  await assert.rejects(stale, /不在文档里/);
  assert.ok((await bridge.renderThumb(1, 1)) instanceof Blob);
});

test("exported bytes include annotations: pending edits are committed before saveAsCopy", async () => {
  const fake = fakeViewerRegistry();
  const bridge = createPdfViewerBridge(fake.registry, "a.pdf");
  const bytes = await bridge.exportBytes();
  assert.deepEqual([...bytes], [0x25, 0x50, 0x44, 0x46]);
  const order = fake.calls.map((call) => call[0]);
  assert.ok(order.indexOf("commit") >= 0 && order.indexOf("commit") < order.indexOf("saveAsCopy"));
});

test("read-only locks every annotation and refuses tools and new annotations", () => {
  const fake = fakeViewerRegistry();
  const bridge = createPdfViewerBridge(fake.registry, "a.pdf");
  bridge.setReadOnly(true);
  assert.deepEqual(named(fake.calls, "setLocked").at(-1)[1], { type: "all" });
  fake.calls.length = 0;
  bridge.setTool("highlight");
  assert.equal(named(fake.calls, "setActiveTool").length, 0);
  assert.equal(bridge.createAnnotation(0, { id: "a", type: PDF_SUBTYPE.STAMP }), false);
  bridge.undo();
  assert.equal(named(fake.calls, "undo").length, 0);
  bridge.setReadOnly(false);
  // 可编辑时只锁表单控件（点它是填写）。
  assert.deepEqual(named(fake.calls, "setLocked").at(-1)[1], { type: "include", categories: ["form"] });
  assert.equal(bridge.createAnnotation(0, { id: "b", type: PDF_SUBTYPE.STAMP }), true);
  assert.deepEqual(named(fake.calls, "selectAnnotation").at(-1), ["selectAnnotation", 0, "b"]);
});

test("zoom is one control: the shell percent drives the viewer and reads back from it", () => {
  const fake = fakeViewerRegistry();
  const bridge = createPdfViewerBridge(fake.registry, "a.pdf");
  assert.equal(bridge.zoomPercent(), 125);
  bridge.setZoomPercent(900);
  bridge.setZoomPercent(10);
  bridge.fitPage();
  assert.deepEqual(named(fake.calls, "requestZoom").map((call) => call[1]), [4, 0.25, "fit-page"]);
  const seen = [];
  bridge.subscribe({ onZoom: (value) => seen.push(value) });
  fake.hooks.zoom.forEach((listener) => listener({ documentId: "doc-1", newZoom: 1.5 }));
  fake.hooks.zoom.forEach((listener) => listener({ documentId: "other", newZoom: 3 }));
  assert.deepEqual(seen, [150]);
});

// ---------------------------------------------------------------------------
// 查看器配置

test("viewer config: self-hosted only, single document, site-token theme, mark tools registered", () => {
  const config = buildPdfViewerConfig({
    wasmUrl: "https://oceanleo.com/static/pdfium/pdfium.wasm",
    fontFallback: undefined,
    bytes: new Uint8Array([1]).buffer,
    name: "x.pdf",
    palette: { accent: "#0f766e", dark: true },
  });
  assert.equal(isVendorCdnUrl(config.wasmUrl), false);
  assert.equal(config.fontFallback, null, "null is the only value that does not fall back to a CDN");
  assert.deepEqual(config.disabledCategories, [...PDF_VIEWER_ALWAYS_DISABLED]);
  assert.equal(config.tabBar, "never");
  assert.equal(config.documentManager.initialDocuments.length, 1);
  assert.equal(config.theme.preference, "dark");
  // 两档同形，颜色全部引外壳 token：站点切明暗时查看器的栏和页间底色一起变。
  assert.match(config.theme.dark.background.app, /^var\(--awb-stage-bg/);
  assert.match(config.theme.light.foreground.primary, /^var\(--awb-text/);
  assert.equal(config.theme.light.accent.primary, "#0f766e");
  assert.deepEqual(
    config.annotations.tools.map((tool) => tool.id),
    [PDF_MARK_TOOL_IDS.check, PDF_MARK_TOOL_IDS.cross, "freeText"],
  );
  // 加文字用来填表：黑字、点下去是空框（上游点击预填 "Insert text"，打的字会接在后面）。
  const freeText = config.annotations.tools.find((tool) => tool.id === "freeText");
  assert.equal(freeText.defaults.fontColor, "#000000");
  assert.equal(freeText.defaults.contents, "");
  assert.equal(freeText.clickBehavior.defaultContent, "");
  assert.equal(freeText.clickBehavior.enabled, true);
  assert.deepEqual(config.annotations.locked, { type: "include", categories: ["form"] });
  const unsafe = buildPdfViewerConfig({
    wasmUrl: "https://oceanleo.com/p.wasm",
    fontFallback: null,
    bytes: new Uint8Array([1]).buffer,
    name: "x.pdf",
    palette: { accent: "red;}</style>", dark: false },
  });
  assert.equal(unsafe.theme.light.accent.primary, "#4f46e5", "accent is not injected verbatim");
});

// ---------------------------------------------------------------------------
// ✓ / ✗：标准 /Ink 批注

test("check and cross are vector Ink annotations, kept inside the page", () => {
  const check = pdfMarkAnnotation("check", 1, { x: 100, y: 120 }, { pageSize: { width: 600, height: 800 } });
  assert.equal(check.type, PDF_SUBTYPE.INK);
  assert.equal(check.pageIndex, 1);
  assert.equal(check.inkList.length, 1);
  assert.equal(check.inkList[0].points.length, 3);
  assert.equal(check.subject, "Check");
  assert.ok(check.flags.includes("print"), "prints like any other annotation");
  const cross = pdfMarkAnnotation("cross", 0, { x: 2, y: 2 }, { pageSize: { width: 600, height: 800 } });
  assert.equal(cross.inkList.length, 2);
  // 点在页角上：整体挪进页内，不落到页外。
  assert.ok(cross.rect.origin.x >= 0 && cross.rect.origin.y >= 0);
  for (const stroke of cross.inkList) {
    for (const point of stroke.points) assert.ok(point.x >= 0 && point.y >= 0);
  }
  // 外框包住笔画。
  const xs = check.inkList[0].points.map((point) => point.x);
  assert.ok(check.rect.origin.x <= Math.min(...xs));
  assert.ok(check.rect.origin.x + check.rect.size.width >= Math.max(...xs));
  assert.notDeepEqual(pdfMarkStrokes("check", { x: 0, y: 0 }), pdfMarkStrokes("cross", { x: 0, y: 0 }));
});

test("the mark tools commit one Ink on pointer down and hand editing back to the ink tool", () => {
  const tools = pdfMarkTools();
  assert.equal(tools.length, 2);
  for (const tool of tools) {
    assert.equal(tool.matchScore(), 0, "existing ink is edited by the default ink tool");
    assert.equal(tool.defaults.type, PDF_SUBTYPE.INK);
    const committed = [];
    const handler = tool.pointerHandler.create({
      pageIndex: 3,
      pageSize: { width: 600, height: 800 },
      getTool: () => ({ defaults: { strokeColor: "#abcdef", strokeWidth: 5 } }),
      onCommit: (annotation) => committed.push(annotation),
    });
    handler.onPointerDown({ x: 300, y: 400 });
    assert.equal(committed.length, 1);
    assert.equal(committed[0].pageIndex, 3);
    assert.equal(committed[0].strokeColor, "#abcdef");
    assert.equal(committed[0].strokeWidth, 5);
  }
});

// ---------------------------------------------------------------------------
// 签名：本机、按用户分开

function memoryStorage({ quota = Infinity } = {}) {
  const map = new Map();
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => {
      if (String(value).length > quota) throw new Error("QuotaExceededError");
      map.set(key, String(value));
    },
    keys: () => [...map.keys()],
  };
}
const png = (tag) => `data:image/png;base64,${Buffer.from(`png-${tag}`).toString("base64")}`;

test("signatures are stored per user on this device, newest first, deduped and capped", () => {
  const store = memoryStorage();
  savePdfSignature("u1", { dataUrl: png("a"), width: 200, height: 80 }, store);
  savePdfSignature("u2", { dataUrl: png("b"), width: 200, height: 80 }, store);
  assert.deepEqual(store.keys().sort(), [pdfSignatureStorageKey("u1"), pdfSignatureStorageKey("u2")].sort());
  assert.equal(readPdfSignatures("u1", store).length, 1);
  assert.equal(readPdfSignatures("u2", store)[0].dataUrl, png("b"), "another user's signature is not shown");
  savePdfSignature("u1", { dataUrl: png("a"), width: 200, height: 80 }, store);
  assert.equal(readPdfSignatures("u1", store).length, 1, "the same image is stored once");
  for (let index = 0; index < PDF_SIGNATURE_LIMIT + 3; index += 1) {
    savePdfSignature("u1", { dataUrl: png(`n${index}`), width: 10, height: 10 }, store);
  }
  const list = readPdfSignatures("u1", store);
  assert.equal(list.length, PDF_SIGNATURE_LIMIT);
  assert.equal(list[0].dataUrl, png(`n${PDF_SIGNATURE_LIMIT + 2}`));
  removePdfSignature("u1", list[0].id, store);
  assert.equal(readPdfSignatures("u1", store).length, PDF_SIGNATURE_LIMIT - 1);
});

test("signature store refuses non-PNG data and reports a full device instead of pretending", () => {
  const store = memoryStorage({ quota: 10 });
  assert.throws(
    () => savePdfSignature("u1", { dataUrl: "data:text/html;base64,PHNjcmlwdD4=", width: 1, height: 1 }, store),
    /格式不对/,
  );
  assert.throws(() => savePdfSignature("u1", { dataUrl: png("a"), width: 1, height: 1 }, store), /空间不够/);
  assert.deepEqual(readPdfSignatures("u1", store), []);
  const corrupt = memoryStorage();
  corrupt.setItem(pdfSignatureStorageKey("u1"), "{not json");
  assert.deepEqual(readPdfSignatures("u1", corrupt), []);
});

// ---------------------------------------------------------------------------
// 统一编辑栏：选中批注时的控件

const selectionBar = await import(
  await compileModule("src/shell/media-editors/PdfSelectionBar.tsx", {
    "../../i18n/ui/useUI": dataModule("const tt = (zh) => zh; export function useUI() { return tt; }"),
    "../SelectionToolbar": dataModule("export function SelectionToolbar() { return null; }"),
  })
);
const tt = (zh) => zh;

test("annotation bars use canonical ids in canonical order, one of each", () => {
  const { pdfSelectionControls } = selectionBar;
  const text = pdfSelectionControls("freetext", { fontFamily: 5, fontSize: 12, textAlign: 1 }, tt, true);
  assert.deepEqual(
    text.map((control) => control.id),
    ["font-family", "font-size", "bold", "italic", "text-color", "align", "fill", "opacity-value", "delete"],
  );
  const font = text.find((control) => control.id === "font-family");
  assert.deepEqual(font.options.map((option) => option.value), ["Helvetica", "Times", "Courier"]);
  assert.equal(font.value, "Helvetica");
  assert.equal(text.find((control) => control.id === "bold").value, true);
  assert.equal(text.find((control) => control.id === "align").value, "center");
  const opacity = text.find((control) => control.id === "opacity-value");
  assert.equal(opacity.inspectorGroup, "opacity");
  assert.equal(opacity.slot, "inspector");
  // 批注文字做不到的规范项不出（不放灰按钮）。
  for (const id of ["underline", "strike", "list", "line-height", "link", "highlight"]) {
    assert.equal(text.some((control) => control.id === id), false, id);
  }
  const ink = pdfSelectionControls("ink", { strokeColor: "#112233", strokeWidth: 4 }, tt, true);
  assert.deepEqual(ink.map((control) => control.id), ["stroke-color", "stroke-width", "opacity-value", "delete"]);
  assert.ok(ink.slice(0, 2).every((control) => control.inspectorGroup === "stroke"));
  assert.deepEqual(
    pdfSelectionControls("stamp", {}, tt, true).map((control) => control.id),
    ["opacity-value", "delete"],
  );
  assert.deepEqual(
    pdfSelectionControls("note", { contents: "hi" }, tt, true).map((control) => control.id),
    ["fill", "opacity-value", "pdf-note-text", "delete"],
  );
  for (const kind of ["freetext", "highlight", "line", "ink", "note", "stamp"]) {
    const ids = pdfSelectionControls(kind, {}, tt, true).map((control) => control.id);
    assert.equal(new Set(ids).size, ids.length, `${kind} repeats a control`);
  }
});

test("bar commands patch the annotation fields the viewer writes into the PDF", () => {
  const { pdfSelectionPatch, pdfFontCode, pdfFontParts, pdfSelectionBarVisible } = selectionBar;
  const values = { fontFamily: pdfFontCode("Times", false, false) };
  assert.deepEqual(pdfFontParts(pdfSelectionPatch("freetext", values, "bold", true).fontFamily), {
    family: "Times",
    bold: true,
    italic: false,
  });
  assert.deepEqual(pdfSelectionPatch("freetext", values, "font-size", 400), { fontSize: 96 });
  assert.deepEqual(pdfSelectionPatch("ink", {}, "opacity-value", 3), { opacity: 0.1 });
  assert.deepEqual(pdfSelectionPatch("highlight", {}, "fill", "#00ff00"), { strokeColor: "#00ff00", color: "#00ff00" });
  assert.deepEqual(pdfSelectionPatch("freetext", {}, "fill", "nope"), { color: "#ffffff", backgroundColor: "#ffffff" });
  assert.equal(pdfSelectionPatch("ink", {}, "no-such-control", 1), null);
  assert.equal(pdfSelectionPatch("note", {}, "pdf-note-text", "x".repeat(5000)).contents.length, 4000);
  // 没选中东西时编辑栏留给工具按钮（不进「…」）；只读时不出。
  assert.equal(pdfSelectionBarVisible(null, "highlight", false), false);
  assert.equal(pdfSelectionBarVisible({ id: "a", type: PDF_SUBTYPE.INK }, null, false), true);
  assert.equal(pdfSelectionBarVisible({ id: "a", type: PDF_SUBTYPE.INK }, null, true), false);
  assert.equal(pdfSelectionBarVisible({ id: "a", type: 99 }, null, false), false);
});

// ---------------------------------------------------------------------------
// agent 指令面：只有新能力

function commandEditor(calls, overrides = {}) {
  return {
    bridge: {
      goToPage: (page) => calls.push(["goToPage", page]),
      searchHits: async (query) =>
        query === "none"
          ? []
          : [{ pageIndex: 1, rects: [{ origin: { x: 10, y: 20 }, size: { width: 30, height: 10 } }] }],
      revealHit: () => undefined,
      createAnnotation: (pageIndex, annotation) => {
        calls.push(["createAnnotation", pageIndex, annotation]);
        return true;
      },
      pages: () => Array.from({ length: 4 }, (_, index) => ({ index, size: { width: 600, height: 800 }, rotation: 0 })),
      annotationCount: () => 7,
    },
    loading: false,
    processing: false,
    pageCount: 4,
    currentPage: 2,
    zoom: 100,
    dirty: false,
    editRevision: 3,
    error: "",
    rotatePage: async (...args) => {
      calls.push(["rotatePage", ...args]);
      return true;
    },
    deletePage: async (...args) => {
      calls.push(["deletePage", ...args]);
      return true;
    },
    ...overrides,
  };
}
const commandDeps = (calls) => ({
  download: async () => {
    calls.push(["download"]);
    return "";
  },
  save: async () => {
    calls.push(["save"]);
    return { ok: true, message: "saved" };
  },
});

test("the PDF command surface lists only the new abilities", () => {
  assert.deepEqual(PDF_COMMAND_SPECS.map((spec) => spec.id), [
    "pdf.go-to-page",
    "pdf.find-text",
    "pdf.add-highlight",
    "pdf.add-text",
    "pdf.add-check",
    "pdf.rotate-page",
    "pdf.delete-page",
    "pdf.export",
    "pdf.save",
  ]);
  const calls = [];
  const surface = buildPdfCommandSurface(commandEditor(calls), commandDeps(calls));
  assert.equal(surface.describe().length, PDF_COMMAND_SPECS.length);
  // 没载入时只剩下载（只读）。
  const loading = buildPdfCommandSurface(commandEditor(calls, { loading: true }), commandDeps(calls));
  assert.deepEqual(loading.describe().map((spec) => spec.id), ["pdf.export"]);
  assert.equal(JSON.parse(JSON.stringify(surface.state())).annotationCount, 7);
});

test("PDF commands create standard annotations and refuse what they cannot do", async () => {
  const calls = [];
  const surface = buildPdfCommandSurface(commandEditor(calls), commandDeps(calls));
  const check = await surface.run("pdf.add-check", { page: 3, x: 50, y: 60 });
  assert.equal(check.ok, true);
  assert.equal(check.revision, 3);
  const created = named(calls, "createAnnotation")[0];
  assert.equal(created[1], 2);
  assert.equal(created[2].type, PDF_SUBTYPE.INK);
  const text = await surface.run("pdf.add-text", { text: "张三", x: 40, y: 50 });
  assert.equal(text.ok, true);
  assert.equal(named(calls, "createAnnotation")[1][2].type, PDF_SUBTYPE.FREETEXT);
  assert.equal(named(calls, "createAnnotation")[1][2].contents, "张三");
  const highlight = await surface.run("pdf.add-highlight", { text: "abc" });
  assert.equal(highlight.ok, true);
  assert.equal(named(calls, "createAnnotation")[2][2].type, PDF_SUBTYPE.HIGHLIGHT);
  assert.equal((await surface.run("pdf.add-highlight", { text: "none" })).ok, false);
  const rotate = await surface.run("pdf.rotate-page", { page: 4, direction: "ccw" });
  assert.equal(rotate.ok, true);
  assert.deepEqual(named(calls, "rotatePage")[0], ["rotatePage", 3, false]);
  const outside = await surface.run("pdf.go-to-page", { page: 9 });
  assert.equal(outside.ok, false);
  assert.match(outside.message, /只有 4 页/);
  const offPage = await surface.run("pdf.add-text", { text: "x", x: 9999, y: 1 });
  assert.equal(offPage.ok, false);
  for (const removed of ["pdf.add-blank-page", "pdf.merge", "pdf.extract-pages", "pdf.move-page"]) {
    const result = await surface.run(removed, {});
    assert.equal(result.ok, false, removed);
  }
  const onePage = buildPdfCommandSurface(commandEditor(calls, { pageCount: 1, currentPage: 1 }), commandDeps(calls));
  assert.equal((await onePage.run("pdf.delete-page", {})).ok, false);
  assert.equal((await surface.run("pdf.save", {})).ok, true);
  assert.equal((await surface.run("pdf.export", {})).ok, true);
});

// ---------------------------------------------------------------------------
// 路由接线

test("the PDF route: ten basic tools on the bar, one stage, no legacy toolbox, single zoom", () => {
  const route = read("src/shell/advanced-routes/PdfRoute.tsx");
  const tools = [...route.matchAll(/\{ id: "(pdf-tool-[a-z]+)", label: "([^"]+)"/g)].map((match) => match[2]);
  assert.deepEqual(tools, ["高亮", "下划线", "删除线", "打勾", "打叉", "加文字", "签名", "画笔", "便签", "查找"]);
  assert.match(route, /actions: chrome === "basic" \? toolActions : \[\]/);
  assert.doesNotMatch(route, /toolbox|drawers:|PdfContextToolbar|ModeSwitchGate|addBlankPage|merge|extract/i);
  // 只有一个缩放：专业档官方工具栏有缩放，外壳那个藏起来。
  assert.match(route, /nativeChrome: \{ viewport: chrome === "pro" \}/);
  // 查看器是懒加载叶子，主包不拖 PDFium。
  assert.match(route, /dynamic\(\s*\(\) => import\("\.\.\/media-editors\/PdfStage"\)/);
  assert.doesNotMatch(route, /from "@embedpdf\//);
  // 素材库：只收图片，作为图章放进页面；拖放给落点。
  assert.match(route, /accepts: \(material\) => !readOnly && isImageMaterial\(material\)/);
  assert.match(route, /placement\?\.source === "drop" \? placement\.clientX : undefined/);
  assert.match(route, /accept: "image\/png,image\/jpeg"/);
  // 素材面板按申报列图片；点一下 / 拖进去走 W02 的 command 契约（插入进查看器自己的撤销历史）。
  assert.match(route, /materialTypes: \["image"\]/);
  assert.match(
    route,
    /withEditorHistoryCommand\(materialAdapter, \{\s*documentId: advancedRootItemId\(item\),\s*targetRevisionId: item\.revisionId,/,
  );
  assert.match(route, /useWorkbenchMaterialAdapter\(materialCommandAdapter\)/);
});

test("the page rail avoids the floating edit bar and locks while read-only", () => {
  const rail = read("src/shell/media-editors/PdfControls.tsx");
  assert.match(rail, /data-edit-bar-avoid=""/);
  assert.match(rail, /const locked = readOnly \|\| busy;/);
  assert.match(rail, /draggable=\{!locked\}/);
  assert.match(rail, /\{!locked \? \(/);
});
