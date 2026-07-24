import assert from "node:assert/strict";
import test from "node:test";

globalThis.window = {
  location: {
    href: "https://design.oceanleo.com/",
    origin: "https://design.oceanleo.com",
  },
};

const {
  canvasSafeUrl,
  isFirstPartyMediaUrl,
  isMediaProxyUrl,
  needsMediaProxy,
  unwrapMediaProxyUrl,
} = await import("../src/lib/media-proxy.ts");

const DECO =
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/design-deco/lip-glaze.png";
const SCENE =
  "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/design-scene/legacy.png";

test("design-deco OSS URLs are first-party and need absolute gateway media-proxy", () => {
  assert.equal(isFirstPartyMediaUrl(DECO), true);
  assert.equal(needsMediaProxy(DECO), true);
  const safe = canvasSafeUrl(DECO);
  assert.equal(isMediaProxyUrl(safe), true);
  assert.match(
    safe,
    /^https:\/\/api\.oceanleo\.com\/v1\/media\/proxy\?url=/,
  );
  assert.equal(unwrapMediaProxyUrl(safe), DECO);
  assert.equal(needsMediaProxy(safe), false);
  assert.equal(canvasSafeUrl(safe), safe);
});

test("design-scene OSS URLs also wrap through absolute https media-proxy", () => {
  const safe = canvasSafeUrl(SCENE);
  assert.equal(isMediaProxyUrl(safe), true);
  assert.equal(decodeURIComponent(new URL(safe).searchParams.get("url")), SCENE);
});

test("gateway and data URLs stay unproxied", () => {
  assert.equal(
    needsMediaProxy("https://api.oceanleo.com/v1/media/file/layer.png"),
    false,
  );
  assert.equal(canvasSafeUrl("data:image/png;base64,aa"), "data:image/png;base64,aa");
  assert.equal(canvasSafeUrl("blob:https://design.oceanleo.com/x"), "blob:https://design.oceanleo.com/x");
});

test("gateway-relative /v1 paths bind to api.oceanleo.com, not the site origin", async () => {
  const { absoluteMediaUrl } = await import("../src/lib/media-proxy.ts");
  const relative =
    "/v1/artifacts/11111111-1111-4111-8111-111111111111/revisions/22222222-2222-4222-8222-222222222222/source-tree/@source";
  assert.equal(
    absoluteMediaUrl(relative),
    `https://api.oceanleo.com${relative}`,
  );
  const siteAbsolute = `https://design.oceanleo.com${relative}`;
  assert.equal(
    absoluteMediaUrl(siteAbsolute),
    `https://api.oceanleo.com${relative}`,
  );
  // Opaque access relative path must also bind to the gateway.
  const opaque = "/v1/artifact-renditions/access/tok_test";
  assert.equal(
    absoluteMediaUrl(opaque),
    "https://api.oceanleo.com/v1/artifact-renditions/access/tok_test",
  );
  assert.equal(needsMediaProxy(opaque), false);
  assert.equal(
    canvasSafeUrl(opaque),
    "https://api.oceanleo.com/v1/artifact-renditions/access/tok_test",
  );
});
