// 主站游戏试玩 / 编辑（claude_game_ui_1022）：用一个假的已注册宿主验证共享 UI。
//
// 覆盖：就地试玩（宿主拿到当前 artifact / revision、重新开始、返回、无宿主回退链接）、
// Code 页的草稿快照（运行才换、按键不换、保存后回到已保存版）、保存身份前进、
// 描述改玩法采纳返回的 artifact（不二次保存）、非自己的作品先 fork、只读与无源码的人话说明。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  ensureOwnGameCopy,
  gameEditAccess,
} from "../src/shell/game-editor/game-edit-access.ts";

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;
const reactUrl = pathToFileURL(require.resolve("react")).href;
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/library",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  localStorage: window.localStorage,
  sessionStorage: window.sessionStorage,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const DOC_V1 =
  "<!doctype html><html><body><script>window.GAME=1</script></body></html>";

// ── fixtures ────────────────────────────────────────────────────────────────

function rendition(url) {
  return { url, digest: `d-${url}`, mediaType: "application/json" };
}

function gameItem({
  artifactId = "art-own",
  revisionId = "rev-1",
  canEdit = true,
  canFork = true,
  withSource = true,
} = {}) {
  const artifact = {
    schema: "oceanleo.artifact.v1",
    artifactId,
    revisionId,
    artifactType: "game",
    owner: { originSiteKey: "game" },
    access: {
      canRead: true,
      canPreview: true,
      canExportSource: true,
      canEdit,
      canFork,
    },
    integrity: { ok: true },
    provenance: { id: "p1", sourceKind: "platform", licenseCode: "official" },
    renditions: withSource
      ? {
          full: rendition(`https://cdn.test/${artifactId}/${revisionId}/full.json`),
          preview: rendition(`https://cdn.test/${artifactId}/cover.png`),
          editor_manifest: rendition(`https://cdn.test/${artifactId}/m.json`),
        }
      : {
          preview: rendition(`https://cdn.test/${artifactId}/cover.png`),
        },
  };
  return {
    key: `artifact:${artifactId}:${revisionId}`,
    source: "artifact",
    id: artifactId,
    title: "海岸井字棋",
    kind: "game",
    siteId: "game",
    favorite: false,
    meta: { game_source: withSource ? DOC_V1 : "", engine_api_version: "1" },
    artifactId,
    revisionId,
    artifactType: "game",
    artifact,
    previewUrl: "https://cdn.test/cover.png",
    thumbUrl: "https://cdn.test/cover.png",
    url: withSource ? artifact.renditions.full.url : undefined,
  };
}

async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  await act(async () => {});
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const click = async (node) => {
  await act(async () => {
    node.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
};
const settle = async (ms = 20) => {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, ms));
  });
};
const q = (container, selector) => container.querySelector(selector);
const byText = (container, tag, text) =>
  [...container.querySelectorAll(tag)].find((node) =>
    (node.textContent || "").includes(text),
  );
async function type(node, proto, value) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    setter?.call(node, value);
    node.dispatchEvent(new window.Event("input", { bubbles: true }));
  });
}

// ── 共用桩：假宿主（记录它收到的 props 与挂载次数）──────────────────────────

const previewHostStub = dataModule(`
  export function registerGamePreviewHost() {}
  export function useGamePreviewHost() { return globalThis.__host || null; }
`);
function FakeHost(props) {
  const log = (globalThis.__hostRenders ||= []);
  log.push({
    artifactId: props.artifactId,
    revisionId: props.revisionId,
    source: props.source,
    reloadKey: props.reloadKey ?? 0,
    envelopeUrl: props.envelopeUrl,
  });
  React.useEffect(() => {
    globalThis.__hostMounts = (globalThis.__hostMounts || 0) + 1;
  }, []);
  return React.createElement("div", {
    "data-testid": "fake-host",
    "data-artifact": props.artifactId,
    "data-revision": props.revisionId,
    "data-source": props.source === undefined ? "" : "draft",
    "data-reload": String(props.reloadKey ?? 0),
  });
}
const uiStub = dataModule(`export function useUI() { return (v, vars) => v; }`);
const lastRender = () => globalThis.__hostRenders.at(-1);

function resetGlobals() {
  globalThis.__host = FakeHost;
  globalThis.__hostRenders = [];
  globalThis.__hostMounts = 0;
  globalThis.__forks = [];
  globalThis.__commits = [];
  globalThis.__recorded = [];
  globalThis.__flush = null;
}

// ── 1. GamePlayDetail ───────────────────────────────────────────────────────

const slot = await import(
  await compileModule("src/shell/material-detail-slot.tsx", {
    react: reactUrl,
    "../i18n/ui/useUI": uiStub,
    "./game-editor/preview-host": previewHostStub,
    "./artifact-client": dataModule(
      `export async function getCurrentArtifactItem() { return { ok: false }; }`,
    ),
  })
);

test("有宿主：先看封面，点开始游玩后宿主挂在原地，拿到当前 artifact / revision", async () => {
  resetGlobals();
  const item = gameItem({ artifactId: "art-play", revisionId: "rev-7" });
  const mounted = await mount(React.createElement(slot.GamePlayDetail, { item }));
  try {
    assert.equal(q(mounted.container, "[data-testid=fake-host]"), null);
    assert.ok(q(mounted.container, "img"), "播放前应显示封面");
    const start = byText(mounted.container, "button", "开始游玩");
    assert.ok(start, "有宿主时「开始游玩」是按钮而不是外链");
    assert.equal(q(mounted.container, "a"), null);
    await click(start);
    const host = q(mounted.container, "[data-testid=fake-host]");
    assert.ok(host, "点开始后宿主要在原地挂上");
    assert.equal(host.getAttribute("data-artifact"), "art-play");
    assert.equal(host.getAttribute("data-revision"), "rev-7");
    assert.equal(lastRender().source, undefined, "详情页播放已保存版，不带草稿");
    assert.ok(byText(mounted.container, "button", "返回"));
    assert.ok(byText(mounted.container, "button", "重新开始"));
    assert.ok(byText(mounted.container, "button", "全屏"));
  } finally {
    await mounted.unmount();
  }
});

test("重新开始让 reloadKey 加一；返回回到封面；全屏被拒时给人话", async () => {
  resetGlobals();
  const mounted = await mount(
    React.createElement(slot.GamePlayDetail, { item: gameItem() }),
  );
  try {
    await click(byText(mounted.container, "button", "开始游玩"));
    assert.equal(lastRender().reloadKey, 0);
    await click(byText(mounted.container, "button", "重新开始"));
    assert.equal(lastRender().reloadKey, 1);
    assert.equal(
      q(mounted.container, "[data-testid=fake-host]").getAttribute("data-reload"),
      "1",
    );
    const play = q(mounted.container, "[data-game-play-container]");
    play.requestFullscreen = () => Promise.reject(new Error("denied"));
    await click(byText(mounted.container, "button", "全屏"));
    await settle();
    assert.match(
      q(mounted.container, "[role=alert]").textContent,
      /无法进入全屏/,
    );
    await click(byText(mounted.container, "button", "返回"));
    assert.equal(q(mounted.container, "[data-testid=fake-host]"), null);
    assert.ok(byText(mounted.container, "button", "开始游玩"));
  } finally {
    await mounted.unmount();
  }
});

test("没有注册宿主（其余站点）：保持老行为，开始游玩是 /play 链接", async () => {
  resetGlobals();
  globalThis.__host = null;
  const mounted = await mount(
    React.createElement(slot.GamePlayDetail, {
      item: gameItem({ artifactId: "art-x", revisionId: "rev-2" }),
    }),
  );
  try {
    const anchor = q(mounted.container, "a");
    assert.ok(anchor);
    assert.equal(anchor.textContent, "开始游玩");
    assert.equal(
      anchor.getAttribute("href"),
      "/play/artifact/art-x?revision=rev-2",
    );
    assert.equal(byText(mounted.container, "button", "开始游玩"), undefined);
  } finally {
    await mounted.unmount();
  }
});

// ── 2. 编辑权限（纯函数）──────────────────────────────────────────────────

test("编辑权限：自己的作品直接改；别人的先 fork；只读明说", async () => {
  assert.equal(gameEditAccess(gameItem()), "own");
  assert.equal(gameEditAccess(gameItem({ canEdit: false })), "fork");
  assert.equal(
    gameEditAccess(gameItem({ canEdit: false, canFork: false })),
    "view-only",
  );
  const forks = [];
  const mine = gameItem({ artifactId: "copy" });
  const forked = await ensureOwnGameCopy(
    gameItem({ canEdit: false }),
    async (item) => {
      forks.push(item.artifactId);
      return { ok: true, data: mine };
    },
  );
  assert.deepEqual(forks, ["art-own"]);
  assert.equal(forked.ok && forked.item.artifactId, "copy");
  assert.equal(forked.ok && forked.forked, true);
  const same = await ensureOwnGameCopy(gameItem(), async () => {
    throw new Error("自己的作品不该 fork");
  });
  assert.equal(same.ok && same.forked, false);
  const denied = await ensureOwnGameCopy(
    gameItem({ canEdit: false, canFork: false }),
    async () => {
      throw new Error("只读条目不该 fork");
    },
  );
  assert.equal(denied.ok, false);
  assert.match(denied.error, /只开放了试玩/);
});

// ── 3. Code 页 ──────────────────────────────────────────────────────────────

const shellStub = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    globalThis.__flush = adapter.persistence && adapter.persistence.flush;
    globalThis.__persistence = adapter.persistence || null;
    return jsxs("div", { children: [
      adapter.toolbox && adapter.toolbox.content ? adapter.toolbox.content : null,
      adapter.stage || null,
      jsx("p", { "data-testid": "status", children: adapter.status || "" }),
    ] });
  }
`);
const sessionStub = dataModule(`
  export function advancedSavedItem(item) { return item; }
  export async function commitAdvancedSavedRevision(base, input) {
    globalThis.__commits.push({
      artifactId: base.artifactId,
      revisionId: base.revisionId,
      previous: input.commit.provenance.previousRevisionId,
    });
    const next = "rev-" + (globalThis.__commits.length + 1);
    const art = { ...base.artifact, revisionId: next };
    return { ...base, key: "artifact:" + base.artifactId + ":" + next, revisionId: next, artifact: art };
  }
`);
const artifactClientStub = dataModule(`
  export async function createArtifactRevision() { throw new Error("unused"); }
  export async function forkArtifact(item) {
    globalThis.__forks.push(item.artifactId);
    return globalThis.__forkResult ? globalThis.__forkResult(item) : { ok: false, error: "no" };
  }
`);
const dbStub = dataModule(`
  let n = 0;
  export async function uploadFile() {
    n += 1;
    return { ok: true, data: { file: { url: "https://cdn.test/up/" + n, meta: { sha256: "h" + n } } } };
  }
`);
const pluginStub = dataModule(`export function usePluginCommandSurface() {}`);
const inboxStub = dataModule(`
  export function rememberEditorChips() { return true; }
  export function publishAgentSelection() { return null; }
`);

const stage = await import(
  await compileModule("src/shell/game-editor/GameCodeStage.tsx", {
    "../AdvancedWorkbenchShell": shellStub,
    "../advanced-session": sessionStub,
    "../artifact-client": artifactClientStub,
    "../../lib/database": dbStub,
    "../plugin-command": pluginStub,
    "../agent-review": inboxStub,
    "../../i18n/ui/useUI": uiStub,
    "./preview-host": previewHostStub,
  })
);

function mountStage(item) {
  return mount(React.createElement(stage.GameCodeStage, { item, onClose() {} }));
}

test("Code 页：运行才换草稿快照，按键不换也不重挂宿主", async () => {
  resetGlobals();
  const mounted = await mountStage(gameItem({ artifactId: "art-code" }));
  try {
    await settle();
    const editor = q(mounted.container, "[data-testid=game-code-editor]");
    assert.ok(editor);
    assert.equal(editor.value, DOC_V1);
    assert.equal(lastRender().source, undefined, "未改动：宿主播放已保存的一版");
    const mountsBefore = globalThis.__hostMounts;
    const edited = DOC_V1.replace("GAME=1", "GAME=2");
    await type(editor, window.HTMLTextAreaElement.prototype, edited);
    await type(editor, window.HTMLTextAreaElement.prototype, edited + "<!-- a -->");
    assert.equal(lastRender().source, undefined, "按键期间快照不变");
    assert.equal(globalThis.__hostMounts, mountsBefore, "按键不重挂宿主");
    await click(q(mounted.container, "[data-testid=game-run]"));
    assert.equal(lastRender().source, edited + "<!-- a -->", "运行后宿主拿到草稿快照");
    assert.equal(lastRender().revisionId, "rev-1");
    const snapshot = lastRender().source;
    await type(editor, window.HTMLTextAreaElement.prototype, snapshot + "<!-- b -->");
    assert.equal(lastRender().source, snapshot, "运行之后继续打字，快照仍不变");
    await click(q(mounted.container, "[data-testid=game-reload]"));
    assert.equal(lastRender().source, snapshot + "<!-- b -->");
  } finally {
    await mounted.unmount();
  }
});

test("Code 页保存：用 currentItem 的身份提交，revision 前进，随后播放已保存版", async () => {
  resetGlobals();
  const mounted = await mountStage(gameItem({ artifactId: "art-save" }));
  try {
    await settle();
    const editor = q(mounted.container, "[data-testid=game-code-editor]");
    await type(editor, window.HTMLTextAreaElement.prototype, DOC_V1 + "<!-- 1 -->");
    await click(q(mounted.container, "[data-testid=game-run]"));
    assert.ok(lastRender().source);
    assert.ok(globalThis.__flush);
    let result;
    await act(async () => {
      result = await globalThis.__flush();
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.equal(globalThis.__commits.length >= 1, true);
    const lastCommit = globalThis.__commits.at(-1);
    assert.equal(lastCommit.artifactId, "art-save");
    assert.equal(lastCommit.revisionId, "rev-1");
    assert.equal(lastRender().source, undefined, "保存后宿主回到已保存的一版");
    assert.equal(lastRender().revisionId, result.item.revisionId);
    assert.notEqual(result.item.revisionId, "rev-1", "revision 前进了");
    // 第二次保存必须以第一次保存出的版本为基线（不是打开时那版）。
    await type(editor, window.HTMLTextAreaElement.prototype, DOC_V1 + "<!-- 2 -->");
    await act(async () => {
      await globalThis.__flush();
    });
    const second = globalThis.__commits.at(-1);
    assert.equal(second.revisionId, result.item.revisionId);
    assert.equal(second.previous, result.item.revisionId);
  } finally {
    await mounted.unmount();
  }
});

test("Code 页：别人的作品保存前先 fork，之后只在副本上提交", async () => {
  resetGlobals();
  const copy = gameItem({ artifactId: "art-copy", revisionId: "copy-1" });
  globalThis.__forkResult = async () => ({ ok: true, data: copy });
  const mounted = await mountStage(
    gameItem({ artifactId: "art-theirs", canEdit: false }),
  );
  try {
    await settle();
    assert.match(
      q(mounted.container, "[data-testid=game-access-notice]").textContent,
      /二创副本/,
    );
    const editor = q(mounted.container, "[data-testid=game-code-editor]");
    assert.equal(editor.disabled, false, "可 fork 的条目可以直接改");
    await type(editor, window.HTMLTextAreaElement.prototype, DOC_V1 + "<!-- x -->");
    assert.deepEqual(globalThis.__forks, [], "打字本身不 fork");
    let result;
    await act(async () => {
      result = await globalThis.__flush();
    });
    assert.equal(result.ok, true, JSON.stringify(result));
    assert.deepEqual(globalThis.__forks, ["art-theirs"]);
    assert.equal(globalThis.__commits.at(-1).artifactId, "art-copy");
    assert.equal(lastRender().artifactId, "art-copy");
  } finally {
    globalThis.__forkResult = null;
    await mounted.unmount();
  }
});

test("Code 页：只开放试玩的作品明说原因，编辑框不可写，保存被拒且不 fork", async () => {
  resetGlobals();
  const mounted = await mountStage(
    gameItem({ artifactId: "art-ro", canEdit: false, canFork: false }),
  );
  try {
    await settle();
    assert.match(
      q(mounted.container, "[data-testid=game-access-notice]").textContent,
      /只开放了试玩/,
    );
    assert.equal(q(mounted.container, "[data-testid=game-code-editor]").disabled, true);
    assert.ok(q(mounted.container, "[data-testid=fake-host]"), "仍然可以试玩");
    let result;
    await act(async () => {
      result = await globalThis.__flush();
    });
    assert.equal(result.ok, false);
    assert.deepEqual(globalThis.__forks, []);
    assert.deepEqual(globalThis.__commits, []);
  } finally {
    await mounted.unmount();
  }
});

test("Code 页：没有可编辑源码时说清楚，仍可试玩，不泄露开发词", async () => {
  resetGlobals();
  const item = gameItem({ artifactId: "art-nosrc", withSource: false });
  const mounted = await mountStage(item);
  try {
    await settle();
    const text = mounted.container.textContent;
    assert.match(text, /没有可编辑的源码/);
    assert.equal(q(mounted.container, "[data-testid=game-code-editor]").disabled, true);
    assert.ok(q(mounted.container, "[data-testid=fake-host]"), "没有源码也能试玩已保存版");
    assert.doesNotMatch(text, /registerGamePreviewHost|共享包/);
  } finally {
    await mounted.unmount();
  }
});

test("Code 页：没有注册宿主时给用户话，而不是开发者提示", async () => {
  resetGlobals();
  globalThis.__host = null;
  const mounted = await mountStage(gameItem({ artifactId: "art-nohost" }));
  try {
    await settle();
    const text = mounted.container.textContent;
    assert.match(text, /当前站点暂不支持试玩，请在 OceanLeo 主站打开/);
    // A JSX text node like `tt("…")` without braces still contains the copy;
    // the call itself must never reach the screen.
    assert.doesNotMatch(text, /tt\(/);
    assert.doesNotMatch(text, /registerGamePreviewHost|共享包|iframe/);
  } finally {
    await mounted.unmount();
  }
});

// ── 4. Edit 页（GameRoute legacy）──────────────────────────────────────────

const nextStageStub = dataModule(`
  export function GameCodeStage() { return null; }
`);
const dynamicStub = dataModule(`
  export default function dynamic() { return function Lazy() { return null; }; }
`);
const sessionContextStub = dataModule(`
  export function useAdvancedSession() {
    return {
      async recordSavedItem(item) { globalThis.__recorded.push(item.revisionId); return true; },
    };
  }
`);

const route = await import(
  await compileModule("src/shell/advanced-routes/GameRoute.tsx", {
    "next/dynamic": dynamicStub,
    "../game-editor/GameCodeStage": nextStageStub,
    "../game-editor/preview-host": previewHostStub,
    "../AdvancedWorkbenchShell": shellStub,
    "../advanced-session": sessionStub,
    "../advanced-session-context": sessionContextStub,
    "../artifact-client": artifactClientStub,
    "../../i18n/ui/useUI": uiStub,
  })
);

function projectionOf(item, revisionId) {
  return { ...item.artifact, revisionId };
}

function mountRoute(item) {
  return mount(React.createElement(route.GameRoute, { item, onClose() {} }));
}

test("W15 reopen only resumes an explicitly job-aware runner and aborts polling on unmount", async () => {
  resetGlobals();
  const item = gameItem({ artifactId: "art-resume" });
  const calls = [];
  const runner = async (request) => { calls.push(request); return { ok: false, idle: true, error: "" }; };
  runner.supportsResume = true;
  route.registerGameIterationRunner(runner);
  const mounted = await mountRoute(item);
  await settle();
  assert.equal(calls.length, 1);
  assert.equal(calls[0].resume, true);
  assert.equal(calls[0].prompt, "");
  assert.equal(globalThis.__forks.length, 0);
  assert.equal(globalThis.__commits.length, 0);
  assert.equal(calls[0].signal.aborted, false);
  await mounted.unmount();
  assert.equal(calls[0].signal.aborted, true);
  route.registerGameIterationRunner(null);
});

async function iterateOnce(container, prompt) {
  await type(q(container, "#game-prompt"), window.HTMLTextAreaElement.prototype, prompt);
  await click(byText(container, "button", "迭代这一版"));
  await settle(40);
}

test("Edit 页迭代：采纳返回的 artifact，宿主换到新 revision，不二次保存；下一轮用新 revision", async () => {
  resetGlobals();
  const item = gameItem({ artifactId: "art-iter" });
  const calls = [];
  route.registerGameIterationRunner(async (request) => {
    calls.push(request);
    const next = `rev-${calls.length + 1}`;
    return {
      ok: true,
      document: {
        envelopeUrl: `https://cdn.test/art-iter/${next}/full.json`,
        envelopeDigest: `dig-${next}`,
        bundleFormat: "html",
        coverUrl: "https://cdn.test/art-iter/cover.png",
        coverDigest: "d-cover",
        manifestUrl: "https://cdn.test/art-iter/m.json",
        manifestDigest: "d-m",
        engineApiVersion: "1",
        skeletonVersion: "1",
        prompt: request.prompt,
        origin: "ai",
      },
      artifact: projectionOf(item, next),
    };
  });
  const mounted = await mountRoute(item);
  try {
    await settle();
    assert.equal(lastRender().revisionId, "rev-1");
    await iterateOnce(mounted.container, "加入二段跳");
    assert.equal(calls.length, 1, mounted.container.textContent);
    assert.equal(calls[0].revisionId, "rev-1");
    assert.equal(lastRender().revisionId, "rev-2", "宿主播放新保存的 revision " + q(mounted.container, "[data-testid=status]").textContent);
    assert.deepEqual(globalThis.__recorded, ["rev-2"], "采纳后记录一次已保存条目");
    assert.deepEqual(globalThis.__commits, [], "没有第二次保存");
    assert.match(mounted.container.textContent || "", /生成并保存|试玩/);
    await iterateOnce(mounted.container, "再加一个敌人");
    assert.equal(calls.length, 2);
    assert.equal(calls[1].revisionId, "rev-2", "下一轮以新 revision 为基线");
    assert.equal(lastRender().revisionId, "rev-3");
  } finally {
    await mounted.unmount();
  }
});

test("Edit 页迭代：别人的作品先 fork，迭代发生在副本上", async () => {
  resetGlobals();
  const theirs = gameItem({ artifactId: "art-theirs2", canEdit: false });
  const copy = gameItem({ artifactId: "art-copy2", revisionId: "c-1" });
  globalThis.__forkResult = async () => ({ ok: true, data: copy });
  const calls = [];
  route.registerGameIterationRunner(async (request) => {
    calls.push(request);
    return {
      ok: true,
      document: {
        envelopeUrl: "https://cdn.test/art-copy2/c-2/full.json",
        envelopeDigest: "dig-c2",
        bundleFormat: "html",
        coverUrl: "https://cdn.test/art-copy2/cover.png",
        coverDigest: "d-cover",
        manifestUrl: "https://cdn.test/art-copy2/m.json",
        manifestDigest: "d-m",
        engineApiVersion: "1",
        skeletonVersion: "1",
        prompt: request.prompt,
        origin: "ai",
      },
      artifact: projectionOf(copy, "c-2"),
    };
  });
  const mounted = await mountRoute(theirs);
  try {
    await settle();
    await iterateOnce(mounted.container, "换成夜晚主题");
    assert.deepEqual(globalThis.__forks, ["art-theirs2"], mounted.container.textContent);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].artifactId, "art-copy2");
    assert.equal(calls[0].revisionId, "c-1");
    assert.deepEqual(globalThis.__recorded, ["c-1", "c-2"]);
  } finally {
    globalThis.__forkResult = null;
    await mounted.unmount();
  }
});

test("Edit 页：只开放试玩的作品不能迭代，并说明原因", async () => {
  resetGlobals();
  route.registerGameIterationRunner(async () => {
    throw new Error("只读条目不该跑生成");
  });
  const mounted = await mountRoute(
    gameItem({ artifactId: "art-ro2", canEdit: false, canFork: false }),
  );
  try {
    await settle();
    const button = byText(mounted.container, "button", "迭代这一版");
    assert.equal(button.disabled, true);
    assert.match(mounted.container.textContent || "", /只开放了试玩/);
    assert.deepEqual(globalThis.__forks, []);
  } finally {
    await mounted.unmount();
  }
});

test("Edit 页：没有注册宿主时给用户话，不出现开发者提示", async () => {
  resetGlobals();
  globalThis.__host = null;
  const mounted = await mountRoute(gameItem({ artifactId: "art-nohost2" }));
  try {
    await settle();
    const text = mounted.container.textContent || "";
    assert.match(text, /当前站点暂不支持试玩，请在 OceanLeo 主站打开/);
    // A JSX text node like `tt("…")` without braces still contains the copy;
    // the call itself must never reach the screen.
    assert.doesNotMatch(text, /tt\(/);
    assert.doesNotMatch(text, /registerGamePreviewHost|共享包|iframe/);
  } finally {
    await mounted.unmount();
  }
});

// ── W15 2026-10-23：结果提示可见；回到旧版本 = 未保存，保存把它写成新 revision ──────────

function iterationDocument(item, next, prompt) {
  return {
    envelopeUrl: `https://cdn.test/${item.artifactId}/${next}/full.json`,
    envelopeDigest: `dig-${next}`,
    bundleFormat: "html",
    coverUrl: `https://cdn.test/${item.artifactId}/cover.png`,
    coverDigest: "d-cover",
    manifestUrl: `https://cdn.test/${item.artifactId}/m.json`,
    manifestDigest: "d-m",
    engineApiVersion: "1",
    skeletonVersion: "1",
    prompt,
    origin: "ai",
  };
}

test("W15 Edit 页：迭代成功的提示显示在玩法抽屉里（以前只进 adapter.status，看不见）", async () => {
  resetGlobals();
  const item = gameItem({ artifactId: "art-w15-ok" });
  route.registerGameIterationRunner(async (request) => ({
    ok: true,
    document: iterationDocument(item, "rev-2", request.prompt),
    artifact: projectionOf(item, "rev-2"),
  }));
  const mounted = await mountRoute(item);
  try {
    await settle();
    await iterateOnce(mounted.container, "加一个敌人");
    const notice = q(mounted.container, "[data-testid=game-play-panel] [data-testid=game-play-notice]");
    assert.ok(notice, "抽屉里要有结果提示");
    assert.match(notice.textContent, /已生成并保存/);
    assert.equal(globalThis.__persistence.dirty, false, "服务器已确认的新版本不是未保存");
  } finally {
    await mounted.unmount();
  }
});

test("W15 Edit 页：迭代失败的原因显示在抽屉里（role=alert），游戏保持上一版", async () => {
  resetGlobals();
  const item = gameItem({ artifactId: "art-w15-fail" });
  route.registerGameIterationRunner(async () => ({ ok: false, error: "生成请求需要人工复审" }));
  const mounted = await mountRoute(item);
  try {
    await settle();
    await iterateOnce(mounted.container, "加一个敌人");
    const alert = q(mounted.container, "[data-testid=game-play-panel] [role=alert]");
    assert.ok(alert, "失败要在抽屉里说出来");
    assert.match(alert.textContent, /人工复审/);
    assert.equal(lastRender().revisionId, "rev-1");
  } finally {
    await mounted.unmount();
  }
});

test("W15 Edit 页：点回 v1 = 未保存；保存把 v1 写成新 revision，之后回到已保存", async () => {
  resetGlobals();
  const item = gameItem({ artifactId: "art-w15-pick" });
  route.registerGameIterationRunner(async (request) => ({
    ok: true,
    document: iterationDocument(item, "rev-2", request.prompt),
    artifact: projectionOf(item, "rev-2"),
  }));
  const mounted = await mountRoute(item);
  try {
    await settle();
    await iterateOnce(mounted.container, "加一个敌人");
    assert.equal(globalThis.__persistence.dirty, false);
    const v1 = byText(mounted.container, "button", "v1 ·");
    await click(v1);
    await settle();
    assert.equal(globalThis.__persistence.dirty, true, "显示的版本不是服务器上那一版，必须是未保存");
    const saved = await act(async () => globalThis.__flush());
    assert.equal(saved.ok, true, JSON.stringify(saved));
    assert.equal(globalThis.__commits.length, 1, "保存一次 = 一个新 revision");
    await settle();
    assert.equal(globalThis.__persistence.dirty, false, "保存确认后回到已保存");
  } finally {
    await mounted.unmount();
  }
});
