/**
 * V2 independent acceptance: remaining editors must record a person edit
 * on the live helper those owners exported (or the hook function they call).
 * Load / hydrate / remote collab / restore / handshake must not.
 *
 * Does not trust W prose. Does not pass by grepping source.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  cloneDeckDocument,
  normalizeDeckDocument,
} from "../src/shell/doc-editors/deck-schema.ts";
import {
  resetUserEditSession,
  userEditItemKey,
  userMutationGeneration,
} from "../src/shell/user-edit-session.ts";

const helperCache = new Map();

function data(source) {
  return dataModule(source);
}

function univerStubs() {
  const presets = data(`
    export const LocaleType = { ZH_CN: "zhCN", EN_US: "enUS" };
  export const IUndoRedoService = "IUndoRedoService";
    export function mergeLocales(...parts) { return Object.assign({}, ...parts); }
    export function getPlainText() { return ""; }
    export function createUniver() {
      return { univer: { dispose() {} }, univerAPI: { createWorkbook() { return {}; } } };
    }
  `);
  const names = {
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
  const stubs = { "@univerjs/presets": presets };
  for (const [pkg, name] of Object.entries(names)) {
    stubs[pkg] = data(
      `export function ${name}(config) { return { name: ${JSON.stringify(name)}, config }; } export const ICanvasColorService = "ICanvasColorService"; export const IRenderManagerService = "IRenderManagerService"; export const IImageIoService = "IImageIoService"; export class ImageIoService {} export const ImageSourceType = { URL: "URL", BASE64: "BASE64" };`,
    );
    stubs[`${pkg}/locales/zh-CN`] = data(`export default {};`);
    stubs[`${pkg}/lib/index.css`] = data(``);
  }
  stubs["../AdvancedWorkbenchShell"] = data(
    `export function AdvancedWorkbenchShell() { return null; }`,
  );
  stubs["../../i18n/ui/useUI"] = data(`export function useUI() { return (zh) => zh; }`);
  stubs["../office-editor"] = data(`
    export function useOfficeArtifactSource(item) {
      return { item, url: "", purpose: null, loading: false, error: "", version: 0, retry() {}, resourceFailed() {} };
    }
  `);
  stubs["../../lib/media-proxy"] = data(
    `export async function fetchMediaBlob() { throw new Error("V2 remaining-autosave does not fetch"); }`,
  );
  stubs["../lib/auth/client"] = data(`export async function accessToken() { return ""; }`);
  return stubs;
}

function lightStubs(extra = {}) {
  return {
    "../../i18n/ui/useUI": data(`export function useUI() { return (zh) => zh; }`),
    "../AdvancedWorkbenchShell": data(
      `export function AdvancedWorkbenchShell() { return null; }`,
    ),
    "../../client-ui/host-context": data(
      `export function useOptionalClientHost() { return null; }`,
    ),
    "next/dynamic": data(
      `export default function dynamic() { return function DynamicStub() { return null; }; }`,
    ),
    ...extra,
  };
}

async function loadOwnerModule(sourcePath, stubs) {
  if (!helperCache.has(sourcePath)) {
    helperCache.set(
      sourcePath,
      import(await compileModule(sourcePath, stubs)).catch((error) => {
        helperCache.delete(sourcePath);
        throw error;
      }),
    );
  }
  return helperCache.get(sourcePath);
}

function requireLiveHelper(mod, sourcePath, names) {
  for (const name of names) {
    if (typeof mod[name] === "function") return { name, fn: mod[name] };
  }
  const similar = Object.keys(mod).filter(
    (key) =>
      typeof mod[key] === "function" &&
      /UserEdit|Person|recordUser|personEdit|markDirty|commit/i.test(key),
  );
  throw new Error(
    `${sourcePath} missing live person-mutation helper ${names.join(" | ")}. Similar function exports: ${similar.join(", ") || "(none)"}`,
  );
}

function callPair(fn, item, spec) {
  return fn(item, spec);
}

function callBag(fn, item, spec) {
  return fn({ item, ...spec });
}

function itemFor(id) {
  return { key: `artifact:v2-${id}:r1`, id: `v2-${id}` };
}

function generationOf(item) {
  return userMutationGeneration(userEditItemKey(item));
}

function assertRecords(label, call, fn, item, personSpec) {
  resetUserEditSession();
  assert.equal(generationOf(item), 0, `${label} starts at generation 0`);
  call(fn, item, personSpec);
  assert.equal(generationOf(item), 1, `${label} person path must increment userMutationGeneration`);
  call(fn, item, personSpec);
  assert.equal(generationOf(item), 2, `${label} second person path must increment again`);
}

function assertDoesNotRecord(label, call, fn, item, specs) {
  resetUserEditSession();
  for (const spec of specs) {
    call(fn, item, spec);
    assert.equal(
      generationOf(item),
      0,
      `${label} must not record for ${JSON.stringify(spec)}`,
    );
  }
  call(fn, item, specs[0]);
  assert.equal(generationOf(item), 0, `${label} still 0 after repeated non-person calls`);
}

function assertNonPersonAfterPerson(label, call, fn, item, personSpec, nonPersonSpecs) {
  resetUserEditSession();
  call(fn, item, personSpec);
  assert.equal(generationOf(item), 1);
  for (const spec of nonPersonSpecs) {
    call(fn, item, spec);
    assert.equal(
      generationOf(item),
      1,
      `${label} non-person ${JSON.stringify(spec)} must not increment after a real edit`,
    );
  }
}

/* --------------------------------- W5 --------------------------------- */

test("grid: local bumpHistory records; collab onActivity / load do not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/doc-editors/GridUniverStage.tsx",
    univerStubs(),
  );
  const { fn } = requireLiveHelper(mod, "GridUniverStage.tsx", [
    "applyGridUserEditSession",
  ]);
  const item = itemFor("grid");
  assertRecords("grid", callPair, fn, item, "person-write");
  assertDoesNotRecord("grid", callPair, fn, item, ["collab-activity", "load"]);
  assertNonPersonAfterPerson("grid", callPair, fn, item, "person-write", [
    "collab-activity",
    "load",
  ]);
});

test("native deck: local apply / endGesture / undo record; remote collab / load do not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/doc-editors/use-deck-editor.ts",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "use-deck-editor.ts", [
    "applyDeckUserEditSession",
  ]);
  const history = requireLiveHelper(mod, "use-deck-editor.ts", [
    "applyDeckHistoryWriteIfChanged",
  ]).fn;
  const item = itemFor("deck");
  assertRecords("native-deck", callPair, fn, item, "local-history");
  assertDoesNotRecord("native-deck", callPair, fn, item, [
    "remote-collab",
    "load",
  ]);
  assertNonPersonAfterPerson("native-deck", callPair, fn, item, "local-history", [
    "remote-collab",
    "load",
  ]);

  resetUserEditSession();
  const before = normalizeDeckDocument(
    { title: "V2 deck", slides: [{ title: "一页", body: "hello", bullets: [] }] },
    "V2 deck",
  );
  const same = cloneDeckDocument(before);
  const after = cloneDeckDocument(before);
  after.slides[0].title = "改过的一页";
  assert.equal(history(item, before, same), 0, "equal documents must not record");
  assert.equal(generationOf(item), 0);
  assert.equal(history(item, before, after), 1, "document inequality is the person write");
  assert.equal(generationOf(item), 1);
});

/* --------------------------------- W6 --------------------------------- */

test("video timeline: person commit records; load hydrate does not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/video-editor/use-video-timeline.ts",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "use-video-timeline.ts", [
    "applyVideoTimelineUserEditSession",
    "applyVideoUserEditSession",
  ]);
  const item = itemFor("video-timeline");
  assertRecords("video-timeline", callPair, fn, item, "person-commit");
  assertDoesNotRecord("video-timeline", callPair, fn, item, ["hydrate", "load"]);
});

test("pdf: local edit records; silent source replace / collab do not", async () => {
  // 10-23 D4：旧核 use-pdf-edit-engine 已删，单实例 hook 自己出这个 helper。
  const workbench = await loadOwnerModule(
    "src/shell/media-editors/use-pdf-workbench.ts",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(workbench, "use-pdf-workbench.ts", [
    "applyPdfWorkbenchUserEditSession",
  ]);
  const item = itemFor("pdf");
  assertRecords("pdf", callPair, fn, item, "local-annotation");
  assertDoesNotRecord("pdf", callPair, fn, item, ["silent-replace", "collab"]);
});

