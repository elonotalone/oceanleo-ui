import assert from "node:assert/strict";
import test from "node:test";
import { officialTemplatePreviewHref, templateMaterialToBayAsset } from "../src/shell/bay/asset/bay-template-shelf.ts";
import { workspaceTemplatePreviewHref } from "../src/shell/site-catalog-controller.ts";

const material = { id: "catalog-deck", title: "Presentation", summary: "Summary", tags: ["education"],
  previewKey: "tpl-material/deck", artifactId: "11111111-1111-4111-8111-111111111111", artifactType: "deck",
  siteKey: "ppt", appId: "lesson", width: 1600, height: 900, deliveryFamily: "pptx", activeRuntimeUrl: "" };

test("taxonomy shelf projection keeps the published catalog identity, cover, metadata and zero price", () => {
  const asset = templateMaterialToBayAsset(material, "ppt");
  assert.equal(asset.id, "template-material:catalog-deck");
  assert.equal(asset.title, "Presentation");
  assert.equal(asset.type, "ppt");
  assert.equal(asset.catalog.catalogId, "catalog-deck");
  assert.equal(asset.catalog.artifactId, material.artifactId);
  assert.equal(asset.catalog.artifactType, "deck");
  assert.equal(asset.catalog.revisionId, null);
  assert.equal(asset.price_fen, 0);
  assert.equal(asset.shelfKind, "official");
  assert.equal(asset.width, 1600); assert.equal(asset.height, 900);
  assert.ok(asset.thumb_url); assert.ok(asset.entry);
  assert.deepEqual(asset.tags, ["education"]);
});

test("document and PDF keep their real detail carriers within the same shelf", () => {
  const doc = templateMaterialToBayAsset({ ...material, artifactType: "document" }, "document");
  const pdf = templateMaterialToBayAsset({ ...material, artifactType: "pdf" }, "pdf");
  assert.equal(doc.catalog.artifactType, "document");
  assert.equal(pdf.catalog.artifactType, "pdf");
  assert.equal(doc.type, "document"); assert.equal(pdf.type, "pdf");
});

test("official preview opens the app inside its site workspace on the main site", () => {
  assert.equal(
    officialTemplatePreviewHref("landing", "artifact-id", "website"),
    "/workspace/website/landing?tab=materials&item=artifact-id&mode=preview",
  );
  assert.equal(
    officialTemplatePreviewHref("lesson", "artifact-id", "ppt"),
    workspaceTemplatePreviewHref("lesson", "artifact-id", { canonicalBasePath: "/workspace/ppt" }),
  );
  // Without a usable site key the old shape stays (no guessed site, no host).
  assert.equal(
    officialTemplatePreviewHref("landing", "artifact-id", ""),
    workspaceTemplatePreviewHref("landing", "artifact-id"),
  );
  assert.equal(templateMaterialToBayAsset(material, "ppt").openHref.startsWith("/workspace/ppt/lesson?"), true);
});
