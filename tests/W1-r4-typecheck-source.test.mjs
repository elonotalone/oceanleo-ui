/**
 * W1-r4: DOCX typed-array views become a real ArrayBuffer before mammoth.
 */
import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { Document, ImageRun, Packer, Paragraph } from "docx";

import { loadRichDocHtml } from "../src/shell/doc-editors/rich-doc-model.ts";

const SCAN_HTML =
  '<p><img src="https://files.example.test/page.png" alt="扫描页"></p>';
const TINY_PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64",
);

function scanDocxItem() {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    key: "artifact:00000000-0000-4000-8000-000000000001",
    source: "artifact",
    artifactId: "00000000-0000-4000-8000-000000000001",
    revisionId: "rev-scan",
    title: "扫描页",
    kind: "document",
    siteId: "home",
    favorite: false,
    url: "https://files.example.test/scan.docx",
    previewUrl: "https://files.example.test/scan.docx",
    meta: {
      filename: "scan.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      source_format: "docx",
    },
  };
}

test("W1-r4 DOCX Uint8Array view loads without SharedArrayBuffer", async () => {
  const doc = new Document({
    sections: [
      {
        children: [
          new Paragraph({
            children: [
              new ImageRun({
                type: "png",
                data: TINY_PNG_BYTES,
                transformation: { width: 24, height: 24 },
              }),
            ],
          }),
        ],
      },
    ],
  });
  const packed = Buffer.from(await Packer.toBuffer(doc));
  const view = new Uint8Array(packed.buffer, packed.byteOffset, packed.byteLength);
  const item = scanDocxItem();
  const loaded = await loadRichDocHtml(item, undefined, {
    fetchDocx: async () => view,
  });
  assert.equal(loaded.error, "");
  assert.equal(loaded.source, "url-docx");
  assert.match(loaded.html, /img/i);
});
