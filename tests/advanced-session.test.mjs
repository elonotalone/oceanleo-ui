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

test("advanced session parser separates workspace site from material provenance", () => {
  assert.match(source, /parsed\.protocol === "https:" \|\| parsed\.protocol === "http:"/);
  assert.match(source, /META_KEYS\.has\(key\)/);
  assert.match(source, /encoded\.length > MAX_META_JSON/);
  assert.doesNotMatch(source, /session\?\.site_id !== siteId/);
  assert.match(
    source,
    /const expectedAppId = advancedSessionAppId\(restored, route\)/,
  );
  assert.match(source, /editorRouteFor\(restored\)\.type !== route/);
});

test("blank advanced drafts retain their onboarding identity after resume", () => {
  assert.match(source, /"draft",\s*"blank",\s*"website_id"/);
  assert.match(
    source,
    /kind === "website"[\s\S]*?!meta\.github_repo[\s\S]*?meta\.draft = true;[\s\S]*?meta\.blank = true;/,
  );
});

test("advanced Design sessions preserve and recover their layered editor route", () => {
  const routes = readFileSync(
    new URL("../src/shell/workbench-routes.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /"template_doc_url"/);
  assert.match(source, /\^site:tpl-\(\[a-z0-9-\]\+\)\$/);
  assert.match(
    source,
    /asset\.oceanleo\.com\/design-templates\/doc\/\$\{legacyTemplate\[1\]\}\.json/,
  );
  assert.match(
    routes,
    /pinnedRoute === "embed"[\s\S]*?pinnedSite === "design"[\s\S]*?design\.oceanleo\.com\/embed\/editor/,
  );
});

test("legacy Office PPTX sessions upgrade in place to the native deck route", () => {
  assert.match(
    source,
    /if \(route === "office" && isNativeDeckFile\(url, meta\)\) \{\s*route = "deck";\s*meta\.advanced_editor_route = "deck";/,
  );
  assert.match(source, /const legacyOfficeAppId =/);
  assert.match(
    source,
    /session\.app_id !== expectedAppId && session\.app_id !== legacyOfficeAppId/,
  );
});
