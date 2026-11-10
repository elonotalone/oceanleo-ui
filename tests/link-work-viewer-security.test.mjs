import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = await readFile(new URL("../src/shell/works/LinkWorkViewer.tsx", import.meta.url), "utf8");

test("UC-3 link viewer keeps an opaque sandbox and referrer policy", () => {
  assert.match(source, /allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-downloads/);
  assert.doesNotMatch(source, /allow-same-origin/);
  assert.match(source, /referrerPolicy="no-referrer"/);
});
