import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  MATERIAL_CATALOG_TYPES,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import {
  artifactProjectionToLibraryItem,
} from "../src/shell/library-data.ts";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

const coverModuleUrl = await compileModule(
  "src/shell/workspace-library-cover.tsx",
);
const {
  WorkspaceCoverResource,
  workspaceCoverPlan,
  workspaceCoverRenditionPurposes,
  coverEvidenceOf,
  coverEvidenceReportOf,
  isSourceAliasRendition,
} = await import(coverModuleUrl);

const SOURCE_FORMATS = {
  single_file_image: "png",
  composite_image: "fabric-json",
  vector_image: "svg",
  chart: "echarts-option+json",
  document: "docx",
  grid: "xlsx",
  deck: "pptx",
  pdf: "pdf",
  website: "html",
  video: "mp4",
  audio: "mp3",
  model_3d: "glb",
  workflow: "oceanleo.workflow.v1",
  game: "oceanleo.game-bundle.v1",
  geo_map: "oceanleo.geo-map.v1",
  interactive_doc: "oceanleo.interactive-doc.v1",
};

const EXPECTED_KINDS = {
  single_file_image: "image",
  composite_image: "image",
  vector_image: "image",
  chart: "image",
  document: "document",
  grid: "sheet",
  deck: "ppt",
  pdf: "document",
  website: "website",
  video: "video",
  audio: "audio",
  model_3d: "threed",
  workflow: "canvas",
  game: "game",
  geo_map: "geo_map",
  interactive_doc: "interactive_doc",
};

function projection(artifactType) {
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
      principal_id: "cover-proof",
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
      full: {
        purpose: "full",
        revision_id: revisionId,
        url: `https://signed.test/${artifactType}-full`,
        media_type: "application/octet-stream",
        format: SOURCE_FORMATS[artifactType],
        byte_size: 250_000,
      },
    },
    ...(artifactType === "composite_image"
      ? {
          source_manifest: {
            schema: "oceanleo.fabric.v1",
            scene_revision_id: revisionId,
            closure_status: "complete",
            closure_digest: "sha256:cover-proof",
            dependency_revision_ids: [],
          },
        }
      : {}),
    provenance: {
      id: `provenance-${artifactType}`,
      source_kind: "owned",
      license_code: "owned",
    },
    integrity: { ok: true, code: "ok", reason: "" },
    context_bindings: [],
  };
}

function normalizedItem(artifactType) {
  const artifact = normalizeArtifactProjection(projection(artifactType));
  assert.ok(artifact, artifactType);
  return artifactProjectionToLibraryItem(artifact);
}

test("all sixteen normalized catalog types retain real cover metadata and type-correct fit", () => {
  const preserveWhole = new Set([
    "composite_image",
    "vector_image",
    "chart",
    "document",
    "grid",
    "deck",
    "pdf",
    "website",
    "model_3d",
    "workflow",
    // 游戏封面是整幅关键美术，裁掉边缘等于把真实 rendition 换成假封面。
    "game",
    // 地图的图例与归属条、交互文档的参数区都贴在画面边缘，裁掉就等于换了张假封面。
    "geo_map",
    "interactive_doc",
  ]);
  // 目录呈现 16 类，但这一组原来循环的是 `ARTIFACT_TYPES`，那份名单只有 14 条 ——
  // 地图与交互文档只有浏览侧（`7bee5da` 提交了两个工作台的契约，实现从未落地），
  // 至今没有进入那份「有编辑/上传链路的 typed artifact」名单。于是这一组的
  // `SOURCE_FORMATS` / `EXPECTED_KINDS` / `preserveWhole` 里替这两类写好的三行
  // 从来没被跑到，而**封面恰恰是浏览侧的能力**：这两类在货架上照样要出真封面。
  // 改判据循环 `MATERIAL_CATALOG_TYPES`（14 + 2），16 这个数留在原处，覆盖面反而
  // 从 14 类补回 16 类。编辑器落地后两类并进 `ARTIFACT_TYPES`，这里逐字不动。
  assert.equal(MATERIAL_CATALOG_TYPES.length, 16);
  for (const artifactType of MATERIAL_CATALOG_TYPES) {
    const item = normalizedItem(artifactType);
    assert.equal(item.kind, EXPECTED_KINDS[artifactType], artifactType);
    assert.deepEqual(
      workspaceCoverRenditionPurposes(item).slice(0, 2),
      ["thumbnail", "preview"],
      artifactType,
    );
    const rendition = item.artifact.renditions.thumbnail;
    const plan = workspaceCoverPlan({
      item,
      kind: item.kind,
      url: rendition.url,
      rendition,
    });
    assert.equal(plan.renderer, "image", artifactType);
    assert.equal(plan.mediaType, "image/webp", artifactType);
    assert.equal(plan.sourceAspectRatio, 4 / 3, artifactType);
    assert.equal(
      plan.fit,
      preserveWhole.has(artifactType) ? "contain" : "cover",
      artifactType,
    );
    assert.equal(plan.failureReason, "", artifactType);
  }
});

test("cover selection skips source-shaped false previews and dispatches real media", () => {
  const model = normalizedItem("model_3d");
  model.artifact.renditions = {
    preview: model.artifact.renditions.preview,
    full: {
      ...model.artifact.renditions.full,
      mediaType: "model/gltf-binary",
      format: "glb",
    },
  };
  assert.deepEqual(workspaceCoverRenditionPurposes(model), ["preview"]);

  const mediaCases = [
    ["video", "video", "video/mp4", "mp4", "video"],
    ["pdf", "document", "application/pdf", "pdf", "pdf"],
    ["website", "website", "text/html; charset=utf-8", "html", "website"],
    ["workflow", "canvas", "text/html; charset=utf-8", "html", "website"],
    ["audio", "audio", "audio/mpeg", "mp3", "audio"],
  ];
  for (const [artifactType, kind, mediaType, format, renderer] of mediaCases) {
    const item = normalizedItem(artifactType);
    const rendition = {
      ...item.artifact.renditions.preview,
      mediaType,
      format,
      url: `https://signed.test/${artifactType}-real`,
    };
    const plan = workspaceCoverPlan({
      item,
      kind,
      url: rendition.url,
      rendition,
    });
    assert.equal(plan.renderer, renderer, artifactType);
  }

  for (const [artifactType, kind, mediaType, format] of [
    ["document", "document", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "docx"],
    ["model_3d", "threed", "model/gltf-binary", "glb"],
    ["composite_image", "image", "application/json", "fabric-json"],
  ]) {
    const item = normalizedItem(artifactType);
    const rendition = {
      ...item.artifact.renditions.full,
      mediaType,
      format,
      url: `https://signed.test/${artifactType}-source`,
    };
    const plan = workspaceCoverPlan({
      item,
      kind,
      url: rendition.url,
      rendition,
    });
    assert.equal(plan.renderer, "unavailable", artifactType);
    assert.match(plan.failureReason, /不能作为真实封面/);
  }
});

// 生产库实测形态（01-analysis-covers.md §4）：svg 平均 2,011 字节、最小 126；
// webp 平均 80,573 字节但 7,013 行 dimensions 全为 null。旧判据按 4096 字节下限
// 猜，把这两类一起判成占位图——本组按**值**锁死三态，改反必须变红。
test("封面判据按证据判三态，不按字节数猜", () => {
  const vector = normalizedItem("vector_image");
  const tinySvg = {
    ...vector.artifact.renditions.thumbnail,
    url: "https://signed.test/kenney-arrow.svg",
    mediaType: "image/svg+xml",
    format: "svg",
    rendererVersion: "kenney-material-catalog/source-v1",
    byteSize: 126,
    width: null,
    height: null,
  };
  assert.equal(coverEvidenceOf(tinySvg), "real");
  assert.equal(coverEvidenceReportOf(tinySvg).reason, "");
  const svgPlan = workspaceCoverPlan({
    item: vector,
    kind: "image",
    url: tinySvg.url,
    rendition: tinySvg,
  });
  assert.equal(svgPlan.renderer, "image");
  assert.equal(svgPlan.failureReason, "");
  assert.equal(svgPlan.coverEvidence, "real");
  // 矢量豁免有两条独立的入口，生产库两种形状都有：老行常常只有扩展名而没写
  // `media_type`，也有反过来只有 `media_type` 的。任一条断了都会让那 5 万份里的
  // 一整批重新掉回按位图判——所以两条各锁各的，不能只靠 OR 的另一边兜住。
  assert.equal(
    coverEvidenceOf({ ...tinySvg, mediaType: "", format: "svg" }),
    "real",
    "只有扩展名的 SVG 失去了矢量豁免",
  );
  assert.equal(
    coverEvidenceOf({ ...tinySvg, mediaType: "image/svg+xml", format: "" }),
    "real",
    "只有 media_type 的 SVG 失去了矢量豁免",
  );

  const image = normalizedItem("single_file_image");
  const unmeasuredWebp = {
    ...image.artifact.renditions.thumbnail,
    url: "https://signed.test/legacy-rehost.webp",
    mediaType: "image/webp",
    format: "webp",
    rendererVersion: "legacy-rehost-v1",
    byteSize: 80_573,
    width: null,
    height: null,
  };
  const webpReport = coverEvidenceReportOf(unmeasuredWebp);
  assert.equal(webpReport.evidence, "unknown-metadata");
  assert.equal(webpReport.code, "dimensions-missing");
  assert.equal(webpReport.reason, "封面尺寸信息缺失，已按原图显示。");
  const webpPlan = workspaceCoverPlan({
    item: image,
    kind: "image",
    url: unmeasuredWebp.url,
    rendition: unmeasuredWebp,
  });
  // 缺元数据的真图必须照常显示：renderer 不是 unavailable，且没有失败文案。
  assert.equal(webpPlan.renderer, "image");
  assert.equal(webpPlan.failureReason, "");
  assert.equal(webpPlan.coverEvidence, "unknown-metadata");
  assert.equal(webpPlan.evidenceReason, "封面尺寸信息缺失，已按原图显示。");
  // 1,394 字节（webp 实测最小值）同样不构成占位图证据。
  assert.equal(
    coverEvidenceOf({ ...unmeasuredWebp, byteSize: 1_394 }),
    "unknown-metadata",
  );
  // 尺寸补齐后升为 real——这正是 W2/W4 回填要达到的状态。
  assert.equal(
    coverEvidenceOf({ ...unmeasuredWebp, width: 640, height: 480 }),
    "real",
  );

  for (const [label, patch, code] of [
    [
      "shelf-fill 按名字自证",
      { rendererVersion: "library-form-shelf-fill/v1/thumbnail" },
      "synthetic-renderer",
    ],
    ["空载荷", { byteSize: 0 }, "empty-payload"],
    ["像素尺寸退化", { width: 1, height: 1 }, "degenerate-pixels"],
  ]) {
    const report = coverEvidenceReportOf({ ...unmeasuredWebp, ...patch });
    assert.equal(report.evidence, "proven-placeholder", label);
    assert.equal(report.code, code, label);
    assert.notEqual(report.reason, "", label);
  }
});

// 生产库里同一批 `library-form-shelf-fill/*` 也盖在真实音频 rendition 上。
// 名字自证只能拦图像形态，否则 7MB 的 mp3 会跟着一起被误杀。
test("名字自证的占位图判据只作用于图像形态的 rendition", () => {
  const audio = normalizedItem("audio");
  const realMp3 = {
    ...audio.artifact.renditions.preview,
    url: "https://signed.test/audio-real.mp3",
    mediaType: "audio/mpeg",
    format: "mp3",
    rendererVersion: "library-form-shelf-fill/v1/preview",
    byteSize: 7_134_741,
    width: null,
    height: null,
  };
  assert.equal(coverEvidenceOf(realMp3), "real");
  assert.equal(
    workspaceCoverPlan({
      item: audio,
      kind: "audio",
      url: realMp3.url,
      rendition: realMp3,
    }).renderer,
    "audio",
  );
});

// 「豁免」的条件是**证实是别的媒体形态**，不是「认不出形态」。生产库里
// `legacy-rehost-v1` 那 55,591 行有 84.7% 连 dimensions 都没有，媒体元数据同样可能
// 整条缺失；而 `workspaceCoverPlan` 会把没报 mediaType/format 的 thumbnail 当图片渲染。
// 认不出形态就放过去 = shelf-fill 占位图直接上货架，这正是 V1 要查的「判据被放水」。
test("认不出媒体形态的 shelf-fill 仍按图像 fail-closed 拦下", () => {
  const item = normalizedItem("single_file_image");
  const shapeless = {
    ...item.artifact.renditions.thumbnail,
    url: "https://signed.test/shelf-fill-shapeless",
    mediaType: "",
    format: "",
    rendererVersion: "library-form-shelf-fill/v1/thumbnail",
    byteSize: 20_480,
    width: null,
    height: null,
  };
  const report = coverEvidenceReportOf(shapeless);
  assert.equal(report.evidence, "proven-placeholder");
  assert.equal(report.code, "synthetic-renderer");
  // 无形态的 thumbnail 走的正是 `declaredThumbnail` 那条图片分支，所以必须判死到底：
  // renderer 落 unavailable，而且失败文案就是占位图那句，不是泛泛的「不能显示」。
  const plan = workspaceCoverPlan({
    item,
    kind: "image",
    url: shapeless.url,
    rendition: shapeless,
    assumeImage: true,
  });
  assert.equal(plan.renderer, "unavailable");
  assert.equal(plan.coverEvidence, "proven-placeholder");
  assert.equal(
    plan.failureReason,
    "这份封面是货架填充生成的占位图，不是素材本身。",
  );
});

// 四个 purpose 指向同一 blob 是生产库的常态（每 purpose 行数完全相同）。
// 别名要降级排序，但**不判失败**——判失败就是又一次把能看的图挡掉。
test("取封面优先真 thumbnail，同 blob 别名降级但不判失败", () => {
  const item = normalizedItem("single_file_image");
  const aliasDigest = "sha256:same-blob-for-every-purpose";
  const alias = (purpose, url) => ({
    ...item.artifact.renditions.thumbnail,
    purpose,
    url,
    mediaType: "image/png",
    format: "png",
    byteSize: 4_439,
    width: 512,
    height: 512,
    digest: aliasDigest,
  });
  item.artifact.renditions = {
    thumbnail: alias("thumbnail", "https://signed.test/alias-thumb.png"),
    preview: alias("preview", "https://signed.test/alias-preview.png"),
    full: alias("full", "https://signed.test/alias-full.png"),
    source: alias("source", "https://signed.test/alias-source.png"),
  };
  assert.equal(isSourceAliasRendition(item, "thumbnail"), true);
  assert.equal(isSourceAliasRendition(item, "preview"), true);
  // 全都是别名时次序不变：没有更好的候选，把封面挪到 full/source 反而会撞上更严的
  // 读取权限。别名仍然可显示——列表非空，thumbnail 也没有被判失败。
  assert.deepEqual(workspaceCoverRenditionPurposes(item), [
    "thumbnail",
    "preview",
    "full",
    "source",
  ]);
  assert.equal(
    workspaceCoverPlan({
      item,
      kind: "image",
      url: item.artifact.renditions.thumbnail.url,
      rendition: item.artifact.renditions.thumbnail,
    }).renderer,
    "image",
  );

  // W2/W4 写进真正独立的封面 blob 后，它必须排到别名前面。
  const dedicated = {
    url: "https://signed.test/real-cover.webp",
    mediaType: "image/webp",
    format: "webp",
    digest: "sha256:dedicated-cover-blob",
    rendererVersion: "oceanleo-material-cover/raster-v1",
    width: 640,
    height: 480,
  };
  item.artifact.renditions.preview = {
    ...item.artifact.renditions.preview,
    ...dedicated,
  };
  assert.equal(isSourceAliasRendition(item, "preview"), false);
  assert.deepEqual(workspaceCoverRenditionPurposes(item), [
    "preview",
    "thumbnail",
    "full",
    "source",
  ]);

  item.artifact.renditions.thumbnail = {
    ...item.artifact.renditions.thumbnail,
    ...dedicated,
    url: "https://signed.test/real-thumb.webp",
    digest: "sha256:dedicated-thumbnail-blob",
  };
  assert.equal(isSourceAliasRendition(item, "thumbnail"), false);
  assert.deepEqual(workspaceCoverRenditionPurposes(item), [
    "thumbnail",
    "preview",
    "full",
    "source",
  ]);
});

test("shelf-fill and undersized flat posters never count as successful covers", () => {
  const audio = normalizedItem("audio");
  const solidThumb = {
    ...audio.artifact.renditions.thumbnail,
    url: "https://signed.test/audio-shelf-fill.png",
    mediaType: "image/png",
    format: "png",
    rendererVersion: "library-form-shelf-fill/v1/thumbnail",
    byteSize: 1212,
    width: null,
    height: null,
  };
  const audioPreview = {
    ...audio.artifact.renditions.preview,
    url: "https://signed.test/audio-real.mp3",
    mediaType: "audio/mpeg",
    format: "mp3",
    rendererVersion: "library-form-shelf-fill/v1/preview",
    byteSize: 7_134_741,
    width: null,
    height: null,
  };
  audio.artifact.renditions = {
    thumbnail: solidThumb,
    preview: audioPreview,
  };
  assert.equal(coverEvidenceOf(solidThumb), "proven-placeholder");
  assert.equal(
    workspaceCoverPlan({
      item: audio,
      kind: "audio",
      url: solidThumb.url,
      rendition: solidThumb,
    }).renderer,
    "unavailable",
  );
  assert.deepEqual(workspaceCoverRenditionPurposes(audio), ["preview"]);
  assert.equal(
    workspaceCoverPlan({
      item: audio,
      kind: "audio",
      url: audioPreview.url,
      rendition: audioPreview,
    }).renderer,
    "audio",
  );

  const document = normalizedItem("document");
  const flatDoc = {
    ...document.artifact.renditions.thumbnail,
    url: "https://signed.test/doc-flat.png",
    mediaType: "image/png",
    format: "png",
    rendererVersion: "library-form-shelf-fill/v1/thumbnail",
    byteSize: 1212,
    width: null,
    height: null,
  };
  document.artifact.renditions = {
    thumbnail: flatDoc,
    preview: { ...flatDoc, purpose: "preview", url: "https://signed.test/doc-flat-preview.png" },
  };
  assert.deepEqual(workspaceCoverRenditionPurposes(document), []);
  const flatPlan = workspaceCoverPlan({
    item: document,
    kind: "document",
    url: flatDoc.url,
    rendition: flatDoc,
  });
  assert.equal(flatPlan.coverEvidence, "proven-placeholder");
  assert.equal(
    flatPlan.failureReason,
    "这份封面是货架填充生成的占位图，不是素材本身。",
  );
});

test("cover resources render image, video, PDF, website and audio semantics without fake tiles", () => {
  const callbacks = { onReady() {}, onError() {} };
  const render = (plan) =>
    renderToStaticMarkup(
      React.createElement(WorkspaceCoverResource, {
        plan,
        alt: "Real cover",
        className: "h-full w-full object-cover",
        resourceKey: `${plan.renderer}:${plan.url}`,
        ...callbacks,
      }),
    );
  const image = render({
    renderer: "image",
    url: "https://signed.test/cover.png",
    mediaType: "image/png",
    format: "png",
    fit: "contain",
    sourceAspectRatio: 0.75,
    failureReason: "",
  });
  assert.match(image, /^<img /);
  assert.match(image, /data-cover-renderer="image"/);
  assert.match(image, /data-cover-fit="contain"/);
  assert.match(image, /object-fit:contain/);

  const video = render({
    renderer: "video",
    url: "https://signed.test/cover.mp4",
    mediaType: "video/mp4",
    format: "mp4",
    fit: "cover",
    sourceAspectRatio: 16 / 9,
    failureReason: "",
  });
  assert.match(video, /^<video /);
  assert.match(video, /muted=""/);
  assert.match(video, /playsInline=""/);
  assert.match(video, /preload="metadata"/);

  const audio = render({
    renderer: "audio",
    url: "https://signed.test/cover.mp3",
    mediaType: "audio/mpeg",
    format: "mp3",
    fit: "contain",
    sourceAspectRatio: null,
    failureReason: "",
  });
  assert.match(audio, /^<canvas /);
  assert.match(audio, /data-cover-renderer="audio"/);
  assert.match(audio, /role="img"/);

  const pdf = render({
    renderer: "pdf",
    url: "https://signed.test/cover.pdf?grant=1",
    mediaType: "application/pdf",
    format: "pdf",
    fit: "contain",
    sourceAspectRatio: null,
    failureReason: "",
  });
  assert.match(pdf, /^<iframe /);
  assert.match(pdf, /#page=1&amp;view=FitH/);
  assert.doesNotMatch(pdf, /sandbox=/);

  const website = render({
    renderer: "website",
    url: "https://signed.test/site-preview",
    mediaType: "text/html",
    format: "html",
    fit: "contain",
    sourceAspectRatio: null,
    failureReason: "",
  });
  assert.match(website, /^<iframe /);
  assert.match(website, /sandbox="allow-scripts"/);

  assert.equal(
    render({
      renderer: "unavailable",
      url: "https://signed.test/source.docx",
      mediaType:
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      format: "docx",
      fit: "contain",
      sourceAspectRatio: null,
      failureReason: "not a cover",
    }),
    "",
  );
});

async function bootstrapThumbnailDom() {
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
  const { document } = window;
  for (const [name, value] of Object.entries({
    window,
    document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
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
  globalThis.__coverResourceFailures = 0;

  const uiStubUrl = dataModule(`
    export function useUI() { return (value) => value; }
  `);
  const databaseStubUrl = dataModule(`
    export async function ensureDatabaseThumbnail() {
      return { ok: false, error: "not used" };
    }
  `);
  const advancedStubUrl = dataModule(`
    export function advancedLibraryReferenceFor() { return null; }
  `);
  const renditionStubUrl = dataModule(`
    export function useArtifactRendition() {
      return globalThis.__coverRenditionState;
    }
  `);
  const dataStubUrl = dataModule(`
    export function isDurableLibraryItem(item) {
      return Boolean(item?.artifactId && item?.revisionId && item?.artifact);
    }
  `);
  const modelStubUrl = dataModule(`
    export const WORKSPACE_KIND_LABELS = {
      image: "图片", video: "视频", document: "文档", website: "网站",
      canvas: "画布", threed: "3D", file: "文件"
    };
  `);
  const thumbnailUrl = await compileModule(
    "src/shell/workspace-library-thumbnail.tsx",
    {
      "../i18n/ui/useUI": uiStubUrl,
      "../lib/database": databaseStubUrl,
      "./advanced-features": advancedStubUrl,
      "./ArtifactRendition": renditionStubUrl,
      "./library-data": dataStubUrl,
      "./workspace-library-cover": coverModuleUrl,
      "./workspace-library-model": modelStubUrl,
    },
  );
  const { WorkspaceThumbnail } = await import(thumbnailUrl);
  return { dom, window, document, WorkspaceThumbnail };
}

test("thumbnail lifecycle reports loading, real-media success, failure and refreshed recovery", async () => {
  const { dom, window, document, WorkspaceThumbnail } =
    await bootstrapThumbnailDom();
  const item = normalizedItem("single_file_image");
  const setRendition = (version, url) => {
    const rendition = {
      ...item.artifact.renditions.thumbnail,
      url,
    };
    globalThis.__coverRenditionState = {
      url,
      purpose: "thumbnail",
      rendition,
      loading: false,
      error: "",
      version,
      retry() {},
      resourceFailed() {
        globalThis.__coverResourceFailures += 1;
      },
    };
  };
  setRendition(0, "https://signed.test/cover-v1.png");

  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const props = {
    item,
    url: item.thumbUrl,
    alt: "Lifecycle cover",
    kind: "image",
    accent: "#4f46e5",
    imageClassName: "h-full w-full object-cover",
  };
  try {
    await act(async () => root.render(React.createElement(WorkspaceThumbnail, props)));
    assert.equal(
      container.querySelector("[data-cover-state]")?.getAttribute(
        "data-cover-state",
      ),
      "loading",
    );
    const firstImage = container.querySelector("img");
    assert.ok(firstImage);
    await act(async () =>
      firstImage.dispatchEvent(new window.Event("load", { bubbles: true })),
    );
    assert.equal(
      container.querySelector("[data-cover-state]")?.getAttribute(
        "data-cover-state",
      ),
      "ready",
    );
    await act(async () =>
      firstImage.dispatchEvent(new window.Event("error", { bubbles: true })),
    );
    assert.equal(globalThis.__coverResourceFailures, 1);
    assert.equal(
      container.querySelector("[data-cover-state]")?.getAttribute(
        "data-cover-state",
      ),
      "error",
    );
    assert.match(
      container.querySelector('[role="alert"]')?.textContent || "",
      /封面不可用/,
    );

    setRendition(1, "https://signed.test/cover-v2.png");
    await act(async () => root.render(React.createElement(WorkspaceThumbnail, props)));
    const refreshedImage = container.querySelector("img");
    assert.ok(refreshedImage);
    assert.equal(
      refreshedImage.getAttribute("src"),
      "https://signed.test/cover-v2.png",
    );
    await act(async () =>
      refreshedImage.dispatchEvent(
        new window.Event("load", { bubbles: true }),
      ),
    );
    assert.equal(
      container.querySelector("[data-cover-state]")?.getAttribute(
        "data-cover-state",
      ),
      "ready",
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    delete globalThis.__coverRenditionState;
    delete globalThis.__coverResourceFailures;
  }
});

// 三态各有各的呈现（合同 §4 W1）：真封面照常显示；缺元数据只弱化、**绝不写
// 「不可用」**；已证实的占位图要明说是「占位图」，不能含糊成「封面不可用」。
test("三态呈现：真封面 / 弱化不写不可用 / 明确的占位图", async () => {
  const { dom, window, document, WorkspaceThumbnail } =
    await bootstrapThumbnailDom();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const mount = async (item, rendition) => {
    globalThis.__coverRenditionState = {
      url: rendition?.url || "",
      purpose: "thumbnail",
      rendition,
      loading: false,
      error: "",
      version: 0,
      retry() {},
      resourceFailed() {},
    };
    await act(async () =>
      root.render(
        React.createElement(WorkspaceThumbnail, {
          item,
          url: rendition?.url || "",
          alt: "Evidence cover",
          kind: "image",
          accent: "#4f46e5",
          imageClassName: "h-full w-full object-cover",
        }),
      ),
    );
    const image = container.querySelector("img");
    if (image) {
      await act(async () =>
        image.dispatchEvent(new window.Event("load", { bubbles: true })),
      );
    }
    const host = container.querySelector("[data-cover-state]");
    return {
      host,
      image: container.querySelector("img"),
      alert: container.querySelector('[role="alert"]'),
      marker: container.querySelector("[data-cover-metadata]"),
      evidence: host?.getAttribute("data-cover-evidence"),
      state: host?.getAttribute("data-cover-state"),
      text: host?.textContent || "",
    };
  };

  try {
    const real = normalizedItem("single_file_image");
    const realCover = {
      ...real.artifact.renditions.thumbnail,
      url: "https://signed.test/real-cover.webp",
      rendererVersion: "oceanleo-material-cover/raster-v1",
      digest: "sha256:dedicated-cover-blob",
    };
    real.artifact.renditions = { thumbnail: realCover };
    const realView = await mount(real, realCover);
    assert.equal(realView.evidence, "real");
    assert.equal(realView.state, "ready");
    assert.ok(realView.image, "真封面必须真的渲染出 <img>");
    assert.equal(realView.alert, null);
    assert.equal(realView.marker, null);

    // 7,013 份平均 80KB 的 webp：图是好的，只是 dimensions 没写。
    const unknown = normalizedItem("single_file_image");
    const unmeasured = {
      ...unknown.artifact.renditions.thumbnail,
      url: "https://signed.test/legacy-rehost.webp",
      rendererVersion: "legacy-rehost-v1",
      byteSize: 80_573,
      width: null,
      height: null,
    };
    unknown.artifact.renditions = { thumbnail: unmeasured };
    const unknownView = await mount(unknown, unmeasured);
    assert.equal(unknownView.evidence, "unknown-metadata");
    assert.equal(unknownView.state, "ready");
    assert.ok(unknownView.image, "缺元数据的真图必须照常显示");
    assert.equal(unknownView.alert, null, "弱化态不许出现 role=alert 失败块");
    assert.doesNotMatch(unknownView.text, /不可用/);
    assert.equal(
      unknownView.marker?.getAttribute("title"),
      "封面尺寸信息缺失，已按原图显示。",
    );
    // 弱化角标必须自带尺寸：`ui.css` 要等父任务 build:css 才重建，靠新工具类会在
    // 36 个 consumer 上渲染成不可见的空元素（§3.3 的发布顺序陷阱）。
    assert.match(
      unknownView.marker?.getAttribute("style") || "",
      /width:\s*6px[\s\S]*height:\s*6px/,
    );

    // 已证实的占位图：候选全被判死 → 明说「占位图」，不含糊成「封面不可用」。
    const placeholder = normalizedItem("single_file_image");
    const shelfFill = {
      ...placeholder.artifact.renditions.thumbnail,
      url: "https://signed.test/shelf-fill.png",
      mediaType: "image/png",
      format: "png",
      rendererVersion: "library-form-shelf-fill/v1/thumbnail",
      byteSize: 1212,
      width: null,
      height: null,
    };
    placeholder.artifact.renditions = { thumbnail: shelfFill };
    const placeholderView = await mount(placeholder, shelfFill);
    assert.equal(placeholderView.evidence, "proven-placeholder");
    assert.equal(placeholderView.image, null, "占位图不得被当封面渲染");
    assert.ok(placeholderView.alert);
    assert.equal(
      placeholderView.alert.getAttribute("data-cover-failure"),
      "placeholder",
    );
    assert.match(placeholderView.text, /占位图/);
    assert.doesNotMatch(placeholderView.text, /封面不可用/);
    // 说得出「为什么」：候选全被判死时不许含糊成「没有可显示的真实封面」。
    assert.match(placeholderView.text, /这份封面是货架填充生成的占位图/);
  } finally {
    await act(async () => root.unmount());
    container.remove();
    dom.window.close();
    delete globalThis.__coverRenditionState;
    delete globalThis.__coverResourceFailures;
  }
});
