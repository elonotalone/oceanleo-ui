// 台账那枚「导出成 …」真的按得动（W24 P3）。
//
// 前一轮把导出链做通了、也从共享包出口接出去了，但**没有任何界面调它**——
// 一条谁也按不到的链跟没做完是一回事。本文件锁住的就是那最后一跳：
//
//   1. 打开的是台账时，表格编辑器上出现那一排导出键，形态清单来自清册；
//   2. 按下去之后导出物**进「我的库」且可下载**，字节按库里的下载方案原样取得回来；
//   3. **保存与导出是两件事**：保存台账记的账不进库（`plugin-instance` 那一支，
//      网关一次都不碰），导出记账记录才进库。W19 刚把保存分档，这两条不许再糊在一起；
//   4. 打开的是用户上传的 xlsx 时，那一排导出键不许出现——同一台表格编辑器，
//      开的东西不同，出口就不同。
//
// 「非浏览器」的意思是没有真浏览器：这里用 jsdom + react act 真渲染真点击，
// 网关只假到网络那一层（上传按 URL 存字节，取回时逐字节比对），
// 判据（`libraryEntryIsDownloadableMaterial`、`artifactDownloadPlanFor`、
// `normalizeArtifactProjection`）全部是真实实现。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  artifactDownloadPlanFor,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";
import { pluginInstanceLibraryItem } from "../src/shell/plugin-initial-state.ts";
import {
  libraryEntryIsDownloadableMaterial,
  libraryEntryIsRuntimeSurface,
} from "../src/shell/plugin-export/plugin-export-contract.ts";
import { LEDGER_RENDERABLE_EXPORT_FORMS } from "../src/shell/plugin-export/ledger-export.ts";

import {
  compileModule,
  dataModule,
  realModule,
} from "./helpers/module-bench.mjs";

/* ------------------------------- jsdom ---------------------------------- */

const require = createRequire(import.meta.url);
// `jsdom` 只作为 fabric 的传递依赖装在树里，仓里其余 rendered 测试也是这样拿它的。
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
  url: "https://excel.oceanleo.com/workspace",
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
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  // `Blob` / `File` **刻意不从 jsdom 拿**：这一版 jsdom 的 File 没有
  // `arrayBuffer()`，而导出链要靠它把字节交给上传。Node 22 自带的那两个是全的。
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

/* ---------------------------- 模块编译 ------------------------------------ */

/**
 * 只有 `.tsx` 需要在这里编译（扩展名 loader 解析不了它），`.ts` 一律走磁盘真文件：
 * 桩得越少，这份用例证明的东西越接近线上那条链。
 */
/* ------------------------------ 假网关 ----------------------------------- */

const MEDIA_BY_FORMAT = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pdf: "application/pdf",
  csv: "text/csv",
  html: "text/html",
  svg: "image/svg+xml",
};

/** 上传按 URL 存下字节；`ensure` 按 transient 的声明补登一件 artifact。 */
const gateway = {
  uploads: [],
  ensures: [],
  announced: [],
  stored: new Map(),
  reset() {
    this.uploads.length = 0;
    this.ensures.length = 0;
    this.announced.length = 0;
    this.stored.clear();
  },
  /** 「用户点下载」那一步的非浏览器替身：库条目 → 下载方案 → 同一个 URL → 字节。 */
  fetchBytes(item) {
    const [candidate] = item.artifact ? artifactDownloadPlanFor(item.artifact) : [];
    const url = candidate?.rendition?.url || "";
    return this.stored.has(url) ? this.stored.get(url) : null;
  },
};
globalThis.__ledgerGateway = gateway;

const databaseStubUrl = dataModule(`
  export async function uploadFile(file, options) {
    const gateway = globalThis.__ledgerGateway;
    const bytes = new Uint8Array(await file.arrayBuffer());
    gateway.uploads.push({ filename: file.name, mediaType: file.type, bytes });
    const url =
      "https://signed.test/" +
      gateway.uploads.length +
      "-" +
      encodeURIComponent(file.name);
    gateway.stored.set(url, bytes);
    return { ok: true, data: { file: { id: "file-" + gateway.uploads.length, url, site_id: options.siteId, meta: {} } } };
  }
`);

const artifactClientStubUrl = dataModule(`
  import { normalizeArtifactProjection } from ${JSON.stringify(
    realModule("src/shell/artifact-contract.ts"),
  )};
  import { artifactProjectionToLibraryItem } from ${JSON.stringify(
    realModule("src/shell/library-data.ts"),
  )};

  export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";

  const MEDIA_BY_FORMAT = ${JSON.stringify(MEDIA_BY_FORMAT)};

  export async function ensureArtifact(transient) {
    const gateway = globalThis.__ledgerGateway;
    gateway.ensures.push(transient);
    const ordinal = gateway.ensures.length;
    const wire = {
      schema: "oceanleo.artifact.v1",
      artifact_id: "artifact-" + ordinal,
      revision_id: "r-" + ordinal,
      artifact_type: transient.artifactType,
      roles: ["deliverable"],
      title: transient.title,
      favorite: false,
      owner: { principal_id: "user-w24", visibility: "private" },
      access: {
        can_read: true,
        can_preview: true,
        can_edit: false,
        can_fork: false,
        can_insert: false,
        can_replace: false,
        can_favorite: true,
        can_bind: false,
        can_export_source: true,
      },
      editability: "view_only",
      editor_capability: null,
      source_format: transient.sourceFormat,
      renditions: {
        preview: {
          purpose: "preview",
          revision_id: "r-" + ordinal,
          url: transient.renditionUrl + "#preview",
          format: "png",
          media_type: "image/png",
        },
        source: {
          purpose: "source",
          revision_id: "r-" + ordinal,
          url: transient.renditionUrl,
          format: transient.sourceFormat,
          media_type:
            MEDIA_BY_FORMAT[transient.sourceFormat] || "application/octet-stream",
          digest: "sha256:" + transient.payloadDigest,
        },
      },
      provenance: { id: "prov-" + ordinal, source_kind: "owned", license_code: "owned" },
      integrity: { ok: true, code: "ok", reason: "" },
      context_bindings: [],
    };
    const projection = normalizeArtifactProjection(wire);
    if (!projection) return { ok: false, error: "假网关造出的投影不合规范" };
    const item = artifactProjectionToLibraryItem(projection);
    // 用例要拿这件真库条目去跑真实的准入判据与下载方案，所以在这里留一份。
    gateway.announced.push(item);
    return { ok: true, data: item };
  }

  /** 下载闸门用真实实现在测试主体里再核一遍；这里只回一个可下载的判定。 */
  export function artifactDownloadEvidence() {
    return { visible: true, available: true, reason: "" };
  }
`);

const wiringUrl = await compileModule(
  "src/shell/plugin-export/plugin-export-wiring.ts",
  {
    "../../lib/database": databaseStubUrl,
    "../artifact-client": artifactClientStubUrl,
  },
);

const uiStubUrl = dataModule(`
  export function useUI() {
    return (value) => value;
  }
`);

const gridEditorUrl = await compileModule(
  "src/shell/doc-editors/use-grid-editor.ts",
  {
    "../../i18n/ui/useUI": uiStubUrl,
    "../plugin-export/plugin-export-wiring": wiringUrl,
  },
);
const { useGridEditor } = await import(gridEditorUrl);

const gridStageUrl = await compileModule("src/shell/doc-editors/GridStage.tsx", {
  "../../i18n/ui/useUI": uiStubUrl,
  "./use-grid-editor": gridEditorUrl,
});
const { GridStage } = await import(gridStageUrl);

/* ------------------------------ 渲染夹具 --------------------------------- */

let liveEditor = null;

function Harness({ item }) {
  const editor = useGridEditor(item, "home");
  liveEditor = editor;
  return React.createElement(GridStage, { editor, accent: "#4f46e5" });
}

async function mount(item) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Harness, { item }));
  });
  await settle();
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function settle(ms = 10) {
  await act(async () => {
    await new Promise((done) => window.setTimeout(done, ms));
  });
}

async function click(target) {
  assert.ok(target, "要点的那个控件不在页面上");
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
  });
  await settle();
}

/** 往台账里记三笔账：日期 / 项目 / 金额 / 备注，金额的正负号就是收支方向。 */
async function writeLedgerRows(editor) {
  const rows = [
    ["2026-08-01", "餐饮", "-32.50", "午饭"],
    ["2026-08-02", "工资", "18000", "七月薪资"],
    ["2026-08-03", "交通", "-6", "地铁通勤"],
  ];
  await act(async () => {
    rows.forEach((row, index) => {
      row.forEach((value, column) => {
        editor.setCell(index + 1, column, value);
      });
    });
  });
  await settle();
}

/** 一件用户上传的 xlsx：没有 `plugin_id`，走的是素材那条路。 */
function uploadedWorkbook() {
  return {
    id: "artifact:uploaded:r1",
    key: "artifact:uploaded:r1",
    title: "季度明细",
    kind: "sheet",
    artifactId: "uploaded",
    revisionId: "r1",
    artifactType: "grid",
    meta: {
      sheets: [
        { name: "Sheet1", rows: [["日期", "项目", "金额", "备注"], ["2026-08-01", "餐饮", "-1", ""]] },
      ],
    },
  };
}

/* -------------------------------- 用例 ----------------------------------- */

test("打开台账时表格上出现那一排导出键，形态清单来自清册", async () => {
  gateway.reset();
  const ledger = pluginInstanceLibraryItem("ledger-register", {
    siteId: "home",
    appId: "personal-ledger",
  });
  assert.ok(ledger, "台账的第一屏必须造得出运行时实例");
  const mounted = await mount(ledger);
  try {
    const bar = mounted.container.querySelector("[data-ledger-export-bar]");
    assert.ok(bar, "台账上没有导出入口，那条链还是没人按得到");
    const rendered = [
      ...mounted.container.querySelectorAll("[data-ledger-export-form]"),
    ].map((node) => node.getAttribute("data-ledger-export-form"));
    // 清册说几种就是几种，界面不许另抄一份名单。
    assert.deepEqual(rendered, [...LEDGER_RENDERABLE_EXPORT_FORMS]);
    assert.ok(rendered.includes("xlsx") && rendered.includes("pdf"));
    // 一笔都没记的时候按不下去：导不出空文件。
    for (const node of mounted.container.querySelectorAll(
      "[data-ledger-export-form]",
    )) {
      assert.equal(node.disabled, true);
    }
    // 面向用户的文案里不许出现那个被 35 个站占用的内部概念名。
    assert.equal(bar.textContent.includes("插件"), false);
  } finally {
    await mounted.unmount();
  }
});

test("按下去：导出物进「我的库」，按库里的下载方案原样取得回字节", async () => {
  gateway.reset();
  const ledger = pluginInstanceLibraryItem("ledger-register", {
    siteId: "home",
    appId: "personal-ledger",
  });
  const mounted = await mount(ledger);
  try {
    await writeLedgerRows(liveEditor);
    assert.equal(liveEditor.ledgerExport.entryCount, 3, "三笔账没读出来");
    await click(
      mounted.container.querySelector('[data-ledger-export-form="xlsx"]'),
    );

    // ① 真的走了网关：一次上传、一次补登。
    assert.equal(gateway.uploads.length, 1, liveEditor.ledgerExport.notice);
    assert.equal(gateway.ensures.length, 1);
    assert.match(gateway.uploads[0].filename, /\.xlsx$/);
    // ② 补登的是一件**素材**载体，不是运行时工程态。
    assert.equal(gateway.ensures[0].artifactType, "grid");

    // ③ 那件东西过得了「我的库」的准入判据，并且不是「打开来用的那个东西」。
    const exported = gateway.announced[0];
    assert.ok(exported, "补登成功却没拿到库条目");
    assert.equal(libraryEntryIsDownloadableMaterial(exported), true);
    assert.equal(libraryEntryIsRuntimeSurface(exported), false);
    assert.equal(
      liveEditor.ledgerExport.lastArtifactId,
      exported.artifactId,
      "界面拿到的库条目 id 与网关补登的那件对不上",
    );

    // ④ 「可下载」不是一句声明：按库条目算出下载方案，去同一个 URL 把字节取回来，
    //    与上传的那一份逐字节相等。这就是用户点「下载」会拿到的东西。
    const plan = artifactDownloadPlanFor(exported.artifact);
    assert.ok(plan.length > 0, "库里那件导出物算不出任何下载方案");
    const bytes = gateway.fetchBytes(exported);
    assert.ok(bytes, "按下载方案取不回字节");
    assert.deepEqual(bytes, gateway.uploads[0].bytes);
    // xlsx 是个 zip 包，头四个字节就能证明取回来的不是一段占位数据。
    assert.deepEqual([...bytes.subarray(0, 4)], [0x50, 0x4b, 0x03, 0x04]);

    // ⑤ 界面把结果说清楚了，而且说的是「导出 / 可下载」，不是「已保存」。
    assert.match(liveEditor.ledgerExport.notice, /我的库/);
    assert.match(
      mounted.container.querySelector("[data-ledger-export-notice]")
        ?.textContent || "",
      /可以下载/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("保存不进库、导出才进库：同一台表格编辑器上两条路互不冒充", async () => {
  gateway.reset();
  const ledger = pluginInstanceLibraryItem("ledger-register", {
    siteId: "home",
    appId: "personal-ledger",
  });
  // 运行时实例本身：既进不了库，也不可下载（合同 §3.3）。
  assert.equal(libraryEntryIsRuntimeSurface(ledger), true);
  assert.equal(libraryEntryIsDownloadableMaterial(ledger), false);

  const mounted = await mount(ledger);
  try {
    await writeLedgerRows(liveEditor);

    // ① 保存：走 `plugin-instance` 那一支，网关一次都不碰，也拿不到 artifact 身份。
    let saved = null;
    await act(async () => {
      saved = await liveEditor.save();
    });
    assert.ok(saved, "台账保存不该返回空");
    assert.equal(saved.saveTarget, "plugin-instance");
    assert.equal(saved.url, "");
    assert.equal(saved.artifactId, "");
    assert.equal(saved.revisionId, "");
    assert.equal(
      gateway.uploads.length,
      0,
      "保存台账记的账时碰了网关——那就是把功能数据当素材落库了",
    );
    assert.equal(gateway.ensures.length, 0);

    // ② 导出：同一份数据、同一台编辑器，这一次必须进库。
    await click(
      mounted.container.querySelector('[data-ledger-export-form="csv"]'),
    );
    assert.equal(gateway.uploads.length, 1);
    assert.equal(gateway.ensures.length, 1);
    assert.ok(liveEditor.ledgerExport.lastArtifactId);

    // ③ 导出物的字节是台账里那三笔账，不是空壳。
    const csv = Buffer.from(gateway.uploads[0].bytes).toString("utf8");
    assert.match(csv, /餐饮/);
    assert.match(csv, /18000/);
    assert.match(csv, /-32\.5/);
  } finally {
    await mounted.unmount();
  }
});

test("开的是用户上传的 xlsx 时，台账那一排导出键不许出现", async () => {
  gateway.reset();
  const mounted = await mount(uploadedWorkbook());
  try {
    assert.equal(liveEditor.ledgerExport, null);
    assert.equal(
      mounted.container.querySelector("[data-ledger-export-bar]"),
      null,
      "一件上传的 xlsx 上冒出了台账的导出口",
    );
  } finally {
    await mounted.unmount();
  }
});
