// F05：别人的改动并进来时不动本地撤销栈；撤销只撤自己的；只读的人改不了；新增文案 17 种语言写全。
// 真挂 React 里的 usePdfMutationRunner / usePdfSnapshotRestore（和 pdf-workbench-hook-runtime 同一套台架），
// 两个模拟客户端共用一份 Yjs 文档。不开浏览器，不联网。
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import * as Y from "yjs";
import { PDFDocument } from "pdf-lib";

import {
  addPdfTextAnnotationAt,
  listPdfAnnotations,
} from "../src/shell/media-editors/pdf-annotation-operations.ts";
import { ensurePdfCollabIds } from "../src/shell/media-editors/pdf-collab-bytes.ts";
import { createPdfCollabSync } from "../src/shell/media-editors/pdf-collab-sync.ts";
import {
  usePdfMutationRunner,
  usePdfSnapshotRestore,
} from "../src/shell/media-editors/use-pdf-edit-engine.ts";
import { COLLAB_PDF_MESSAGES } from "../src/i18n/ui/messages/collab-pdf-copy.ts";

/* --------------------------------- jsdom --------------------------------- */
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
  url: "https://pdf.oceanleo.com/workspace",
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
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(element));
  return {
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/* --------------------------------- 台架 ---------------------------------- */
async function blankPdf(pages = 4) {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pages; i += 1) doc.addPage([612, 792]);
  return (await ensurePdfCollabIds(await doc.save())).bytes;
}

async function contentsOf(bytes) {
  const doc = await PDFDocument.load(bytes);
  const out = [];
  for (let i = 0; i < doc.getPageCount(); i += 1) {
    for (const a of await listPdfAnnotations(bytes, i)) out.push(a.contents);
  }
  return out.sort();
}

function link(a, b) {
  const queue = { ab: [], ba: [] };
  a.on("update", (u, o) => o !== "net" && queue.ab.push(u));
  b.on("update", (u, o) => o !== "net" && queue.ba.push(u));
  return {
    flush() {
      while (queue.ab.length || queue.ba.length) {
        for (const u of queue.ab.splice(0)) Y.applyUpdate(b, u, "net");
        for (const u of queue.ba.splice(0)) Y.applyUpdate(a, u, "net");
      }
    },
  };
}

function makeRoom(doc, id, extra = {}) {
  const room = {
    doc,
    role: "editor",
    status: "synced",
    self: { id, name: id, color: "#000", avatar_url: null },
    needsSeed: false,
    lock: null,
    completeSeed() {
      room.needsSeed = false;
    },
    ...extra,
  };
  return room;
}

function createBed() {
  return {
    refs: {
      aliveRef: { current: true },
      bytesRef: { current: null },
      processingRef: { current: false },
      processingTokenRef: { current: 0 },
      redoRef: { current: [] },
      revisionRef: { current: 0 },
      sourceGenerationRef: { current: 0 },
      undoRef: { current: [] },
    },
    state: { canUndo: false, canRedo: false, dirty: false, notice: "" },
    runMutation: null,
    restoreSnapshot: null,
    clears: 0,
  };
}

function Probe({ bed }) {
  const set = (key) => (value) => {
    bed.state[key] = typeof value === "function" ? value(bed.state[key]) : value;
  };
  const noop = () => {};
  bed.runMutation = usePdfMutationRunner({
    ...bed.refs,
    pageCount: 4,
    pageNumber: 1,
    advance: noop,
    setCanRedo: set("canRedo"),
    setCanUndo: set("canUndo"),
    setDirty: set("dirty"),
    setDocumentRevision: noop,
    setError: noop,
    setNotice: set("notice"),
    setPageCount: noop,
    setPageNumber: noop,
    setProcessing: noop,
    setSavedUrl: noop,
    tt: (text) => text,
  });
  bed.restoreSnapshot = usePdfSnapshotRestore({
    annotation: { clearSelection: () => { bed.clears += 1; } },
    bytesRef: bed.refs.bytesRef,
    redoRef: bed.refs.redoRef,
    revisionRef: bed.refs.revisionRef,
    undoRef: bed.refs.undoRef,
    setCanRedo: set("canRedo"),
    setCanUndo: set("canUndo"),
    setDirty: set("dirty"),
    setDocumentRevision: noop,
    setError: noop,
    setNotice: set("notice"),
    setPageCount: noop,
    setPageNumber: noop,
    setSavedUrl: noop,
  });
  return null;
}

/** 和 usePdfWorkbench.replaceBytesSilently 同一份契约：本地在编辑就 busy；换字节但不碰撤销栈 / 选区。 */
function silentHost(bed) {
  return {
    getBytes: () => bed.refs.bytesRef.current,
    async replaceBytes(transform) {
      const current = bed.refs.bytesRef.current;
      if (!current || bed.refs.processingRef.current) return "busy";
      const next = await transform(Uint8Array.from(current));
      if (bed.refs.bytesRef.current !== current) return "busy";
      if (!next) return "unchanged";
      bed.refs.bytesRef.current = next;
      bed.refs.revisionRef.current += 1;
      return "applied";
    },
  };
}

/* ---------------------------------- 测试 --------------------------------- */
test("别人的改动并进来不清空本地撤销栈；本地撤销只撤自己的、别人的批注留着", async () => {
  const docA = new Y.Doc();
  const docB = new Y.Doc();
  const net = link(docA, docB);
  const roomA = makeRoom(docA, "u-a", { needsSeed: true });
  const roomB = makeRoom(docB, "u-b");
  const seed = await blankPdf();
  const bedA = createBed();
  bedA.refs.bytesRef.current = seed;
  let bytesB = seed;
  const hostB = {
    getBytes: () => bytesB,
    async replaceBytes(transform) {
      const next = await transform(bytesB);
      if (!next) return "unchanged";
      bytesB = next;
      return "applied";
    },
  };
  const syncA = createPdfCollabSync({ room: roomA, host: silentHost(bedA), holdsPages: () => false, retryDelayMs: 5 });
  const syncB = createPdfCollabSync({ room: roomB, host: hostB, holdsPages: () => false, retryDelayMs: 5 });
  await syncA.setBaseline(seed);
  await syncB.setBaseline(seed);
  await syncA.reconcile();
  net.flush();
  await syncB.reconcile();
  net.flush();

  const mounted = await mount(React.createElement(Probe, { bed: bedA }));
  try {
    // 甲做了一次本地编辑（进撤销栈）
    await act(async () => {
      await bedA.runMutation(async (bytes) => ({
        bytes: (await addPdfTextAnnotationAt(bytes, 0, "甲的批注", { x: 0.1, y: 0.1 })).bytes,
        notice: "已加批注",
      }));
    });
    assert.equal(bedA.refs.undoRef.current.length, 1);
    assert.equal(bedA.state.canUndo, true);

    // 乙加一条批注；甲这边对齐收下
    bytesB = (await addPdfTextAnnotationAt(bytesB, 2, "乙的批注", { x: 0.4, y: 0.4 })).bytes;
    for (let i = 0; i < 4; i += 1) {
      await syncA.reconcile();
      await syncB.reconcile();
      net.flush();
    }
    await syncA.reconcile();
    assert.deepEqual(await contentsOf(bedA.refs.bytesRef.current), ["乙的批注", "甲的批注"].sort(), "甲这边已有双方批注");
    assert.equal(bedA.refs.undoRef.current.length, 1, "收到别人的改动，本地撤销栈原样");
    assert.equal(bedA.state.canUndo, true, "仍然可以撤销");
    assert.equal(bedA.clears, 0, "也没有清选区");

    // 甲撤销：旧快照里没有任何批注，补回乙的再落下
    const current = bedA.refs.bytesRef.current;
    const previous = bedA.refs.undoRef.current.pop();
    const adjusted = await syncA.adjustRestored(previous.bytes, current);
    await act(async () => bedA.restoreSnapshot({ ...previous, bytes: adjusted }, "已撤销上一步"));
    assert.deepEqual(await contentsOf(bedA.refs.bytesRef.current), ["乙的批注"], "只撤掉了甲自己的");
    for (let i = 0; i < 4; i += 1) {
      await syncA.reconcile();
      await syncB.reconcile();
      net.flush();
    }
    assert.deepEqual(await contentsOf(bytesB), ["乙的批注"], "乙那边看到同样的结果，乙的批注没被撤销带走");
  } finally {
    await mounted.unmount();
    syncA.dispose();
    syncB.dispose();
  }
});

test("只有查看权限的人：本地字节怎么变也不写进共享文档", async () => {
  const doc = new Y.Doc();
  const room = makeRoom(doc, "u-v", { role: "viewer", needsSeed: true });
  const seed = await blankPdf();
  const bed = createBed();
  bed.refs.bytesRef.current = seed;
  const sync = createPdfCollabSync({ room, host: silentHost(bed), holdsPages: () => false, retryDelayMs: 5 });
  await sync.setBaseline(seed);
  await sync.reconcile();
  const before = Buffer.from(Y.encodeStateVector(doc)).toString("hex");
  bed.refs.bytesRef.current = (await addPdfTextAnnotationAt(seed, 0, "不该出现", { x: 0.1, y: 0.1 })).bytes;
  await sync.reconcile();
  assert.equal(Buffer.from(Y.encodeStateVector(doc)).toString("hex"), before, "查看者没有产生任何写入");
  sync.dispose();
});

test("接线的静态保证：静默替换不碰撤销栈；撤销经 adjustRestored；只读冻结改动入口、整页动作先拿锁", async () => {
  const workbench = [
    await readFile(resolve("src/shell/media-editors/use-pdf-workbench.ts"), "utf8"),
    await readFile(resolve("src/shell/media-editors/use-pdf-workbench-collab.ts"), "utf8"),
  ].join("\n");
  const body = workbench.slice(
    workbench.indexOf("const replaceBytesSilently"),
    workbench.indexOf("const goToPage"),
  );
  assert.ok(body.length > 200);
  assert.doesNotMatch(body, /undoRef|redoRef|setCanUndo|setCanRedo|clearSelection/);
  assert.match(workbench, /landSnapshot\(previous[\s\S]*landSnapshot\(next/);
  assert.match(workbench, /collabRef\.current\?\.adjustRestored/);

  const collab = await readFile(resolve("src/shell/collab/adapters/use-pdf-collab.ts"), "utf8");
  for (const name of [
    "addTextAnnotationAt", "moveAnnotation", "updateSelectedAnnotation", "deleteSelectedAnnotation",
    "applyFormFill", "placeSignatureAt", "applyRedactions", "undo", "redo",
  ]) {
    assert.match(collab, new RegExp(`\\b${name}:`), `只读冻结里有 ${name}`);
  }
  for (const name of ["rotateCurrentPage", "movePage", "deleteCurrentPage", "addBlankPage", "mergePdf", "applyRedactions"]) {
    assert.match(collab, new RegExp(`${name}: page\\(editor\\.${name}\\)`), `${name} 先拿整页锁`);
  }

  const toolbar = await readFile(resolve("src/shell/media-editors/PdfContextToolbar.tsx"), "utf8");
  assert.match(toolbar, /collabReadOnly === true/, "上下文工具栏只读时灰掉而不是消失");
  const route = await readFile(resolve("src/shell/advanced-routes/PdfRoute.tsx"), "utf8");
  assert.doesNotMatch(route, /contextToolbar: collabReadOnly/);
});

test("新增文案：4 条在 17 种语言里都写全、不留中文原文占位（zh 除外）、占位符一致", () => {
  const locales = Object.keys(COLLAB_PDF_MESSAGES);
  assert.equal(locales.length, 17);
  const zh = COLLAB_PDF_MESSAGES.zh;
  const keys = Object.keys(zh);
  assert.equal(keys.length, 4);
  for (const locale of locales) {
    const dict = COLLAB_PDF_MESSAGES[locale];
    for (const key of keys) {
      assert.ok(dict[key] && dict[key].length > 0, `${locale} 缺 ${key}`);
      assert.deepEqual(
        (dict[key].match(/\{\w+\}/g) ?? []).sort(),
        (key.match(/\{\w+\}/g) ?? []).sort(),
        `${locale} 的占位符与原文一致：${key}`,
      );
      assert.doesNotMatch(dict[key], /上线/);
    }
  }
  for (const locale of locales.filter((l) => l !== "zh" && l !== "zh-TW")) {
    for (const key of keys) {
      assert.notEqual(COLLAB_PDF_MESSAGES[locale][key], key, `${locale} 没翻译：${key}`);
    }
  }
});
