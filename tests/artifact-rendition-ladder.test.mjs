import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  MATERIAL_CATALOG_TYPES,
  normalizeArtifactProjection,
  viewerRenditionOrder,
} from "../src/shell/artifact-contract.ts";
import { artifactProjectionToLibraryItem } from "../src/shell/library-data.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

/** 阶梯里**永远**不该出现的三档。 */
const NON_VIEWER_PURPOSES = ["thumbnail", "source", "editor_manifest"];

/** 取 `["preview","full"]` 的那一族（`artifact-contract.ts:2211-2222`）。 */
const PREVIEW_FIRST_TYPES = [
  "single_file_image",
  "composite_image",
  "vector_image",
  "chart",
  "website",
  "game",
];

// ---------------------------------------------------------------------------
// 重签台：`refreshArtifactRendition` 的替身，每一次调用都记账
// ---------------------------------------------------------------------------

const bench = {
  calls: [],
  handler: () => new Promise(() => {}),
  reset(handler) {
    this.calls = [];
    this.handler = handler ?? (() => new Promise(() => {}));
  },
};
globalThis.__w07LadderBench = bench;

/** 永不落定的重签：用在「不该看重签结果」的用例上，免得计时器把状态改掉。 */
const NEVER_SETTLES = () => new Promise(() => {});

const renditionModuleUrl = await compileModule(
  "src/shell/ArtifactRendition.tsx",
  {
    "../i18n/ui/useUI": dataModule(`export const useUI=()=>s=>s;`),
    "./artifact-client": dataModule(`
      export async function refreshArtifactRendition(identity, purpose) {
        const bench = globalThis.__w07LadderBench;
        bench.calls.push({
          artifactId: identity.artifactId,
          revisionId: identity.revisionId,
          purpose,
        });
        return bench.handler(identity, purpose, bench.calls.length);
      }
    `),
    // office 包判定与失败文案的可读性判定都不是本份活的判据，换成最小替身，
    // 免得把两棵与阶梯无关的子树拖进编译图。
    "./doc-editors/office-file": dataModule(`
      export function officePackageKindForItem() { return null; }
    `),
    "./website-inline-preview": dataModule(`
      export function isDisplayableText() { return true; }
    `),
  },
);
const { useArtifactRendition } = await import(renditionModuleUrl);

const firstPaintUrl = await compileModule(
  "src/shell/library-viewer-first-paint.tsx",
  {
    "../i18n/ui/useUI": dataModule(`
      export function useUI() { return (value) => value; }
    `),
  },
);
const { libraryViewerIsHeavy, useVisibleViewerGate } = await import(
  firstPaintUrl
);

// ---------------------------------------------------------------------------
// 素材投影
// ---------------------------------------------------------------------------

const SOURCE_FORMATS = {
  single_file_image: "png",
  deck: "pptx",
  video: "mp4",
  game: "oceanleo.game-document.v1",
};

let artifactSeq = 0;

/**
 * 一件可见、可读、带 provenance 的素材。
 * `artifactIsVisible()` 不成立时 `useArtifactRendition()` 会走「无权查看」的早退分支，
 * 那样下面所有断言都测不到真实路径，所以这些字段一个都不能省。
 */
function projection(artifactType, renditions) {
  artifactSeq += 1;
  const revisionId = `rev-${artifactType}-${artifactSeq}`;
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: `artifact-${artifactType}-${artifactSeq}`,
    revision_id: revisionId,
    artifact_type: artifactType,
    roles: ["template"],
    title: `${artifactType} ${artifactSeq}`,
    favorite: false,
    owner: {
      principal_id: "w07-ladder",
      visibility: "public",
      origin_site_key: "asset",
    },
    access: {
      can_read: true,
      can_preview: true,
      can_edit: false,
      can_fork: false,
      can_insert: false,
      can_replace: false,
      can_favorite: false,
      can_bind: false,
      can_export_source: false,
    },
    editability: "view_only",
    editor_capability: null,
    source_format: SOURCE_FORMATS[artifactType] || "png",
    renditions: Object.fromEntries(
      Object.entries(renditions).map(([purpose, rendition]) => [
        purpose,
        {
          purpose,
          revision_id: revisionId,
          media_type: "image/png",
          format: "png",
          width: 1280,
          height: 960,
          byte_size: 120_000,
          digest: "sha256:3f9a1c7d55aa00ff",
          ...rendition,
        },
      ]),
    ),
    provenance: {
      id: `provenance-${artifactSeq}`,
      source_kind: "owned",
      license_code: "owned",
    },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
  };
}

function libraryItem(artifactType, renditions) {
  const artifact = normalizeArtifactProjection(
    projection(artifactType, renditions),
  );
  assert.ok(artifact, `${artifactType} 的投影没通过契约归一化`);
  return artifactProjectionToLibraryItem(artifact);
}

const future = (ms = 3_600_000) => new Date(Date.now() + ms).toISOString();
const past = (ms = 1_000) => new Date(Date.now() - ms).toISOString();

// ---------------------------------------------------------------------------
// DOM 台（`material-cover-rendering.test.mjs:801` 的模板）
// ---------------------------------------------------------------------------

/**
 * jsdom 只能从 fabric 的 node_modules 里拿到，而 fabric/node 会 require 原生
 * `canvas`。先往 require.cache 塞个空壳挡掉那次原生加载，拿到 JSDOM 再恢复。
 */
async function bootstrapDom() {
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
  const { window } = dom;
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    Image: window.Image,
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
  return { dom, window, document: window.document };
}

/** 把 `useArtifactRendition()` 挂起来，`box.state` 永远是最新一次渲染的返回值。 */
async function mountRendition(item, purposes) {
  const { document } = await bootstrapDom();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const box = { state: null, renders: 0 };

  function Probe() {
    box.renders += 1;
    box.state = useArtifactRendition(item, purposes);
    return null;
  }

  await act(async () => root.render(React.createElement(Probe)));
  return {
    box,
    container,
    unmount: () => act(async () => root.unmount()),
  };
}

// ---------------------------------------------------------------------------
// ① 选档
// ---------------------------------------------------------------------------

test("查看器阶梯只在 preview / full 两档之间选，且顺序按类型分族", () => {
  assert.equal(MATERIAL_CATALOG_TYPES.length, 15);
  // 先验这张名单本身：写错一个名字会让下面的分族断言整条落空。
  for (const artifactType of PREVIEW_FIRST_TYPES) {
    assert.ok(
      MATERIAL_CATALOG_TYPES.includes(artifactType),
      `${artifactType} 不在 MATERIAL_CATALOG_TYPES 里，名单已经漂了`,
    );
  }

  let previewFirst = 0;
  let fullFirst = 0;
  for (const artifactType of MATERIAL_CATALOG_TYPES) {
    const order = viewerRenditionOrder(artifactType, false);
    const expected = PREVIEW_FIRST_TYPES.includes(artifactType)
      ? ["preview", "full"]
      : ["full", "preview"];
    assert.deepEqual(order, expected, `${artifactType} 的阶梯不对`);
    if (expected[0] === "preview") previewFirst += 1;
    else fullFirst += 1;

    // `canExportSource` 不该把 source 挤进查看器阶梯：能不能下载源文件是另一件事。
    assert.deepEqual(
      viewerRenditionOrder(artifactType, true),
      order,
      `${artifactType} 的阶梯被 canExportSource 改掉了`,
    );
  }
  // 两族都得非空，否则「分族」这句话是空的。
  assert.equal(previewFirst, PREVIEW_FIRST_TYPES.length);
  assert.ok(fullFirst > 0);
});

test("thumbnail / source / editor_manifest 从不出现在任何 artifactType 的阶梯里", () => {
  for (const artifactType of MATERIAL_CATALOG_TYPES) {
    for (const canExportSource of [false, true]) {
      const order = viewerRenditionOrder(artifactType, canExportSource);
      for (const forbidden of NON_VIEWER_PURPOSES) {
        assert.ok(
          !order.includes(forbidden),
          `${artifactType}（canExportSource=${canExportSource}）的阶梯里出现了 ${forbidden}`,
        );
      }
    }
  }
});

test("useArtifactRendition 默认按 viewerRenditionOrder 取档，绕开 thumbnail", async () => {
  bench.reset(NEVER_SETTLES);
  // 三档都在，且 thumbnail 排在对象最前面：取到它就说明阶梯没被遵守。
  const image = libraryItem("single_file_image", {
    thumbnail: { url: "https://signed.test/img-thumb.webp", expiresAt: future() },
    preview: { url: "https://signed.test/img-preview.png", expiresAt: future() },
    full: { url: "https://signed.test/img-full.png", expiresAt: future() },
  });
  const mountedImage = await mountRendition(image);
  try {
    assert.equal(mountedImage.box.state.purpose, "preview");
    assert.equal(mountedImage.box.state.url, "https://signed.test/img-preview.png");
    assert.equal(mountedImage.box.state.error, "");
    assert.equal(mountedImage.box.state.failure, null);
  } finally {
    await mountedImage.unmount();
  }

  // 同样三档，换成 full 优先的一族。
  const deck = libraryItem("deck", {
    thumbnail: { url: "https://signed.test/deck-thumb.webp", expiresAt: future() },
    preview: { url: "https://signed.test/deck-preview.png", expiresAt: future() },
    full: { url: "https://signed.test/deck-full.pptx", expiresAt: future() },
  });
  const mountedDeck = await mountRendition(deck);
  try {
    assert.equal(mountedDeck.box.state.purpose, "full");
    assert.equal(mountedDeck.box.state.url, "https://signed.test/deck-full.pptx");
  } finally {
    await mountedDeck.unmount();
  }

  // 取档这一路不该顺手发重签：三档都还没过期。
  assert.equal(bench.calls.length, 0, "没过期的素材不该触发重签");
});

// ---------------------------------------------------------------------------
// ② 签名过期 ⇒ 重签，不是报错
// ---------------------------------------------------------------------------

test("expiresAt 已过：挂载即重签，新地址接手，不落在失败态上", async () => {
  const item = libraryItem("single_file_image", {
    preview: { url: "https://signed.test/stale-preview.png", expiresAt: past() },
    full: { url: "https://signed.test/stale-full.png", expiresAt: past() },
  });
  bench.reset((identity, purpose) =>
    Promise.resolve({
      ok: true,
      status: 200,
      data: {
        purpose,
        revisionId: identity.revisionId,
        url: "https://signed.test/fresh-preview.png",
        mediaType: "image/png",
        format: "png",
        expiresAt: future(),
        rendererVersion: null,
        width: 1280,
        height: 960,
        byteSize: 120_000,
        digest: "sha256:3f9a1c7d55aa00ff",
      },
    }),
  );

  const mounted = await mountRendition(item);
  try {
    assert.equal(bench.calls.length, 1, "过期的签名地址没有触发重签");
    assert.equal(bench.calls[0].purpose, "preview", "重签的是阶梯选中的那一档");
    assert.equal(mounted.box.state.url, "https://signed.test/fresh-preview.png");
    // 过期是可恢复的，不该把用户丢在失败面上。
    assert.equal(mounted.box.state.error, "");
    assert.equal(mounted.box.state.failure, null);
    assert.ok(mounted.box.state.version > 0, "重签成功该推进 version");
  } finally {
    await mounted.unmount();
  }
});

// ---------------------------------------------------------------------------
// ③ 失败态分档
// ---------------------------------------------------------------------------

for (const expiresAt of [null, future()]) {
  test(`transport failure recovers automatically with bounded backoff (${expiresAt ? "signed" : "public"})`, async t => {
    const item = libraryItem("single_file_image", { preview: { url: "https://cdn.test/preview.png", expiresAt } });
    bench.reset(async () => ({ ok: false, error: "temporary transport failure" }));
    const mounted = await mountRendition(item);
    t.mock.timers.enable({ apis: ["setTimeout"] });
    try {
      await act(async () => mounted.box.state.resourceFailed());
      assert.equal(mounted.box.state.failure.kind, "resource");
      assert.equal(mounted.box.state.failure.exhausted, false);
      assert.equal(bench.calls.length, 0, "no immediate signing loop");
      for (const [index, delay] of [1000, 2000, 4000, 8000, 15000, 30000].entries()) {
        await act(async () => t.mock.timers.tick(delay));
        assert.equal(bench.calls.length, index + 1);
      }
      await mounted.unmount();
      t.mock.timers.tick(30000);
      assert.equal(bench.calls.length, 6, "unmount stops recovery");
    } finally { t.mock.timers.reset(); }
  });
}

// ---------------------------------------------------------------------------
// ④ 重型查看器：进视口之前不挂载
// ---------------------------------------------------------------------------

test("五种重型 kind 加上 game 都在延迟挂载闸内，轻量 kind 不在", () => {
  // ppt/xlsx/docx/3d/pdf —— pdf 走 document / file 两个 kind。
  for (const kind of [
    "ppt",
    "sheet",
    "document",
    "threed",
    "file",
    "website",
    "canvas",
  ]) {
    assert.ok(
      libraryViewerIsHeavy({ kind }),
      `${kind} 不在重型闸门里，容器没进视口就会开始拉整个 payload`,
    );
  }
  // P4 补上的那个缺口：可玩 bundle 是这张表上最重的一件。
  assert.ok(
    libraryViewerIsHeavy({ kind: "game" }),
    "game 不在重型闸门里——沙箱 iframe 会在进视口前就下载并执行整个游戏",
  );
  // 闸门不该退化成「什么都算重」，否则延迟挂载就成了全局开关。
  for (const kind of ["image", "video", "audio", "xhs", "geo_map"]) {
    assert.equal(
      libraryViewerIsHeavy({ kind }),
      false,
      `${kind} 被当成了重型查看器`,
    );
  }
});

test("闸门未放行前不挂载重型子树，进视口后才挂", async () => {
  const { document, window } = await bootstrapDom();
  const { createRoot } = await import("react-dom/client");

  const observers = [];
  class FakeIntersectionObserver {
    constructor(callback, options) {
      this.callback = callback;
      this.options = options;
      this.observed = [];
      observers.push(this);
    }
    observe(node) {
      this.observed.push(node);
    }
    disconnect() {
      this.observed = [];
    }
  }
  window.IntersectionObserver = FakeIntersectionObserver;

  let heavyMounts = 0;
  function HeavySubtree() {
    heavyMounts += 1;
    return React.createElement("div", { "data-heavy": "mounted" });
  }
  function Viewer() {
    const gate = useVisibleViewerGate(false);
    return React.createElement(
      "div",
      { ref: gate.ref, "data-gate-ready": String(gate.ready) },
      gate.ready ? React.createElement(HeavySubtree) : null,
    );
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(Viewer)));

    const host = container.querySelector("[data-gate-ready]");
    assert.ok(host);
    assert.equal(host.getAttribute("data-gate-ready"), "false");
    assert.equal(heavyMounts, 0, "闸门还没放行，重型子树就已经挂上了");
    assert.equal(
      container.querySelector('[data-heavy="mounted"]'),
      null,
    );

    assert.equal(observers.length, 1, "没有装上 IntersectionObserver");
    assert.equal(
      observers[0].options.rootMargin,
      "128px",
      "预取余量不是 128px",
    );
    assert.equal(observers[0].observed.length, 1, "观察的节点没接上 ref");

    // 进视口。
    await act(async () =>
      observers[0].callback([{ isIntersecting: true }]),
    );

    assert.equal(host.getAttribute("data-gate-ready"), "true");
    assert.equal(heavyMounts, 1, "进了视口反而没挂载重型子树");
    assert.ok(container.querySelector('[data-heavy="mounted"]'));
  } finally {
    await act(async () => root.unmount());
    delete window.IntersectionObserver;
  }
});

test("没有 IntersectionObserver 的环境（SSR / 老浏览器）下一帧就放行，不把预览卡死", async () => {
  const { document, window } = await bootstrapDom();
  const { createRoot } = await import("react-dom/client");
  delete window.IntersectionObserver;
  delete globalThis.IntersectionObserver;

  function Viewer() {
    const gate = useVisibleViewerGate(false);
    return React.createElement("div", {
      ref: gate.ref,
      "data-gate-ready": String(gate.ready),
    });
  }

  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => root.render(React.createElement(Viewer)));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.equal(
      container.querySelector("[data-gate-ready]").getAttribute("data-gate-ready"),
      "true",
      "闸门在没有 IntersectionObserver 的环境里把预览永久卡住了",
    );
  } finally {
    await act(async () => root.unmount());
  }
});
