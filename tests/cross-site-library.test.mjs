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

test("works and task artifacts never use a matching URL as identity", () => {
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
  assert.equal(items.length, 2);
  const creation = items.find((item) => item.id === "creation-1");
  const artifact = items.find((item) => item.id === "artifact-1");
  assert.equal(creation.kind, "ppt");
  assert.equal(creation.title, "产品发布会");
  assert.deepEqual(creation.meta.slides, [{ title: "封面" }]);
  assert.equal(artifact.favorite, true);
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
  assert.equal(workspaceSlotForLegacyId("mylib"), "mine");
  assert.equal(workspaceSlotForLegacyId("favorites"), "mine");
  assert.equal(workspaceSlotForLegacyId("browser"), "browser");
  assert.equal(workspaceSlotForLegacyId("video-workflow"), "preview");
  assert.equal(workspaceSlotForLegacyId("draft"), "preview");
});

test("dynamic plus/minus libraries are removed from the right workspace", () => {
  const source = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /FIXED_WORKSPACE_SLOTS\.filter/);
  assert.match(source, /showTemplate \|\| slot !== "template"/);
  assert.match(source, /template: "灵感"/);
  assert.match(source, /preview: "生成"/);
  assert.match(source, /mine: "我的库"/);
  assert.match(source, /useRightPaneSlot/);
  assert.match(source, /setRightLabel\([\s\S]*?<FixedWorkspaceTabs/);
  assert.match(source, /hint\?: string/);
  assert.match(source, /tab\.id !== "__guide"/);
  assert.match(source, /const selected =[\s\S]*internal/);
  assert.match(source, /setInternal\(id\)/);
  assert.match(source, /setRightTab\(id\)/);
  assert.doesNotMatch(source, /expanded \? "−" : "\+"/);
  assert.doesNotMatch(source, /crossSiteLibraryTabs/);
  assert.doesNotMatch(source, /\bmoreTabs\b/);
  assert.match(source, /!isGenericMaterialsTab\(tab\)/);
});

test("chart viewer cover stays separate from typed chart edit capability", () => {
  const source = readFileSync(
    new URL("../src/shell/MaterialLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /chart: "image"/);
  assert.match(
    source,
    /const chartViewerUrl =[\s\S]*?asset\.preview_url \|\| asset\.thumb_url/,
  );
  assert.match(source, /source_asset_url: asset\.full_url/);
  assert.match(source, /editor: asset\.editor \|\| undefined/);
  assert.match(source, /unavailable_reason: asset\.unavailable_reason/);
  assert.doesNotMatch(source, /image workbench gives them real/);
});

test("Design template series keeps its layered document for Advanced editing", () => {
  const source = readFileSync(
    new URL("../src/shell/MaterialLibrary.tsx", import.meta.url),
    "utf8",
  );
  const routesSource = readFileSync(
    new URL("../src/shell/workbench-routes.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /function designTemplateDocumentUrl/);
  assert.match(source, /asset\.series_id === "design-materials"/);
  assert.match(source, /design-templates\\\/doc/);
  assert.match(source, /template_doc_url: designTemplateDoc/);
  assert.match(source, /siteId: designTemplateDoc \? "design" : "asset"/);
  assert.match(source, /siteId: templateDocUrl \? "design" : ""/);
  assert.match(routesSource, /item\.meta\.template_doc_url/);
  assert.match(
    routesSource,
    /design\.oceanleo\.com\/embed\/editor[\s\S]*?mediaType: "canvas"/,
  );
});

test("closing a configured library keeps the app runtime mounted", () => {
  const source = readFileSync(
    new URL("../src/shell/SplitWorkspace.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /if \(!hasRight && !library\)/);
  assert.match(source, /!hasRight \|\| maxed === "app" \? "hidden" : "flex"/);
  assert.match(source, /Keep every left-panel runtime mounted/);
  assert.match(source, /WORKSPACE_ACTION_EVENT/);
});

test("task receipts refresh My Library without adding a fifth shared card action", () => {
  const canvas = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  const mine = readFileSync(
    new URL("../src/shell/MyLibrary.tsx", import.meta.url),
    "utf8",
  );
  const library = readFileSync(
    new URL("../src/shell/WorkspaceLibrary.tsx", import.meta.url),
    "utf8",
  );
  assert.match(canvas, /onDelete: tab\.onDelete/);
  assert.match(canvas, /libraryRefreshNonce/);
  assert.match(canvas, /refreshNonce=\{libraryRefreshNonce\}/);
  assert.match(mine, /refreshNonce\?: string \| number/);
  assert.match(mine, /\[load, refreshNonce\]/);
  assert.doesNotMatch(library, /彻底删除/);
});

test("inspiration slot preserves both quick-start guide and legacy prompt pages", () => {
  const source = readFileSync(
    new URL("../src/shell/ResultCanvas.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /templatePageId/);
  assert.match(source, /grouped\.template\.find/);
  assert.match(source, /grouped\.template\.length > 1/);
  assert.match(source, /tab\.id === "__guide"[\s\S]*?"快速起手"[\s\S]*?inspirationLabel\(tab\.label\)/);
  assert.match(source, /if \(id !== "__guide"\) onChange\?\.\(id\)/);
  assert.match(source, /slotForCanvasTab/);
  assert.match(source, /灵感\|靈感\|模板\|範本\|template\|inspiration/);
  assert.match(source, /!isGenericMineTab\(tab\)/);
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
