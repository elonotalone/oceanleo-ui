import assert from "node:assert/strict";
import test from "node:test";

import { BAY_GALLERY_MAX, cleanGalleryUrls, galleryCoverUrl, isGalleryImageFile } from "../src/shell/bay/form/bay-gallery.ts";

test("作品图最多 9 张，第一张当封面，只留 https", () => {
  assert.equal(BAY_GALLERY_MAX, 9);
  assert.deepEqual(cleanGalleryUrls([]), []);
  assert.deepEqual(cleanGalleryUrls(null, "https://cdn.example/a.png"), ["https://cdn.example/a.png"]);
  assert.deepEqual(cleanGalleryUrls(["http://x", "https://cdn.example/a.png", "https://cdn.example/a.png", "ftp://z"]), [
    "https://cdn.example/a.png",
  ]);
  const nine = Array.from({ length: 9 }, (_, i) => `https://cdn.example/${i}.png`);
  assert.deepEqual(cleanGalleryUrls([...nine, "https://cdn.example/overflow.png"]), nine);
  assert.equal(galleryCoverUrl(nine), nine[0]);
  assert.equal(galleryCoverUrl([]), "");
});

test("相册文件没有 MIME 时按扩展名识别图片", () => {
  assert.equal(isGalleryImageFile({ type: "image/jpeg", name: "a.jpg" }), true);
  assert.equal(isGalleryImageFile({ type: "", name: "IMG_001.JPG" }), true);
  assert.equal(isGalleryImageFile({ type: "application/octet-stream", name: "c.webp" }), true);
  assert.equal(isGalleryImageFile({ type: "application/pdf", name: "d.pdf" }), false);
  assert.equal(isGalleryImageFile({ type: "", name: "notes.txt" }), false);
});
