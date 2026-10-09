import assert from "node:assert/strict";
import test from "node:test";

import { defaultAssetTypeForSite, liveSearchAvailable } from "../src/shell/bay/asset/library-client.ts";
import { DOCUMENT_ZONES, documentZonesForType } from "../src/shell/bay/asset/document-zones.ts";
import { canonicalBayFeedKind, normalizeBayFeedKind } from "../src/shell/bay/shell/bay-links.ts";

test("站点落到默认素材类型，类型芯片仍可独立切换", () => {
  assert.equal(defaultAssetTypeForSite("word"), "document");
  assert.equal(defaultAssetTypeForSite("ppt"), "ppt");
  assert.equal(defaultAssetTypeForSite("video"), "video");
  assert.equal(defaultAssetTypeForSite("image"), "image");
  assert.equal(defaultAssetTypeForSite("threed"), "3d");
  assert.equal(defaultAssetTypeForSite("excel"), "chart");
  assert.equal(defaultAssetTypeForSite("unknown"), "image");
});

test("文书区按类型切开，合同区只出现在文档", () => {
  const docs = documentZonesForType("document").map((zone) => zone.slug);
  assert.deepEqual(docs, ["contract", "diligence", "litigation", "lawyer", "resume"]);
  assert.equal(documentZonesForType("ppt").some((zone) => zone.slug === "flowchart"), true);
  assert.equal(documentZonesForType("image").some((zone) => zone.slug === "poster"), true);
  assert.equal(DOCUMENT_ZONES.length, 8);
});

test("实时搜索只开给有上游的类型", () => {
  assert.equal(liveSearchAvailable("image"), true);
  assert.equal(liveSearchAvailable("video"), true);
  assert.equal(liveSearchAvailable("document"), false);
  assert.equal(liveSearchAvailable("ppt"), false);
  assert.equal(liveSearchAvailable("website"), false);
});

test("三类视图：老地址落到 service/asset/request", () => {
  assert.equal(normalizeBayFeedKind("material"), "asset");
  assert.equal(normalizeBayFeedKind("supply"), "service");
  assert.equal(normalizeBayFeedKind("demand"), "request");
  assert.equal(canonicalBayFeedKind(undefined), "service");
});
