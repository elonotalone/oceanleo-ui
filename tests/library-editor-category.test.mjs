import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { compileModule } from "./helpers/module-bench.mjs";
import { UI_MESSAGES } from "../src/i18n/ui/messages/index.ts";
import { loadUiMessages } from "../src/i18n/ui/messages/load.ts";
import { SHEET_NAMING_MESSAGES } from "../src/i18n/ui/messages/sheet-naming-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";

const contractUrl = await compileModule("src/shell/artifact-contract.ts");
const contract = await import(contractUrl);
const taxonomyUrl = await compileModule("src/shell/library-editor-category.ts", { "./artifact-contract": contractUrl });
const taxonomy = await import(taxonomyUrl);
const model = await import(await compileModule("src/shell/workspace-library-model.ts", { "./library-editor-category": taxonomyUrl }));
const item = (artifactType, kind = "document", extra = {}) => ({ id: artifactType, key: artifactType, title: artifactType,
  kind, source: "artifact", meta: {}, artifactType, ...extra });
const MENU = ["演示文稿", "图像", "文档", "电子表格", "网站与应用", "游戏", "视频", "3D 模型", "音频", "文件", "链接"];

test("Library lists professional categories in the agreed order without a separate PDF category", () => {
  const rows = taxonomy.LIBRARY_EDITOR_CATEGORIES;
  assert.deepEqual(rows.map((row) => row.typeLabel), MENU);
  assert.deepEqual(rows.map((row) => row.label), MENU);
  assert.equal(rows.some((row) => ["pdf_editing", "video_canvas", "chart", "geo_map", "interactive_doc"].includes(row.value)), false);
  assert.equal(rows.find((row) => row.filter === "files").label, "文件");
});

test("Documents filter includes both document and PDF while editor capabilities stay distinct", () => {
  const doc = item("document"), pdf = item("pdf");
  assert.equal(taxonomy.libraryEditorFeatureId(pdf), "pdf_editing");
  assert.equal(taxonomy.libraryEditorFeatureId(doc), "document_editing");
  for (const value of [doc, pdf]) {
    assert.equal(taxonomy.libraryEditorCategory(value), "document_editing");
    assert.equal(taxonomy.libraryEditorLabel(value), "文档");
  }
  const entries = [doc, pdf, item("grid", "sheet")].map((value) => model.workspaceEntryFromLibraryItem(value));
  assert.deepEqual(model.filterWorkspaceLibraryEntries(entries, "", "documents").map((row) => row.id), ["document", "pdf"]);
  assert.deepEqual(model.filterWorkspaceLibraryEntries([], "", "documents"), []);
});

test("document format filtering uses stored source format, not file titles", () => {
  const pdf = item("pdf", "document", { title: "report.docx", artifact: { sourceFormat: "pdf" } });
  const docx = item("document", "document", { meta: { format: "DOCX" } });
  assert.equal(taxonomy.libraryMatchesDocumentFormat(pdf, "pdf"), true);
  assert.equal(taxonomy.libraryMatchesDocumentFormat(docx, "pdf"), false);
  assert.equal(taxonomy.libraryMatchesDocumentFormat(pdf, ""), true);
  const mine = readFileSync(new URL("../src/shell/MyLibrary.tsx", import.meta.url), "utf8");
  assert.match(mine, /libraryMatchesDocumentFormat\(item, documentFormat\)/);
  assert.match(mine, /name="format"/);
});

test("all image carriers share Images and unsupported carriers are generic files", () => {
  for (const type of ["single_file_image", "vector_image", "composite_image"]) {
    assert.equal(taxonomy.libraryEditorCategory(item(type, "image")), "image_editing");
    assert.equal(taxonomy.libraryEditorLabel(item(type, "image")), "图像");
  }
  for (const type of ["chart", "geo_map", "interactive_doc", "unknown"]) {
    assert.equal(taxonomy.libraryEditorCategory(item(type, "file")), "files");
    assert.equal(taxonomy.libraryEditorLabel(item(type, "file")), "文件");
  }
});

test("links and generic files can be selected independently of website and document capabilities", () => {
  const link = item("website", "website", { meta: { link_work: { id: "l" } } });
  assert.equal(taxonomy.libraryEditorCategory(link), "links");
  assert.equal(taxonomy.libraryEditorLabel(link), "链接");
  const entries = [link, item("website", "website"), item("unknown", "file")].map((value) => model.workspaceEntryFromLibraryItem(value));
  assert.equal(model.filterWorkspaceLibraryEntries(entries, "", "links").length, 1);
  assert.equal(model.filterWorkspaceLibraryEntries(entries, "", "files").length, 1);
  assert.equal(model.filterWorkspaceLibraryEntries(entries, "", "website").length, 1);
});

test("Library and Sheet names translate in every locale; in-document Table stays Table", async () => {
  for (const locale of LOCALES) {
    const runtime = await loadUiMessages(locale);
    const tt = (key) => UI_MESSAGES[locale][key] || key;
    for (const label of MENU) {
      const result = taxonomy.translateLibraryTypeLabel(tt, label);
      assert.ok(result);
      assert.doesNotMatch(result, /素材类别/);
      if (!["zh", "zh-TW", "ja"].includes(locale)) assert.doesNotMatch(result, /[一-鿿]/, `${locale}: ${result}`);
    }
    for (const key of [...Object.keys(SHEET_NAMING_MESSAGES.en), "Sheet", "Sheet 编辑", "Sheet 编辑器", "网站与应用", "全部格式", "其他文档格式"]) {
      assert.ok(UI_MESSAGES[locale][key], `${locale}: ${key}`);
      if (locale !== "zh") assert.equal(runtime[key], UI_MESSAGES[locale][key]);
    }
  }
  assert.equal(UI_MESSAGES.en["表格"], "Table");
  assert.equal(UI_MESSAGES.en.Sheet, "Sheet");
  assert.equal(UI_MESSAGES.zh.Sheet, "Sheet");
  assert.equal(taxonomy.translateLibraryTypeLabel((key) => UI_MESSAGES.en[key] || key, "电子表格"), "Spreadsheet");
});
