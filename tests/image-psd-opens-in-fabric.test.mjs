/**
 * PSD 必须在 Fabric 里按压平合成图打开：识别、解码成 PNG、失败时退预览，
 * 保存仍是 Fabric + PNG，绝不把 .psd URL 交给图片加载。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { initializeCanvas, writePsd } from "ag-psd";

import { FABRIC_IMAGE_REVISION_SOURCE } from "../src/shell/image-editor/editor-persistence.ts";
import {
  createImageSceneSource,
  imageSceneWithResolvedDependencies,
  parseImageSceneSource,
  sha256Blob,
  sha256Bytes,
} from "../src/shell/image-editor/image-scene-source.ts";
import { openFabricImagePixels } from "../src/shell/image-editor/fabric-image-open.ts";
import {
  PSD_MIMES,
  PSD_NO_COMPOSITE_ZH,
  decodePsdCompositeToPng,
  isPsdSource,
  resolvePsdCanvasSource,
} from "../src/shell/image-editor/psd-composite.ts";
import { EAS_W18_MESSAGES } from "../src/i18n/ui/messages/eas-w18-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EDITOR = `${ROOT}/src/shell/image-editor/use-fabric-image-editor.ts`;
const PERSIST = `${ROOT}/src/shell/image-editor/editor-persistence.ts`;
const PANELS = `${ROOT}/src/shell/image-editor/FabricImageCreationPanels.tsx`;
const ROUTE = `${ROOT}/src/shell/advanced-routes/ImageRoute.tsx`;

const TINY_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";

globalThis.window ||= {
  location: {
    href: "https://image.oceanleo.com/workspace",
    origin: "https://image.oceanleo.com",
  },
};

function installTestCanvas() {
  initializeCanvas(
    (width, height) => {
      const pixels = new Uint8ClampedArray(Math.max(1, width) * Math.max(1, height) * 4);
      const ctx = {
        createImageData(w, h) {
          return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
        },
        getImageData() {
          return { width, height, data: pixels };
        },
        putImageData(image) {
          pixels.set(image.data.subarray(0, pixels.length));
        },
        drawImage() {},
        scale() {},
      };
      return {
        width,
        height,
        getContext: () => ctx,
        toDataURL: () => TINY_PNG,
      };
    },
    (width, height) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
  );
}

function compositePsdBytes() {
  const width = 4;
  const height = 4;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 220;
    data[i + 1] = 40;
    data[i + 2] = 40;
    data[i + 3] = 255;
  }
  return writePsd(
    {
      width,
      height,
      imageData: { data, width, height },
      children: [{ name: "红", imageData: { data, width, height } }],
    },
    { generateThumbnail: false },
  );
}

function assertNotPsdOpenUrl(url) {
  assert.match(String(url), /^(data:image\/png|blob:|https?:\/\/.+\.(png|jpe?g|webp|gif))/i);
  assert.doesNotMatch(String(url), /\.psd(\?|#|$)/i);
  assert.doesNotMatch(String(url), /vnd\.adobe\.photoshop/i);
}

installTestCanvas();

test("PSD 识别函数认 format、后缀和三种 mime", () => {
  assert.equal(isPsdSource({ format: "psd" }), true);
  assert.equal(isPsdSource({ url: "https://lib.example/a.psd" }), true);
  assert.equal(isPsdSource({ url: "https://lib.example/a.PSD?token=1" }), true);
  assert.equal(isPsdSource({ name: "海报.psd" }), true);
  for (const mime of PSD_MIMES) {
    assert.equal(isPsdSource({ mime }), true, mime);
  }
  assert.equal(isPsdSource({ format: "png", url: "https://lib.example/a.png" }), false);
  assert.equal(isPsdSource({ mime: "image/png", name: "a.png" }), false);
});

test("解码函数把带合成图的 PSD 收成 PNG，不回原 .psd 地址", async () => {
  const bytes = compositePsdBytes();
  const png = await decodePsdCompositeToPng(bytes);
  assertNotPsdOpenUrl(png);
  assert.match(png, /^data:image\/png/i);
});

test("合成图拿不到时先退 previewUrl，再没有就给人话错误", async () => {
  const previewUrl = "https://lib.example/a-preview.png";
  const withPreview = await resolvePsdCanvasSource({
    url: "https://lib.example/a.psd",
    format: "psd",
    previewUrl,
    fetchBytes: async () => {
      throw new Error("素材过大，无法在浏览器内存中安全处理");
    },
  });
  assert.equal(withPreview.ok, true);
  assert.equal(withPreview.canvasUrl, previewUrl);
  assertNotPsdOpenUrl(withPreview.canvasUrl);

  const noPreview = await resolvePsdCanvasSource({
    url: "https://lib.example/a.psd",
    format: "psd",
    fetchBytes: async () => new Uint8Array([0, 1, 2, 3]).buffer,
  });
  assert.equal(noPreview.ok, false);
  assert.equal(noPreview.error, PSD_NO_COMPOSITE_ZH);
  assert.match(noPreview.error, /最大兼容/);
  assert.doesNotMatch(noPreview.error, /photopea/i);
});

test("解码成功时返回 PNG，原 .psd URL 不会变成画布地址", async () => {
  const opened = await resolvePsdCanvasSource({
    url: "https://lib.example/a.psd",
    format: "psd",
    fetchBytes: async () => compositePsdBytes(),
  });
  assert.equal(opened.ok, true);
  assertNotPsdOpenUrl(opened.canvasUrl);
  assert.notEqual(opened.canvasUrl, "https://lib.example/a.psd");
});

test("保存产物锁成 png，不得冒充 psd", () => {
  assert.equal(FABRIC_IMAGE_REVISION_SOURCE.sourceFormat, "png");
  assert.equal(FABRIC_IMAGE_REVISION_SOURCE.sourceMediaType, "image/png");
  assert.notEqual(FABRIC_IMAGE_REVISION_SOURCE.sourceFormat, "psd");
  const persist = readFileSync(PERSIST, "utf8");
  assert.match(
    persist,
    /sourceFormat:\s*FABRIC_IMAGE_REVISION_SOURCE\.sourceFormat/,
  );
  assert.match(
    persist,
    /sourceMediaType:\s*FABRIC_IMAGE_REVISION_SOURCE\.sourceMediaType/,
  );
  assert.doesNotMatch(persist, /sourceFormat:\s*["']psd["']/);
});

test("打开链先解 PSD 再交给 loadImageObject，面板和路由收 .psd", () => {
  const editor = readFileSync(EDITOR, "utf8");
  const open = readFileSync(
    `${ROOT}/src/shell/image-editor/fabric-image-open.ts`,
    "utf8",
  );
  assert.match(open, /resolvePsdCanvasSource/);
  assert.match(open, /assertFabricImageOpenUrl/);
  assert.match(editor, /openFabricImagePixels/);
  assert.doesNotMatch(
    editor,
    /loadImageObject\(\s*fabric,\s*sourceUrl/,
  );
  const panels = readFileSync(PANELS, "utf8");
  assert.match(panels, /\.psd|vnd\.adobe\.photoshop/);
  const route = readFileSync(ROUTE, "utf8");
  assert.match(route, /isPsdSource/);
  assert.match(route, /\.psd/);
});

test("人话错误在 17 语词典里齐，且没有 Photopea", () => {
  assert.equal(EAS_W18_MESSAGES.zh[PSD_NO_COMPOSITE_ZH], PSD_NO_COMPOSITE_ZH);
  for (const locale of LOCALES) {
    const text = EAS_W18_MESSAGES[locale][PSD_NO_COMPOSITE_ZH];
    assert.ok(text && text.trim(), locale);
    assert.doesNotMatch(text, /photopea/i);
  }
});

test("库里打开 PSD：图层依赖是上传后的 PNG，不是 PSD 的 url/digest", async () => {
  const psdBytes = compositePsdBytes();
  const psdDigest = await sha256Bytes(psdBytes);
  const uploaded = [];
  const opened = await openFabricImagePixels({
    source: "https://lib.example/a.psd",
    siteId: "image",
    title: "海报",
    evidence: {
      kind: "image",
      required: true,
      url: "https://lib.example/a.psd",
      digest: psdDigest,
    },
    hints: {
      format: "psd",
      fetchBytes: async () => psdBytes,
    },
    persistPng: async (file) => {
      uploaded.push(file);
      return "https://lib.example/a-composite.png";
    },
  });
  assert.equal(uploaded.length, 1);
  assert.equal(uploaded[0].type, "image/png");
  assert.ok(opened.dependency);
  assert.equal(opened.dependency.url, "https://lib.example/a-composite.png");
  assert.equal(opened.dependency.digest, await sha256Blob(uploaded[0]));
  assert.notEqual(opened.dependency.url, "https://lib.example/a.psd");
  assert.notEqual(opened.dependency.digest, psdDigest);
  assertNotPsdOpenUrl(opened.dependency.url);
  assertNotPsdOpenUrl(opened.canvasUrl);
});

test("拖进 PSD：图层依赖同样是合成 PNG，不是原 PSD", async () => {
  const psdBytes = compositePsdBytes();
  const psdDigest = await sha256Bytes(psdBytes);
  const uploaded = [];
  const opened = await openFabricImagePixels({
    source: "海报.psd",
    siteId: "image",
    title: "海报.psd",
    evidence: {
      kind: "image",
      required: true,
      url: "https://lib.example/uploads/海报.psd",
      digest: psdDigest,
    },
    hints: {
      format: "psd",
      mime: "image/vnd.adobe.photoshop",
      name: "海报.psd",
      bytes: psdBytes,
    },
    persistPng: async (file) => {
      uploaded.push(file);
      return "https://lib.example/uploads/海报-合成图.png";
    },
  });
  assert.equal(uploaded[0].type, "image/png");
  assert.equal(opened.dependency.url, "https://lib.example/uploads/海报-合成图.png");
  assert.equal(opened.dependency.digest, await sha256Blob(uploaded[0]));
  assert.notEqual(opened.dependency.digest, psdDigest);
  assertNotPsdOpenUrl(opened.dependency.url);
});

test("存一次再重开：图层 src 指向 PNG，不是 .psd", async () => {
  const opened = await openFabricImagePixels({
    source: "https://lib.example/a.psd",
    siteId: "image",
    title: "海报",
    evidence: {
      kind: "image",
      required: true,
      url: "https://lib.example/a.psd",
      digest: "b".repeat(64),
    },
    hints: {
      format: "psd",
      fetchBytes: async () => compositePsdBytes(),
    },
    persistPng: async () => "https://lib.example/a-composite.png",
  });
  const snapshot = {
    json: {
      version: "6.0.0",
      objects: [
        {
          type: "FabricImage",
          oceanleoId: "photo-layer",
          oceanleoKind: "image",
          src: opened.canvasUrl,
          oceanleoDependency: { ...opened.dependency, id: "photo-layer" },
        },
      ],
    },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  };
  const scene = await createImageSceneSource({
    snapshot,
    revision: 1,
    artifactId: "artifact-psd",
    baseRevisionId: "revision-psd-1",
  });
  assert.doesNotMatch(scene.sceneGraph.snapshot.json.objects[0].src, /\.psd/i);
  assert.match(scene.sceneGraph.snapshot.json.objects[0].src, /\.png(\?|#|$)/i);
  assert.equal(
    scene.dependencyClosure.dependencies[0].url,
    "https://lib.example/a-composite.png",
  );
  const parsed = await parseImageSceneSource(scene);
  const reopened = imageSceneWithResolvedDependencies(
    parsed,
    parsed.dependencyClosure.dependencies,
  );
  assert.equal(reopened.json.objects[0].src, "https://lib.example/a-composite.png");
  assert.doesNotMatch(reopened.json.objects[0].src, /\.psd/i);
});

test("非 PSD 的 data URL 不再被贴上 evidence 依赖", async () => {
  const opened = await openFabricImagePixels({
    source: TINY_PNG,
    siteId: "image",
    title: "签名",
    evidence: {
      kind: "image",
      required: true,
      url: "https://lib.example/should-not-attach.psd",
      digest: "c".repeat(64),
    },
  });
  assert.equal(opened.canvasUrl, TINY_PNG);
  assert.equal(opened.dependency, null);
});

test("生产解码不带 Node 假 canvas；打开链不再用 evidence 兜底 PSD", () => {
  const composite = readFileSync(`${ROOT}/src/shell/image-editor/psd-composite.ts`, "utf8");
  assert.doesNotMatch(composite, /ensurePsdCanvas/);
  assert.doesNotMatch(composite, /initializeCanvas/);
  assert.doesNotMatch(composite, /iVBORw0KGgoAAAANSUhEUgAAAAEAAAAB/);
  const editor = readFileSync(EDITOR, "utf8");
  assert.match(editor, /openFabricImagePixels/);
  assert.doesNotMatch(editor, /\?\?\s*evidence/);
});
