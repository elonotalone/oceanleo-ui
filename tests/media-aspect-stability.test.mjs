// ============================================================================
// W07 P5-a — 素材几何在图片加载前后不动（CLS 的机检形式）
// ----------------------------------------------------------------------------
// 四组判据，各自锁一件事：
//
//   ①「不许留 0 高度」是形式保证，不是希望。`artifactMediaGeometry()` 的三条取值
//     路（rendition 自报 → artifactType 默认 → 4:3 兜底）在任何输入下都必须给出
//     有限正数比例，`mediaFrameStyle()` 必须把它写成一个正的 `aspect-ratio`。
//     **删掉 `mediaFrameStyle` 里的 `aspectRatio` 这一条就当场红。**
//   ② 查看器侧：`ProgressiveArtifactImage` 的媒体框在 `<img>` 的 `load` 前后几何
//     逐字不变，而渐进档位**必须**变——档位不变就说明 load 没真的发生，
//     那样「几何没变」是句空话。
//   ③ 卡片侧：`data-cover-aspect` 在 `load` / `error` 前后都不变。这就是与 W06
//     的接缝（虚拟化行高缓存要求卡片高度在整个生命周期恒定）的机器证据。
//   ④ `library-viewer-first-paint.tsx` 里的 `KIND_TO_ARTIFACT_TYPE` 副本与
//     `library-data.ts` 的 `artifactTypeForLibraryKind()` **逐字一致**。
//
// ④ 为什么必须有：first-paint 对 `./library-data` 只能有**类型依赖**。改成值依赖
// 会让 `material-cover-rendering` / `artifact-surface-rendered` / `material-library-scope`
// 三份测试在加载期整例炸掉——它们一边编译 `workspace-library-thumbnail.tsx`、
// 一边把 `"./library-data"` 换成只导出 `isDurableLibraryItem` 的桩，新增的那条值边
// 会去桩里找一个它没有的导出。那三份不在 W07 的独占面上，不许改它们的桩，
// 于是 first-paint 里留了一份副本，一致性由这里锁死。
//
// 顺带一层保险：下面 ③ 用的就是**同一副桩**（`./library-data` 只有
// `isDurableLibraryItem`），所以值依赖一旦被重新引入，本文件自己也会红。
// 那颗地雷因此在 W07 自己的面上有了引信，而不是只有别人的文件会炸。
//
// ⚠️ jsdom 的 CSSOM 实测（本波，`cssstyle`）：
//   `aspect-ratio` **不进** `style` 属性，`getPropertyValue("aspect-ratio")` 是空串；
//   `width: min(100%, …vh)` 同样被整条丢掉；只有 `max-width` 留得下来。
//   值仍然读得到，但只能走 camelCase 的 `el.style.aspectRatio`。
//   所以下面读几何一律用 camel 访问器，**不要**改成 `getAttribute("style")`——
//   那样读到的字符串里压根没有 aspect-ratio，比对就变成两个空值相等，
//   删掉 `aspectRatio` 也不会红。
// ============================================================================

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import ts from "typescript";

import {
  MATERIAL_CATALOG_TYPES,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import {
  artifactProjectionToLibraryItem,
  artifactTypeForLibraryKind,
} from "../src/shell/library-data.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** `LibraryKind` 的全集（`library-data.ts:21-50`）。副本比对逐个走这 15 个。 */
const LIBRARY_KINDS = [
  "website",
  "canvas",
  "ppt",
  "sheet",
  "document",
  "image",
  "video",
  "video_canvas",
  "audio",
  "xhs",
  "threed",
  "game",
  "geo_map",
  "interactive_doc",
  "file",
];

const uiStubUrl = dataModule(`
  export function useUI() { return (value) => value; }
`);

const firstPaintUrl = await compileModule(
  "src/shell/library-viewer-first-paint.tsx",
  { "../i18n/ui/useUI": uiStubUrl },
);
const {
  ProgressiveArtifactImage,
  artifactMediaGeometry,
  libraryMediaGeometry,
  lqipColorFromDigest,
  mediaFrameStyle,
} = await import(firstPaintUrl);

// ---------------------------------------------------------------------------
// ① 纯函数：任何输入都给有限正数比例
// ---------------------------------------------------------------------------

function assertUsableGeometry(geometry, label) {
  assert.equal(typeof geometry.ratio, "number", `${label} ratio 不是数字`);
  assert.ok(
    Number.isFinite(geometry.ratio),
    `${label} ratio 不是有限数：${geometry.ratio}`,
  );
  assert.ok(geometry.ratio > 0, `${label} ratio 不是正数：${geometry.ratio}`);
  const declared = Number(geometry.aspectRatio);
  assert.ok(
    Number.isFinite(declared) && declared > 0,
    `${label} aspectRatio 写不出正数：${JSON.stringify(geometry.aspectRatio)}`,
  );
  assert.equal(declared, geometry.ratio, `${label} aspectRatio 与 ratio 不一致`);
  assert.equal(typeof geometry.lqipColor, "string", `${label} lqipColor 类型`);
  assert.ok(geometry.lqipColor.length > 0, `${label} lqipColor 为空`);
}

/**
 * 媒体框样式里**影响几何**的那几条。`aspectRatio` 是「不许留 0 高度」的载体，
 * 所以它缺席、为空、或者算不出正数，这里都必须红。
 */
function assertUsableFrameStyle(style, label) {
  const declared = Number(style.aspectRatio);
  assert.ok(
    style.aspectRatio !== undefined && style.aspectRatio !== "",
    `${label} mediaFrameStyle 没有 aspectRatio——媒体框会退回内容高度，CLS 当场回归`,
  );
  assert.ok(
    Number.isFinite(declared) && declared > 0,
    `${label} aspectRatio 不是正数：${JSON.stringify(style.aspectRatio)}`,
  );
  assert.equal(typeof style.width, "string", `${label} width 类型`);
  assert.ok(style.width.length > 0, `${label} width 表达式为空`);
  assert.ok(
    style.width.includes("min(100%"),
    `${label} width 不再收在容器宽以内：${style.width}`,
  );
  assert.equal(typeof style.maxWidth, "string", `${label} maxWidth 类型`);
  assert.ok(style.maxWidth.length > 0, `${label} maxWidth 为空`);
  assert.equal(style.position, "relative", `${label} 媒体框必须是定位父级`);
  assert.equal(style.overflow, "hidden", `${label} 媒体框必须裁掉溢出`);
  assert.ok(
    String(style.backgroundColor || "").length > 0,
    `${label} 没有第一级占位色`,
  );
}

test("每个 artifactType 与每个 LibraryKind 都拿得到正比例", () => {
  assert.equal(MATERIAL_CATALOG_TYPES.length, 16);
  for (const artifactType of MATERIAL_CATALOG_TYPES) {
    const geometry = artifactMediaGeometry({ artifactType });
    assertUsableGeometry(geometry, `artifactType=${artifactType}`);
    assertUsableFrameStyle(
      mediaFrameStyle(geometry),
      `artifactType=${artifactType}`,
    );
  }
  for (const kind of LIBRARY_KINDS) {
    const geometry = artifactMediaGeometry({ kind });
    assertUsableGeometry(geometry, `kind=${kind}`);
    assertUsableFrameStyle(mediaFrameStyle(geometry), `kind=${kind}`);
  }
  // 认不出类型时也要有形状，否则「兜底」这条路是空的。
  assertUsableGeometry(artifactMediaGeometry({}), "空输入");
  assertUsableGeometry(
    artifactMediaGeometry({ artifactType: "no_such_type" }),
    "未知 artifactType",
  );
});

test("width/height 缺席、为 0、为 NaN、为负、为字符串时仍是有限正数", () => {
  const degenerate = [
    ["rendition 缺席", undefined],
    ["rendition 为 null", null],
    ["空 rendition", {}],
    ["宽高都 0", { width: 0, height: 0 }],
    ["宽 0", { width: 0, height: 480 }],
    ["高 0", { width: 640, height: 0 }],
    ["宽高都 NaN", { width: Number.NaN, height: Number.NaN }],
    ["高 NaN", { width: 640, height: Number.NaN }],
    ["宽 Infinity", { width: Number.POSITIVE_INFINITY, height: 480 }],
    ["高 Infinity", { width: 640, height: Number.POSITIVE_INFINITY }],
    ["宽高为负", { width: -640, height: -480 }],
    ["高为负", { width: 640, height: -480 }],
    ["宽高是字符串", { width: "640", height: "480" }],
    ["宽高是 null", { width: null, height: null }],
  ];
  for (const [label, rendition] of degenerate) {
    for (const artifactType of ["single_file_image", "deck", "no_such_type"]) {
      const geometry = artifactMediaGeometry({ rendition, artifactType });
      assertUsableGeometry(geometry, `${label} / ${artifactType}`);
      assertUsableFrameStyle(
        mediaFrameStyle(geometry),
        `${label} / ${artifactType}`,
      );
      // 量不出来就必须自陈量不出来，否则调用方会把兜底比例当成真比例用。
      assert.equal(
        geometry.measured,
        false,
        `${label} / ${artifactType} 不该自称 measured`,
      );
      assert.equal(
        geometry.intrinsicWidth,
        0,
        `${label} / ${artifactType} 不该报 intrinsicWidth`,
      );
    }
  }
});

test("rendition 自报的宽高优先于类型默认比例", () => {
  const geometry = artifactMediaGeometry({
    rendition: { width: 1600, height: 1000 },
    // 默认比例是 16/9；自报值必须赢，否则 P1 的第一条取值路是死的。
    artifactType: "deck",
  });
  assertUsableGeometry(geometry, "自报宽高");
  assert.equal(geometry.ratio, 1.6);
  assert.equal(geometry.measured, true);
  assert.equal(geometry.intrinsicWidth, 1600);
  // 自报像素宽要收住 maxWidth，免得把一张小图拉满整屏。
  assert.equal(mediaFrameStyle(geometry).maxWidth, "min(100%, 1600px)");

  // 类型默认比例这条路也要真的按类型分档，不能全塌成一个数。
  assert.notEqual(
    artifactMediaGeometry({ artifactType: "deck" }).ratio,
    artifactMediaGeometry({ artifactType: "document" }).ratio,
  );
});

test("LQIP 颜色只从 digest 派生，稳定且对坏输入不炸", () => {
  const digest = "sha256:3f9a1c7d55aa00ff";
  assert.equal(lqipColorFromDigest(digest), lqipColorFromDigest(digest));
  assert.match(lqipColorFromDigest(digest), /^hsl\(/);
  // 大小写与前缀不该换掉一件素材的占位色。
  assert.equal(
    lqipColorFromDigest(digest),
    lqipColorFromDigest("3F9A1C7D55AA00FF"),
  );
  assert.notEqual(
    lqipColorFromDigest("3f9a1c7d55aa00ff"),
    lqipColorFromDigest("aaaaaaaaaaaaaaaa"),
  );
  for (const bad of [undefined, null, "", "  ", "zzzz", "abc", 12345, {}]) {
    const color = lqipColorFromDigest(bad);
    assert.equal(typeof color, "string");
    assert.ok(color.length > 0, `坏 digest ${JSON.stringify(bad)} 没有兜底色`);
  }
});

// ---------------------------------------------------------------------------
// ④ KIND_TO_ARTIFACT_TYPE 副本一致性
// ---------------------------------------------------------------------------

/**
 * 用 AST 把 first-paint 里那份副本读出来。
 *
 * 刻意不 export 它再 import：那会给这个模块加一条公共 API，而 `api:check` 的快照
 * 不在 W07 的独占面上。也刻意不用 grep —— 本波已经有三次「零命中是正则用错」的
 * 记录（`_COMMON.md §7b③`），结构化的东西就该用结构化的方式读。
 */
function kindToArtifactTypeCopy() {
  const file = resolve(REPO, "src/shell/library-viewer-first-paint.tsx");
  const text = readFileSync(file, "utf8");
  const source = ts.createSourceFile(
    file,
    text,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let literal = null;
  const visit = (node) => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === "KIND_TO_ARTIFACT_TYPE" &&
      node.initializer
    ) {
      let init = node.initializer;
      while (
        ts.isAsExpression(init) ||
        ts.isSatisfiesExpression(init) ||
        ts.isParenthesizedExpression(init)
      ) {
        init = init.expression;
      }
      if (ts.isObjectLiteralExpression(init)) literal = init;
    }
    ts.forEachChild(node, visit);
  };
  visit(source);
  assert.ok(
    literal,
    "library-viewer-first-paint.tsx 里找不到 KIND_TO_ARTIFACT_TYPE 的对象字面量。" +
      "若是改成了从 library-data 直接 import：那正是被禁的那条值依赖，" +
      "会让 material-cover-rendering / artifact-surface-rendered / material-library-scope 整例炸掉。",
  );
  const map = new Map();
  for (const property of literal.properties) {
    assert.ok(
      ts.isPropertyAssignment(property),
      "副本里出现了展开或简写属性，逐字比对失效",
    );
    const name = property.name;
    assert.ok(
      ts.isIdentifier(name) || ts.isStringLiteral(name),
      "副本里出现了计算属性名，逐字比对失效",
    );
    assert.ok(
      ts.isStringLiteral(property.initializer),
      `副本里 ${name.text} 的值不是字符串字面量`,
    );
    assert.ok(!map.has(name.text), `副本里 ${name.text} 重复`);
    map.set(name.text, property.initializer.text);
  }
  return map;
}

test("first-paint 的 KIND_TO_ARTIFACT_TYPE 副本与 artifactTypeForLibraryKind() 逐字一致", () => {
  const copy = kindToArtifactTypeCopy();
  // 少一个 kind 就意味着那个 kind 在 first-paint 里拿不到类型默认比例。
  assert.deepEqual(
    [...copy.keys()].sort(),
    [...LIBRARY_KINDS].sort(),
    "副本覆盖的 kind 与 LibraryKind 全集不一致",
  );
  for (const kind of LIBRARY_KINDS) {
    assert.equal(
      copy.get(kind),
      artifactTypeForLibraryKind(kind),
      `kind=${kind} 的副本值与 library-data 的原函数不一致`,
    );
  }
});

test("副本的行为侧交叉验证：按 kind 与按 artifactType 取到同一块地", () => {
  for (const kind of LIBRARY_KINDS) {
    const byKind = artifactMediaGeometry({ kind });
    const byType = artifactMediaGeometry({
      artifactType: artifactTypeForLibraryKind(kind),
    });
    assert.equal(byKind.ratio, byType.ratio, `kind=${kind} 两条路取值不同`);
  }
});

// ---------------------------------------------------------------------------
// DOM 台：`material-cover-rendering.test.mjs:801` 的现成模板，照抄
// ---------------------------------------------------------------------------

/**
 * jsdom 只能从 fabric 的 node_modules 里拿到（不是本仓直接依赖），而 fabric/node
 * 会去 require 原生 `canvas`。先往 require.cache 里塞一个空壳把那次原生加载挡掉，
 * 拿到 JSDOM 之后再把 cache 恢复原样。
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

/**
 * 一个元素身上**影响几何**的读数。
 *
 * `aspectRatio` 走 camel 访问器：jsdom 的 cssstyle 不实现 `aspect-ratio`，
 * 它既不进 `style` 属性也读不出 `getPropertyValue`（本波实测），但 camel 属性
 * 上的值是在的。改成读属性字符串会让这份比对变成空值相等。
 */
function geometryReading(element) {
  return {
    aspectRatio: element.style.aspectRatio,
    maxWidth: element.style.maxWidth,
    measured: element.getAttribute("data-media-frame-measured"),
  };
}

function positiveAspect(reading, label) {
  const declared = Number(reading.aspectRatio);
  assert.ok(
    reading.aspectRatio !== undefined && reading.aspectRatio !== "",
    `${label} 媒体框没有 aspect-ratio——加载前没有占位，CLS 回归`,
  );
  assert.ok(
    Number.isFinite(declared) && declared > 0,
    `${label} aspect-ratio 不是正数：${JSON.stringify(reading.aspectRatio)}`,
  );
}

// ---------------------------------------------------------------------------
// ② 查看器侧：ProgressiveArtifactImage 的框在 load 前后不动
// ---------------------------------------------------------------------------

test("查看器媒体框的几何在 img load 前后逐字相等，而渐进档位必须前进", async () => {
  const { window, document } = await bootstrapDom();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  const geometry = artifactMediaGeometry({
    rendition: {
      width: 1600,
      height: 1000,
      digest: "sha256:3f9a1c7d55aa00ff",
    },
    artifactType: "geo_map",
  });
  assert.equal(geometry.measured, true);

  try {
    await act(async () =>
      root.render(
        React.createElement(ProgressiveArtifactImage, {
          thumbUrl: "https://signed.test/geo-thumb.webp",
          fullUrl: "https://signed.test/geo-full.png",
          alt: "geo map",
          geometry,
        }),
      ),
    );
    const frame = container.querySelector('[data-media-frame="progressive"]');
    assert.ok(frame, "媒体框没渲染出来");

    const before = geometryReading(frame);
    const stageBefore = frame.getAttribute("data-progressive-stage");
    // 加载之前就必须已经占好地——这是 P1 的全部意义。
    positiveAspect(before, "load 之前");
    assert.equal(stageBefore, "lqip", "第一帧应停在纯色占位那一级");

    const image = container.querySelector("img");
    assert.ok(image, "渐进图的 img 没渲染出来");
    await act(async () =>
      image.dispatchEvent(new window.Event("load", { bubbles: true })),
    );

    const after = geometryReading(frame);
    const stageAfter = frame.getAttribute("data-progressive-stage");

    // 这一条是「load 真的发生了」的证据。它不成立时，下面那条「几何没变」
    // 就是一句空话——什么都没变当然什么都没动。
    assert.notEqual(
      stageAfter,
      stageBefore,
      "load 之后渐进档位没变，说明这次比对根本没经过一次加载",
    );
    assert.equal(stageAfter, "thumbnail");

    positiveAspect(after, "load 之后");
    assert.deepEqual(
      after,
      before,
      "img load 前后媒体框的几何变了——这正是 CLS",
    );
    // 比例来自 rendition 自报的 1600×1000，不是兜底值。
    assert.equal(Number(after.aspectRatio), 1.6);
    assert.equal(after.measured, "true");
  } finally {
    await act(async () => root.unmount());
  }
});

test("缺 width/height 时查看器媒体框仍在加载前占好地且高度非 0", async () => {
  const { window, document } = await bootstrapDom();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  // 一份什么都没量出来的 rendition：必须走 artifactType 默认比例。
  const geometry = artifactMediaGeometry({
    rendition: { width: 0, height: 0 },
    artifactType: "deck",
  });
  assert.equal(geometry.measured, false);

  try {
    await act(async () =>
      root.render(
        React.createElement(ProgressiveArtifactImage, {
          thumbUrl: "https://signed.test/deck-thumb.webp",
          fullUrl: "https://signed.test/deck-full.png",
          alt: "deck",
          geometry,
        }),
      ),
    );
    const frame = container.querySelector('[data-media-frame="progressive"]');
    assert.ok(frame);
    const before = geometryReading(frame);
    positiveAspect(before, "缺宽高 / load 之前");
    assert.equal(before.measured, "false");
    assert.equal(Number(before.aspectRatio), 16 / 9);

    const image = container.querySelector("img");
    await act(async () =>
      image.dispatchEvent(new window.Event("load", { bubbles: true })),
    );
    assert.deepEqual(geometryReading(frame), before, "兜底比例也不许在加载后变");
  } finally {
    await act(async () => root.unmount());
  }
});

// ---------------------------------------------------------------------------
// ③ 卡片侧：data-cover-aspect 不依赖图片加载结果（与 W06 的接缝）
// ---------------------------------------------------------------------------

const SOURCE_FORMATS = {
  single_file_image: "png",
  deck: "pptx",
  geo_map: "oceanleo.geo-map.v1",
};

function projection(artifactType, renditionOverrides = {}) {
  const revisionId = `r-${artifactType}`;
  return {
    schema: "oceanleo.artifact.v1",
    artifact_id: `artifact-${artifactType}`,
    revision_id: revisionId,
    artifact_type: artifactType,
    roles: ["template"],
    title: artifactType,
    favorite: false,
    owner: {
      principal_id: "w07-aspect",
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
    source_format: SOURCE_FORMATS[artifactType],
    renditions: {
      thumbnail: {
        purpose: "thumbnail",
        revision_id: revisionId,
        url: `https://signed.test/${artifactType}-thumb.webp`,
        media_type: "image/webp",
        format: "webp",
        width: 640,
        height: 480,
        byte_size: 48_000,
        digest: "sha256:3f9a1c7d55aa00ff",
        ...renditionOverrides,
      },
      preview: {
        purpose: "preview",
        revision_id: revisionId,
        url: `https://signed.test/${artifactType}-preview.png`,
        media_type: "image/png",
        format: "png",
        width: 1280,
        height: 960,
        byte_size: 120_000,
      },
    },
    provenance: {
      id: `provenance-${artifactType}`,
      source_kind: "owned",
      license_code: "owned",
    },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
  };
}

function normalizedItem(artifactType, renditionOverrides) {
  const artifact = normalizeArtifactProjection(
    projection(artifactType, renditionOverrides),
  );
  assert.ok(artifact, artifactType);
  return artifactProjectionToLibraryItem(artifact);
}

/**
 * `WorkspaceThumbnail` 的挂载台。
 *
 * `./library-data` 的桩**只导出 `isDurableLibraryItem`**，与
 * `material-cover-rendering` / `artifact-surface-rendered` 完全一致。这是刻意的：
 * `library-viewer-first-paint.tsx` 一旦对 `./library-data` 加回值依赖，
 * 这个桩里找不到那个导出，本文件会和那两份一起红。
 */
async function bootstrapThumbnailDom() {
  const dom = await bootstrapDom();
  const coverModuleUrl = await compileModule(
    "src/shell/workspace-library-cover.tsx",
  );
  const thumbnailUrl = await compileModule(
    "src/shell/workspace-library-thumbnail.tsx",
    {
      "../i18n/ui/useUI": uiStubUrl,
      "../lib/database": dataModule(`
        export async function ensureDatabaseThumbnail() {
          return { ok: false, error: "not used" };
        }
      `),
      "./advanced-features": dataModule(`
        export function advancedLibraryReferenceFor() { return null; }
      `),
      "./ArtifactRendition": dataModule(`
        export function useArtifactRendition() {
          return globalThis.__w07RenditionState;
        }
      `),
      "./library-data": dataModule(`
        export function isDurableLibraryItem(item) {
          return Boolean(item?.artifactId && item?.revisionId && item?.artifact);
        }
      `),
      "./workspace-library-cover": coverModuleUrl,
      "./workspace-library-model": dataModule(`
        export const WORKSPACE_KIND_LABELS = {
          image: "图片", video: "视频", document: "文档", website: "网站",
          canvas: "画布", threed: "3D", file: "文件", ppt: "演示",
          sheet: "表格", geo_map: "地图", interactive_doc: "交互文档",
          game: "游戏", audio: "音频", xhs: "笔记", video_canvas: "视频画布"
        };
      `),
    },
  );
  const { WorkspaceThumbnail } = await import(thumbnailUrl);
  return { ...dom, WorkspaceThumbnail };
}

test("卡片的 data-cover-aspect 在 load / error 前后都不变（W06 行高缓存的接缝）", async () => {
  const { window, document, WorkspaceThumbnail } =
    await bootstrapThumbnailDom();
  const item = normalizedItem("single_file_image");
  globalThis.__w07RenditionState = {
    url: item.artifact.renditions.thumbnail.url,
    purpose: "thumbnail",
    rendition: item.artifact.renditions.thumbnail,
    loading: false,
    error: "",
    version: 0,
    failure: null,
    retry() {},
    resourceFailed() {},
  };

  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props = {
    item,
    url: item.thumbUrl,
    alt: "aspect stability cover",
    kind: "image",
    accent: "#4f46e5",
    imageClassName: "h-full w-full object-cover",
  };

  const readCover = () => {
    const host = container.querySelector("[data-cover-aspect]");
    assert.ok(host, "卡片宿主没有 data-cover-aspect");
    return {
      aspect: host.getAttribute("data-cover-aspect"),
      measured: host.getAttribute("data-cover-aspect-measured"),
      inline: host.style.aspectRatio,
    };
  };

  try {
    await act(async () =>
      root.render(React.createElement(WorkspaceThumbnail, props)),
    );
    const before = readCover();
    // 第一帧就要有比例：卡片高度不许等图片回来才定得下来。
    assert.ok(
      Number.isFinite(Number(before.aspect)) && Number(before.aspect) > 0,
      `第一帧没有可用比例：${JSON.stringify(before.aspect)}`,
    );
    assert.equal(before.measured, "true");
    assert.equal(Number(before.aspect), 640 / 480);

    const image = container.querySelector("img");
    assert.ok(image, "封面 img 没渲染出来");

    await act(async () =>
      image.dispatchEvent(new window.Event("load", { bubbles: true })),
    );
    const afterLoad = readCover();
    assert.deepEqual(
      afterLoad,
      before,
      "图片 load 之后卡片比例变了——W06 的虚拟化行高缓存会被打乱",
    );

    await act(async () =>
      image.dispatchEvent(new window.Event("error", { bubbles: true })),
    );
    const afterError = readCover();
    assert.deepEqual(
      afterError,
      before,
      "图片 error 之后卡片比例变了——失败态也不许改变已占好的地",
    );
  } finally {
    await act(async () => root.unmount());
    delete globalThis.__w07RenditionState;
  }
});

test("卡片在 rendition 没有宽高时也有非 0 比例，且仍不依赖加载结果", async () => {
  const { window, document, WorkspaceThumbnail } =
    await bootstrapThumbnailDom();
  // 宽高都抹掉：卡片必须退到 artifactType 默认比例，而不是留 0 高度。
  const item = normalizedItem("deck", { width: 0, height: 0 });
  globalThis.__w07RenditionState = {
    url: item.artifact.renditions.thumbnail.url,
    purpose: "thumbnail",
    rendition: item.artifact.renditions.thumbnail,
    loading: false,
    error: "",
    version: 0,
    failure: null,
    retry() {},
    resourceFailed() {},
  };

  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);

  try {
    await act(async () =>
      root.render(
        React.createElement(WorkspaceThumbnail, {
          item,
          url: item.thumbUrl,
          alt: "deck cover",
          kind: "ppt",
          accent: "#4f46e5",
          imageClassName: "h-full w-full object-cover",
        }),
      ),
    );
    const host = container.querySelector("[data-cover-aspect]");
    assert.ok(host);
    const before = host.getAttribute("data-cover-aspect");
    assert.equal(Number(before), 16 / 9, "deck 没走 16:9 默认比例");
    assert.equal(host.getAttribute("data-cover-aspect-measured"), "false");

    const image = container.querySelector("img");
    if (image) {
      await act(async () =>
        image.dispatchEvent(new window.Event("load", { bubbles: true })),
      );
      assert.equal(
        host.getAttribute("data-cover-aspect"),
        before,
        "兜底比例在加载后变了",
      );
    }
  } finally {
    await act(async () => root.unmount());
    delete globalThis.__w07RenditionState;
  }
});

test("libraryMediaGeometry 从 LibraryItem 的投影里取比例，不碰活状态", () => {
  const item = normalizedItem("single_file_image");
  const byUrl = libraryMediaGeometry(item, item.artifact.renditions.thumbnail.url);
  assertUsableGeometry(byUrl, "按 thumbnail url");
  assert.equal(byUrl.ratio, 640 / 480);
  assert.equal(byUrl.measured, true);

  // 认不出来的地址退回 thumbnail/preview 的元数据，仍旧给得出正比例。
  const byUnknown = libraryMediaGeometry(item, "https://signed.test/nope.png");
  assertUsableGeometry(byUnknown, "未知 url");
  assert.equal(byUnknown.measured, true);
});
