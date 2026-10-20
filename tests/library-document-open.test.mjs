import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { zipSync } from "fflate";

import { compileModule } from "./helpers/module-bench.mjs";
import { extractOoxmlEmbeddedThumbnail } from "../src/shell/ooxml-embedded-thumbnail.ts";

const jpeg = Uint8Array.from([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01,
  0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43, 0x00, 0x08,
  0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09, 0x09, 0x08, 0x0a,
  0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12, 0x13, 0x0f, 0x14, 0x1d,
  0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20, 0x24, 0x2e, 0x27, 0x20, 0x22,
  0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29, 0x2c, 0x30, 0x31, 0x34, 0x34, 0x34,
  0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32, 0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0,
  0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4,
  0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xff, 0xda, 0x00, 0x08, 0x01,
  0x01, 0x00, 0x00, 0x3f, 0x00, 0x7f, 0x3f, 0xff, 0xd9,
]);

function officeZip(parts) {
  return zipSync(parts);
}

test("OOXML 内嵌封面只认 jpeg/png，解不出就返回空", () => {
  const withThumb = officeZip({
    "word/document.xml": new TextEncoder().encode("<w:document/>"),
    "docProps/thumbnail.jpeg": jpeg,
  });
  const found = extractOoxmlEmbeddedThumbnail(withThumb);
  assert.ok(found);
  assert.equal(found.mediaType, "image/jpeg");
  assert.equal(found.partName, "docProps/thumbnail.jpeg");
  assert.equal(found.bytes[0], 0xff);
  assert.equal(found.bytes[1], 0xd8);

  const mixedCase = officeZip({
    "word/document.xml": new TextEncoder().encode("<w:document/>"),
    "DocProps/Thumbnail.JPEG": jpeg,
  });
  const mixed = extractOoxmlEmbeddedThumbnail(mixedCase);
  assert.ok(mixed);
  assert.equal(mixed.mediaType, "image/jpeg");

  const without = officeZip({
    "word/document.xml": new TextEncoder().encode("<w:document/>"),
  });
  assert.equal(extractOoxmlEmbeddedThumbnail(without), null);
  assert.equal(extractOoxmlEmbeddedThumbnail(new Uint8Array([0, 1, 2, 3])), null);
});

test("文档才提供 Markdown / Word / PDF 下载，图片视频不提供", async () => {
  const { libraryItemOffersDocumentFormats } = await import(
    await compileModule("src/shell/library-document-export.ts")
  );
  const document = {
    kind: "document",
    title: "需签字盖章页清单.md",
    url: "https://signed.test/list.md",
    previewUrl: "https://signed.test/list.md",
    meta: { filename: "需签字盖章页清单.md", mime: "text/markdown" },
    artifact: {
      renditions: {
        source: {
          mediaType: "text/markdown",
          url: "https://signed.test/list.md",
        },
      },
    },
  };
  const word = {
    kind: "document",
    title: "合同.docx",
    meta: {
      filename: "合同.docx",
      mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
    artifact: {
      renditions: {
        source: {
          mediaType:
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        },
      },
    },
  };
  assert.equal(libraryItemOffersDocumentFormats(document), true);
  assert.equal(libraryItemOffersDocumentFormats(word), true);
  assert.equal(
    libraryItemOffersDocumentFormats({
      kind: "image",
      meta: {},
      artifact: { renditions: { source: { mediaType: "image/png" } } },
    }),
    false,
  );
  assert.equal(
    libraryItemOffersDocumentFormats({
      kind: "ppt",
      meta: { filename: "deck.pptx" },
      artifact: { renditions: {} },
    }),
    false,
  );
});

test("点开文件后库页 chrome 收起，文档 preview 写进查看器 url", () => {
  const mine = readFileSync(resolve("src/shell/MyLibrary.tsx"), "utf8");
  assert.match(mine, /detailOpen \? null/);
  assert.match(mine, /onDetailOpenChange=\{setDetailOpen\}/);
  assert.match(mine, /data-library-collection-chrome/);

  const rendition = readFileSync(
    resolve("src/shell/ArtifactRendition.tsx"),
    "utf8",
  );
  assert.match(
    rendition,
    /item\.kind === "document"[\s\S]*item\.kind === "file"/,
  );
  assert.match(rendition, /url: state\.url, previewUrl: state\.url/);

  const viewers = readFileSync(resolve("src/shell/library-viewers.tsx"), "utf8");
  assert.match(viewers, /viewerMediaType\.startsWith\("text\/"\)/);
  assert.match(viewers, /setTextBody\(text\)/);
  assert.match(
    viewers,
    /item\.kind === "document" \|\| item\.kind === "file"/,
  );

  const thumbnail = readFileSync(
    resolve("src/shell/workspace-library-thumbnail.tsx"),
    "utf8",
  );
  assert.match(thumbnail, /documentShelfCover && item/);

  const cover = readFileSync(
    resolve("src/shell/document-shelf-cover.tsx"),
    "utf8",
  );
  assert.match(cover, /data-document-cover="paper"/);
  assert.match(cover, /data-document-cover="embedded-thumbnail"/);
  assert.match(cover, /extractOoxmlEmbeddedThumbnail/);

  const workspace = readFileSync(
    resolve("src/shell/WorkspaceLibrary.tsx"),
    "utf8",
  );
  assert.match(workspace, /onDetailOpenChange\?\.\(Boolean\(id\)\)/);

  const actions = readFileSync(resolve("src/shell/ArtifactActions.tsx"), "utf8");
  assert.match(actions, /data-artifact-action="share"/);
  assert.match(actions, /Library material order: 分享 → 下载 → 收藏 → 编辑/);
  assert.doesNotMatch(actions, /tt\("链接"\)/);
  const iconBtnClass = actions.match(
    /const iconBtnClass =\s*\n\s*"([^"]+)"/,
  )?.[1];
  assert.ok(iconBtnClass, "icon buttons must share one class string");
  assert.match(iconBtnClass, /hover:bg-/);
  assert.doesNotMatch(iconBtnClass, /\bborder\b/);

  const rich = readFileSync(
    resolve("src/shell/doc-editors/rich-doc-model.ts"),
    "utf8",
  );
  assert.match(rich, /looksLikeTextRichDoc/);
  assert.match(rich, /richDocSourceUrl/);

  const officeSource = readFileSync(
    resolve("src/shell/office-editor/useOfficeArtifactSource.ts"),
    "utf8",
  );
  assert.match(
    officeSource,
    /isDurableLibraryItem\(item\) && officePackageKindForItem\(item\)/,
  );
});
