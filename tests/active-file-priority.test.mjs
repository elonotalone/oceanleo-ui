import assert from "node:assert/strict";
import test from "node:test";
import { usableImageVisionSource } from "../src/shell/image-editor/image-command-surface.ts";

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
