// 2026-10-23 editor overhaul W08 R2: 图片栏「替换」上传成功后图要真的换掉。
// 旧实现等上传回来才看「当前是否选中图片」，焦点离开过编辑器就落空（实测：上传 200，图没换）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(new URL("../src/shell/doc-editors/use-rich-doc-editor.ts", import.meta.url), "utf8");
const start = source.indexOf("const replaceSelectedImage = useCallback");
const body = source.slice(start, source.indexOf("[editor, requireSourceReady, siteId, tt]", start));

test("replace pins the selected image before the upload and writes back to that node", () => {
  assert.ok(start > 0);
  const pin = body.indexOf("const targetPos");
  const upload = body.indexOf("await uploadFile(");
  assert.ok(pin > 0 && upload > pin, "the target is captured before awaiting the upload");
  assert.match(body, /const targetSrc = /);
  assert.match(body, /setNodeSelection\(pos\)\s*\.updateAttributes\("image", \{ src: url, alt: file\.name \}\)/);
  // No post-upload "is an image still selected" gate any more.
  assert.doesNotMatch(body.slice(upload), /if \(!editor\.isActive\("image"\)\)/);
});
