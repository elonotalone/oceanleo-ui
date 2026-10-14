import test from "node:test";
import assert from "node:assert/strict";
import { compileModule } from "./helpers/module-bench.mjs";

const { normalizeUserMessage, safeImagePreview } = await import(await compileModule("src/shell/cloud-computer/agent-dialog/message-attachments.ts"));

test("Codex replay link becomes an attachment without dumping a large photo into text", () => {
  const data = "a".repeat(974000);
  const result = normalizeUserMessage(`Explain\n[@image](data:image/png;base64,${data})`);
  assert.deepEqual(result, { text: "Explain\n", attachments: [{ name: "图片", mime: "image/png" }] });
  const truncated = normalizeUserMessage(`Explain\n[@image](data:image/png;base64,${data}…`);
  assert.equal(truncated.text, "Explain\n");
  assert.equal(truncated.attachments.length, 1);
});

test("photo-only replay and serialized text plus image remain visible", () => {
  const result = normalizeUserMessage("[@image](data:image/jpeg;base64,YWJj)");
  assert.equal(result.text, "");
  assert.equal(result.attachments[0].preview, "data:image/jpeg;base64,YWJj");
  const mixed = normalizeUserMessage(JSON.stringify([{ type: "text", text: "Explain" }, { type: "image", mimeType: "image/png", data: "YWJj" }]));
  assert.equal(mixed.text, "Explain");
  assert.equal(mixed.attachments.length, 1);
});

test("normal JSON remains text; preview source rejects SVG and active or remote URLs", () => {
  assert.equal(normalizeUserMessage('{"type":"example","data":"abc"}').text, '{"type":"example","data":"abc"}');
  for (const src of ["javascript:alert(1)", "https://example.com/a.png", "data:image/svg+xml;base64,YWJj", "data:image/png;base64," + "a".repeat(128 * 1024)]) {
    assert.equal(safeImagePreview(src), undefined);
  }
});
