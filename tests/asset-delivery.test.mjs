import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import test from "node:test";
import ts from "typescript";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import * as delivery from "../src/lib/asset-delivery.ts";
import { CLIENT_HOST_CONFIG_GLOBAL_KEY } from "../src/contracts/client-host-config.ts";

const OSS = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com";
const CDN = "https://assets.oceanleo.com";
const familyModule = pathToFileURL(resolve("src/contracts/domain-family.ts")).href;
const source = readFileSync("src/lib/asset-delivery.ts", "utf8");
assert.match(source, /export const ASSET_CDN_ENABLED: boolean = (?:false|true);/);
// Exercise the parent's eventual single-constant flip without a runtime override.
function deliveryModule(flag) {
  return dataModule(ts.transpileModule(
    source.replace(/ASSET_CDN_ENABLED: boolean = (?:false|true)/, `ASSET_CDN_ENABLED: boolean = ${flag}`)
      .replace('"../contracts/domain-family"', JSON.stringify(familyModule)),
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } },
  ).outputText);
}
const disabledModule = deliveryModule(false);
const enabledModule = deliveryModule(true);
const disabled = await import(disabledModule);
const enabled = await import(enabledModule);

test("checked-in switch controls the actual resolver", () => {
  const origin = delivery.ASSET_CDN_ENABLED ? CDN : OSS;
  assert.equal(delivery.resolvePublicAssetMedia("assets/image/a.webp", { purpose: "full", family: "com" }), `${origin}/assets/image/a.webp`);
});

for (const [flag, module] of [[false, disabled], [true, enabled]]) {
  for (const family of ["com", "ws", "cn"]) {
    for (const purpose of ["thumb", "preview", "full"]) {
      test(`flag=${flag} family=${family} purpose=${purpose}: public keys and exact legacy URLs`, () => {
        const origin = flag && family !== "cn" ? CDN : OSS;
        const media = (key) => module.resolvePublicAssetMedia(key, { purpose, family });
        const suffix = purpose === "thumb" ? ".thumb.webp" : ".webp";
        assert.equal(media("cap-app/oceanleo-image"), `${origin}/assets/image/cap-app/oceanleo-image${suffix}`);
        for (const path of [
          "assets/image/demo.webp", "assets/image/demo.thumb.webp", "assets/image/demo.preview.webp",
          "assets/image/a%20b.png", "assets/video/demo.poster.webp", "assets/icon/b.svg",
          "assets/charts/funnel-inside-label/cover.webp", "assets/font/demo.woff2", "assets/image/extensionless",
        ]) {
          assert.equal(media(path), `${origin}/${path}`);
          assert.equal(media(`${OSS}/${path}`), `${origin}/${path}`);
        }
        assert.equal(media("food/demo.webp"), `${origin}/assets/image/food/demo.webp`);
        assert.equal(media("/assets/image/海 报.webp"), `${origin}/assets/image/${encodeURIComponent("海 报.webp")}`);
        const transformed = "/assets/image/a%20b.webp?x-oss-process=image%2Fresize%2Cw_300#view";
        assert.equal(media(OSS + transformed), origin + transformed);
      });
      test(`flag=${flag} family=${family} purpose=${purpose}: foreign/private/signed URLs stay byte-identical`, () => {
        for (const url of [
          "https://foreign.example/assets/image/a.webp",
          `${CDN}/assets/image/a.webp`,
          "https://api.oceanleo.com/v1/artifacts/a/renditions/full?token=private",
          "/v1/artifacts/a/renditions/full", "project-assets/u/a.webp", "/storage/v1/object/sign/project-assets/a.webp",
          "https://example.supabase.co/storage/v1/object/sign/project-assets/u/a.webp?token=private",
          `${OSS}/project-assets/u/a.webp`, `${OSS}/assets/private/a.webp`,
          `${OSS}/assets/project-assets/u/a.webp`,
          `${OSS}/assets/image/a.webp?OSSAccessKeyId=id&Expires=123&Signature=signature`,
          `${OSS}/assets/image/a.webp?x-oss-signature=signature`,
          `${OSS}/assets/image/a.webp?token=private`,
          `${OSS}/assets/image/a.webp?X-Amz-Signature=signature`,
          `${OSS}/assets/image/a.webp?unknown=capability`,
          "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com.evil.test/assets/image/a.webp",
          "https://user:pass@oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/a.webp",
          `${OSS}:444/assets/image/a.webp`, `${OSS}/assets/image/../private/a.webp`,
          "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com\\extra/assets/image/a.webp",
          `${OSS}/assets/image/%2e%2e/a.webp`, `${OSS}/assets/image/a%2Fb.webp`,
          "http://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/a.webp",
          "//oceanleo-assets.oss-cn-guangzhou.aliyuncs.com/assets/image/a.webp",
          "data:image/png;base64,AA==", "blob:https://oceanleo.com/id",
        ]) assert.equal(module.resolvePublicAssetMedia(url, { purpose, family }), url);
      });
    }
  }
}

test("empty and invalid object keys cannot become public media", () => {
  for (const key of ["", " ", "../a", "assets/image/../a", "assets/image/%2e%2e/a", "assets/image/a\\b", "assets/image/%00a", "assets/image/%zz"]) {
    assert.equal(enabled.resolvePublicAssetMedia(key, { purpose: "full", family: "com" }), "", key);
  }
});

test("explicit family produces identical SSR/client URLs, independent of ambient host", () => {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, "window");
  try {
    for (const family of ["com", "cn", "ws"]) {
      Reflect.deleteProperty(globalThis, "window");
      const server = enabled.resolvePublicAssetMedia("cap-app/demo", { purpose: "thumb", family });
      Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { host: "oceanleo.cn" } } });
      assert.equal(enabled.resolvePublicAssetMedia("cap-app/demo", { purpose: "thumb", family }), server);
    }
  } finally {
    if (descriptor) Object.defineProperty(globalThis, "window", descriptor);
    else Reflect.deleteProperty(globalThis, "window");
  }
});

for (const [flag, module] of [[false, disabledModule], [true, enabledModule]]) {
  const thumbs = await import(await compileModule("src/lib/asset-thumb.ts", { "./asset-delivery": module }));
  const design = await import(await compileModule("src/shell/image-editor/design-document-snapshot.ts",
    { "../../lib/asset-delivery": module }));
  const bay = await import(await compileModule("src/shell/bay/form/post-templates.ts",
    { "../../../lib/asset-delivery": module }));
  test(`flag=${flag}: home/template helpers, design assets and Bay presets use regional delivery`, () => {
    for (const family of ["com", "cn", "ws"]) {
      const origin = flag && family !== "cn" ? CDN : OSS;
      assert.equal(thumbs.assetThumbUrl("cap-app/demo", family), `${origin}/assets/image/cap-app/demo.thumb.webp`);
      assert.equal(thumbs.assetPreviewUrl("cap-app/demo", family), `${origin}/assets/image/cap-app/demo.webp`);
      assert.equal(design.designAssetUrl("assets/icon/图 标.svg", family), `${origin}/assets/icon/${encodeURIComponent("图 标.svg")}`);
      const presets = bay.builtinTemplates("digital", family);
      assert.equal(presets.length, bay.DIGITAL_MATERIAL_KINDS.length);
      for (const preset of presets) {
        assert.ok(preset.coverUrl.startsWith(`${origin}/assets/`));
        assert.deepEqual(preset.coverUrls, [preset.coverUrl]);
        assert.ok(!preset.coverUrl.includes(".webp.thumb.webp"));
      }
      assert.ok(presets.find((preset) => preset.materialKind === "video").coverUrl.endsWith(".poster.webp"));
    }
    for (const key of ["https://foreign.example/a.webp", "../a", "/a", "javascript:1"]) {
      assert.equal(design.designAssetUrl(key, "com"), "");
    }
  });
  test(`flag=${flag}: implicit family follows host configuration at call time in SSR and browser`, () => {
    const config = Object.getOwnPropertyDescriptor(globalThis, CLIENT_HOST_CONFIG_GLOBAL_KEY);
    const browser = Object.getOwnPropertyDescriptor(globalThis, "window");
    try {
      for (const family of ["com", "cn", "ws"]) {
        Object.defineProperty(globalThis, CLIENT_HOST_CONFIG_GLOBAL_KEY, { configurable: true, value: {
          family, portalOrigin: "https://portal.example", gatewayOrigin: "https://api.example", identityOrigin: "https://identity.example",
        } });
        Reflect.deleteProperty(globalThis, "window");
        const origin = flag && family !== "cn" ? CDN : OSS;
        const server = thumbs.assetThumbUrl("cap-app/demo");
        assert.equal(server, `${origin}/assets/image/cap-app/demo.thumb.webp`);
        Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { host: "oceanleo.cn" } } });
        assert.equal(thumbs.assetThumbUrl("cap-app/demo"), server);
        assert.ok(bay.builtinTemplates("digital").every((row) => row.coverUrl.startsWith(origin + "/")));
        assert.equal(design.designAssetUrl("assets/image/demo.webp"), `${origin}/assets/image/demo.webp`);
      }
    } finally {
      if (config) Object.defineProperty(globalThis, CLIENT_HOST_CONFIG_GLOBAL_KEY, config);
      else Reflect.deleteProperty(globalThis, CLIENT_HOST_CONFIG_GLOBAL_KEY);
      if (browser) Object.defineProperty(globalThis, "window", browser);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
}

// UC-1/UC-7: docs/architecture/oceanleo-untrusted-content-isolation.md.
for (const family of ["com", "ws", "cn"]) {
  test(`audited on-demand previews keep exact paths and select the ${family} host`, () => {
    const origin = family === "cn" ? OSS : CDN;
    for (const kind of ["ecommerce", "flowchart", "poster", "resume"]) {
      const key = `ondemand/oceanleo-${kind}-wash/ab/${"a".repeat(64)}.preview.png`;
      for (const purpose of ["thumb", "preview", "full"]) {
        assert.equal(enabled.resolvePublicAssetMedia(key, { purpose, family }), `${origin}/${key}`);
        assert.equal(enabled.resolvePublicAssetMedia(`${OSS}/${key}`, { purpose, family }), `${origin}/${key}`);
        assert.equal(disabled.resolvePublicAssetMedia(key, { purpose, family }), `${OSS}/${key}`);
        assert.equal(enabled.resolvePublicAssetMedia(`${OSS}/${key}?x-oss-process=image/resize,w_300`, { purpose, family }), `${origin}/${key}?x-oss-process=image/resize,w_300`);
      }
    }
  });
}
test("on-demand source expansion refuses private, signed, unknown and executable media", () => {
  for (const key of [
    "ondemand/user/a.png", "ondemand/met/a.png", "ondemand/oceanleo-resume-wash-evil/a.png",
    "ondemand/oceanleo-resume-wash/a.docx", "ondemand/oceanleo-resume-wash/a.html",
    "ondemand/oceanleo-resume-wash/a.svg", "ondemand/oceanleo-resume-wash/private/a.png",
    "ondemand/oceanleo-resume-wash/a.png?token=secret",
  ]) {
    assert.equal(enabled.resolvePublicAssetMedia(key, { purpose: "preview", family: "com" }), key);
    const url = `${OSS}/${key}`;
    assert.equal(enabled.resolvePublicAssetMedia(url, { purpose: "preview", family: "ws" }), url);
  }
});
