// F04：「从这一步接手」。
//   ① createReplayArtifact：能存的族（video / audio）走保存链并给出 openPath；保存链失败把人话原样给出；
//      不能存的族、内容不完整都如实拒绝；
//   ② 播放器：成功 → 提示「已存到你的库」并给「打开」；失败 → 显示原因；没有 createArtifact → 不显示按钮；
//      公开页 → 不显示；这一族存不成 → 不显示；openPath 不是站内路径 → 只提示不给链接。
// 保存链全部用注入的替身，不联网、不上传。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);

// ---- ① 纯函数 --------------------------------------------------------------
const forkUrl = await compileModule("src/shell/replay/work/fork-artifact.ts");
const fork = await import(forkUrl);

const videoDoc = () => ({ width: 1280, height: 720, fps: 30, tracks: [{ id: "t1", kind: "video", clips: [{ id: "c1", start_ms: 0, duration_ms: 1000 }] }] });
const audioDoc = () => ({ sourceUrl: "https://m/a.mp3", operations: [{ type: "crop", start: 1, end: 6 }] });

test("接手：video / audio 能存，别的族不能（按钮据此显示）", () => {
  assert.equal(fork.canForkKind("video"), true);
  assert.equal(fork.canForkKind("audio"), true);
  for (const kind of ["richdoc", "grid", "deck", "image", "vector", "chart", "game", "model3d", "pdf", "workflow", null, undefined]) {
    assert.equal(fork.canForkKind(kind), false, String(kind));
  }
  assert.deepEqual([...fork.FORKABLE_EDITOR_KINDS].sort(), ["audio", "video"]);
});

test("接手：工程 schema 与两个编辑器自己的常量同值", () => {
  const timeline = readFileSync(new URL("../src/shell/video-editor/timeline-carrier.ts", import.meta.url), "utf8");
  const audio = readFileSync(new URL("../src/shell/media-editors/audio-project-carrier.ts", import.meta.url), "utf8");
  assert.ok(timeline.includes(`TIMELINE_PROJECT_SCHEMA_ID = "${fork.FORK_TIMELINE_SCHEMA}"`));
  assert.ok(audio.includes(`AUDIO_PROJECT_SCHEMA_ID = "${fork.FORK_AUDIO_SCHEMA}"`));
});

test("接手：成功 → 走保存链新建（没有既有 artifact 身份）并返回 openPath", async () => {
  const calls = [];
  const result = await fork.createReplayArtifact(
    { editorKind: "video", title: "周报回放（接手）", json: videoDoc() },
    {
      nonce: () => "n1",
      save: async (input) => {
        calls.push(input);
        return { ok: true, artifactId: "art-1" };
      },
    },
  );
  assert.deepEqual(result, { ok: true, openPath: "/library" });
  assert.equal(calls.length, 1);
  const call = calls[0];
  assert.equal(call.title, "周报回放（接手）");
  assert.equal(call.mediaType, "video");
  assert.equal(call.project.schema, "oceanleo.timeline.v1");
  assert.deepEqual(call.project.data, videoDoc());
  assert.equal(call.editorManifest.id, "video-timeline");
  assert.equal(call.idempotencyKey, "replay-fork:video:n1");
  // 占位条目没有任何 artifact / revision 身份 → 保存链只会「新建」，不会去改别人的作品
  assert.equal(call.item.artifactId, undefined);
  assert.equal(call.item.revisionId, undefined);
  assert.equal(call.artifactRevision, undefined);
  assert.equal(call.meta.source_kind, "work_replay_fork");
});

test("接手：audio 带上编辑器认的元数据", async () => {
  let seen = null;
  const result = await fork.createReplayArtifact(
    { editorKind: "audio", title: "录音（接手）", json: audioDoc() },
    { save: async (input) => ((seen = input), { ok: true }) },
  );
  assert.equal(result.ok, true);
  assert.equal(seen.project.schema, "oceanleo.audio-project.v1");
  assert.equal(seen.mediaType, "audio");
  assert.equal(seen.meta.audio_source_url, "https://m/a.mp3");
  assert.equal(seen.meta.audio_operation_count, 1);
  assert.equal(seen.editorManifest.id, "audio-editor");
});

test("接手：保存链失败 → 把它给的人话原样带回；抛错 → 通用提示", async () => {
  const failed = await fork.createReplayArtifact(
    { editorKind: "video", title: "x", json: videoDoc() },
    { save: async () => ({ ok: false, error: "存储服务没有返回可编辑工程地址" }) },
  );
  assert.deepEqual(failed, { ok: false, error: "存储服务没有返回可编辑工程地址" });
  const empty = await fork.createReplayArtifact(
    { editorKind: "video", title: "x", json: videoDoc() },
    { save: async () => ({ ok: false }) },
  );
  assert.deepEqual(empty, { ok: false, error: "没有保存成功，请再试一次。" });
  const thrown = await fork.createReplayArtifact(
    { editorKind: "video", title: "x", json: videoDoc() },
    { save: async () => { throw new Error("boom: secret internals"); } },
  );
  assert.deepEqual(thrown, { ok: false, error: "接手没有成功，请再试一次。" });
});

test("接手：不支持的族、内容不完整都如实拒绝，且不会去调保存链；错误话走 tt", async () => {
  let called = 0;
  const save = async () => ((called += 1), { ok: true });
  const seen = [];
  const tt = (zh, vars) => (seen.push(zh), `T:${zh}`);
  const unsupported = await fork.createReplayArtifact({ editorKind: "richdoc", title: "x", json: {} }, { save, tt });
  assert.deepEqual(unsupported, { ok: false, error: "T:这种作品暂时还不能从回放接手。" });
  const broken = await fork.createReplayArtifact({ editorKind: "video", title: "x", json: { nope: 1 } }, { save, tt });
  assert.deepEqual(broken, { ok: false, error: "T:这一步还原不出来，换一步再试。" });
  const brokenAudio = await fork.createReplayArtifact({ editorKind: "audio", title: "x", json: { sourceUrl: 3, operations: [] } }, { save, tt });
  assert.equal(brokenAudio.ok, false);
  assert.equal(called, 0);
});

test("接手：openPath 只放行站内相对路径", () => {
  assert.equal(fork.safeOpenPath("/library"), "/library");
  assert.equal(fork.safeOpenPath("/workspace/x?item=1&mode=preview"), "/workspace/x?item=1&mode=preview");
  for (const bad of ["//evil.com", "https://evil.com", "javascript:alert(1)", "library", "/a\\b", "/a\nb", "", null, undefined, 3]) {
    assert.equal(fork.safeOpenPath(bad), null, String(bad));
  }
});

// ---- ② 播放器 --------------------------------------------------------------
const uiStub = dataModule(`
  const tt = (zh, vars) =>
    vars ? String(zh).replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : zh;
  export function useUI() { return tt; }
`);
const b64 = (text) => Buffer.from(text, "utf8").toString("base64");
globalThis.__forkTestFrames = { kind: "trail", base_seq: 0, base_state: b64("base"), updates: [{ seq: 1, update: b64("u1"), author_id: "u1", t_ms: 100 }] };
const agentStub = dataModule(`
  export async function authed(path) {
    if (String(path).includes("/frames")) return { ok: true, data: globalThis.__forkTestFrames, status: 200 };
    return { ok: false, error: "stub", status: 0 };
  }
`);
const configStub = dataModule(`export const GATEWAY_BASE = "https://api.dev.oceanleo.com";`);
const imClientStub = dataModule(`export async function imFetch() { return { ok: false, status: 0 }; }`);
globalThis.__forkTestReact = React;
const markdownStub = dataModule(`
  const h = (props, text) => globalThis.__forkTestReact.createElement("div", { "data-md": "" }, text ?? props.children);
  export function Markdown(props) { return h(props, props.text ?? props.content); }
  export function TypewriterMarkdown(props) { return h(props, props.text ?? props.content); }
`);
const framesStub = dataModule(`
  const renderer = {
    kind: "video",
    fromY: (doc) => ({ tracks: [{ id: "t1", kind: "video", clips: [{ id: "c1", start_ms: 0, duration_ms: 1000 }] }], applied: doc.applied.length }),
    Frame: () => null,
    describeChange: (prev, next, tt) => (tt ? tt("新增了 {n} 段", { n: 1 }) : null),
    toArtifactJson: (snapshot) => ({ tracks: snapshot.tracks, width: 1280, height: 720 }),
  };
  export async function loadFrameRenderer() { return renderer; }
  export function resetFrameRendererCache() {}
`);
const stubs = {
  "../../../i18n/ui/useUI": uiStub,
  "../../../../i18n/ui/useUI": uiStub,
  "../../../lib/agent": agentStub,
  "../../../lib/auth/config": configStub,
  "../../../lib/im/client": imClientStub,
  "../../Markdown": markdownStub,
  "./frames": framesStub,
};
const { WorkReplayPlayer } = await import(await compileModule("src/shell/replay/work/WorkReplayPlayer.tsx", stubs));

async function installDom() {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/replay/demo" });
  const { window } = dom;
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    MouseEvent: window.MouseEvent,
    KeyboardEvent: window.KeyboardEvent,
    requestAnimationFrame: window.requestAnimationFrame.bind(window),
    cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  const previousAct = globalThis.IS_REACT_ACT_ENVIRONMENT;
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  restore.push(() => {
    if (previousAct === undefined) delete globalThis.IS_REACT_ACT_ENVIRONMENT;
    else globalThis.IS_REACT_ACT_ENVIRONMENT = previousAct;
  });
  return {
    window,
    restore() {
      for (const undo of restore.reverse()) undo();
      window.close();
    },
  };
}

async function mount(element) {
  const dom = await installDom();
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.createElement("div");
  dom.window.document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async wait(ms) {
      await act(async () => {
        await new Promise((done) => setTimeout(done, ms));
      });
    },
    async click(node) {
      await act(async () => {
        node.dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true, cancelable: true }));
      });
    },
    async key(node, key) {
      await act(async () => {
        node.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }));
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      dom.restore();
    },
  };
}

function fakeYjs() {
  class Doc {
    constructor() {
      this.applied = [];
    }
    destroy() {}
  }
  return {
    Doc,
    applyUpdate(doc, bytes) {
      doc.applied.push(Buffer.from(bytes).toString("utf8"));
    },
  };
}

function videoReplay({ canFork = true, isOwner = false, via = "recipient" } = {}) {
  return {
    replay: { id: "r1", title: "周报回放", owner_id: "u1", scope: "personal", visibility: "recipients", share_url: null, trim: null, show_exact_times: false, show_undone: false, created_at: "2026-10-05T00:00:00Z" },
    viewer: { is_owner: isOwner, can_fork: canFork, via },
    people: [{ user_id: "u1", display_name: "小王", avatar_url: null, color: "hsl(10, 70%, 45%)", consent: "self" }],
    days: [{ date: "2026-10-05", active_ms: 600_000 }],
    active_ms: 600_000,
    playback_ms: 8000,
    chapters: [{ id: "c1", title: "周一 上午 · 剪辑", title_parts: { weekday: 0, half: "am", source_title: "剪辑" }, day: "2026-10-05", start_ms: 0, end_ms: 8000, active_ms: 8000, sources: ["artifact:v1"], summary: null, hidden: false }],
    events: [{ id: "e1", t_ms: 500, dur_ms: 0, kind: "edit", source: "artifact:v1", author_id: "u1", at: null, seq_from: 1, seq_to: 1, revision_id: null, text: null, undone: false, editor_kind: "video" }],
    sources: [{ key: "artifact:v1", editor_kind: "video", title: "剪辑", has_trail: true }],
  };
}

const q = (container, selector) => container.querySelector(selector);

/** 把播放器拖到有编辑的位置，等画法与逐步记录都就绪。 */
async function readyView(props) {
  const view = await mount(
    React.createElement(WorkReplayPlayer, { data: videoReplay(), autoPlay: false, loadYjsImpl: async () => fakeYjs(), ...props }),
  );
  await view.key(q(view.container, "[data-replay-track]"), "ArrowRight"); // +5 秒，此时第 1 号更新已发生
  await view.wait(60);
  return view;
}

test("播放器：没有 createArtifact → 不显示「从这一步接手」", async () => {
  const view = await readyView({});
  try {
    assert.equal(q(view.container, "[data-replay-fork]"), null);
  } finally {
    await view.unmount();
  }
});

test("播放器：成功 → 把还原出的内容交给 createArtifact，提示「已存到你的库」并给「打开」", async () => {
  const calls = [];
  const view = await readyView({
    createArtifact: async (input) => (calls.push(input), { ok: true, openPath: "/library" }),
    canForkKind: (kind) => kind === "video",
  });
  try {
    const button = q(view.container, "[data-replay-fork]");
    assert.ok(button, "能接手的族应显示按钮");
    await view.click(button);
    await view.wait(30);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].editorKind, "video");
    assert.equal(calls[0].title, "周报回放（接手）");
    assert.equal(calls[0].json.width, 1280);
    assert.equal(calls[0].json.tracks[0].clips[0].id, "c1");
    assert.equal(q(view.container, "[data-replay-fork-error]"), null);
    const done = q(view.container, "[data-replay-fork-done]");
    assert.ok(done, "应出现成功提示");
    assert.match(done.textContent, /已存到你的库/);
    const open = q(view.container, "[data-replay-fork-open]");
    assert.equal(open.getAttribute("href"), "/library");
    assert.equal(open.textContent, "打开");
  } finally {
    await view.unmount();
  }
});

test("播放器：接口失败 → 把它给的原因显示出来，不显示成功提示", async () => {
  const view = await readyView({
    createArtifact: async () => ({ ok: false, error: "存储服务没有返回可编辑工程地址" }),
    canForkKind: () => true,
  });
  try {
    await view.click(q(view.container, "[data-replay-fork]"));
    await view.wait(30);
    assert.equal(q(view.container, "[data-replay-fork-error]").textContent, "存储服务没有返回可编辑工程地址");
    assert.equal(q(view.container, "[data-replay-fork-done]"), null);
  } finally {
    await view.unmount();
  }
});

test("播放器：createArtifact 抛错 → 通用提示，不白屏", async () => {
  const view = await readyView({
    createArtifact: async () => {
      throw new Error("boom");
    },
    canForkKind: () => true,
  });
  try {
    await view.click(q(view.container, "[data-replay-fork]"));
    await view.wait(30);
    assert.equal(q(view.container, "[data-replay-fork-error]").textContent, "接手没有成功，请再试一次。");
  } finally {
    await view.unmount();
  }
});

test("播放器：公开页不显示接手（即使给了 createArtifact 且服务端说能接手）", async () => {
  const view = await readyView({
    data: videoReplay({ canFork: true }),
    publicCode: "w_abc",
    createArtifact: async () => ({ ok: true, openPath: "/library" }),
    canForkKind: () => true,
  });
  try {
    assert.equal(q(view.container, "[data-replay-fork]"), null);
  } finally {
    await view.unmount();
  }
});

test("播放器：服务端说不能接手 / 这一族存不成 → 不显示按钮", async () => {
  const noRight = await readyView({
    data: videoReplay({ canFork: false }),
    createArtifact: async () => ({ ok: true }),
    canForkKind: () => true,
  });
  try {
    assert.equal(q(noRight.container, "[data-replay-fork]"), null);
  } finally {
    await noRight.unmount();
  }
  const wrongKind = await readyView({
    createArtifact: async () => ({ ok: true }),
    canForkKind: (kind) => kind === "audio",
  });
  try {
    assert.equal(q(wrongKind.container, "[data-replay-fork]"), null);
  } finally {
    await wrongKind.unmount();
  }
});

test("播放器：openPath 不是站内路径 → 只提示已存好，不渲染链接", async () => {
  const view = await readyView({
    createArtifact: async () => ({ ok: true, openPath: "javascript:alert(1)" }),
    canForkKind: () => true,
  });
  try {
    await view.click(q(view.container, "[data-replay-fork]"));
    await view.wait(30);
    assert.ok(q(view.container, "[data-replay-fork-done]"));
    assert.equal(q(view.container, "[data-replay-fork-open]"), null);
  } finally {
    await view.unmount();
  }
});

test("播放器：说明文字走传进来的 tt（caption 是画法用 tt 拼出来的）", async () => {
  const view = await readyView({});
  try {
    const caption = q(view.container, "[data-replay-caption]");
    assert.ok(caption);
    assert.equal(caption.textContent, "新增了 1 段");
  } finally {
    await view.unmount();
  }
});
