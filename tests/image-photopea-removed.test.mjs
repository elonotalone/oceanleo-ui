/**
 * 图片件已删除 Photopea：src 不得再出现该词，专业页只剩同一份 Fabric 稿。
 * W2 会把本文件挂进 oceanleo-security-gate.sh 的 UC-3 步骤。
 *
 * UC-3：docs/architecture/oceanleo-untrusted-content-isolation.md
 */
import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  sandboxGrantsScriptedSameOrigin,
} from "../src/shell/editor-sandbox-origin.ts";
import { editorRouteFor } from "../src/shell/workbench-routes.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "src");
const IMAGE_ROUTE = join(SRC, "shell/advanced-routes/ImageRoute.tsx");

const REMOVED_MODULES = [
  "src/shell/image-editor/photopea-bridge.ts",
  "src/shell/image-editor/photopea-session.ts",
  "src/shell/image-editor/photopea-mount.ts",
  "src/shell/image-editor/PhotopeaFrame.tsx",
  "src/shell/image-editor/ImagePhotopeaHost.tsx",
];

function walkFiles(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

function libraryItem(overrides = {}) {
  return {
    key: "img-guard",
    source: "artifact",
    id: "img-guard",
    title: "图",
    kind: "image",
    siteId: "image",
    favorite: false,
    url: "",
    previewUrl: "",
    meta: {},
    ...overrides,
  };
}

test("src 下任何文件都不含 photopea", () => {
  const hits = [];
  for (const file of walkFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (/photopea/i.test(text)) hits.push(file.slice(SRC.length + 1));
  }
  assert.deepEqual(hits, [], `src 仍含 photopea：${hits.join(", ")}`);
});

test("五个 Photopea 模块文件不存在", () => {
  const leftover = REMOVED_MODULES.filter((relative) => existsSync(join(ROOT, relative)));
  assert.deepEqual(leftover, [], `这些文件还应删掉：${leftover.join(", ")}`);
});

// UC-3 §8.3：docs/architecture/oceanleo-untrusted-content-isolation.md
// 第三方修图站走通用嵌入路径，必须是不可信档，不得 scripts+same-origin。
test("embedEditorFrameSandbox(photopea.com) 是不可信档，不含 scripts+same-origin", () => {
  const sandbox = embedEditorFrameSandbox("https://www.photopea.com");
  assert.equal(sandbox, UNTRUSTED_FRAME_SANDBOX);
  assert.equal(sandboxGrantsScriptedSameOrigin(sandbox), false);
  assert.equal(sandbox.includes("allow-same-origin") && sandbox.includes("allow-scripts"), false);
});

test("ImageRoute 单一模式：没有 iframe、没有专业模式开关、没有 Photopea", () => {
  const route = readFileSync(IMAGE_ROUTE, "utf8");
  assert.equal(/<iframe/i.test(route), false);
  assert.equal(/ImagePhotopeaHost|showPhotopea|data-image-show-photopea/.test(route), false);
  assert.equal(/bindImageModeAdapter|rememberedImagePluginMode|applyImageL0Mode|bindProFaceHandoff|bindNormalFaceHandoff/.test(route), false);
  assert.equal(existsSync(join(SRC, "shell/image-editor/design-mode/image-plugin-mode.ts")), false);
});

test("PSD 与 PNG 都落到 image 路由", () => {
  assert.equal(
    editorRouteFor(libraryItem({ url: "https://cdn.example/shot.png" })).type,
    "image",
  );
  assert.equal(
    editorRouteFor(libraryItem({ url: "https://cdn.example/art.psd" })).type,
    "image",
  );
  assert.equal(
    editorRouteFor(
      libraryItem({ url: "", meta: { mime: "image/vnd.adobe.photoshop" } }),
    ).type,
    "image",
  );
  assert.equal(
    editorRouteFor(libraryItem({ url: "", meta: { mime: "image/x-photoshop" } })).type,
    "image",
  );
});
