import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const emptyFn = dataModule(`
  export default function empty() { return null; }
  export function AdvancedWorkbenchShell() { return null; }
  export function GridContextToolbar() { return null; }
  export function GridStage() { return null; }
  export function downloadBlob() {}
  export function captureGridRouteSnapshot() { return {}; }
  export class GridRouteHistory {}
  export function buildGridRouteWorkbookBlob() { return new Blob(); }
  export function useGridEditor() { return { recalculate() {}, loading: false }; }
  export function useOfficeArtifactSource() { return { item: {}, error: "", retry() {} }; }
  export function editorToolLabel() { return "表格"; }
  export function buildGridCommandSurface() { return {}; }
  export function downloadConvertedCopy() { return ""; }
  export const DOC_FAMILY_DOWNLOAD_FORMATS = { grid: [{ extension: "xlsx", label: "XLSX" }] };
  export function docFamilyAcceptAttribute() { return ""; }
  export function importDocFamilyFile() { return { ok: false }; }
  export function usePluginCommandSurface() {}
  export function useWorkbenchMaterialAdapter() {}
  export function advancedSavedItem() { return {}; }
  export function advancedRecoveryKey() { return "grid"; }
  export function fetchMediaBlob() { return new Blob(); }
  export const GRID_SOURCE_FORMAT = "xlsx";
  export const GRID_SOURCE_MEDIA_TYPE = "application/vnd.ms-excel";
  export function gridSavedItemForHandoff(item) { return item; }
`);

const { buildGridDocumentActions } = await import(
  await compileModule("src/shell/advanced-routes/GridRoute.tsx", {
    "next/dynamic": dataModule(`
      export default function dynamic() {
        return function GridUniverStageStub() { return null; }
      }
    `),
    "../AdvancedWorkbenchShell": emptyFn,
    "../../lib/media-proxy": emptyFn,
    "../doc-editors/GridContextToolbar": emptyFn,
    "../doc-editors/doc-io": emptyFn,
    "../doc-editors/GridRouteHistory": emptyFn,
    "../doc-editors/GridStage": emptyFn,
    "../doc-editors/GridWorkbookExport": emptyFn,
    "../doc-editors/use-grid-editor": emptyFn,
    "../office-editor": emptyFn,
    "../workbench-routes": emptyFn,
    "../doc-editors/doc-family-commands": emptyFn,
    "../doc-editors/doc-family-download": emptyFn,
    "../doc-editors/doc-family-formats": emptyFn,
    "../doc-editors/doc-family-import": emptyFn,
    "../plugin-command": emptyFn,
    "../workbench-material-provider": emptyFn,
    "../advanced-session": emptyFn,
    "../advanced-recovery-store": emptyFn,
  })
);

const route = readFileSync("src/shell/advanced-routes/GridRoute.tsx", "utf8");

test("有 recalculate 时必含 grid-recalculate", () => {
  const recalculate = () => {};
  const actions = buildGridDocumentActions({
    recalculate,
    loading: false,
  });
  const found = actions.find((action) => action.id === "grid-recalculate");
  assert.ok(found, "有 recalculate 能力却没给出「重新计算」");
  assert.equal(found.label, "重新计算");
  assert.equal(found.disabled, false);
  assert.equal(found.onTrigger, recalculate);
});

test("载入中时重新计算仍在，只是不可点", () => {
  const actions = buildGridDocumentActions({
    recalculate() {},
    loading: true,
  });
  const found = actions.find((action) => action.id === "grid-recalculate");
  assert.ok(found);
  assert.equal(found.disabled, true);
});

test("没有 recalculate 能力时不含 grid-recalculate", () => {
  const actions = buildGridDocumentActions({ loading: false });
  assert.equal(
    actions.some((action) => action.id === "grid-recalculate"),
    false,
  );
});

test("sourceFailed 才给出重新载入；office 错才给出重试", () => {
  const reload = () => {};
  const retryOffice = () => {};
  const bare = buildGridDocumentActions({ recalculate() {} });
  assert.deepEqual(
    bare.map((action) => action.id),
    ["grid-recalculate"],
  );
  const failed = buildGridDocumentActions(
    { recalculate() {}, sourceFailed: true, reload, error: "断了" },
    { officeError: "source 404", retryOffice },
  );
  assert.deepEqual(
    failed.map((action) => action.id),
    [
      "grid-recalculate",
      "grid-reload-source",
      "grid-refresh-office-source",
    ],
  );
});

test("登记随 editor 与当前页重算，切回普通页不把旧核重挂挂在 flush 后面", () => {
  assert.match(route, /buildGridDocumentActions\(editor/);
  assert.match(route, /pageId/);
  assert.match(route, /documentActionsEpoch/);
  assert.match(route, /usePluginPage\("grid"\)/);
  assert.match(route, /want === "legacy"[\s\S]*setShown\("legacy"\)/);
});
