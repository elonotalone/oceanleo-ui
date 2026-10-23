// 10-23 编辑器整改 W07（_EDITOR.md §E / signals/W02-to-editors.md）：演示的素材 adapter
// 只收图片，点一下插入 / 选中图片时替换，并且登记走编辑器撤销历史的 command 契约。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("deck material adapter registers the editor-history command contract", () => {
  const hook = source("../src/shell/doc-editors/use-deck-material-adapter.ts");
  const route = source("../src/shell/advanced-routes/DeckRoute.tsx");
  assert.match(route, /useDeckMaterialAdapter\(editor, item\);/);
  assert.doesNotMatch(route, /useWorkbenchMaterialAdapter\(/);
  assert.match(hook, /withEditorHistoryCommand\(base, \{/);
  assert.match(hook, /useWorkbenchMaterialAdapter\(adapter\);/);
  // 载入中不登记契约（面板如实说还不能插入），不是灰按钮假装能用。
  assert.match(hook, /targetRevisionId: editor\.loading\s*\? ""/);
  // 替换只认选中的图片，几何取自那张图片。
  assert.match(hook, /editor\.selectedElement\?\.type === "image"/);
  assert.match(hook, /targetId: selectedImage\.id/);
  assert.match(hook, /width: selectedImage\.width/);
});

test("deck accepts only real images and inserts by an image address", async () => {
  const { deckAcceptsMaterial, deckMaterialImageUrl } = await import(
    "../src/shell/doc-editors/deck-material.ts"
  );
  const item = (extra) => ({ id: "x", key: "k", source: "library", title: "t", url: "", kind: "file", meta: {}, ...extra });
  assert.equal(deckAcceptsMaterial(item({ kind: "image" })), true);
  assert.equal(deckAcceptsMaterial(item({ meta: { mime: "image/png" } })), true);
  assert.equal(deckAcceptsMaterial(item({ url: "https://x.invalid/a.webp?x=1" })), true);
  // 视频 / 文档自带预览图也不算图片素材。
  assert.equal(deckAcceptsMaterial(item({ kind: "video", previewUrl: "https://x.invalid/p.png", url: "https://x.invalid/v.mp4" })), false);
  assert.equal(
    deckMaterialImageUrl(item({ url: "https://x.invalid/raw", previewUrl: "https://x.invalid/p.jpg" })),
    "https://x.invalid/p.jpg",
  );
  assert.equal(deckMaterialImageUrl(item({})), "");
});
