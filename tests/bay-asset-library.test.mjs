import assert from "node:assert/strict";
import test from "node:test";

import { DOCUMENT_ZONES, documentZonesForType } from "../src/shell/bay/asset/document-zones.ts";
import { canonicalBayFeedKind, normalizeBayFeedKind } from "../src/shell/bay/shell/bay-links.ts";


test("文书区按类型切开，合同区只出现在文档", () => {
  const docs = documentZonesForType("document").map((zone) => zone.slug);
  assert.deepEqual(docs, ["contract", "diligence", "litigation", "lawyer", "resume"]);
  assert.equal(documentZonesForType("ppt").some((zone) => zone.slug === "flowchart"), true);
  assert.equal(documentZonesForType("image").some((zone) => zone.slug === "poster"), true);
  assert.equal(DOCUMENT_ZONES.length, 8);
});



test("三类视图：老地址落到 service/asset/request", () => {
  assert.equal(normalizeBayFeedKind("material"), "asset");
  assert.equal(normalizeBayFeedKind("supply"), "service");
  assert.equal(normalizeBayFeedKind("demand"), "request");
  assert.equal(canonicalBayFeedKind(undefined), "asset");
});
