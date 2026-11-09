import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const mod = await import(await compileModule("src/shell/attachment-file-viewer.tsx", {
  "../i18n/ui/useUI": dataModule("export function useUI(){ return (value) => value; }"),
  "./library-data": dataModule(""),
}));

const item = (name, mime = "") => ({
  key: name, source: "creation", id: name, title: name, kind: "file", siteId: "oceanleo",
  favorite: false, meta: { attachment_preview: true, filename: name, mime },
});

test("generic attachment viewer selects safe text, zip, and unknown previews", () => {
  assert.equal(mod.isAttachmentFilePreview(item("notes.md", "text/markdown")), true);
  assert.equal(mod.isAttachmentFilePreview(item("data.json", "application/json")), true);
  assert.equal(mod.isAttachmentFilePreview(item("archive.zip", "application/zip")), true);
  assert.equal(mod.isAttachmentFilePreview(item("photo.png", "image/png")), false);
  assert.equal(mod.isAttachmentFilePreview(item("report.pdf", "application/pdf")), false);
  assert.equal(mod.isAttachmentFilePreview(item("report.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")), false);
});

test("viewer source is rendered as a preformatted text surface, never injected HTML", () => {
  return readFile(new URL("../src/shell/attachment-file-viewer.tsx", import.meta.url), "utf8").then((source) => {
    assert.match(source, /<pre[\s\S]*\{body\}/);
    assert.doesNotMatch(source, /dangerouslySetInnerHTML/);
  });
});
