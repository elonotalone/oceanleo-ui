import assert from "node:assert/strict";
import test from "node:test";
import { usableImageVisionSource } from "../src/shell/image-editor/image-command-surface.ts";
import { createWebsiteCommandSurface } from "../src/shell/website-local/website-command-surface.ts";

test("image vision source skips private, signed, and unusable URLs before a public rendition", () => {
  assert.equal(usableImageVisionSource([
    "/private/source-tree/file.png",
    "blob:https://app.example/opaque",
    "https://cdn.example/private.png?signature=secret",
    "https://cdn.example/public-preview.png",
  ]), "https://cdn.example/public-preview.png");
  assert.equal(usableImageVisionSource([
    "https://user:password@cdn.example/image.png",
    "https://localhost/image.png",
    "http://cdn.example/image.png",
  ]), "");
});

test("website context serializes the selected page before large unrelated site content", () => {
  const source = {
    pages: [
      { id: "home", title: "首页", sections: [{ id: "huge", body: "unrelated-".repeat(3000) }] },
      { id: "current", title: "当前页", sections: [{ id: "hero", body: "selected-page-body" }] },
    ],
    theme: { tokens: "x".repeat(12000) },
  };
  const surface = createWebsiteCommandSurface({
    source: () => source,
    revision: () => 7,
    sourceReady: () => true,
    apply: () => {},
    pageId: () => "current",
  });
  const context = surface.agentContext();
  assert.equal(context.ready, true);
  assert.equal(context.content.selectedPage.id, "current");
  assert.match(JSON.stringify(context.content.selectedPage), /selected-page-body/);
  assert.equal(context.truncated, true);
});
