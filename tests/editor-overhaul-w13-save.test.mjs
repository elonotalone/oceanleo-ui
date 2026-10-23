import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvas = fabricRequire.resolve("canvas");
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previous) require.cache[canvas] = previous; else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.invalid" });
for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document,
  navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node })) {
  Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import("react-dom/client");
const { useModel3DSave } = await import(await compileModule("src/shell/media-editors/use-model3d-save.ts", {
  "./model3d-files": dataModule(`
    export function safeModelStem(title) { return title.replace(/\\.glb$/i, ''); }
    export function uploadModel3DPoster() { throw Error('poster must use private revision staging'); }
  `),
  "./model3d-project": dataModule(`export async function persistModel3DProject(input) { return globalThis.__w13.persist(input); }`),
}));
const { useModel3DProjectBootstrap } = await import(await compileModule("src/shell/media-editors/use-model3d-project-bootstrap.ts", {
  "../doc-editors/doc-io": dataModule(`
    export async function loadEditorProject(url, schema) { return globalThis.__w13Manifest.load(url, schema); }
    export async function saveFileToLibrary() { throw Error('not a save test'); }
  `),
}));

const ref = (current) => ({ current });
function fixture() {
  const calls = { saves: [], exports: 0, checkpoints: [] };
  const item = { id: "root", key: "root", artifactId: "root", revisionId: "r1", artifactType: "model_3d",
    source: "artifact", title: "Model.glb", kind: "threed", siteId: "threed", url: "https://example.invalid/model.glb", meta: {} };
  const runtime = { getOperationJournal: () => [{ id: "op1", kind: "transform", target: "base:0", value: { position: [1, 0, 0] } }],
    capturePng: async () => new Blob(["png"], { type: "image/png" }),
    exportGlb: async () => { calls.exports++; return new ArrayBuffer(8); },
    commitCheckpoint: (ids) => calls.checkpoints.push(ids) };
  const options = { item, siteId: "threed", modelLoaded: true, checkpointUrl: item.url,
    sourceProvenance: { sourceUrl: item.url, artifactId: "root", revisionId: "r1", format: "glb" }, posterUrl: "", view: {},
    runtimeRef: ref(runtime), revisionRef: ref(1), sourceGenerationRef: ref(1), aliveRef: ref(true),
    ownSavedVersionKeys: ref(new Set()), setError() {}, setNotice() {}, setSavedUrl() {}, setDirty() {}, onDurableModelUrl() {}, tt: (x) => x };
  globalThis.__w13 = { persist: async (input) => {
    calls.saves.push(input);
    const revisionId = `r${calls.saves.length + 1}`;
    return { url: `https://example.invalid/${revisionId}.glb`, versionId: revisionId, artifactId: "root", revisionId,
      projectUrl: `https://example.invalid/${revisionId}.json`, projectSchema: "oceanleo.three-editor@2", posterUrl: "https://example.invalid/cover.png",
      sourceProvenance: { ...options.sourceProvenance, revisionId }, item: { ...item, revisionId, id: revisionId } };
  } };
  return { options, calls };
}
async function mount(options) {
  let hook;
  const container = document.createElement("div"); document.body.appendChild(container);
  const root = createRoot(container);
  function Probe() { hook = useModel3DSave(options); return null; }
  await act(async () => root.render(React.createElement(Probe)));
  return { current: () => hook, unmount: async () => { await act(async () => root.unmount()); container.remove(); } };
}

test("each typed save exports a GLB and a private PNG, moves CAS forward, and repeats only once per edit", async () => {
  const { options, calls } = fixture();
  const tree = await mount(options);
  try {
    let first;
    await act(async () => { first = await tree.current().saveCopy(); });
    assert.equal(first.revisionId, "r2");
    assert.ok(calls.saves[0].glb instanceof ArrayBuffer, "ordinary typed save must not be journal-only");
    assert.equal(calls.saves[0].poster.type, "image/png");
    assert.equal(calls.saves[0].title, "Model.glb", "saving must preserve the document title");
    options.revisionRef.current = 2;
    options.sourceGenerationRef.current = 2; // Undo/replacement restores another scene generation.
    await act(async () => { await tree.current().saveCopy(); });
    assert.equal(calls.saves[1].item.revisionId, "r2", "second save used the old CAS base");
    await act(async () => { await tree.current().saveCopy(); });
    assert.equal(calls.saves.length, 2);
    assert.equal(calls.exports, 2);
  } finally { await tree.unmount(); }
});

test("export/download reads the model without publishing another artifact revision", async () => {
  const { options, calls } = fixture();
  const tree = await mount(options);
  try {
    let bytes;
    await act(async () => { bytes = await tree.current().checkpointForExport(); });
    assert.ok(bytes instanceof ArrayBuffer);
    assert.equal(calls.saves.length, 0);
  } finally { await tree.unmount(); }
});

test("a failed save retains the journal and can be retried without clearing it prematurely", async () => {
  const { options, calls } = fixture();
  globalThis.__w13.persist = async () => { throw Error("offline"); };
  const tree = await mount(options);
  try {
    let result;
    await act(async () => { result = await tree.current().saveCopy(); });
    assert.equal(result, null);
    assert.equal(calls.checkpoints.length, 0);
  } finally { await tree.unmount(); }
});

test("cold typed projection loads its editor manifest; a broken manifest cannot admit an empty fallback", async () => {
  for (const broken of [false, true]) {
    const { options } = fixture();
    const calls = { urls: [], source: [], errors: [], views: [], provenance: [] };
    globalThis.__w13Manifest = { load: async (url, schema) => {
      calls.urls.push([url, schema]);
      if (broken) throw Error("manifest unavailable");
      return { checkpointUrl: "", operations: [], view: { exposure: 2.25, background: "#123456" } };
    } };
    const bootstrap = { ...options, item: { ...options.item, meta: { editor_manifest_url: "https://example.invalid/manifest.json",
      model_source_artifact_id: "", model_source_revision_id: "", model_source_digest: "" } },
      artifactSourceDigest: "sha256:typed", loadedSourceRef: ref(""), pendingOperationsRef: ref([]), runtimeRef: ref({ clear() {} }),
      applyView: (view) => calls.views.push(view), setSourceUrl: (url) => calls.source.push(url),
      setSourceLoading() {}, setModelLoading() {}, setProgress() {}, setRuntimeState() {}, setSourceProvenance: (value) => calls.provenance.push(value),
      setError: (value) => calls.errors.push(value) };
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container);
    function Probe() { useModel3DProjectBootstrap(bootstrap); return null; }
    try {
      await act(async () => { root.render(React.createElement(Probe)); await new Promise((resolve) => setTimeout(resolve, 0)); });
      assert.equal(calls.urls[0][0], "https://example.invalid/manifest.json");
      if (broken) {
        assert.deepEqual(calls.source, [""]);
        assert.ok(calls.errors.some((value) => value.includes("manifest unavailable")));
      } else {
        assert.equal(calls.views.at(-1).exposure, 2.25);
        assert.equal(calls.views.at(-1).background, "#123456");
        assert.equal(calls.source.at(-1), options.item.url);
        assert.equal(calls.provenance.at(-1).artifactId, options.item.artifactId, "blank typed metadata must not erase renewable grant identity");
        assert.equal(calls.provenance.at(-1).revisionId, options.item.revisionId);
        assert.equal(calls.provenance.at(-1).sourceDigest, "sha256:typed");
      }
    } finally { await act(async () => root.unmount()); container.remove(); }
  }
});
