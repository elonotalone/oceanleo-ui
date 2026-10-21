import assert from "node:assert/strict";
import test from "node:test";
import { zipSync, strToU8 } from "fflate";
import { extractDocumentCoverExcerpt } from "../src/shell/document-cover-excerpt.ts";

const zip = (parts) => zipSync(Object.fromEntries(Object.entries(parts).map(([name, xml]) => [name, strToU8(xml)])));

test("Word and PowerPoint covers show actual paragraphs, safely decoded as text", () => {
  assert.equal(extractDocumentCoverExcerpt(zip({ "word/document.xml": '<w:document><w:p><w:r><w:t>First &amp; second</w:t></w:r></w:p><w:p><w:r><w:t>&lt;script&gt;literal&lt;/script&gt;</w:t></w:r></w:p></w:document>' })), "First & second\n<script>literal</script>");
  assert.equal(extractDocumentCoverExcerpt(zip({ "ppt/slides/slide1.xml": '<a:p><a:r><a:t>Quarterly results</a:t></a:r></a:p>', "ppt/slides/slide2.xml": '<a:t>Not the cover</a:t>' })), "Quarterly results");
});

test("spreadsheet excerpts resolve shared strings, inline text and numeric cells", () => {
  const bytes = zip({
    "xl/sharedStrings.xml": '<sst><si><t>Revenue</t></si></sst>',
    "xl/worksheets/sheet1.xml": '<worksheet><row><c t="s"><v>0</v></c><c><v>2400</v></c><c t="inlineStr"><is><t>USD</t></is></c></row></worksheet>',
  });
  assert.equal(extractDocumentCoverExcerpt(bytes), "Revenue · 2400 · USD");
});

test("invalid packages, unrelated sources and oversized XML never masquerade as document text", () => {
  assert.equal(extractDocumentCoverExcerpt(strToU8('{"title":"Game"}')), "");
  assert.equal(extractDocumentCoverExcerpt(zip({ "source.html": "<script>run()</script>" })), "");
  assert.equal(extractDocumentCoverExcerpt(zip({ "word/document.xml": "<w:t>" + "A".repeat(2 * 1024 * 1024) + "</w:t>" })), "");
});
