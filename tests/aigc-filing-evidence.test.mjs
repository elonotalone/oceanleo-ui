// Synthetic module fixtures processed by actual exporters. No UI/model claim.
import assert from "node:assert/strict";
import test from "node:test";
import { mkdir, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import JSZip from "jszip";
import { shareMessagesToDocxBlob } from "../src/shell/share/share-docx.ts";
import { markdownToShareBlocks } from "../src/shell/share/share-blocks.ts";
import { tiptapJsonToDocxBlob } from "../src/shell/doc-editors/docx-export.ts";
import { AIGC_TEXT_NOTICE, withAigcTextNotice } from "../src/contracts/aigc-label.ts";

test("write real exporter files for independent filing readback", async () => {
  const dir = process.env.AIGC_FILING_EVIDENCE_DIR || await mkdtemp(path.join(tmpdir(), "aigc-evidence-"));
  await mkdir(dir, { recursive: true });
  process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL = "1";
  const text = "模块验证样例：这是一段用于验证生成内容标识的中性文本。并非模型实时生成结果。";
  const root = { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] };
  const share = (role) => ({ title: "标识模块验证样例", brand: "OceanLeo", contentId: "fixture-conversation", messages: [{ role, speaker: role, blocks: markdownToShareBlocks(text) }] });
  const outputs = [
    ["assistant-export.docx", await shareMessagesToDocxBlob(share("assistant")), true],
    ["user-only-export.docx", await shareMessagesToDocxBlob(share("user")), false],
    ["unprovenanced-editor-export.docx", await tiptapJsonToDocxBlob("上传文档验证", root), false],
    ["known-generated-editor-export.docx", await tiptapJsonToDocxBlob("生成文档验证", root, { generated: true }), true],
  ];
  for (const [name, blob, generated] of outputs) {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const zip = await JSZip.loadAsync(bytes);
    const custom = await zip.file("docProps/custom.xml")?.async("string") || "";
    const body = await zip.file("word/document.xml").async("string");
    assert.equal(custom.includes('name="AIGC"'), generated);
    assert.equal(body.includes(AIGC_TEXT_NOTICE), generated);
    await writeFile(path.join(dir, name), bytes);
  }
  await writeFile(path.join(dir, "assistant-copy.txt"), withAigcTextNotice(text));
  process.env.NEXT_PUBLIC_OCEANLEO_AIGC_LABEL = "0";
  assert.equal(withAigcTextNotice(text), text);
  const overseas = await shareMessagesToDocxBlob(share("assistant"));
  await writeFile(path.join(dir, "overseas-assistant-export.docx"), new Uint8Array(await overseas.arrayBuffer()));
});
