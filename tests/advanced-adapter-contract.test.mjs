import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TRUSTED_EDITOR_REGISTRY } from "../src/shell/workbench-routes.ts";

const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("every trusted editor declares project, viewport, toolbar and persistence ownership", () => {
  assert.equal(Object.keys(TRUSTED_EDITOR_REGISTRY).length, 13);
  assert.deepEqual(TRUSTED_EDITOR_REGISTRY.office, {
    routeType: "none",
    artifactCapabilities: [],
    featureId: null,
    routable: false,
    roundTrip: [],
    projectSchema: "office-file@1",
    viewportOwnership: "content",
    toolbarOwnership: "shared",
    persistence: "project",
  });
  assert.equal(
    Object.values(TRUSTED_EDITOR_REGISTRY).filter((entry) => entry.routable)
      .length,
    12,
  );
  for (const [id, contract] of Object.entries(TRUSTED_EDITOR_REGISTRY)) {
    if (!contract.routable) continue;
    assert.deepEqual(
      [...contract.roundTrip],
      ["load", "mutate", "save", "reopen"],
      id,
    );
    assert.match(contract.projectSchema, /^[a-z0-9.-]+(?:@|\.v)\d+$/i, id);
    assert.ok(["content", "native"].includes(contract.viewportOwnership), id);
    assert.ok(["shared", "native"].includes(contract.toolbarOwnership), id);
    assert.ok(["project", "native-callback"].includes(contract.persistence), id);
  }
});

test("all route components use the single typed adapter prop", () => {
  const routes = [
    "ImageRoute",
    "VideoTimelineRoute",
    "AudioRoute",
    "PdfRoute",
    "Model3DRoute",
    "ChartRoute",
    "GridRoute",
    "RichDocRoute",
    "DeckRoute",
    "EmbeddedRoute",
    "UnsupportedRoute",
  ];
  for (const route of routes) {
    const text = source(`../src/shell/advanced-routes/${route}.tsx`);
    assert.match(text, /adapter=\{\{/, route);
    assert.doesNotMatch(
      text,
      /editor(?:Toolbox|Drawers|ContextualToolbar|HeaderActions|Viewport|Stage|Dirty)=/,
      route,
    );
  }
  const contract = source("../src/shell/advanced-editor-adapter.ts");
  assert.match(contract, /interface AdvancedEditorAdapter/);
  assert.match(contract, /persistence\?: AdvancedEditorPersistenceAdapter/);
  assert.match(contract, /editRevision: string \| number/);
});

test("shell geometry never scales editor chrome and every legacy toolbox gets a launcher", () => {
  const shell =
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx") +
    source("../src/shell/FloatingContextToolbar.tsx");
  const stage = source("../src/shell/AdvancedWorkbenchStage.tsx");
  assert.match(shell, /data-advanced-context-row/);
  assert.match(shell, /data-advanced-viewport-row/);
  assert.match(shell, /drawerById/);
  assert.match(shell, /const showWorkspaceDetail = workspacePane\?\.showDetail/);
  assert.match(shell, /adapter\.nativeChrome\?\.viewport/);
  assert.doesNotMatch(stage, /stageScale|data-advanced-scaled-panel/);
  assert.doesNotMatch(shell, /editorContextualToolbarAnchor/);
});

test("fixed workspace row owns semantic actions outside the object edit bar", () => {
  const contract = source("../src/shell/advanced-workbench-chrome.ts");
  const header =
    source("../src/shell/InlineAdvancedWorkbenchShell.tsx") +
    source("../src/shell/InlineAdvancedWorkbenchHeader.tsx") +
    source("../src/shell/FloatingContextToolbar.tsx");
  const actions = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  assert.match(contract, /interface AdvancedWorkbenchAction/);
  assert.match(contract, /variant\?: "default" \| "primary" \| "danger" \| "icon"/);
  assert.match(header, /<AdvancedWorkspaceActionBar/);
  assert.match(actions, /const actions = adapter\.actions \|\| \[\]/);
  assert.match(actions, /standaloneActions\.map\(\(action\)/);
  assert.match(actions, /adapter\.directDownload/);
  assert.match(contract, /group\?: "download"/);
  assert.match(actions, /action\.group === "download"/);
  assert.match(actions, /data-workspace-download-launcher/);
  assert.match(actions, /data-workspace-download-menu/);
  assert.match(actions, /data-advanced-workspace-actions/);
  assert.match(header, /data-advanced-context-row/);
  assert.match(header, /action\.panelId/);
  assert.doesNotMatch(header, /absolute left-2 right-2 top-2/);
});

test("RichDoc groups DOCX Markdown HTML and JSON behind one download contract", () => {
  const route = source("../src/shell/advanced-routes/RichDocRoute.tsx");
  assert.match(
    route,
    /directDownload:\s*\{[\s\S]*?id:\s*"richdoc-export-docx"/,
  );
  for (const id of [
    "richdoc-export-markdown",
    "richdoc-export-html",
    "richdoc-export-json",
  ]) {
    assert.match(
      route,
      new RegExp(`id: "${id}"[\\s\\S]*?group: "download"`),
      id,
    );
  }
  const retry = route.match(
    /id: "richdoc-refresh-office-source"[\s\S]*?\}/,
  )?.[0];
  assert.ok(retry);
  assert.doesNotMatch(retry, /group:\s*"download"/);
});

test("mutable native editors keep an independent local recovery log", () => {
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const store = source("../src/shell/advanced-recovery-store.ts");
  assert.match(shell, /useAdvancedRecovery/);
  assert.match(store, /indexedDB\.open/);
  assert.match(store, /mutationQueues/);
  assert.match(store, /MAX_DRAFT_AGE_MS/);
  for (const route of [
    "AudioRoute",
    "ChartRoute",
    "DeckRoute",
    "GridRoute",
    "Model3DRoute",
    "PdfRoute",
    "RichDocRoute",
    "VideoTimelineRoute",
  ]) {
    assert.match(
      source(`../src/shell/advanced-routes/${route}.tsx`),
      /recovery: \{/,
      route,
    );
  }
  const image = source(
    "../src/shell/image-editor/editor-persistence.ts",
  );
  assert.match(image, /LOCAL_DRAFT_PREFIX/);
  assert.match(image, /saveLocalImageDraft/);
});
