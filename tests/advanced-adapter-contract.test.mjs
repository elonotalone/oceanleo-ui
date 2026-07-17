import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { TRUSTED_EDITOR_REGISTRY } from "../src/shell/workbench-routes.ts";

const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("every trusted editor declares project, viewport, toolbar and persistence ownership", () => {
  assert.equal(Object.keys(TRUSTED_EDITOR_REGISTRY).length, 13);
  for (const [id, contract] of Object.entries(TRUSTED_EDITOR_REGISTRY)) {
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
    "OfficeRoute",
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
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const stage = source("../src/shell/AdvancedWorkbenchStage.tsx");
  assert.match(shell, /data-advanced-context-row/);
  assert.match(shell, /data-advanced-viewport-row/);
  assert.match(shell, /drawerById/);
  assert.match(shell, /const showWorkspaceDetail = workspacePane\?\.showDetail/);
  assert.match(shell, /adapter\.nativeChrome\?\.viewport/);
  assert.doesNotMatch(stage, /stageScale|data-advanced-scaled-panel/);
  assert.doesNotMatch(shell, /editorContextualToolbarAnchor/);
});

test("inline context row consumes semantic actions instead of arbitrary JSX slots", () => {
  const contract = source("../src/shell/advanced-workbench-chrome.ts");
  const header = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  assert.match(contract, /interface AdvancedWorkbenchAction/);
  assert.match(contract, /variant\?: "default" \| "primary" \| "danger" \| "icon"/);
  assert.match(header, /const actions = adapter\.actions \|\| \[\]/);
  assert.match(header, /actions\.map\(\(action\)/);
  assert.match(header, /actions\.length > 1 && actionsOpen/);
  assert.match(header, /data-advanced-context-row/);
  assert.match(header, /action\.panelId/);
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
