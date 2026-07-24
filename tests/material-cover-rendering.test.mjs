import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import ts from "typescript";

import {
  ARTIFACT_TYPES,
  normalizeArtifactProjection,
} from "../src/shell/artifact-contract.ts";
import {
  artifactProjectionToLibraryItem,
} from "../src/shell/library-data.ts";

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

async function compileModule(relativePath, replacements = {}) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    ...replacements,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
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

const coverModuleUrl = await compileModule(
  "src/shell/workspace-library-cover.tsx",
);
const {
  WorkspaceCoverResource,
  workspaceCoverPlan,
  workspaceCoverRenditionPurposes,
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
      },
      preview: {
        purpose: "preview",
        revision_id: revisionId,
        url: `https://signed.test/${artifactType}-preview.png`,
        media_type: "image/png",
        format: "png",
        width: 1280,
        height: 960,
      },
      full: {
        purpose: "full",
        revision_id: revisionId,
        url: `https://signed.test/${artifactType}-full`,
        media_type: "application/octet-stream",
        format: SOURCE_FORMATS[artifactType],
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

test("all thirteen normalized catalog types retain real cover metadata and type-correct fit", () => {
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
  ]);
  assert.equal(ARTIFACT_TYPES.length, 13);
  for (const artifactType of ARTIFACT_TYPES) {
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

test("cover resources render image, video, PDF and website semantics without fake tiles", () => {
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

test("thumbnail lifecycle reports loading, real-media success, failure and refreshed recovery", async () => {
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
