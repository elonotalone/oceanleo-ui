// ============================================================================
// PDF 工作台那两个拆出来的 hook —— 真挂进 React 里跑，不再只看源码文本
// ----------------------------------------------------------------------------
// 为什么要有这份文件（W41，2026-09-01）
//
// `dfe6e54` 把 `use-pdf-workbench.ts` 的读路径与写路径拆成
// `use-pdf-view-pipeline.ts` 与 `use-pdf-edit-engine.ts`，让它退回 600 行以内。
// 拆的时候我做了反面验证：在干净检出上把 `usePdfMutationRunner` 的依赖数组从
// `[advance, pageCount, pageNumber, tt]` 改成 `[]`（这会让每一次 PDF 编辑都拿着
// 首渲染那一刻的页码去算落点，是真回归），重跑 `media-editors` +
// `pdf-carrier-contract` + `pdf-annotations-runtime` + `pdf-forms` +
// `advanced-native-editors` 共 72 例 —— **全绿，一条红都没有**。
//
// 按 `_COMMON.md §7b⑨`「反面验证跑出 0 红时先怀疑判据」查下去，洞是这样的：
// 全仓 `rg "usePdfWorkbench" tests/` 只有一处命中，那处断言的是 `index.ts` 的
// 导出面上**有这个名字**。**没有一份测试渲染或调用过这个 hook。** 罩着这一整面的
// 全是对源码文本做 `assert.match(...)` 的正则（分布在 8 份判据里）。正则挡得住
// 「谁把这段代码删了」，挡不住「谁把依赖数组改错了」—— 源码文本还在，行为已经坏了。
//
// 所以这里补的是**运行时证据**：真起一棵 React 树，把两个 hook 挂进去，
// 按调用顺序驱动它们，读它们真正写出去的值。三件事以前只有结构论证、现在有判据：
//   1. 一次 `runMutation` 之后页码被 clamp 到**新的**页数，快照记的是**当前**页码，
//      不是首渲染那一刻的（依赖数组改成 `[]` 当场红）；
//   2. `restoreSnapshot` 落下来的 `canUndo` / `canRedo` 与两个栈的真实深度一致；
//   3. 读路径的四个子 hook 顺序固定，且 `previewRevision` 这个令牌真的同时喂给了
//      光栅渲染与文本层 —— 这是「三者永远在同一版字节上」那句承诺的全部内容。
//
// 反面验证（本文件落盘时实测，两条都在干净检出上做）见 `verdicts/W41-delivery.md`。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { deletePdfPage } from "../src/shell/media-editors/pdf-operations.ts";
import {
  usePdfMutationRunner,
  usePdfSnapshotRestore,
} from "../src/shell/media-editors/use-pdf-edit-engine.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

/* --------------------------------- jsdom --------------------------------- */
// 经 fabric 的依赖树拿到（本仓没有直接装 jsdom，红线 6 不许为测试引新依赖）；
// 加载期间给缺失的 canvas 原生绑定一个空替身，样板与
// `rendition-callback-identity.test.mjs` 同源。

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
  url: "https://pdf.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
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

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/* ------------------------------- 写路径的台架 ------------------------------ */

/** `pdf-lib` 造一份 n 页的 PDF；写路径要的只是「真能被 inspectPdf 数出页数」。 */
async function pdfWithPages(count) {
  const { PDFDocument } = await import("pdf-lib");
  const pdf = await PDFDocument.create();
  for (let index = 0; index < count; index += 1) pdf.addPage([600, 800]);
  return pdf.save();
}

/**
 * 一套完整的 `usePdfMutationRunner` / `usePdfSnapshotRestore` 入参。
 *
 * 页码与页数走 React state（`view`），因为它们是**渲染作用域的值**，也正是那条
 * 依赖数组要盯的东西；其余状态位只记最后一次写入，判据要读的就是「落到哪个值」。
 */
function createBed() {
  const bed = {
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
    state: {
      canRedo: false,
      canUndo: false,
      dirty: false,
      documentRevision: 0,
      error: "",
      notice: "",
      processing: false,
      savedUrl: "https://cdn.test/已存过的.pdf",
    },
    initial: { pageCount: 1, pageNumber: 1 },
    advance: () => {},
    advanceCalls: [],
    annotation: { clearSelection: () => {} },
    clearSelectionCalls: 0,
    tt: (text) => text,
    view: null,
    setView: null,
    tick: null,
    runMutation: null,
    restoreSnapshot: null,
  };
  bed.advance = (event) => bed.advanceCalls.push(event);
  bed.annotation = {
    clearSelection: () => {
      bed.clearSelectionCalls += 1;
    },
  };
  return bed;
}

function settle(bed, key) {
  return (value) => {
    bed.state[key] = typeof value === "function" ? value(bed.state[key]) : value;
  };
}

function pageSetter(bed, key) {
  return (value) =>
    bed.setView((previous) => ({
      ...previous,
      [key]: typeof value === "function" ? value(previous[key]) : value,
    }));
}

function useBedWiring(bed) {
  const [view, setView] = React.useState(bed.initial);
  const [, setTick] = React.useState(0);
  bed.view = view;
  bed.setView = setView;
  bed.tick = () => setTick((value) => value + 1);
  return {
    setCanRedo: settle(bed, "canRedo"),
    setCanUndo: settle(bed, "canUndo"),
    setDirty: settle(bed, "dirty"),
    setDocumentRevision: settle(bed, "documentRevision"),
    setError: settle(bed, "error"),
    setNotice: settle(bed, "notice"),
    setPageCount: pageSetter(bed, "pageCount"),
    setPageNumber: pageSetter(bed, "pageNumber"),
    setProcessing: settle(bed, "processing"),
    setSavedUrl: settle(bed, "savedUrl"),
    view,
  };
}

function RunnerProbe({ bed }) {
  const { view, ...setters } = useBedWiring(bed);
  bed.runMutation = usePdfMutationRunner({
    ...bed.refs,
    pageCount: view.pageCount,
    pageNumber: view.pageNumber,
    advance: bed.advance,
    ...setters,
    tt: bed.tt,
  });
  return null;
}

function RestoreProbe({ bed }) {
  const { setProcessing, view, ...setters } = useBedWiring(bed);
  void view;
  void setProcessing;
  bed.restoreSnapshot = usePdfSnapshotRestore({
    annotation: bed.annotation,
    bytesRef: bed.refs.bytesRef,
    redoRef: bed.refs.redoRef,
    revisionRef: bed.refs.revisionRef,
    undoRef: bed.refs.undoRef,
    ...setters,
  });
  return null;
}

/* ------------------ 写路径 1：落点算在新页数上，不是首渲染那一刻 ----------------- */

test("一次编辑之后页码落在新的页数上，快照记的是当前页码而不是首渲染那一刻的", async () => {
  const bed = createBed();
  bed.refs.bytesRef.current = await pdfWithPages(3);
  const mounted = await mount(React.createElement(RunnerProbe, { bed }));
  try {
    // 装载完成后用户翻到了第 3 页 —— 这一步是关键：依赖数组坏掉的版本会永远
    // 停留在首渲染那一刻的 `{ pageNumber: 1, pageCount: 1 }`。
    await act(async () => {
      bed.setView({ pageCount: 3, pageNumber: 3 });
    });
    assert.deepEqual(bed.view, { pageCount: 3, pageNumber: 3 });

    let result = null;
    await act(async () => {
      result = await bed.runMutation(async (bytes) => ({
        bytes: await deletePdfPage(bytes, 0),
        notice: "已删除第 1 页",
      }));
    });

    assert.ok(result, "runMutation 应当把结果原样递回去");
    assert.equal(bed.view.pageCount, 3 - 1, "页数要按真实字节重新数一遍");
    assert.equal(
      bed.view.pageNumber,
      2,
      "第 3 页被删到只剩 2 页时，页码要 clamp 到新的页数（2），" +
        "而不是首渲染那一刻的页数（1）",
    );

    const [snapshot] = bed.refs.undoRef.current;
    assert.ok(snapshot, "撤销栈上应当压进一份快照");
    assert.deepEqual(
      { pageCount: snapshot.pageCount, pageNumber: snapshot.pageNumber },
      { pageCount: 3, pageNumber: 3 },
      "快照要记住编辑发生前用户真正停在的那一页，撤销才回得去",
    );

    assert.equal(bed.state.dirty, true);
    assert.equal(bed.state.canUndo, true);
    assert.equal(bed.state.canRedo, false);
    assert.equal(bed.state.savedUrl, "", "改过之后旧的已存地址必须作废");
    assert.equal(bed.state.notice, "已删除第 1 页");
    assert.equal(bed.state.processing, false, "跑完必须把转圈收掉");
    assert.deepEqual(bed.advanceCalls, ["annotation-edited"]);
    assert.equal(bed.state.documentRevision, 1);
    assert.equal(bed.refs.revisionRef.current, 1);
  } finally {
    await mounted.unmount();
  }
});

/* --------------- 写路径 2：结果自带页码时，同样按新页数收口 ------------------- */

test("结果自带页码时也按新页数 clamp，越界的页码不会漏出去", async () => {
  const bed = createBed();
  bed.refs.bytesRef.current = await pdfWithPages(4);
  const mounted = await mount(React.createElement(RunnerProbe, { bed }));
  try {
    await act(async () => {
      bed.setView({ pageCount: 4, pageNumber: 2 });
    });
    await act(async () => {
      await bed.runMutation(async (bytes) => ({
        bytes: await deletePdfPage(bytes, 0),
        pageNumber: 99,
        notice: "越界页码",
      }));
    });
    assert.equal(bed.view.pageCount, 3);
    assert.equal(bed.view.pageNumber, 3, "99 要被收进 1 到 3 之间");
  } finally {
    await mounted.unmount();
  }
});

/* ------------- 写路径 3：源换代 / 已卸载时，字节一个都不许换 ------------------ */

test("编辑跑到一半源被换掉时，字节与撤销栈一个都不许动", async () => {
  const bed = createBed();
  const original = await pdfWithPages(3);
  bed.refs.bytesRef.current = original;
  const mounted = await mount(React.createElement(RunnerProbe, { bed }));
  try {
    await act(async () => {
      bed.setView({ pageCount: 3, pageNumber: 3 });
    });

    let result = "未赋值";
    await act(async () => {
      result = await bed.runMutation(async (bytes) => {
        // 用户在这一刻打开了另一份 PDF：装载路径把代数往前推了一格。
        bed.refs.sourceGenerationRef.current += 1;
        return { bytes: await deletePdfPage(bytes, 0), notice: "不该落地" };
      });
    });

    assert.equal(result, null, "换代之后这次编辑必须整个作废");
    assert.equal(bed.refs.bytesRef.current, original, "字节不许被换掉");
    assert.deepEqual(bed.refs.undoRef.current, [], "撤销栈不许被写脏");
    assert.equal(bed.state.dirty, false);
    assert.equal(bed.state.notice, "", "作废的编辑不许留下提示");
    assert.deepEqual(bed.view, { pageCount: 3, pageNumber: 3 });
  } finally {
    await mounted.unmount();
  }
});

/* --------------- 写路径 4：一次只跑一个编辑，失败时说人话 -------------------- */

test("前一个编辑还没跑完时第二个直接退掉，失败原因照实说", async () => {
  const bed = createBed();
  bed.refs.bytesRef.current = await pdfWithPages(2);
  const mounted = await mount(React.createElement(RunnerProbe, { bed }));
  try {
    let release = () => {};
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let pending = null;
    await act(async () => {
      pending = bed.runMutation(async (bytes) => {
        await gate;
        return { bytes, notice: "第一个" };
      });
    });
    assert.equal(bed.state.processing, true, "跑起来了就要转圈");

    const second = await bed.runMutation(async () => {
      throw new Error("第二个编辑不该被跑起来");
    });
    assert.equal(second, null, "同一时刻只许有一个编辑在跑");

    await act(async () => {
      release();
      await pending;
    });
    assert.equal(bed.state.processing, false);
    assert.equal(bed.state.notice, "第一个");

    // 失败的那次：错误文案是被测代码从异常里取的原文，不是一句「处理失败」。
    await act(async () => {
      const failed = await bed.runMutation(async () => {
        throw new Error("这份 PDF 的第 2 页读不出来");
      });
      assert.equal(failed, null);
    });
    assert.equal(bed.state.error, "这份 PDF 的第 2 页读不出来");
    assert.equal(bed.state.processing, false, "报错之后也要把转圈收掉");
  } finally {
    await mounted.unmount();
  }
});

/* -------------- 写路径 5：回调身份只随它声明的那几样一起动 ------------------- */
// 这一条是上面那些断言的自保闸：依赖数组少一项，回调就会带着旧值继续用，
// 而源码文本正则看不出任何区别。`W20` 的 `effect-tt-dependency` 是 AST 静态分析，
// 同样只看得见写法。这里换成运行时问它：换了这个入参，你到底有没有重建。

test("runMutation 的身份随 pageNumber / pageCount / tt / advance 一起动，别的不动", async () => {
  const bed = createBed();
  bed.refs.bytesRef.current = await pdfWithPages(2);
  const mounted = await mount(React.createElement(RunnerProbe, { bed }));
  try {
    const first = bed.runMutation;
    await act(async () => bed.tick());
    assert.equal(
      bed.runMutation,
      first,
      "什么都没变的重渲染不许换回调身份，否则下游 effect 全部自激",
    );

    const beforePageNumber = bed.runMutation;
    await act(async () => {
      bed.setView((view) => ({ ...view, pageNumber: 2 }));
    });
    assert.notEqual(
      bed.runMutation,
      beforePageNumber,
      "页码变了必须重建回调，否则编辑会算在旧页码上",
    );

    const beforePageCount = bed.runMutation;
    await act(async () => {
      bed.setView((view) => ({ ...view, pageCount: 2 }));
    });
    assert.notEqual(
      bed.runMutation,
      beforePageCount,
      "页数变了必须重建回调，否则快照会记住一个不存在的页数",
    );

    const beforeTt = bed.runMutation;
    await act(async () => {
      bed.tt = (text) => `EN:${text}`;
      bed.tick();
    });
    assert.notEqual(
      bed.runMutation,
      beforeTt,
      "换语言之后报错文案要跟着换，回调必须重建",
    );

    const beforeAdvance = bed.runMutation;
    await act(async () => {
      bed.advance = (event) => bed.advanceCalls.push(event);
      bed.tick();
    });
    assert.notEqual(
      bed.runMutation,
      beforeAdvance,
      "阅读机换了实例，编辑完要通知的是新的那个",
    );
  } finally {
    await mounted.unmount();
  }
});

/* ------------- 撤销/重做：两个开关必须和两个栈的真实深度一致 ------------------ */

test("restoreSnapshot 落下来的可撤销/可重做，与两个栈的真实深度逐位一致", async () => {
  const bed = createBed();
  const current = await pdfWithPages(2);
  bed.refs.bytesRef.current = current;
  const mounted = await mount(React.createElement(RestoreProbe, { bed }));
  try {
    const restored = await pdfWithPages(5);

    // 撤销一步：撤销栈里还剩一份，重做栈刚被压进一份。
    bed.refs.undoRef.current = [
      { bytes: await pdfWithPages(1), pageNumber: 1, pageCount: 1 },
    ];
    bed.refs.redoRef.current = [
      { bytes: current, pageNumber: 2, pageCount: 2 },
    ];
    await act(async () => {
      bed.restoreSnapshot(
        { bytes: restored, pageNumber: 4, pageCount: 5 },
        "已撤销上一步",
      );
    });
    assert.equal(bed.refs.bytesRef.current, restored, "字节要换成快照那一份");
    assert.deepEqual(bed.view, { pageCount: 5, pageNumber: 4 });
    assert.equal(bed.state.canUndo, true, "撤销栈还剩一份，撤销要保持可用");
    assert.equal(bed.state.canRedo, true, "刚压进重做栈，重做要当场可用");
    assert.equal(bed.state.dirty, true);
    assert.equal(bed.state.savedUrl, "");
    assert.equal(bed.state.error, "");
    assert.equal(bed.state.notice, "已撤销上一步");
    assert.equal(bed.clearSelectionCalls, 1, "回到旧字节要收掉当前选中的批注");
    assert.equal(bed.state.documentRevision, 1);
    assert.equal(bed.refs.revisionRef.current, 1);

    // 再撤一步到底：撤销栈空了，两个开关必须立刻分别落到假与真。
    bed.refs.undoRef.current = [];
    await act(async () => {
      bed.restoreSnapshot(
        { bytes: current, pageNumber: 1, pageCount: 2 },
        "已撤销上一步",
      );
    });
    assert.equal(bed.state.canUndo, false, "撤销栈空了就不许再显示可撤销");
    assert.equal(bed.state.canRedo, true);

    // 重做到底：反过来同样成立。
    bed.refs.redoRef.current = [];
    bed.refs.undoRef.current = [
      { bytes: current, pageNumber: 1, pageCount: 2 },
    ];
    await act(async () => {
      bed.restoreSnapshot(
        { bytes: restored, pageNumber: 2, pageCount: 5 },
        "已重做",
      );
    });
    assert.equal(bed.state.canUndo, true);
    assert.equal(bed.state.canRedo, false, "重做栈空了就不许再显示可重做");
    assert.equal(bed.state.notice, "已重做");
    assert.equal(bed.clearSelectionCalls, 3);
  } finally {
    await mounted.unmount();
  }
});

test("快照里越界的页码同样被收进这份快照自己的页数里", async () => {
  const bed = createBed();
  bed.refs.bytesRef.current = await pdfWithPages(2);
  const mounted = await mount(React.createElement(RestoreProbe, { bed }));
  try {
    const bytes = await pdfWithPages(3);
    for (const [pageNumber, expected] of [
      [9, 3],
      [0, 1],
      [Number.NaN, 1],
    ]) {
      await act(async () => {
        bed.restoreSnapshot({ bytes, pageNumber, pageCount: 3 }, "回到旧版本");
      });
      assert.equal(
        bed.view.pageNumber,
        expected,
        `快照页码 ${String(pageNumber)} 应当被收到 ${expected}`,
      );
    }
  } finally {
    await mounted.unmount();
  }
});

test("restoreSnapshot 只随 annotation 换身份，重渲染不换", async () => {
  const bed = createBed();
  const mounted = await mount(React.createElement(RestoreProbe, { bed }));
  try {
    const first = bed.restoreSnapshot;
    await act(async () => bed.tick());
    assert.equal(bed.restoreSnapshot, first, "重渲染不许换身份");

    await act(async () => {
      bed.annotation = { clearSelection: () => {} };
      bed.tick();
    });
    assert.notEqual(
      bed.restoreSnapshot,
      first,
      "批注层换了实例，要收掉的就是新那一份的选中态",
    );
  } finally {
    await mounted.unmount();
  }
});

/* ------------------------------- 读路径的台架 ------------------------------ */
// 四个子 hook 全部打桩：真实现要 pdf.js、要 canvas、要真字节，而这一条判的不是
// 它们各自对不对（那是它们自己的判据），判的是**编排**：谁先谁后、令牌喂给了谁。

const RECORDER = `
  globalThis.__pdfViewCalls ??= [];
  const record = (name, argument) => {
    globalThis.__pdfViewCalls.push({ name, argument });
    return argument;
  };
`;

const viewPipelineUrl = await compileModule(
  "src/shell/media-editors/use-pdf-view-pipeline.ts",
  {
    "./use-pdf-document": dataModule(`${RECORDER}
      export function usePdfDocument(argument) {
        record("document", argument);
        return {
          documentProxy: globalThis.__pdfProxy,
          previewRevision: 77,
          loading: true,
        };
      }
    `),
    "./use-pdf-preview-render": dataModule(`${RECORDER}
      export function usePdfPreviewRender(argument) {
        record("preview", argument);
        return {
          rotation: 90,
          rendering: true,
          renderedZoom: 150,
          pageWidth: 612,
          pageHeight: 792,
          renderThumbnail: globalThis.__pdfThumbnail,
        };
      }
    `),
    "./use-pdf-text-layer": dataModule(`${RECORDER}
      export function usePdfTextLayer(argument) {
        record("textLayer", argument);
        return globalThis.__pdfTextLayer;
      }
    `),
    "./use-pdf-reader-machine": dataModule(`${RECORDER}
      export function usePdfReaderMachine(argument) {
        record("machine", argument);
        return globalThis.__pdfMachine;
      }
    `),
  },
);
const { usePdfViewPipeline } = await import(viewPipelineUrl);

test("读路径的四个子 hook 顺序固定，同一个版本令牌同时喂给光栅与文本层", async () => {
  globalThis.__pdfViewCalls = [];
  globalThis.__pdfProxy = { marker: "pdfjs-document-proxy" };
  globalThis.__pdfThumbnail = () => null;
  globalThis.__pdfTextLayer = { pages: [{ index: 0, items: [] }] };
  globalThis.__pdfMachine = { advance: () => {}, marker: "reader-machine" };

  const bytesRef = { current: null };
  const canvas = document.createElement("canvas");
  const translate = (text) => text;
  const onPageCount = () => {};
  const setError = () => {};
  const item = {
    id: "pdf-1",
    meta: {
      provenance_channel: "upload",
      license_code: "CC-BY",
      license_url: "https://creativecommons.org/licenses/by/4.0/",
      source_url: "https://example.test/paper.pdf",
      attribution: "某作者",
    },
  };

  let pipeline = null;
  function Probe() {
    pipeline = usePdfViewPipeline({
      bytesRef,
      canvas,
      documentRevision: 5,
      item,
      pageCount: 12,
      pageNumber: 7,
      rasterZoom: 1.5,
      translate,
      onPageCount,
      setError,
    });
    return null;
  }

  const mounted = await mount(React.createElement(Probe));
  try {
    const calls = globalThis.__pdfViewCalls;
    assert.deepEqual(
      calls.map((entry) => entry.name),
      ["document", "preview", "textLayer", "machine"],
      "四个子 hook 的次序是 React 的 hook 槽位次序，换了顺序就是换了一棵状态树",
    );
    const byName = Object.fromEntries(
      calls.map((entry) => [entry.name, entry.argument]),
    );

    assert.equal(byName.document.bytesRef, bytesRef);
    assert.equal(byName.document.documentRevision, 5);
    assert.equal(byName.document.onPageCount, onPageCount);
    assert.equal(byName.document.setError, setError);
    assert.equal(byName.document.translate, translate);

    // 这一对是整条读路径唯一的不变量：**同一个** previewRevision。
    // 谁被喂成了 documentRevision，谁就会在旧字节上继续画/继续取词。
    assert.equal(
      byName.preview.revision,
      77,
      "光栅渲染要跟着 previewRevision 走，不是 documentRevision",
    );
    assert.equal(
      byName.textLayer.revision,
      77,
      "文本层要跟着 previewRevision 走，不是 documentRevision",
    );
    assert.equal(byName.preview.documentProxy, globalThis.__pdfProxy);
    assert.equal(byName.textLayer.documentProxy, globalThis.__pdfProxy);
    assert.equal(byName.preview.canvas, canvas);
    assert.equal(byName.preview.pageCount, 12);
    assert.equal(byName.preview.pageNumber, 7);
    assert.equal(byName.preview.rasterZoom, 1.5);

    assert.equal(byName.machine.pages, globalThis.__pdfTextLayer.pages);
    assert.equal(byName.machine.textLayer, globalThis.__pdfTextLayer);
    assert.equal(byName.machine.annotatable, true);
    assert.deepEqual(byName.machine.provenance, {
      channel: "upload",
      licenseCode: "CC-BY",
      licenseUrl: "https://creativecommons.org/licenses/by/4.0/",
      sourceUrl: "https://example.test/paper.pdf",
      attribution: "某作者",
    });

    // 出口面：主 hook 只看得见它真的要渲染的东西。proxy 与令牌漏出去，
    // 「三者永远在同一版字节上」这句承诺就没人守得住了。
    assert.deepEqual(Object.keys(pipeline).sort(), [
      "machine",
      "pageHeight",
      "pageWidth",
      "previewLoading",
      "renderThumbnail",
      "renderedZoom",
      "rendering",
      "rotation",
      "textLayer",
    ]);
    assert.equal(pipeline.previewLoading, true);
    assert.equal(pipeline.rotation, 90);
    assert.equal(pipeline.renderedZoom, 150);
    assert.equal(pipeline.machine, globalThis.__pdfMachine);
  } finally {
    await mounted.unmount();
    delete globalThis.__pdfViewCalls;
    delete globalThis.__pdfProxy;
    delete globalThis.__pdfThumbnail;
    delete globalThis.__pdfTextLayer;
    delete globalThis.__pdfMachine;
  }
});
