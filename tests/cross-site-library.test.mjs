import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildLibraryItems,
  inferLibraryKind,
} from "../src/shell/library-data.ts";
import {
  FIXED_WORKSPACE_SLOTS,
  normalizeWorkspaceAction,
  workspaceSlotForLegacyId,
} from "../src/shell/workspace-actions.ts";

test("viewer kind prefers explicit metadata and recognizes real Office files", () => {
  assert.equal(
    inferLibraryKind({
      meta: { library_kind: "video_canvas" },
      mediaType: "video",
      url: "https://cdn.test/output.mp4",
    }),
    "video_canvas",
  );
  assert.equal(
    inferLibraryKind({ kind: "file", url: "https://cdn.test/board.xlsx?x=1" }),
    "sheet",
  );
  assert.equal(
    inferLibraryKind({ kind: "file", url: "https://cdn.test/deck.pptx" }),
    "ppt",
  );
  assert.equal(
    inferLibraryKind({
      mediaType: "other",
      kind: "preview",
      url: "https://p123.website.oceanleo.com",
    }),
    "website",
  );
});

test("works and task artifacts with the same URL merge into one rich item", () => {
  const items = buildLibraryItems(
    [
      {
        id: "creation-1",
        url: "https://cdn.test/deck.pptx?token=stable",
        title: "产品发布会",
        media_type: "ppt",
        site_id: "ppt",
        meta: { slides: [{ title: "封面" }] },
      },
    ],
    [
      {
        id: "artifact-1",
        url: "https://cdn.test/deck.pptx",
        title: "PPT",
        kind: "file",
        favorite: true,
        created_at: "2026-07-13T00:00:00Z",
      },
    ],
  );
  assert.equal(items.length, 1);
  assert.equal(items[0].kind, "ppt");
  assert.equal(items[0].title, "产品发布会");
  assert.equal(items[0].favorite, true);
  assert.deepEqual(items[0].meta.slides, [{ title: "封面" }]);
});

test("legacy pages normalize into exactly five fixed workspace slots", () => {
  assert.deepEqual(FIXED_WORKSPACE_SLOTS, [
    "template",
    "preview",
    "materials",
    "mine",
    "browser",
  ]);
  assert.equal(workspaceSlotForLegacyId("__guide"), "template");
  assert.equal(workspaceSlotForLegacyId("result"), "preview");
  assert.equal(workspaceSlotForLegacyId("material"), "materials");
  assert.equal(workspaceSlotForLegacyId("files"), "mine");
  assert.equal(workspaceSlotForLegacyId("browser"), "browser");
  assert.equal(workspaceSlotForLegacyId("video-workflow"), "preview");
  assert.equal(workspaceSlotForLegacyId("draft"), "preview");
});

test("dynamic plus/minus libraries are removed from the right workspace", () => {
  const source = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /FIXED_WORKSPACE_SLOTS\.map/);
  assert.match(source, /template: "模板"/);
  assert.match(source, /preview: "预览"/);
  assert.match(source, /mine: "我的库"/);
  assert.match(source, /useRightPaneSlot/);
  assert.match(source, /setRightLabel\([\s\S]*?<FixedWorkspaceTabs/);
  assert.match(source, /hint\?: string/);
  assert.match(source, /tab\.id !== "__guide"/);
  assert.match(source, /const selected = internal/);
  assert.match(source, /setInternal\(id\)/);
  assert.match(source, /setRightTab\(id\)/);
  assert.doesNotMatch(source, /expanded \? "−" : "\+"/);
  assert.doesNotMatch(source, /crossSiteLibraryTabs/);
  assert.doesNotMatch(source, /\bmoreTabs\b/);
});

test("template slot preserves both quick-start guide and legacy template pages", () => {
  const source = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /templatePageId/);
  assert.match(source, /grouped\.template\.find/);
  assert.match(source, /grouped\.template\.length > 1/);
  assert.match(source, /tab\.id === "__guide" \? "快速起手" : tab\.label/);
  assert.match(source, /if \(id !== "__guide"\) onChange\?\.\(id\)/);
});

test("workspace actions are versioned, bounded and reject unsafe URLs", () => {
  assert.deepEqual(
    normalizeWorkspaceAction({
      version: 1,
      tab: "materials",
      query: " 小红书模板 ",
      itemId: "asset:library:123",
      url: "https://asset.oceanleo.com/materials",
    }),
    {
      version: 1,
      tab: "materials",
      query: "小红书模板",
      category: undefined,
      itemId: "asset:library:123",
      url: "https://asset.oceanleo.com/materials",
      browserSessionId: undefined,
    },
  );
  assert.equal(
    normalizeWorkspaceAction({
      version: 1,
      tab: "browser",
      url: "javascript:alert(1)",
    })?.url,
    undefined,
  );
  assert.equal(normalizeWorkspaceAction({ version: 2, tab: "preview" }), null);
});

test("function agents forward only verified persisted UI actions", () => {
  const source = readFileSync(
    new URL("../src/shell/FunctionAgentChat.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /message\.kind !== "ui_action"/);
  assert.match(source, /message\.meta\?\.verified !== true/);
  assert.match(source, /dispatchWorkspaceAction\(\{/);
});

test("only first-party curated video workflows keep an interactive iframe origin", () => {
  const source = readFileSync(
    new URL("../src/shell/library-viewers.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /item\.meta\.asset_type === "video_workflow"/);
  assert.ok(source.includes('hostname.endsWith(".oceanleo.com")'));
  assert.match(source, /trustedInteractive \? " allow-same-origin" : ""/);
});
