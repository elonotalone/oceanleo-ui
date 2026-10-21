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
      `export function ${name}(config) { return { name: ${JSON.stringify(name)}, config }; }`,
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

test("hosted deck: post-open dirty:true records; restore-only dirty does not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/advanced-routes/DeckHostedRoute.tsx",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "DeckHostedRoute.tsx", [
    "applyHostedDeckUserEditSession",
  ]);
  const item = itemFor("hosted-deck");
  const opened = {
    kind: "dirty",
    dirty: true,
    openedContentIdentity: "v2-deck|open-1",
    contentIdentity: "v2-deck|open-1",
    source: { slides: [{ id: "s1" }] },
    applyingInit: false,
  };
  assertRecords("hosted-deck", callBag, fn, item, opened);
  assertDoesNotRecord("hosted-deck", callBag, fn, item, [
    { ...opened, kind: "restore", dirty: true },
    { ...opened, kind: "init" },
    { ...opened, dirty: false },
    { ...opened, openedContentIdentity: null },
    { ...opened, openedContentIdentity: "other" },
    { ...opened, source: null },
    { ...opened, applyingInit: true },
  ]);
  assertNonPersonAfterPerson("hosted-deck", callBag, fn, item, opened, [
    { ...opened, kind: "restore", dirty: true },
    { ...opened, kind: "init" },
  ]);
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

test("video designcombo: person commit records; load does not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/video-editor/VideoDesigncomboStage.tsx",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "VideoDesigncomboStage.tsx", [
    "applyVideoDesigncomboUserEditSession",
    "applyVideoUserEditSession",
  ]);
  const item = itemFor("video-designcombo");
  assertRecords("video-designcombo", callPair, fn, item, "commit");
  assertDoesNotRecord("video-designcombo", callPair, fn, item, ["load"]);
});

test("video canvas: person command records; hydrate does not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/workflow-carrier/VideoCanvasStage.tsx",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "VideoCanvasStage.tsx", [
    "applyVideoCanvasUserEditSession",
    "applyVideoUserEditSession",
  ]);
  const item = itemFor("video-canvas");
  assertRecords("video-canvas", callPair, fn, item, "person-command");
  assertDoesNotRecord("video-canvas", callPair, fn, item, ["hydrate", "load"]);
  if (typeof mod.applyVideoCanvasPersonCommand === "function") {
    resetUserEditSession();
    const applied = mod.applyVideoCanvasPersonCommand(
      item,
      { nodes: [], edges: [] },
      "workflow.add-node",
      { kind: "filter", label: "自动化测试节点" },
      0,
    );
    assert.equal(applied.ok, true, "live person command must apply");
    assert.equal(generationOf(item), 1, "live person command must record");
    const again = mod.applyVideoCanvasPersonCommand(
      item,
      { nodes: [], edges: [] },
      "workflow.not-a-command",
      {},
      0,
    );
    assert.equal(again.ok, false);
    assert.equal(generationOf(item), 1, "unknown command must not record");
  }
});

test("audio: local mutation records; remote apply does not", async () => {
  const mutations = await loadOwnerModule(
    "src/shell/media-editors/use-audio-mutations.ts",
    lightStubs(),
  );
  const playlist = await loadOwnerModule(
    "src/shell/media-editors/AudioPlaylistStage.tsx",
    lightStubs(),
  );
  const { fn } = (() => {
    try {
      return requireLiveHelper(mutations, "use-audio-mutations.ts", [
        "applyAudioUserEditSession",
        "applyAudioMutationUserEditSession",
      ]);
    } catch (first) {
      try {
        return requireLiveHelper(playlist, "AudioPlaylistStage.tsx", [
          "applyAudioUserEditSession",
          "applyAudioPlaylistUserEditSession",
        ]);
      } catch (second) {
        throw new Error(`${first.message}; ${second.message}`);
      }
    }
  })();
  const item = itemFor("audio");
  assertRecords("audio", callPair, fn, item, "local-mutation");
  assertDoesNotRecord("audio", callPair, fn, item, ["remote-apply"]);
});

test("pdf: local annotation engine records; silent source replace / collab do not", async () => {
  const engine = await loadOwnerModule(
    "src/shell/media-editors/use-pdf-edit-engine.ts",
    lightStubs(),
  );
  const workbench = await loadOwnerModule(
    "src/shell/media-editors/use-pdf-workbench.ts",
    lightStubs(),
  );
  const { fn } = (() => {
    try {
      return requireLiveHelper(engine, "use-pdf-edit-engine.ts", [
        "applyPdfUserEditSession",
        "applyPdfEditEngineUserEditSession",
      ]);
    } catch (first) {
      try {
        return requireLiveHelper(workbench, "use-pdf-workbench.ts", [
          "applyPdfUserEditSession",
          "applyPdfWorkbenchUserEditSession",
        ]);
      } catch (second) {
        throw new Error(`${first.message}; ${second.message}`);
      }
    }
  })();
  const item = itemFor("pdf");
  assertRecords("pdf", callPair, fn, item, "local-annotation");
  assertDoesNotRecord("pdf", callPair, fn, item, ["silent-replace", "collab"]);
});

test("chart: mutate / history record; applyRemoteDocument does not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/chart-editor/use-chart-workbench.ts",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "use-chart-workbench.ts", [
    "applyChartUserEditSession",
  ]);
  const item = itemFor("chart");
  assertRecords("chart", callPair, fn, item, "mutate");
  resetUserEditSession();
  callPair(fn, item, "history");
  assert.equal(generationOf(item), 1, "chart history (undo/redo) is a person path");
  assertDoesNotRecord("chart", callPair, fn, item, [
    "remote-document",
    "applyRemoteDocument",
  ]);
});

test("3d: local markDirty records; bootstrap does not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/media-editors/use-model3d-workbench.ts",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "use-model3d-workbench.ts", [
    "applyModel3dUserEditSession",
    "applyModel3DUserEditSession",
  ]);
  const item = itemFor("model3d");
  assertRecords("3d", callPair, fn, item, "local-dirty");
  assertDoesNotRecord("3d", callPair, fn, item, ["bootstrap"]);
});

/* --------------------------------- W7 --------------------------------- */

test("design canvas: commit records; load setRevision(0) does not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/design-canvas/use-local-design-canvas.ts",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "use-local-design-canvas.ts", [
    "applyDesignCanvasUserEditSession",
    "applyLocalDesignCanvasUserEditSession",
  ]);
  const item = itemFor("design-canvas");
  assertRecords("design-canvas", callPair, fn, item, "commit");
  resetUserEditSession();
  callPair(fn, item, "undo");
  assert.equal(generationOf(item), 1, "design undo is a person path");
  resetUserEditSession();
  callPair(fn, item, "redo");
  assert.equal(generationOf(item), 1, "design redo is a person path");
  assertDoesNotRecord("design-canvas", callPair, fn, item, ["load"]);
  assertNonPersonAfterPerson("design-canvas", callPair, fn, item, "commit", [
    "load",
  ]);
});

test("game: local textarea origin records; remote Yjs / writeThrough do not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/game-editor/GameCodeStage.tsx",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "GameCodeStage.tsx", [
    "applyGameUserEditSession",
  ]);
  const localOrigin = Symbol("oceanleo-collab-textarea-local");
  const item = itemFor("game");
  assertRecords("game", callPair, fn, item, { kind: "local-type" });
  resetUserEditSession();
  callPair(fn, item, { kind: "ytext-observe", origin: localOrigin });
  assert.equal(
    generationOf(item),
    1,
    "game ytext-observe with bind-textarea local origin must record",
  );
  assertDoesNotRecord("game", callPair, fn, item, [
    { kind: "ytext-observe", origin: "remote" },
    { kind: "write-through" },
    { kind: "restore" },
    { kind: "load" },
  ]);
});

test("embedded: post-handshake person dirty records; restore / handshake do not", async () => {
  const mod = await loadOwnerModule(
    "src/shell/advanced-routes/EmbeddedRoute.tsx",
    lightStubs(),
  );
  const { fn } = requireLiveHelper(mod, "EmbeddedRoute.tsx", [
    "applyEmbeddedUserEditSession",
  ]);
  const item = itemFor("embedded");
  const person = {
    kind: "person-dirty",
    dirty: true,
    hostedOpen: true,
    handshakeReady: true,
  };
  assertRecords("embedded", callBag, fn, item, person);
  resetUserEditSession();
  callBag(fn, item, {
    dirty: true,
    hostedOpen: true,
    handshakeReady: true,
  });
  assert.equal(
    generationOf(item),
    1,
    "embedded derived post-handshake dirty (no explicit kind) must record",
  );
  assertDoesNotRecord("embedded", callBag, fn, item, [
    {
      kind: "restore",
      dirty: true,
      hostedOpen: true,
      handshakeReady: true,
    },
    {
      kind: "handshake",
      dirty: true,
      hostedOpen: true,
      handshakeReady: false,
    },
    {
      dirty: true,
      hostedOpen: false,
      handshakeReady: true,
    },
    {
      dirty: true,
      hostedOpen: true,
      handshakeReady: true,
      restoring: true,
    },
    {
      dirty: true,
      hostedOpen: true,
      handshakeReady: true,
      initEcho: true,
    },
  ]);
});
