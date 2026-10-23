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

// D5（2026-10-23）：菜单是素材类别，顺序与名字由操作员定死。
const MENU = ["视频", "网站", "演示文稿", "文档", "表格", "图片", "PDF", "音频", "视频画布", "3D 模型", "游戏"];

test("the Type menu lists the 11 material categories in order, with no editor names", () => {
  const rows = taxonomy.LIBRARY_EDITOR_CATEGORIES;
  assert.deepEqual(rows.map((row) => row.typeLabel), MENU);
  assert.deepEqual(rows.map((row) => row.label), MENU, "the menu label is the type name, never the editor name");
  for (const row of rows) {
    assert.doesNotMatch(row.label, /编辑|创作|editing|设计画布/i);
  }
  assert.equal(rows.some((row) => row.value === "design_canvas"), false);
  const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  assert.match(mine, /translateLibraryTypeLabel\(tt, option\.typeLabel\)/);
  assert.doesNotMatch(mine, /tt\(option\.label\)/);
});

test("every capability family selects its own entries; design canvas folds into images", () => {
  const rows = contract.ADVANCED_CAPABILITY_MATRIX;
  assert.equal(rows.length, 12, "the capability plane itself keeps design_canvas");
  const entries = rows.map((row) => model.workspaceEntryFromLibraryItem(itemFor(row)));
  for (const row of rows) {
    // Shelf identity is still the real capability; only the library category folds.
    assert.equal(taxonomy.libraryEditorFeatureId(itemFor(row)), row.featureId);
    if (row.featureId === "design_canvas" || row.featureId === "image_editing") continue;
    const matches = model.filterWorkspaceLibraryEntries(entries, "", row.featureId);
    assert.deepEqual(matches.map((entry) => entry.id), [row.featureId]);
  }
  const images = model.filterWorkspaceLibraryEntries(entries, "", "image_editing");
  assert.deepEqual(images.map((entry) => entry.id).sort(), ["design_canvas", "image_editing"]);
  const design = itemFor(rows.find((row) => row.featureId === "design_canvas"));
  assert.equal(taxonomy.libraryEditorCategory(design), "image_editing");
  assert.equal(taxonomy.libraryEditorLabel(design), "图片");
});

test("legacy ?category=design, design_canvas and old editor names land on the image category", () => {
  const rows = contract.ADVANCED_CAPABILITY_MATRIX;
  const design = model.workspaceEntryFromLibraryItem(itemFor(rows.find((row) => row.featureId === "design_canvas")));
  for (const alias of ["design", "design_canvas", "设计画布", "canvas", "图片编辑", "images", "图片"]) {
    assert.equal(taxonomy.normalizeLibraryCategory(alias), "image_editing", alias);
    assert.equal(model.filterWorkspaceLibraryEntries([design], "", alias).length, 1, alias);
  }
  assert.equal(taxonomy.normalizeLibraryCategory("视频编辑"), "video_editing");
  assert.equal(taxonomy.normalizeLibraryCategory("3D"), "model_3d");
  assert.equal(taxonomy.libraryCategoryLabel("design"), "图片");
  assert.equal(taxonomy.libraryCategoryLabel("model_3d"), "3D 模型");
});

test("PDF/document, chart/image and workflow variants stay distinct without available editors", () => {
  const make = (type, capability, kind) => itemFor({ featureId: type, artifactType: type, editorCapability: capability }, { kind });
  assert.equal(taxonomy.libraryEditorLabel(make("pdf", "pdf-editor", "document")), "PDF");
  assert.equal(taxonomy.libraryEditorLabel(make("document", "richdoc-editor", "document")), "文档");
  assert.equal(taxonomy.libraryEditorLabel(make("chart", "chart-editor", "image")), "图表");
  assert.equal(taxonomy.libraryEditorLabel(make("composite_image", "design-canvas", "image")), "图片");
  assert.equal(taxonomy.libraryEditorLabel(make("composite_image", "composite-image-editor", "image")), "图片");
  assert.equal(taxonomy.libraryEditorLabel(make("workflow", "design-canvas", "video_canvas")), "图片");
  assert.equal(taxonomy.libraryEditorLabel(make("workflow", "video-canvas", "video_canvas")), "视频画布");
  assert.equal(taxonomy.libraryEditorLabel({ key: "c", title: "", kind: "canvas", meta: {} }), "图片");
  assert.equal(taxonomy.libraryEditorLabel(make("model_3d", "model-3d-editor", "threed")), "3D 模型");
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

test("type names translate through context keys where the flat dictionary is ambiguous", async () => {
  const { register } = await import("node:module");
  register("./ts-extension-loader.mjs", import.meta.url);
  const { UI_MESSAGES } = await import("../src/i18n/ui/messages/index.ts");
  const ttFor = (locale) => (zh) => UI_MESSAGES[locale][zh] || zh;
  const label = (locale, zh) => taxonomy.translateLibraryTypeLabel(ttFor(locale), zh);
  // The plain keys keep their other meanings (deck "Table" tool, "Games" channel)…
  assert.equal(UI_MESSAGES.en["表格"], "Table");
  // …while the library type menu reads as material categories.
  assert.deepEqual(MENU.map((zh) => label("en", zh)), [
    "Video", "Website", "Presentation", "Document", "Spreadsheet", "Image", "PDF",
    "Audio", "Video canvas", "3D model", "Game",
  ]);
  assert.deepEqual(MENU.map((zh) => label("zh", zh)), MENU, "Chinese falls back to the type name, never the context key");
  for (const locale of Object.keys(UI_MESSAGES).filter((value) => value !== "zh")) {
    for (const zh of MENU) {
      const text = label(locale, zh);
      assert.ok(text, `${locale} ${zh} has a label`);
      assert.doesNotMatch(text, /素材类别/, `${locale} ${zh} never shows the context key`);
      if (!["zh-TW", "ja"].includes(locale)) {
        assert.doesNotMatch(text, /[一-鿿]/, `${locale} ${zh} → ${text}`);
      }
    }
  }
  assert.equal(label("zh-TW", "表格"), "試算表");
  assert.equal(label("ja", "游戏"), "ゲーム");
});

test("valid empty categories return empty results and the component never resets selection based on loaded rows", () => {
  assert.deepEqual(model.filterWorkspaceLibraryEntries([], "", "pdf_editing"), []);
  const source = readFileSync(new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(source, /categories\.some\([\s\S]{0,120}setCategory\("all"\)/);
  assert.match(source, /setCategory\(next\.category\)/);
  const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  assert.match(mine, /category: libraryEditorCategory\(item\)/);
});
