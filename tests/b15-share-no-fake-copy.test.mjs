import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(
  new URL("../src/shell/share/useShareMode.ts", import.meta.url),
  "utf8",
);

test("创建分享失败时不回退复制任务页 URL", () => {
  assert.doesNotMatch(source, /兜底回落/);
  assert.doesNotMatch(source, /new URL\(window\.location\.href\)/);
  assert.match(source, /const url = await ensureLink\(\);/);
  assert.match(source, /分享链接创建失败，请稍后再试。/);
});

test("分享链接没建成时，长图不拿站点首页冒充二维码", () => {
  const start = source.indexOf("const generateImage = useCallback");
  const end = source.indexOf("const generateDocument = useCallback");
  assert.ok(start > 0 && end > start);
  const body = source.slice(start, end);
  assert.doesNotMatch(body, /window\.location/);
  assert.match(body, /link = await ensureLink\(\);/);
  assert.match(body, /if \(!link\) \{\s*say\("error", tt\("长图已生成，但分享链接没建成，图上没有二维码。"\)\);/);
});

