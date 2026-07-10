import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPrivateWorkspaceRuntime } from "../src/lib/auth/workspace-privacy.ts";

const source = await readFile(
  new URL("../src/lib/auth/middleware.ts", import.meta.url),
  "utf8",
);

test("workspace、history 与 embed 统一下发 no-store/noindex", () => {
  assert.match(source, /isPrivateWorkspaceRuntime\(/);
  assert.match(
    source,
    /private, no-store, no-cache, max-age=0, must-revalidate/,
  );
  assert.match(source, /CDN-Cache-Control", "private, no-store"/);
  assert.match(source, /Vercel-CDN-Cache-Control", "private, no-store"/);
  assert.match(
    source,
    /X-Robots-Tag", "noindex, nofollow, noarchive"/,
  );
  assert.match(source, /Referrer-Policy", "no-referrer"/);
});

test("隐私路径判定覆盖语言前缀且不误伤相似公开路径", () => {
  assert.equal(isPrivateWorkspaceRuntime("/workspace"), true);
  assert.equal(isPrivateWorkspaceRuntime("/workspace/report"), true);
  assert.equal(isPrivateWorkspaceRuntime("/zh/history/session-1"), true);
  assert.equal(isPrivateWorkspaceRuntime("/en/workspace/report"), true);
  assert.equal(isPrivateWorkspaceRuntime("/workspace-public"), false);
  assert.equal(isPrivateWorkspaceRuntime("/about/history-book"), false);
  assert.equal(isPrivateWorkspaceRuntime("/anything", true), true);
});
