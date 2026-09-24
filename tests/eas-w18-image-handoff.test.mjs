import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  persistPhotopeaDocument,
  photopeaLaunchIncludesDocument,
  photopeaRevisionBlockedReason,
  sniffImageBytes,
  stripFabricProjectPointers,
  toPhotopeaDocumentRef,
} from "../src/shell/advanced-routes/image-pro-handoff.ts";
import { photopeaLaunchUrl } from "../src/shell/image-editor/photopea-bridge.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const route = readFileSync("src/shell/advanced-routes/ImageRoute.tsx", "utf8");
const host = readFileSync("src/shell/image-editor/ImagePhotopeaHost.tsx", "utf8");
const frame = readFileSync("src/shell/image-editor/PhotopeaFrame.tsx", "utf8");

function pngBytes() {
  return Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]).buffer;
}

function item(overrides = {}) {
  return {
    key: "img-w18",
    source: "artifact",
    id: "img-w18",
    title: "交接图",
    kind: "image",
    siteId: "design",
    favorite: false,
    url: "https://cdn.example/old.png",
    previewUrl: "https://cdn.example/old.png",
    meta: {
      fabric_document_url: "https://cdn.example/old.fabric.json",
      editor_project_url: "https://cdn.example/old.fabric.json",
    },
    ...overrides,
  };
}

test("Photopea 启动 URL 带当前图像", async () => {
  const current = "data:image/png;base64,aaa";
  const launch = photopeaLaunchUrl({ documentDataUrl: current });
  assert.equal(photopeaLaunchIncludesDocument(launch), true);
  assert.equal(launch.includes(encodeURIComponent(current)) || launch.includes(current), true);
  assert.equal(photopeaLaunchIncludesDocument(photopeaLaunchUrl({})), false);

  const fromUrl = await toPhotopeaDocumentRef("https://cdn.example/now.png", {
    fetchImpl: async () =>
      new Response(pngBytes(), { headers: { "content-type": "image/png" } }),
  });
  assert.equal(fromUrl.ok, true);
  assert.equal(photopeaLaunchIncludesDocument(photopeaLaunchUrl({
    documentDataUrl: fromUrl.documentDataUrl,
  })), true);
});

test("onDocument 触发保存并产生新版本，快速面换成新图", async () => {
  const opened = item({
    artifactId: "art-img",
    revisionId: "rev-img-1",
    artifactType: "single_file_image",
    artifact: {
      artifactId: "art-img",
      revisionId: "rev-img-1",
      artifactType: "single_file_image",
    },
  });
  assert.equal(sniffImageBytes(pngBytes()), "png");
  let savedArgs = null;
  const saved = await persistPhotopeaDocument({
    item: opened,
    siteId: "design",
    bytes: pngBytes(),
    save: async (args) => {
      savedArgs = args;
      return {
        ok: true,
        url: "https://cdn.example/new.png",
        versionId: "ver-img-2",
        projectUrl: "",
        projectSchema: "",
        sourceFormat: "png",
        sourceMediaType: "image/png",
        title: "交接图-编辑版",
        fileName: "交接图-编辑版.png",
        savedAt: "2026-09-24T08:00:00.000Z",
        artifactId: "art-img",
        revisionId: "rev-img-2",
        previousRevisionId: "rev-img-1",
        error: "",
      };
    },
  });
  assert.equal(saved.ok, true);
  assert.ok(savedArgs?.file || savedArgs?.createFile);
  assert.equal(saved.item.url, "https://cdn.example/new.png");
  assert.equal(saved.item.revisionId, "rev-img-2");
  assert.equal(saved.item.meta.fabric_document_url, undefined);
  assert.equal(saved.item.meta.editor_project_url, undefined);
  const handoffUrl = await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
    "../office-editor/useOfficeArtifactSource": dataModule(`
      export function useOfficeArtifactSource(item) {
        return { item, url: item && item.url ? item.url : "", purpose: null, loading: false, error: "", version: 0, retry() {}, resourceFailed() {} };
      }
    `),
  });
  const { handoffItemKey, peekProSavedRevision, reportProSaved, resetEditorHandoffForTests } =
    await import(handoffUrl);
  resetEditorHandoffForTests();
  reportProSaved(handoffItemKey(opened), saved.item);
  const back = peekProSavedRevision(handoffItemKey(opened));
  assert.equal(back?.url, "https://cdn.example/new.png");
});

test("分层设计稿不覆盖原稿", async () => {
  const layered = item({ artifactType: "composite_image" });
  assert.match(photopeaRevisionBlockedReason(layered) || "", /分层设计稿/);
  const saved = await persistPhotopeaDocument({
    item: layered,
    siteId: "design",
    bytes: pngBytes(),
    save: async () => {
      throw new Error("不得调用保存");
    },
  });
  assert.equal(saved.ok, false);
});

test("交给快速面的 item 去掉旧 Fabric 工程指针", () => {
  const cleaned = stripFabricProjectPointers(item());
  assert.equal(cleaned.meta.fabric_document_url, undefined);
  assert.equal(cleaned.meta.editor_project_url, undefined);
  assert.equal(cleaned.url, "https://cdn.example/old.png");
});

test("ImageRoute 把当前图像和回传交给 Photopea", () => {
  assert.match(route, /documentDataUrl=\{/);
  assert.match(route, /onDocument=\{/);
  assert.match(route, /<ImagePhotopeaHost showPhotopea=\{showPhotopea\}/);
  assert.equal(/photopea\.com/i.test(route), false);
  assert.equal(/setShowPhotopea|togglePro|proSwitch/.test(route), false);
});

test("PhotopeaFrame 按 PNG 要回当前文档", () => {
  assert.match(host, /documentDataUrl=\{documentDataUrl\}/);
  assert.match(host, /onDocument=\{onDocument\}/);
  assert.match(frame, /saveToOE\("png"\)/);
  assert.match(frame, /postToPhotopea\(/);
});
