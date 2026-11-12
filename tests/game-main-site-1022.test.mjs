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

// Retired single-document editing is covered by game-project-render.test.mjs.
