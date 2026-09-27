import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import React, { act } from "react";
import { createRoot } from "react-dom/client";

const LEAVE_PRO_LOCK = "专业编辑里的修改还没保存成功，请重试。";
const repoFile = (relative) =>
  readFileSync(new URL(relative, import.meta.url), "utf8");

const require = createRequire(import.meta.url);
const fabric = createRequire(require.resolve("fabric/node"));
const canvas = fabric.resolve("canvas");
const previous = require.cache[canvas];
require.cache[canvas] = { id: canvas, filename: canvas, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabric.resolve("jsdom")).href);
if (previous) require.cache[canvas] = previous;
else delete require.cache[canvas];
const dom = new JSDOM("<!doctype html><body></body>", {
  url: "https://unit.dev.oceanleo.com",
  pretendToBeVisual: true,
});
for (const name of [
  "window",
  "document",
  "navigator",
  "HTMLElement",
  "Element",
  "Node",
  "Event",
  "MouseEvent",
  "localStorage",
  "sessionStorage",
]) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value: name === "window" ? dom.window : dom.window[name],
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = dom.window.requestAnimationFrame.bind(dom.window);
globalThis.cancelAnimationFrame = dom.window.cancelAnimationFrame.bind(dom.window);
globalThis.fetch = async () => {
  throw new Error("No network in P7 component tests");
};
globalThis.AudioContext = class {
  async decodeAudioData(bytes) {
    return { duration: 1, marker: new Uint8Array(bytes)[0] };
  }
  async close() {}
};
after(() => dom.window.close());

const react = pathToFileURL(require.resolve("react")).href;
const jsx = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const noop = (...names) =>
  dataModule(names.map((n) => `export function ${n}(){return null}`).join("\n"));
const handoffUrl = await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
  "../office-editor/useOfficeArtifactSource": dataModule(
    "export function useOfficeArtifactSource(){return {loading:false}}",
  ),
});
const handoff = await import(handoffUrl);
const sourceStub = dataModule(
  `export * from ${JSON.stringify(handoffUrl)}; export const useEditorHandoffSource=()=>globalThis.__p7.source;`,
);
const common = {
  "../advanced-routes/editor-handoff": sourceStub,
  "../advanced-routes/mode-switch-gate": dataModule(
    "export const useModeSwitchHandoff=()=>null; export const useModeSwitchReady=()=>{}; export const useModeSwitchFailure=()=>globalThis.__p7.fail;",
  ),
  "../advanced-routes/w19-handoff-store": dataModule(`
    export const w19ItemKey=(plugin,item)=>plugin+':'+(item.artifactId||item.id||'');
    export const peekW19EnterHandoff=()=>null; export const resolveW19Handoff=(item,source)=>source||{kind:'empty'};
    export const applyW19HandoffToItem=item=>item; export const w19OfficeProbeItem=item=>item;
    export const reportW19ProSaved=(key,item)=>globalThis.__p7.reports.push(item);
    export const W19_PRO_SAVED_AS_NEW_VERSION='';`),
  "../AdvancedWorkbenchShell": dataModule(
    `import {jsx} from ${JSON.stringify(jsx)}; export function AdvancedWorkbenchShell({adapter}) {globalThis.__p7.adapter=adapter; return jsx('main',{children:adapter.stage});}`,
  ),
  "../advanced-recovery-store": dataModule('export const advancedRecoveryKey=()=>"test"'),
  "../advanced-session": dataModule(
    "export const advancedSavedItem=(item,patch)=>({...item,...patch}); export const advancedCommittedRevisionItem=(item,saved)=>({...item,...saved});",
  ),
  "../plugin-command": noop("usePluginCommandSurface"),
  "../agent-review": noop("rememberEditorChips"),
  "../workbench-routes": dataModule(
    'export const editorToolLabel=()=>"test"; export const editorRouteFor=()=>({});',
  ),
  "../doc-editors/doc-io": dataModule(
    `export const saveFileToLibrary=input=>globalThis.__p7.save(input); export const saveProjectWorkingHead=input=>globalThis.__p7.save(input); export function downloadText(){}`,
  ),
  "../../lib/media-proxy": dataModule(
    "export const fetchMediaBlob=async()=>new Blob([new Uint8Array([1])]); export const absoluteMediaUrl=x=>x; export const canvasSafeUrl=x=>x;",
  ),
  "../../lib/auth/client": dataModule('export const accessToken=async()=>"";'),
  "../../lib/auth/config": dataModule('export const GATEWAY_BASE="https://invalid.test";'),
  "../../lib/database": noop("uploadFile"),
};
const audioStubs = {
  ...common,
  "./audio-playlist-mount": dataModule(
    "export const mountWaveformPlaylist=async()=>({emit(){},getDuration:()=>1,getTimeSelection:()=>({start:0,end:1}),trackCount:()=>1});",
  ),
  "./audio-workbench-utils": dataModule(
    "export const encodeWav=buffer=>{globalThis.__p7.encoded.push(buffer.marker);return new Blob([new Uint8Array([buffer.marker])])}; export const applyAudioOperation=buffer=>buffer; export const validAudioProject=value=>Boolean(value&&value.sourceUrl);",
  ),
  "./AudioPlaylistToolbar": noop("AudioPlaylistToolbar"),
  "./AudioTranscriptPanel": noop("AudioTranscriptPanel"),
};
const modelStubs = {
  ...common,
  "./model3d-source-cache": dataModule(
    'export const preloadModel3DSource=async()=>({bytes:new Uint8Array([1]).buffer,format:"glb"});',
  ),
  "./Model3DNextToolbar": noop("Model3DNextToolbar"),
  "./Model3DNextDirector": noop("Model3DNextDirector"),
  "./Model3DViewerStage": noop("Model3DViewerStage"),
};
const { AudioPlaylistStage } = await import(
  await compileModule("src/shell/media-editors/AudioPlaylistStage.tsx", audioStubs)
);
const { Model3DNextStage } = await import(
  await compileModule("src/shell/media-editors/Model3DNextStage.tsx", modelStubs)
);
const { EDITOR_PROTOCOL } = await import("../src/shell/editor-protocol.ts");
const { portableAdvancedDraft } = await import(
  "../src/shell/advanced-draft-recovery.ts"
);
const {
  asGameWorkingDocument,
  peekGameWorkingDocument,
  stashGameWorkingDocument,
  GAME_WORKING_DOCUMENT_SCHEMA,
} = await import(
  await compileModule("src/shell/advanced-routes/GameRoute.tsx", {
    "../AdvancedWorkbenchShell": dataModule(
      "export function AdvancedWorkbenchShell(){return null}",
    ),
    "../AdvancedContentWorkbench": dataModule(
      "export function AdvancedContentWorkbench(){return null}",
    ),
  })
);

async function mount(t, kind) {
  handoff.resetEditorHandoffForTests();
  const state = (globalThis.__p7 = {
    source: {
      status: "ready",
      source:
        kind === "audio" || kind === "threed"
          ? {
              kind: "url",
              url: "https://fixture.invalid/input",
              format: kind === "audio" ? "wav" : "glb",
              revision: null,
            }
          : { kind: "empty" },
    },
    fail() {},
    reports: [],
    saved: [],
    encoded: [],
    posted: [],
  });
  state.item = {
    id: "asset",
    key: "asset",
    artifactId: "asset",
    revisionId: "r0",
    title: "test",
    kind,
    url: "https://fixture.invalid/input",
    meta: {},
  };
  state.save = async (input) => {
    state.saved.push(input);
    return {
      ok: true,
      url: "https://fixture.invalid/saved",
      item: {
        ...state.item,
        revisionId: "r" + state.saved.length,
        url: "https://fixture.invalid/saved",
      },
      versionId: "r" + state.saved.length,
    };
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let mounted = true;
  const Component = kind === "audio" ? AudioPlaylistStage : Model3DNextStage;
  await act(async () => {
    root.render(React.createElement(Component, { item: state.item }));
  });
  state.unmount = async () => {
    if (mounted) {
      mounted = false;
      await act(async () => root.unmount());
      container.remove();
    }
  };
  t.after(state.unmount);
  state.container = container;
  state.key = kind + ":asset";
  state.mode = async (mode) =>
    act(async () => {
      await state.adapter.mode.setMode(mode);
    });
  state.enter = async () => {
    await state.mode("pro");
    const frame = container.querySelector("iframe");
    assert.ok(frame, "professional frame exists");
    frame.contentWindow.postMessage = (message) => state.posted.push(message);
    state.message = async (data) =>
      act(async () =>
        window.dispatchEvent(
          new window.MessageEvent("message", {
            source: frame.contentWindow,
            origin:
              kind === "audio"
                ? "https://audio.oceanleo.app"
                : "https://3d.oceanleo.app",
            data: {
              protocol: EDITOR_PROTOCOL,
              instanceId: new URL(frame.src).searchParams.get("instance"),
              ...data,
            },
          }),
        ),
      );
    await state.message({ type: "ready" });
    if (kind === "threed") await state.message({ type: "dirty", dirty: true, revision: 0 });
  };
  state.dirty = async (revision) => state.message({ type: "dirty", dirty: true, revision });
  state.snapshot = async (
    marker,
    revision = 1,
    request = state.posted.findLast((m) =>
      m.type === (kind === "audio" ? "save-request" : "recovery-capture"),
    ),
  ) => {
    assert.ok(request, "dirty proactively requests current snapshot");
    await state.message({
      type: "recovery-snapshot",
      ok: true,
      recoveryId: request.saveId || request.recoveryId,
      snapshot: {
        revision,
        payload:
          kind === "audio"
            ? { audioBase64: Buffer.from([marker]).toString("base64"), mime: "audio/wav" }
            : { gltfBase64: Buffer.from([marker]).toString("base64"), format: "glb" },
      },
    });
  };
  state.flush = async () => {
    let result;
    await act(async () => {
      result = await state.adapter.persistence.flush();
    });
    return result;
  };
  return state;
}

test("owned audio/3D/PDF/game sources share one working schema and drop the leave-pro lock", () => {
  const audioRoute = repoFile("../src/shell/advanced-routes/AudioRoute.tsx");
  const audioLeaf = repoFile("../src/shell/media-editors/AudioPlaylistStage.tsx");
  const modelRoute = repoFile("../src/shell/advanced-routes/Model3DRoute.tsx");
  const modelLeaf = repoFile("../src/shell/media-editors/Model3DNextStage.tsx");
  const pdfRoute = repoFile("../src/shell/advanced-routes/PdfRoute.tsx");
  const gameRoute = repoFile("../src/shell/advanced-routes/GameRoute.tsx");
  const gameCode = repoFile("../src/shell/game-editor/GameCodeStage.tsx");
  assert.match(audioRoute, /draftSchema:\s*"oceanleo\.audio\.edit\.v1"/);
  assert.match(audioLeaf, /draftSchema:\s*"oceanleo\.audio\.edit\.v1"/);
  assert.match(modelRoute, /draftSchema:\s*"oceanleo\.threed\.edit\.v1"/);
  assert.match(modelLeaf, /draftSchema:\s*"oceanleo\.threed\.edit\.v1"/);
  assert.match(gameRoute, /GAME_WORKING_DOCUMENT_SCHEMA/);
  assert.match(gameCode, /GAME_WORKING_DOCUMENT_SCHEMA/);
  assert.doesNotMatch(gameCode, /oceanleo\.game\.code\.v1/);
  assert.doesNotMatch(pdfRoute, /draftSchema:/);
  assert.doesNotMatch(pdfRoute, /W19_PRO_SAVED_AS_NEW_VERSION/);
  for (const body of [audioRoute, audioLeaf, modelRoute, modelLeaf, pdfRoute]) {
    assert.doesNotMatch(body, /saveBeforeLeavePro/);
    assert.doesNotMatch(body, /专业编辑里的修改还没保存成功/);
    assert.doesNotMatch(body, /handoffItemKey=/);
  }
});

for (const kind of ["audio", "threed"]) {
  test(`P7 ${kind}: failed flush still switches to normal and never paints the lock copy`, async (t) => {
    const s = await mount(t, kind);
    await s.enter();
    await s.dirty(1);
    await s.snapshot(7);
    assert.equal(
      s.adapter.persistence.recovery.draftSchema,
      kind === "audio" ? "oceanleo.audio.edit.v1" : "oceanleo.threed.edit.v1",
    );
    s.save = async () => ({ ok: false, error: "offline" });
    const flushed = await s.flush();
    assert.equal(flushed.ok, false);
    await s.mode("normal");
    assert.equal(s.adapter.mode.current, "normal");
    assert.equal(s.container.textContent.includes(LEAVE_PRO_LOCK), false);
    assert.equal(document.body.textContent.includes(LEAVE_PRO_LOCK), false);
  });

  test(`P7 ${kind}: a successful flush writes the same artifact identity`, async (t) => {
    const s = await mount(t, kind);
    await s.enter();
    await s.dirty(1);
    await s.snapshot(7);
    const flushed = await s.flush();
    assert.equal(flushed.ok, true, flushed.error);
    assert.equal(s.saved.length, 1);
    assert.equal(s.saved[0].item.artifactId, "asset");
    assert.equal(
      s.saved[0].artifactRevision.artifactType,
      kind === "audio" ? "audio" : "model_3d",
    );
    assert.equal(s.reports[0].artifactId, "asset");
    const captured = s.adapter.persistence.recovery.capture();
    assert.equal(portableAdvancedDraft(captured) === null, false);
    if (kind === "audio") {
      assert.equal(captured.sourceUrl, "https://fixture.invalid/saved");
      assert.deepEqual(captured.operations, []);
    } else {
      assert.equal(captured.checkpointUrl, "https://fixture.invalid/saved");
      assert.equal(captured.view.sourceUrl, "https://fixture.invalid/saved");
    }
  });
}

test("P7 game: both faces read and write one working document", () => {
  assert.equal(GAME_WORKING_DOCUMENT_SCHEMA, "oceanleo.game.edit.v1");
  const item = { artifactId: "game-1", id: "game-1" };
  const fromCode = asGameWorkingDocument({
    envelopeUrl: "https://fixture.invalid/game.json",
    envelopeDigest: "abc",
    origin: "ai",
    source: "<!doctype html><html><body><script></script></body></html>",
    prompt: "jump",
  });
  assert.ok(fromCode);
  stashGameWorkingDocument(item, fromCode);
  const peeked = peekGameWorkingDocument(item);
  assert.equal(peeked?.source, fromCode.source);
  assert.equal(peeked?.envelopeUrl, fromCode.envelopeUrl);
  const fromPlay = asGameWorkingDocument({
    envelopeUrl: "https://fixture.invalid/game-2.json",
    envelopeDigest: "def",
    origin: "remix",
  });
  assert.ok(fromPlay);
  assert.equal(fromPlay.source, undefined);
  assert.equal(asGameWorkingDocument({ origin: "upload", source: "<html>" }), null);
});
