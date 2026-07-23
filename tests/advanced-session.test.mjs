import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../src/shell/advanced-session.ts", import.meta.url),
  "utf8",
);
const {
  INLINE_EDITOR_HISTORY_KEY,
  advancedSessionAppId,
  advancedSessionSnapshot,
  advancedSnapshotFromSession,
  inlineEditorItemsFromSession,
  withInlineEditorHistoryHead,
} = await import("../src/shell/advanced-session.ts");

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
    /pinnedRoute === "embed"[\s\S]*?const pinnedEditor[\s\S]*?item\.kind === "canvas"[\s\S]*?pinnedEditor === "design-canvas"[\s\S]*?design\.oceanleo\.com\/embed\/editor/,
  );
});

test("legacy Office sessions upgrade to typed lightweight routes only", () => {
  for (const [kind, extension, route] of [
    ["document", "docx", "richdoc"],
    ["sheet", "xlsx", "grid"],
    ["ppt", "pptx", "deck"],
  ]) {
    const item = {
      key: `creation:${kind}`,
      source: "creation",
      id: `legacy-${kind}`,
      title: `legacy.${extension}`,
      kind,
      siteId: "word",
      url: `https://files.test/legacy.${extension}`,
      favorite: false,
      meta: { format: extension },
    };
    const snapshot = advancedSessionSnapshot(item, route);
    const appId = advancedSessionAppId(item, route);
    const restored = advancedSnapshotFromSession({
      app_id: appId.replace(`advanced:v2:${route}:`, "advanced:v2:office:"),
      snapshot: {
        ...snapshot,
        editor_route: "office",
        item: {
          ...snapshot.item,
          meta: {
            ...snapshot.item.meta,
            advanced_editor_route: "office",
          },
        },
      },
    });
    assert.ok(restored, `${kind} legacy snapshot`);
    assert.equal(restored.editor_route, route);
    assert.equal(restored.item.meta.advanced_editor_route, route);

    const history = withInlineEditorHistoryHead({}, item, route);
    const [head] = Object.values(
      history[INLINE_EDITOR_HISTORY_KEY].heads,
    );
    head.head.route = "office";
    head.head.item.meta.advanced_editor_route = "office";
    const [inlineItem] = inlineEditorItemsFromSession({ snapshot: history });
    assert.ok(inlineItem, `${kind} legacy inline head`);
    assert.equal(inlineItem.meta.advanced_editor_route, route);
  }
  assert.throws(
    () =>
      advancedSessionAppId(
        {
          key: "creation:invalid-office",
          source: "creation",
          id: "invalid-office",
          title: "invalid.docx",
          kind: "document",
          siteId: "word",
          favorite: false,
          meta: {},
        },
        "office",
      ),
    /Legacy office route/,
  );
  assert.match(source, /const legacyOfficeAppId =/);
  assert.match(
    source,
    /session\.app_id !== expectedAppId && session\.app_id !== legacyOfficeAppId/,
  );
});
