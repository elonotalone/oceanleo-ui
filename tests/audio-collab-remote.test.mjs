import assert from "node:assert/strict";
import test from "node:test";
import {
  React,
  act,
  compileModule,
  dataModule,
  loadEntityCollab,
  makeWorld,
  mount,
  settle,
} from "./collab-media-sim.mjs";

const h = React.createElement;

// ---- 浏览器音频 API 的替身：解码永远得到 1 秒单声道静音；AudioBuffer 保存声道数据。
class FakeAudioBuffer {
  constructor({ length, numberOfChannels, sampleRate }) {
    this.length = length;
    this.numberOfChannels = numberOfChannels;
    this.sampleRate = sampleRate;
    this.duration = length / sampleRate;
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel) {
    return this.channels[channel];
  }
  copyToChannel(source, channel) {
    this.channels[channel].set(source);
  }
}
class FakeAudioContext {
  async decodeAudioData() {
    return new FakeAudioBuffer({ length: 44_100, numberOfChannels: 1, sampleRate: 44_100 });
  }
  async close() {}
}
globalThis.AudioBuffer = FakeAudioBuffer;
globalThis.AudioContext = FakeAudioContext;

const useUiStub = dataModule(`export const useUI = () => (text, vars) =>
  vars ? String(text).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars[key] ?? "")) : String(text);`);
const stubs = {
  "../../i18n/ui/useUI": useUiStub,
  "../../lib/database": dataModule(`export const uploadFile = async () => ({ ok: true, data: { file: { url: "https://m/cp.wav" } } });`),
  "../../lib/media-proxy": dataModule(`
    export const fetchMediaBlob = async () => new Blob([new Uint8Array(16)], { type: "audio/wav" });
    export const importMediaUrl = async (url) => url;
    export const isFirstPartyMediaUrl = () => true;
  `),
  "./source-integrity.mjs": dataModule(`export const assertBlobSource = async () => "wav";`),
  "../doc-editors/doc-io": dataModule(`
    export const saveProjectWorkingHead = async () => { globalThis.__audioSaves = (globalThis.__audioSaves || 0) + 1; return null; };
  `),
  "../doc-editors/artifact-save-contract": dataModule(`export const artifactSaveStepMessage = () => "";`),
  "../doc-editors/editor-preview-raster": dataModule(`export const renderAudioWaveformPng = async () => null;`),
};

const { useAudioPersistence } = await import(
  await compileModule("src/shell/media-editors/use-audio-persistence.ts", stubs)
);
const { useAudioMutations } = await import(
  await compileModule("src/shell/media-editors/use-audio-mutations.ts", stubs)
);
const { useEntityCollab } = await loadEntityCollab();
const adapter = await import("../src/shell/collab/adapters/audio.ts");

const ITEM = { id: "a1", key: "a1", title: "录音", kind: "audio", source: "local", url: "https://m/a.wav", meta: {} };
const gain = (start, end, multiplier) => ({ type: "gain", start, end, multiplier });

/** 照 AudioWorkbench + AudioRoute 的接法：真 useAudioMutations / useAudioPersistence / useEntityCollab。 */
function makeClient(key, captured) {
  return function Client() {
    const bufferRef = React.useRef(new FakeAudioBuffer({ length: 44_100, numberOfChannels: 1, sampleRate: 44_100 }));
    const sourceUrlRef = React.useRef("https://m/a.wav");
    const operationsRef = React.useRef([]);
    const undoOperationsRef = React.useRef([]);
    const redoOperationsRef = React.useRef([]);
    const undoRef = React.useRef([]);
    const redoRef = React.useRef([]);
    const revisionRef = React.useRef(0);
    const savingRef = React.useRef(false);
    const mutatingRef = React.useRef(false);
    const remoteReplayRef = React.useRef(false);
    const workingHeadUrlRef = React.useRef("https://m/a.wav");
    const reloads = React.useRef({ plain: 0, keepView: 0 });
    const [dirty, setDirty] = React.useState(false);
    const [error, setError] = React.useState("");
    const [, setCanUndo] = React.useState(false);
    const [, setCanRedo] = React.useState(false);
    const [, setLoading] = React.useState(false);
    const [, setSaving] = React.useState(false);
    const [, setSavedUrl] = React.useState("");
    const [contentVersion, setContentVersion] = React.useState(0);
    const tt = (text, vars) =>
      vars ? String(text).replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? "")) : String(text);
    const reloadWaveform = React.useCallback(async () => {
      reloads.current.plain += 1;
    }, []);
    const reloadWaveformKeepView = React.useCallback(async () => {
      reloads.current.keepView += 1;
    }, []);
    const bumpContent = React.useCallback(() => setContentVersion((v) => v + 1), []);
    const shared = {
      item: ITEM,
      siteId: "",
      bufferRef,
      sourceUrlRef,
      operationsRef,
      undoOperationsRef,
      redoOperationsRef,
      undoRef,
      redoRef,
      revisionRef,
      reloadWaveform,
      setError,
      setSavedUrl,
      setDirty,
      setCanUndo,
      setCanRedo,
      tt,
      mutatingRef,
      remoteReplayRef,
    };
    const persistence = useAudioPersistence({
      ...shared,
      requiresExistingSource: false,
      workingHeadUrlRef,
      savingRef,
      setSaving,
      reloadWaveformKeepView,
      bumpContent,
    });
    const commit = useAudioMutations({ ...shared, setLoading });
    const editRevision = revisionRef.current;
    const collabLocal = React.useMemo(
      () => persistence.captureRecovery(),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [editRevision, contentVersion],
    );
    const collab = useEntityCollab({
      item: { artifactId: key, title: "录音" },
      editorKind: "audio",
      rootName: adapter.AUDIO_ROOT,
      toEntities: adapter.audioToEntities,
      fromEntities: (input, prev) => adapter.audioFromEntities(input, prev),
      local: collabLocal,
      historyCoalesceMs: 0,
      applyRemote: (state) => persistence.applyRemoteProject(state),
      applyLocal: (state) => persistence.applyLocalProject(state),
    });
    captured[key] = {
      collab,
      commit,
      dirty,
      error,
      editRevision,
      nativeUndo: () => undoRef.current.length,
      nativeRedo: () => redoRef.current.length,
      operations: () => operationsRef.current,
      reloads: () => ({ ...reloads.current }),
      save: persistence.save,
    };
    return null;
  };
}

async function twoClients() {
  const world = makeWorld();
  const captured = {};
  const mountedA = await mount(h(makeClient("A", captured)));
  await settle();
  await world.sync();
  const mountedB = await mount(h(makeClient("B", captured)));
  await settle(6);
  await world.sync();
  await settle(6);
  return {
    world,
    captured,
    async close() {
      await mountedA.unmount();
      await mountedB.unmount();
    },
  };
}

const types = (client) => client.operations().map((op) => `${op.type}:${op.multiplier}`);

test("音频：B 加一条操作，A 的撤销栈、改动版本都不动，也没有保存调用", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => {
      assert.equal(await captured.A.commit(gain(0, 0.5, 2)), true);
    });
    await settle(4);
    await world.sync();
    await settle(4);
    const before = {
      depth: captured.A.collab.history.undoDepth,
      nativeUndo: captured.A.nativeUndo(),
      revision: captured.A.editRevision,
      saves: globalThis.__audioSaves || 0,
    };
    assert.equal(before.depth, 1);
    assert.deepEqual(types(captured.B), ["gain:2"], "B 先收到 A 的操作");

    await act(async () => {
      assert.equal(await captured.B.commit(gain(0.5, 1, 3)), true);
    });
    await settle(4);
    await world.sync();
    await settle(8);

    assert.deepEqual(types(captured.A).sort(), ["gain:2", "gain:3"], "A 这边看到了 B 的操作");
    assert.equal(captured.A.collab.history.undoDepth, before.depth, "A 自己的撤销栈长度不变");
    assert.equal(captured.A.nativeUndo(), before.nativeUndo, "A 本机的音频撤销栈没被清掉");
    assert.equal(captured.A.editRevision, before.revision, "改动版本号不变 → 自动保存不会被触发");
    assert.equal(globalThis.__audioSaves || 0, before.saves, "没有保存调用");
    assert.equal(captured.A.error, "", "没有报错或「已恢复本地草稿」类提示");
    assert.ok(captured.A.reloads().keepView >= 1, "对方的改动用「保住视角」的重载进来");
    assert.equal(captured.A.reloads().plain, 1, "只有 A 自己那次编辑重载过普通波形");
  } finally {
    await close();
  }
});

test("音频：只收到对方改动的一端不会被标成未保存", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => {
      await captured.A.commit(gain(0, 1, 2));
    });
    await settle(4);
    await world.sync();
    await settle(8);
    assert.deepEqual(types(captured.B), ["gain:2"]);
    assert.equal(captured.B.dirty, false);
    assert.equal(captured.B.editRevision, 0);
    assert.equal(captured.B.collab.history.undoDepth, 0);
    assert.equal(captured.B.nativeUndo(), 0);
  } finally {
    await close();
  }
});

test("音频：A 撤销自己的那条操作，B 的操作保留", async () => {
  const { world, captured, close } = await twoClients();
  try {
    await act(async () => {
      await captured.A.commit(gain(0, 0.5, 2));
    });
    await settle(4);
    await world.sync();
    await settle(6);
    await act(async () => {
      await captured.B.commit(gain(0.5, 1, 3));
    });
    await settle(4);
    await world.sync();
    await settle(8);
    assert.deepEqual(types(captured.A).sort(), ["gain:2", "gain:3"]);

    await act(async () => captured.A.collab.history.undo());
    await settle(8);
    await world.sync();
    await settle(8);

    assert.deepEqual(types(captured.A), ["gain:3"], "A 撤销了自己的 gain:2，B 的 gain:3 还在");
    assert.deepEqual(types(captured.B), ["gain:3"], "B 那边一致");
    assert.equal(captured.A.collab.history.canRedo, true);
  } finally {
    await close();
  }
});

// ------------------------------------------------------------------ 只读

const spyEditor = (calls, overrides = {}) =>
  new Proxy(
    {
      loading: false,
      error: "",
      playing: false,
      speed: 1,
      currentTime: 0,
      duration: 10,
      volume: 80,
      zoom: 50,
      selection: { start: 1, end: 2 },
      fadeDuration: 1,
      gain: 1,
      effectSpeed: 1,
      lowEq: 0,
      midEq: 0,
      highEq: 0,
      canUndo: true,
      canRedo: false,
      ...overrides,
    },
    {
      get(target, prop) {
        if (prop in target) return target[prop];
        return typeof prop === "string" ? (...args) => calls.push([prop, ...args]) : undefined;
      },
    },
  );

test("音频（只读）：播放、停止、拖播放位置、音量、缩放可用；导入和所有编辑控件不可用", async () => {
  const calls = [];
  const view = await import(
    await compileModule("src/shell/media-editors/AudioWorkbenchView.tsx", {
      "../../i18n/ui/useUI": useUiStub,
      "./AudioWorkbench": dataModule(`export const useAudioWorkbench = () => ({});`),
    })
  );
  const editor = spyEditor(calls);
  const controls = await mount(h(view.AudioControls, { editor, readOnly: true }));
  try {
    const fileInput = controls.container.querySelector('input[type="file"]');
    assert.equal(fileInput.disabled, true, "导入 / 替换音频不可用");
    const buttons = [...controls.container.querySelectorAll("button")];
    const play = buttons.find((b) => b.getAttribute("aria-label") === "播放");
    const stop = buttons.find((b) => b.getAttribute("aria-label") === "停止");
    assert.equal(play.disabled, false);
    assert.equal(stop.disabled, false);
    await act(async () => play.click());
    assert.ok(calls.some((c) => c[0] === "playPause"), "播放可用");
    const ranges = [...controls.container.querySelectorAll('input[type="range"]')];
    assert.ok(ranges.length >= 4, "播放位置 / 音量 / 速度 / 缩放四条滑杆都在");
    assert.ok(ranges.every((r) => !r.disabled), "滑杆没被禁用");
  } finally {
    await controls.unmount();
  }
});

test("音频（只读）：选区工具栏的每个控件都置灰，命令不会触发任何改动", async () => {
  const calls = [];
  const toolbar = await import(
    await compileModule("src/shell/media-editors/AudioContextToolbar.tsx", {
      "../../i18n/ui/useUI": useUiStub,
      "../SelectionToolbar": dataModule(`
        export function SelectionToolbar({ context, onCommand }) {
          globalThis.__audioSelection = { context, onCommand };
          return null;
        }
      `),
    })
  );
  const editor = spyEditor(calls);
  const mounted = await mount(h(toolbar.AudioContextToolbar, { editor, readOnly: true }));
  try {
    const { context, onCommand } = globalThis.__audioSelection;
    assert.ok(context.controls.length >= 8);
    assert.ok(context.controls.every((control) => control.disabled === true), "每个控件都置灰");
    assert.ok(context.controls.every((control) => control.unavailableReason === "只能查看，不能修改"));
    for (const controlId of ["crop", "delete", "fade-in", "fade-out", "apply-gain", "apply-effects"]) {
      onCommand({ selectionId: context.id, controlId });
    }
    onCommand({ selectionId: context.id, controlId: "gain", value: 3 });
    assert.deepEqual(calls, [], "只读时命令不触发任何编辑");
  } finally {
    await mounted.unmount();
  }
  const open = await mount(h(toolbar.AudioContextToolbar, { editor: spyEditor(calls), readOnly: false }));
  try {
    const { context, onCommand } = globalThis.__audioSelection;
    assert.ok(context.controls.some((control) => control.disabled !== true), "非只读时控件可用");
    onCommand({ selectionId: context.id, controlId: "crop" });
    assert.ok(calls.some((c) => c[0] === "cropSelection"));
  } finally {
    await open.unmount();
  }
});
