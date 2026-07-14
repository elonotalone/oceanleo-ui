import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/shell/advanced-session.ts", import.meta.url),
  "utf8",
);

test("advanced session keeps a stable bounded root identity across saved versions", () => {
  assert.match(source, /ADVANCED_SESSION_SCHEMA_VERSION = 2/);
  assert.match(
    source,
    /root_asset_id \|\| item\.meta\.parent_asset_id \|\| item\.id \|\| item\.key/,
  );
  assert.match(source, /stableDigest\(rootId\)/);
  assert.match(source, /\.slice\(0, MAX_APP_ID\)/);
  assert.match(source, /versionId: item\.id/);
  assert.match(source, /task_id: taskId\?\.trim\(\) \|\| null/);
});

test("advanced session parser rejects mismatched identity and unsafe snapshots", () => {
  assert.match(source, /parsed\.protocol === "https:" \|\| parsed\.protocol === "http:"/);
  assert.match(source, /META_KEYS\.has\(key\)/);
  assert.match(source, /encoded\.length > MAX_META_JSON/);
  assert.match(source, /session\?\.site_id !== siteId/);
  assert.match(
    source,
    /session\.app_id !== advancedSessionAppId\(restored, route\)/,
  );
  assert.match(source, /editorRouteFor\(restored\)\.type !== route/);
});
