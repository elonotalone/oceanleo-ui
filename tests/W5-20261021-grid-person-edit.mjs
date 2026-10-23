/**
 * W5: a person write in the grid increments the shared user-edit generation.
 * Collab activity and load go through the same helper and must not.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  resetUserEditSession,
  userEditItemKey,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const presetsStubUrl = dataModule(`
  export const LocaleType = { ZH_CN: "zhCN", EN_US: "enUS" };
  export const IUndoRedoService = "IUndoRedoService";
  export function mergeLocales(...parts) { return Object.assign({}, ...parts); }
  export function getPlainText() { return ""; }
  export function createUniver() {
    return { univer: { dispose() {} }, univerAPI: { createWorkbook() { return {}; } } };
  }
`);
const presetNames = {
  "@univerjs/preset-sheets-core": "UniverSheetsCorePreset",
  "@univerjs/preset-sheets-filter": "UniverSheetsFilterPreset",
  "@univerjs/preset-sheets-sort": "UniverSheetsSortPreset",
  "@univerjs/preset-sheets-data-validation": "UniverSheetsDataValidationPreset",
  "@univerjs/preset-sheets-conditional-formatting":
    "UniverSheetsConditionalFormattingPreset",
  "@univerjs/preset-sheets-find-replace": "UniverSheetsFindReplacePreset",
  "@univerjs/preset-sheets-hyper-link": "UniverSheetsHyperLinkPreset",
  "@univerjs/preset-sheets-thread-comment": "UniverSheetsThreadCommentPreset",
  "@univerjs/preset-sheets-drawing": "UniverSheetsDrawingPreset",
  "@univerjs/preset-sheets-table": "UniverSheetsTablePreset",
  "@univerjs/preset-sheets-note": "UniverSheetsNotePreset",
};
const stubs = { "@univerjs/presets": presetsStubUrl };
for (const [pkg, name] of Object.entries(presetNames)) {
  stubs[pkg] = dataModule(
    `export function ${name}(config) { return { name: ${JSON.stringify(name)}, config }; } export const ICanvasColorService = "ICanvasColorService";`,
  );
  stubs[`${pkg}/locales/zh-CN`] = dataModule(`export default {};`);
  stubs[`${pkg}/lib/index.css`] = dataModule(``);
}
stubs["../AdvancedWorkbenchShell"] = dataModule(
  `export function AdvancedWorkbenchShell() { return null; }`,
);
stubs["../../i18n/ui/useUI"] = dataModule(
  `export function useUI() { return (zh) => zh; }`,
);
stubs["../office-editor"] = dataModule(`
  export function useOfficeArtifactSource(item) {
    return { item, url: "", purpose: null, loading: false, error: "", version: 0, retry() {}, resourceFailed() {} };
  }
`);
stubs["../../lib/media-proxy"] = dataModule(`
  export async function fetchMediaBlob() { throw new Error("W5 grid test does not fetch"); }
`);
stubs["../lib/auth/client"] = dataModule(`
  export async function accessToken() { return ""; }
`);

const { applyGridUserEditSession } = await import(
  await compileModule("src/shell/doc-editors/GridUniverStage.tsx", stubs)
);

function gridItem() {
  return { key: "artifact:grid-w5:r1", id: "grid-w5" };
}

test("grid person-write increments userMutationGeneration", () => {
  resetUserEditSession();
  const item = gridItem();
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  assert.equal(applyGridUserEditSession(item, "person-write"), 1);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
  assert.equal(applyGridUserEditSession(item, "person-write"), 2);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 2);
  assert.equal(userMutationGeneration("artifact:other:r1"), 0);
});

test("grid load and collab activity do not record a person mutation", () => {
  resetUserEditSession();
  const item = gridItem();
  assert.equal(applyGridUserEditSession(item, "load"), 0);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  assert.equal(applyGridUserEditSession(item, "collab-activity"), 0);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 0);
  applyGridUserEditSession(item, "person-write");
  assert.equal(applyGridUserEditSession(item, "collab-activity"), 1);
  assert.equal(applyGridUserEditSession(item, "load"), 1);
  assert.equal(userMutationGeneration(userEditItemKey(item)), 1);
});
