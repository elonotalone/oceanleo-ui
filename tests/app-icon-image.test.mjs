import assert from "node:assert/strict";
import test from "node:test";

import { appIconImageKey, appIconThumbSrc } from "../src/lib/app-icon-image.ts";

test("appIconImageKey uses the same slug rules as capabilityImageKey", () => {
  assert.equal(appIconImageKey("make", "tshirt"), "app-icon/make-tshirt");
  assert.equal(appIconImageKey("make", "canvas-art"), "app-icon/make-canvas-art");
  assert.equal(appIconImageKey("Make", "Gift Box"), "app-icon/make-gift-box");
  assert.equal(appIconImageKey("make", "cat-card"), "app-icon/make-cat-card");
  assert.equal(appIconImageKey("", "tshirt"), "");
  assert.equal(appIconImageKey("make", "   "), "");
});

test("appIconThumbSrc joins keys and passes absolute URLs through", () => {
  assert.equal(
    appIconThumbSrc("app-icon/make-tshirt"),
    "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/app-icon/make-tshirt.thumb.webp",
  );
  assert.equal(appIconThumbSrc("https://cdn.example/icon.png"), "https://cdn.example/icon.png");
  assert.equal(appIconThumbSrc(""), "");
  assert.equal(appIconThumbSrc(null), "");
  assert.equal(appIconThumbSrc(undefined), "");
});
