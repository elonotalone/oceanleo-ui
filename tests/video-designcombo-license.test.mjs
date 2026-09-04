import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const license = new URL(
  "../src/shell/video-editor/vendor/react-video-editor/LICENSE",
  import.meta.url,
);
const notice = new URL(
  "../src/shell/video-editor/vendor/react-video-editor/NOTICE.md",
  import.meta.url,
);
const sha = new URL(
  "../src/shell/video-editor/vendor/react-video-editor/upstream-sha.txt",
  import.meta.url,
);
const timeline = new URL(
  "../src/shell/video-editor/vendor/react-video-editor/upstream/timeline.tsx.upstream",
  import.meta.url,
);
const exportHook = new URL(
  "../src/shell/video-editor/vendor/react-video-editor/upstream/use-export.ts.upstream",
  import.meta.url,
);

test("OpenVideo LICENSE is vendored verbatim and names the ≤3-person free tier", () => {
  assert.equal(existsSync(license), true);
  const text = readFileSync(license, "utf8");
  assert.match(text, /OpenVideo License/);
  assert.match(text, /up to 3 employees/);
  assert.match(text, /Company License/);
});

test("vendor snapshot pins commit 9a8c529 and keeps the timeline/inspector sources", () => {
  const pin = readFileSync(sha, "utf8");
  assert.match(pin, /9a8c5296da4b258f66dfb7ad73de96be62478bca/);
  assert.match(readFileSync(notice, "utf8"), /OpenVideo License/);
  assert.equal(existsSync(timeline), true);
  const exp = readFileSync(exportHook, "utf8");
  assert.match(exp, /@openvideo\/engine-pixi/);
  assert.doesNotMatch(exp, /@remotion/);
});
