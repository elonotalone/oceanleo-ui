import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compileModule } from "./helpers/module-bench.mjs";

const contractUrl = await compileModule("src/shell/artifact-contract.ts");
const contract = await import(contractUrl);
const taxonomyUrl = await compileModule("src/shell/library-editor-category.ts", { "./artifact-contract": contractUrl });
const taxonomy = await import(taxonomyUrl);
const model = await import(await compileModule("src/shell/workspace-library-model.ts", { "./library-editor-category": taxonomyUrl }));
const itemFor = (row, overrides = {}) => ({
  key: row.featureId, id: row.featureId, title: "sample", source: "artifact",
  kind: "document", siteId: "", favorite: false, meta: { library_source: "upload" },
  artifactType: row.artifactType,
  artifact: { artifactType: row.artifactType, editorCapability: row.editorCapability,
    sourceFormat: row.sourceFormat, editability: "view_only", source: null },
  ...overrides,
});

test("12 declared editor families each select exactly their own actual workspace entry", () => {
  const rows = contract.ADVANCED_CAPABILITY_MATRIX;
  assert.equal(rows.length, 12);
  const entries = rows.map((row) => model.workspaceEntryFromLibraryItem(itemFor(row)));
  for (const row of rows) {
    const matches = model.filterWorkspaceLibraryEntries(entries, "", row.featureId);
    assert.deepEqual(matches.map((entry) => entry.id), [row.featureId]);
    assert.equal(taxonomy.libraryEditorFeatureId(itemFor(row)), row.featureId);
  }
});

test("PDF/document, chart/image, design/image and workflow variants stay distinct without available editors", () => {
  const make = (type, capability, kind) => itemFor({ featureId: type, artifactType: type, editorCapability: capability }, { kind });
  assert.equal(taxonomy.libraryEditorLabel(make("pdf", "pdf-editor", "document")), "PDF");
  assert.equal(taxonomy.libraryEditorLabel(make("document", "richdoc-editor", "document")), "文档");
  assert.equal(taxonomy.libraryEditorLabel(make("chart", "chart-editor", "image")), "图表");
  assert.equal(taxonomy.libraryEditorLabel(make("composite_image", "design-canvas", "image")), "设计画布");
  assert.equal(taxonomy.libraryEditorLabel(make("composite_image", "composite-image-editor", "image")), "图片");
  assert.equal(taxonomy.libraryEditorLabel(make("workflow", "design-canvas", "video_canvas")), "设计画布");
  assert.equal(taxonomy.libraryEditorLabel(make("workflow", "video-canvas", "video_canvas")), "视频画布");
});

test("legacy slides and translated labels select canonical entries; unknown files remain available", () => {
  const slides = contract.ADVANCED_CAPABILITY_MATRIX.find((row) => row.featureId === "presentation_editing");
  const entries = [model.workspaceEntryFromLibraryItem(itemFor(slides))];
  for (const alias of ["slides", "presentations", "PPT", "演示文稿"]) {
    assert.equal(model.filterWorkspaceLibraryEntries(entries, "", alias).length, 1);
  }
  const file = { key: "unknown", title: "chart website.pdf", kind: "file", meta: {}, artifactType: "unknown" };
  assert.equal(taxonomy.libraryEditorFeatureId(file), null);
  assert.equal(taxonomy.libraryEditorLabel(file), "文件");
  assert.equal(model.filterWorkspaceLibraryEntries([model.workspaceEntryFromLibraryItem(file)], "", "all").length, 1);
});

test("valid empty categories return empty results and the component never resets selection based on loaded rows", () => {
  assert.deepEqual(model.filterWorkspaceLibraryEntries([], "", "pdf_editing"), []);
  const source = readFileSync(new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /categories\.some\([\s\S]{0,120}setCategory\("all"\)/);
  assert.match(source, /setCategory\(next\.category\)/);
  const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  assert.match(mine, /category: libraryEditorCategory\(item\)/);
});
