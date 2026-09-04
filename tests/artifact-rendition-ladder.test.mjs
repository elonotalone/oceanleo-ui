// ============================================================================
// W07 P5-b — rendition 阶梯 / 失败态分档 / 重型查看器延迟挂载
// ----------------------------------------------------------------------------
// 四组判据，各自锁一件事：
//
//   ① 选档：图片族 + chart/website/workflow/game 取 `["preview","full"]`，其余取
//     `["full","preview"]`。**任何 artifactType 都拿不到
//     `thumbnail` / `source` / `editor_manifest`**——五档里那三档从不进查看器阶梯
//     （`thumbnail` 只服务卡片，`source` 只服务下载，`editor_manifest` 只服务编辑器
//     路由与保存）。这条既验纯函数，也验 `useArtifactRendition()` 真的按它取。
//
//   ② 签名过期：`expiresAt` 已过 ⇒ 挂载即重签，**不是报错**；重签回来的地址接手。
//
//   ③ 失败态分档（W07 P3 的全部意义）：
//     - 「签名过期」按退避表自动重试，**最多三次**，第四次起 `exhausted: true`；
//     - 「资源不存在」**一次都不重签**。两种来路都归这档：压根没有 `expiresAt`
//       （不是签名地址，没有签名可换），或者刚换发过的新地址同样打不开
//       （证明问题不在签名）。用计数器断言「不再发起任何重签请求」——
//       这就是「用户不会一直点重试」的机器形式。
//     - 用尽之后 `retry()` 必须真的还能再试一次，否则失败面上那个按钮是句空话。
//
//   ④ 延迟挂载的反向验证：五种重型 kind（ppt/sheet/document/threed/file）**加上
//     `game`** 在进入视口前不挂载重型子树。`game` 是 P4 补上的那个缺口——它把整份
//     自包含 HTML 送进沙箱 iframe，漏在闸外等于容器还没进视口就开始下载并执行整个
//     游戏。**把 `game` 从 `HEAVY_LIBRARY_VIEWER_KINDS` 里摘掉，这里当场红。**
//
// ⚠️ `ArtifactRendition.tsx` 的重签缓存（`renditionRefreshCache` /
// `renditionRefreshPending`）是**模块级**的，按 `artifactId:revisionId:purpose` 存。
// 同一份编译产物在整份测试里只有一个实例，所以每个用例都得用**新的 artifactId**，
// 否则上一例重签到的地址会被下一例当成缓存命中，计数器断言随即变成假绿。
// ============================================================================

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
  "workflow",
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
  assert.equal(MATERIAL_CATALOG_TYPES.length, 16);
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

test("签名档：退避重试最多三次，第四次起 exhausted，retry() 之后预算重置", async () => {
  // 未过期但可签（带 expiresAt）：挂载时不重签，失败判定才走「签名」那一支。
  const item = libraryItem("single_file_image", {
    preview: { url: "https://signed.test/sig-preview.png", expiresAt: future() },
  });
  bench.reset(NEVER_SETTLES);

  const mounted = await mountRendition(item);
  try {
    assert.equal(mounted.box.state.failure, null);

    for (const attempt of [1, 2, 3]) {
      await act(async () => mounted.box.state.resourceFailed());
      const failure = mounted.box.state.failure;
      assert.ok(failure, `第 ${attempt} 次失败没有落下失败态`);
      assert.equal(failure.kind, "signature", `第 ${attempt} 次该判成签名过期`);
      assert.equal(failure.attempts, attempt);
      assert.equal(
        failure.exhausted,
        false,
        `第 ${attempt} 次就宣告用尽——退避预算少于三次`,
      );
    }

    // 第四次：退避表用尽，停下来，把决定权交回用户。
    await act(async () => mounted.box.state.resourceFailed());
    assert.equal(mounted.box.state.failure.kind, "signature");
    assert.equal(mounted.box.state.failure.attempts, 3);
    assert.equal(
      mounted.box.state.failure.exhausted,
      true,
      "第四次仍未 exhausted——自动重试没有上限，网关会被打爆",
    );

    // 再多按几次也不许把预算涨回去。
    await act(async () => mounted.box.state.resourceFailed());
    assert.equal(mounted.box.state.failure.attempts, 3);
    assert.equal(mounted.box.state.failure.exhausted, true);

    // 失败面上那个按钮必须真的还能再试一次，否则它是句空话。
    const before = bench.calls.length;
    await act(async () => mounted.box.state.retry());
    assert.equal(mounted.box.state.failure, null, "retry() 没有清掉失败态");
    assert.ok(
      bench.calls.length > before,
      "retry() 没有真的再发一次重签——按钮是空的",
    );
  } finally {
    await mounted.unmount();
  }
});

test("资源档之一：没有 expiresAt 的地址失败，一次重签都不发", async () => {
  // 不是签名地址 ⇒ 没有签名可换 ⇒ 重签是白跑。
  const item = libraryItem("single_file_image", {
    preview: { url: "https://cdn.test/public-preview.png", expiresAt: null },
  });
  bench.reset(NEVER_SETTLES);

  const mounted = await mountRendition(item);
  try {
    assert.equal(bench.calls.length, 0);
    await act(async () => mounted.box.state.resourceFailed());
    const failure = mounted.box.state.failure;
    assert.ok(failure);
    assert.equal(failure.kind, "resource", "没有签名可换却判成了签名过期");
    assert.equal(failure.exhausted, true, "资源档必须直接停手");
    assert.equal(
      bench.calls.length,
      0,
      "资源不存在却发了重签请求——用户会一直点重试",
    );

    // 再失败几次也不许改判、更不许开始重签。
    await act(async () => mounted.box.state.resourceFailed());
    await act(async () => mounted.box.state.resourceFailed());
    assert.equal(mounted.box.state.failure.kind, "resource");
    assert.equal(bench.calls.length, 0);
  } finally {
    await mounted.unmount();
  }
});

test("资源档之二：刚换发的新地址同样打不开 ⇒ resource + exhausted，且不再重签", async () => {
  const item = libraryItem("single_file_image", {
    preview: { url: "https://signed.test/expired-preview.png", expiresAt: past() },
  });
  bench.reset((identity, purpose) =>
    Promise.resolve({
      ok: true,
      status: 200,
      data: {
        purpose,
        revisionId: identity.revisionId,
        url: "https://signed.test/resigned-preview.png",
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
    // 前提：确实换发过一次，手里拿的是那个新地址。
    assert.equal(bench.calls.length, 1);
    assert.equal(mounted.box.state.url, "https://signed.test/resigned-preview.png");

    await act(async () => mounted.box.state.resourceFailed());
    const failure = mounted.box.state.failure;
    assert.ok(failure);
    assert.equal(
      failure.kind,
      "resource",
      "刚换发的地址又挂了，问题不在签名，不该继续判成签名过期",
    );
    assert.equal(failure.exhausted, true);
    assert.equal(
      bench.calls.length,
      1,
      "证明了重签没用之后还在重签——这正是 P3 要消灭的死循环",
    );

    // 给退避表最长的一档留出富余：真要有自动重试，这段时间足够它跑掉。
    await new Promise((resolve) => setTimeout(resolve, 700));
    assert.equal(
      bench.calls.length,
      1,
      "资源档之后仍有计时器在自动重签",
    );
    assert.equal(mounted.box.state.failure.kind, "resource");
  } finally {
    await mounted.unmount();
  }
});

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
    "video_canvas",
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
