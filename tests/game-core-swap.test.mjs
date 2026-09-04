// 游戏换核接线闸（W14 · editor-core-swap）。
//
// 源码正则是辅闸。A-48：产品被破坏成用户可感知的样子时闸必须红。
// jsdom 没有 layout，可见性只钉 hidden / aria-hidden / 内联 style / 藏起 class。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import {
  DEFAULT_EDITOR_CORE,
  setEditorCoreOverride,
} from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
import {
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
} from "../src/shell/editor-sandbox-origin.ts";
import {
  GAME_NEXT_DEFAULT_MODE,
  applyGameNextMode,
} from "../src/shell/game-editor/game-next-mode.ts";
import {
  planGamePreviewControl,
  isGamePreviewRunning,
  GAME_PREVIEW_INITIAL,
} from "../src/shell/game-editor/game-preview-controls.ts";
import {
  GAME_IDE_HOSTED_EMBED_ORIGIN,
  gameIdeHostedEmbedBase,
  canBuildGameIdeEmbedUrl,
  buildGameIdeEmbedUrl,
  computeGameIdeHostedEmbedSrc,
} from "../src/shell/game-editor/game-microstudio-embed.ts";
import {
  CC0_ART_SOURCES,
  cc0ArtSourcesAreValid,
  renderCc0ArtSourceLines,
} from "../src/shell/game-editor/cc0-art-sources.ts";
import {
  GAME_AGENT_CHIPS,
  gameAgentChipsAreValid,
  gameReskinChip,
  gameToolsManifestChips,
} from "../src/shell/game-editor/l4-chips.ts";
import {
  GAME_APPLY_TOKEN_KEY,
  gameMutatingAgentCommandIds,
  planGameAgentDisposition,
  peekGameApplyToken,
  resetGameApplyTokens,
  runGameAgentCommand,
} from "../src/shell/game-editor/game-agent-gate.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import { resetAgentReviewInbox } from "../src/shell/agent-review/inbox.ts";
import { registerGamePreviewHost } from "../src/shell/game-editor/preview-host.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/GameRoute.tsx");
const leaf = read("src/shell/game-editor/GameCodeStage.tsx");
const frame = read("src/shell/game-editor/GameHostedFrame.tsx");
const gate = read("src/shell/game-editor/game-agent-gate.ts");
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

const MINIMAL_HTML =
  "<!doctype html><html><body><script>void 0</script></body></html>";
const NEXT_HTML =
  "<!doctype html><html><body><script>window.GAME=1</script></body></html>";

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("game"\) === "next"\)/);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/game-editor\/GameCodeStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<GameCodeStage \{\.\.\.props\} \/>/);
  assert.match(route, /function GameLegacyRoute/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.doesNotMatch(routeCode, /<iframe/i);
  assert.doesNotMatch(routeCode, /srcdoc/i);
});

test("professional mode uses applyGameNextMode and only then shows microStudio", () => {
  assert.equal(GAME_NEXT_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(leaf, /applyGameNextMode/);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(leaf, /mode: \{ current: mode, setMode: applyMode \}/);
  const normal = applyGameNextMode("oceanleo-game-next", "normal");
  assert.equal(normal.mode, "normal");
  assert.equal(normal.message.type, "set-mode");
  assert.equal(normal.showHostedEditor, false);
  const pro = applyGameNextMode("oceanleo-game-next", "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.showHostedEditor, true);
  assert.equal(pro.message.mode, "pro");
});

test("microStudio iframe is untrusted: no allow-same-origin, exact targetOrigin", () => {
  assert.equal(
    embedEditorFrameSandbox("https://game-ide.oceanleo.app"),
    UNTRUSTED_FRAME_SANDBOX,
  );
  assert.equal(UNTRUSTED_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.match(frame, /embedEditorFrameSandbox/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.match(frame, /postMessage\(checked, GAME_IDE_HOSTED_EMBED_ORIGIN\)/);
  assert.doesNotMatch(frame, /postMessage\([^,]+,\s*"\*"\)/);
  const frameCode = frame
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");
  assert.doesNotMatch(frameCode, /allow-same-origin/);
  assert.equal(GAME_IDE_HOSTED_EMBED_ORIGIN, "https://game-ide.oceanleo.app");
  assert.equal(gameIdeHostedEmbedBase(), GAME_IDE_HOSTED_EMBED_ORIGIN);
  assert.equal(canBuildGameIdeEmbedUrl(GAME_IDE_HOSTED_EMBED_ORIGIN), true);
  const src = computeGameIdeHostedEmbedSrc({
    embedBase: GAME_IDE_HOSTED_EMBED_ORIGIN,
    instanceId: "gm-gate",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "闸",
  });
  assert.equal(new URL(src).origin, GAME_IDE_HOSTED_EMBED_ORIGIN);
  assert.equal(canBuildGameIdeEmbedUrl("https://evil.example"), false);
  const fallback = buildGameIdeEmbedUrl({
    instanceId: "gm-1",
    hostOrigin: "https://oceanleo.com",
    base: "https://evil.example",
  });
  assert.equal(new URL(fallback).origin, GAME_IDE_HOSTED_EMBED_ORIGIN);
});

test("the eight game chips include CC0 reskin sources and pass the contract", () => {
  assert.equal(gameAgentChipsAreValid(), true);
  assert.equal(cc0ArtSourcesAreValid(), true);
  const fields = gameToolsManifestChips();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(fields.chips.length, 8);
  const reskin = gameReskinChip();
  assert.ok(reskin, "「换美术风格」这条 chip 必须存在");
  assert.match(reskin.prompt, /kenney\.nl/i);
  assert.match(reskin.prompt, /opengameart\.org/);
  assert.match(reskin.prompt, /只取标着 CC0/);
  const lines = renderCc0ArtSourceLines(CC0_ART_SOURCES).join("\n");
  assert.match(lines, /Kenney/);
  assert.match(leaf, /rememberEditorChips\("game"/);
  assert.match(leaf, /createGameAgentSurface/);
  assert.equal(GAME_AGENT_CHIPS.some((chip) => chip.id === "game.chip.reskin"), true);
});

test("agent writes default to review; only an explicit token applies", async () => {
  resetGameApplyTokens();
  resetAgentReviewInbox();
  const writes = [];
  const port = {
    source: () => MINIMAL_HTML,
    revision: () => 1,
    writeSource(next) {
      writes.push(next);
    },
    params: () => null,
  };
  const mutating = gameMutatingAgentCommandIds();
  assert.ok(mutating.includes("game.set-source"));
  assert.equal(
    planGameAgentDisposition({
      commandId: "game.set-source",
      mutates: true,
      tokenMatches: false,
      known: true,
    }).kind,
    "review",
  );
  assert.equal(
    planGameAgentDisposition({
      commandId: "game.set-source",
      mutates: true,
      tokenMatches: true,
      known: true,
    }).kind,
    "apply",
  );
  const parked = await runGameAgentCommand(port, "game.set-source", {
    source: NEXT_HTML,
  });
  assert.equal(writes.length, 0, "没令牌时源码一个字都不能写");
  assert.match(String(parked.message), /审阅/);
  const held = hostReviewSession.snapshot().parked;
  assert.ok(held, "提案必须真的交进审阅收件箱");
  assert.equal(typeof held.params[GAME_APPLY_TOKEN_KEY], "string");
  assert.equal(
    peekGameApplyToken("game.set-source", held.params),
    true,
  );
  const applied = await runGameAgentCommand(
    port,
    "game.set-source",
    held.params,
  );
  assert.equal(applied.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0], NEXT_HTML);
  assert.match(gate, /planGameAgentDisposition/);
  assert.match(gate, /route\.kind !== "review"/);
});

test("run/stop/reload are decided by a pure function, not an if in the button", () => {
  const stopped = planGamePreviewControl(GAME_PREVIEW_INITIAL, "stop");
  assert.equal(stopped.paused, true);
  assert.equal(isGamePreviewRunning(stopped), false);
  const running = planGamePreviewControl(stopped, "run");
  assert.equal(running.paused, false);
  assert.equal(running.reloadKey, GAME_PREVIEW_INITIAL.reloadKey);
  const reloaded = planGamePreviewControl(running, "reload");
  assert.equal(reloaded.paused, false);
  assert.equal(reloaded.reloadKey, GAME_PREVIEW_INITIAL.reloadKey + 1);
  assert.match(leaf, /planGamePreviewControl/);
  assert.match(leaf, /data-testid="game-run"/);
  assert.match(leaf, /data-testid="game-stop"/);
  assert.match(leaf, /data-testid="game-reload"/);
  assert.match(leaf, /data-testid="game-code-editor"/);
});

test("next-core sources do not embed a DashScope key", () => {
  for (const text of [leaf, frame, route, gate]) {
    assert.doesNotMatch(text, /sk-[a-zA-Z0-9]{8,}/);
    assert.doesNotMatch(text, /PLATFORM_DASHSCOPE_KEY\s*=\s*['"]/);
  }
});

// ── A-48 行为闸：jsdom 真挂叶子，看节点 ─────────────────────────────────
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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const GAME_ORIGIN = "https://game-ide.oceanleo.app";
const HOST_PAGE = "https://oceanleo.com/workspace";
const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: HOST_PAGE,
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLIFrameElement: window.HTMLIFrameElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
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
globalThis.fetch = async () => {
  throw new Error("游戏接线闸首屏不该发网络请求");
};

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "game-next-shell",
      children: [
        adapter && adapter.mode
          ? jsx("button", {
              type: "button",
              "data-testid": "game-set-pro",
              onClick: () => adapter.mode.setMode("pro"),
              children: "专业模式",
            })
          : null,
        adapter && adapter.toolbox && adapter.toolbox.content
          ? adapter.toolbox.content
          : null,
        adapter && adapter.stage ? adapter.stage : null,
      ],
    });
  }
`);
const sessionStubUrl = dataModule(`
  export function advancedSavedItem(item) { return item; }
  export async function commitAdvancedSavedRevision() {
    throw new Error("叶子闸不该去提交 revision");
  }
`);
const artifactStubUrl = dataModule(`
  export async function createArtifactRevision() {
    throw new Error("叶子闸不该去创建 revision");
  }
  export async function forkArtifact() { return { ok: false }; }
`);
const dbStubUrl = dataModule(`
  export async function uploadFile() { return { ok: false, error: "no" }; }
`);
const pluginStubUrl = dataModule(`
  export function usePluginCommandSurface() {}
`);
const inboxStubUrl = dataModule(`
  export function rememberEditorChips() { return true; }
  export function publishAgentSelection() { return null; }
`);
const nextStageMarkerUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function GameCodeStage(props) {
    if (!props || !props.item) {
      return jsx("div", { "data-testid": "game-next-missing-item" });
    }
    return jsx("div", {
      "data-testid": "game-next-stage-loaded",
      "data-item-id": String(props.item.id || ""),
    });
  }
`);
const dynamicStubUrl = dataModule(`
  import { createElement, useEffect, useState } from ${JSON.stringify(reactUrl)};
  export default function dynamic(loader) {
    let resolved = null;
    let err = null;
    const pending = Promise.resolve(typeof loader === "function" ? loader() : loader)
      .then((mod) => {
        resolved = typeof mod === "function" ? mod : mod && (mod.default || mod);
        return resolved;
      })
      .catch((error) => {
        err = error;
      });
    return function DynamicLoaded(props) {
      const [, bump] = useState(0);
      useEffect(() => {
        pending.then(() => bump((n) => n + 1));
      }, []);
      if (err) throw err;
      return resolved ? createElement(resolved, props) : null;
    };
  }
`);
const previewHostForRouteUrl = dataModule(`
  export function registerGamePreviewHost() {}
  export function useGamePreviewHost() { return null; }
`);

const leafStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../advanced-session": sessionStubUrl,
  "../artifact-client": artifactStubUrl,
  "../../lib/database": dbStubUrl,
  "../plugin-command": pluginStubUrl,
  "../agent-review": inboxStubUrl,
};

const routeStubs = {
  "next/dynamic": dynamicStubUrl,
  "../game-editor/GameCodeStage": nextStageMarkerUrl,
  "../game-editor/preview-host": previewHostForRouteUrl,
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../plugin-command": pluginStubUrl,
  "../artifact-client": artifactStubUrl,
  "../advanced-session": sessionStubUrl,
};

function gameItem() {
  return {
    key: "gm-gate",
    source: "artifact",
    id: "gm-gate",
    title: "闸",
    kind: "game",
    siteId: "game",
    favorite: false,
    artifactId: "art-1",
    revisionId: "rev-1",
    url: "https://cdn.example/envelope.json",
    meta: { game_source: MINIMAL_HTML, advanced_editor_route: "game" },
  };
}

function concealmentReason(node) {
  let current = node;
  while (current && current.nodeType === 1) {
    if (current.hidden === true || current.hasAttribute("hidden")) return "hidden";
    if (current.getAttribute("aria-hidden") === "true") return "aria-hidden";
    const style = String(current.getAttribute("style") || "");
    if (/display\s*:\s*none/i.test(style)) return "display:none";
    const cls = String(current.getAttribute("class") || "");
    if (/(?:^|\s)(?:hidden|invisible|sr-only)(?:\s|$)/.test(cls)) {
      return `class ${cls}`;
    }
    if (/(?:^|\s)h-0(?:\s|$)/.test(cls) && /(?:^|\s)w-0(?:\s|$)/.test(cls)) {
      return "h-0 w-0";
    }
    current = current.parentElement;
  }
  return null;
}

function assertLiveGameIframe(iframe) {
  assert.ok(iframe, "专业模式挂起来之后没有 iframe 节点，用户看不到 microStudio");
  assert.equal(iframe.tagName, "IFRAME", "画布节点不是 iframe（标签被换成别的了）");
  const src = iframe.getAttribute("src") || "";
  assert.ok(src, "iframe 的 src 是空的，用户看见的是无法构造嵌入地址");
  assert.equal(
    new URL(src).origin,
    GAME_ORIGIN,
    `iframe src origin 不是 game-ide 托管域：${src}`,
  );
  const expectedSandbox = embedEditorFrameSandbox(GAME_ORIGIN);
  assert.equal(
    iframe.getAttribute("sandbox"),
    expectedSandbox,
    "sandbox 没有走 embedEditorFrameSandbox()",
  );
  assert.equal(expectedSandbox.includes("allow-same-origin"), false);
  const hidden = concealmentReason(iframe);
  assert.equal(
    hidden,
    null,
    `iframe 还在 DOM 里，但祖先带了藏起标记 ${hidden}。jsdom 没有 layout，这条钉的是 class / hidden / aria-hidden / 内联 style，不是在假装量了可见像素。`,
  );
}

async function mountCompiled(entry, stubs, element) {
  const url = await compileModule(entry, stubs);
  const mod = await import(url);
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element(mod));
  });
  await act(async () => {});
  return {
    container,
    mod,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function TestPreviewHost(props) {
  return React.createElement("iframe", {
    "data-testid": "game-preview-frame",
    "data-paused": String(props.paused === true),
    "data-reload-key": String(props.reloadKey ?? 0),
    "data-param-speed":
      props.paramValues && props.paramValues.speed != null
        ? String(props.paramValues.speed)
        : "",
    title: props.title || "preview",
    src: "https://s-0123456789abcdef0123456789abcdef.oceanleo.app/play",
    sandbox: "allow-scripts allow-pointer-lock",
    referrerPolicy: "no-referrer",
  });
}

test("jsdom 挂上 GameHostedFrame 后，画布是真 iframe 而不是 fallback", async () => {
  const src = computeGameIdeHostedEmbedSrc({
    embedBase: GAME_ORIGIN,
    instanceId: "gm-gate",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "闸",
  });
  const mounted = await mountCompiled(
    "src/shell/game-editor/GameHostedFrame.tsx",
    {},
    (mod) =>
      React.createElement(mod.GameHostedFrame, {
        instanceId: "gm-gate",
        hostOrigin: "https://oceanleo.com",
        src,
        title: "microStudio",
        onReady() {},
        onExport() {},
        onError() {},
      }),
  );
  try {
    assertLiveGameIframe(mounted.container.querySelector("iframe"));
  } finally {
    await mounted.unmount();
  }
});

test("普通模式有代码编辑器与预览槽；运行/停止/重载改的是预览宿主的真实 props", async () => {
  registerGamePreviewHost(TestPreviewHost);
  const mounted = await mountCompiled(
    "src/shell/game-editor/GameCodeStage.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.GameCodeStage, {
        item: gameItem(),
        onClose() {},
      }),
  );
  try {
    const editor = mounted.container.querySelector("[data-testid=game-code-editor]");
    assert.ok(editor, "普通模式没有代码编辑器，用户改不了游戏");
    assert.equal(editor.tagName, "TEXTAREA");
    assert.equal(concealmentReason(editor), null, "代码编辑器被藏起来了");
    const preview = mounted.container.querySelector("[data-testid=game-preview-frame]");
    assert.ok(preview, "普通模式没有沙箱预览 iframe，用户看不见游戏在跑");
    assert.equal(preview.tagName, "IFRAME");
    assert.equal(concealmentReason(preview), null, "预览 iframe 被藏起来了");
    assert.equal(
      mounted.container.querySelector("[data-testid=game-hosted-frame]"),
      null,
      "普通模式不该挂 microStudio iframe",
    );
    const stop = mounted.container.querySelector("[data-testid=game-stop]");
    const run = mounted.container.querySelector("[data-testid=game-run]");
    const reload = mounted.container.querySelector("[data-testid=game-reload]");
    assert.ok(stop && run && reload, "运行/停止/重载按钮缺了一只");
    await act(async () => {
      stop.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(
      mounted.container
        .querySelector("[data-testid=game-preview-frame]")
        .getAttribute("data-paused"),
      "true",
      "点停止之后预览还在跑（paused 没传到宿主）",
    );
    await act(async () => {
      run.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(
      mounted.container
        .querySelector("[data-testid=game-preview-frame]")
        .getAttribute("data-paused"),
      "false",
      "点运行之后预览没有恢复（按钮空转）",
    );
    const before = Number(
      mounted.container
        .querySelector("[data-testid=game-preview-frame]")
        .getAttribute("data-reload-key"),
    );
    await act(async () => {
      reload.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    const after = Number(
      mounted.container
        .querySelector("[data-testid=game-preview-frame]")
        .getAttribute("data-reload-key"),
    );
    assert.equal(after, before + 1, "点重载之后 reloadKey 没变，iframe 不会重挂");
  } finally {
    registerGamePreviewHost(null);
    await mounted.unmount();
  }
});

test("有参数声明时参数面板真在，拖滑块会改预览宿主的 paramValues", async () => {
  registerGamePreviewHost(TestPreviewHost);
  const item = gameItem();
  item.meta.paramDeclarations = {
    speed: { label: "速度", min: 1, max: 10, step: 1, default: 5 },
    jump: { label: "跳跃", min: 1, max: 10, step: 1, default: 3 },
    gravity: { label: "重力", min: 1, max: 10, step: 1, default: 2 },
  };
  const mounted = await mountCompiled(
    "src/shell/game-editor/GameCodeStage.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.GameCodeStage, {
        item,
        onClose() {},
      }),
  );
  try {
    const panel = mounted.container.querySelector("[data-testid=game-param-panel]");
    assert.ok(panel, "有 3 项参数声明时参数面板没画出来，用户调不了难度");
    assert.equal(
      concealmentReason(panel),
      null,
      "参数面板还在 DOM 里，但被 hidden / aria-hidden / display:none 藏起来了",
    );
    const slider = mounted.container.querySelector("[data-testid=game-param-speed]");
    assert.ok(slider, "速度滑块不在，参数面板是空壳");
    assert.equal(
      concealmentReason(slider),
      null,
      "滑块被藏起来了，用户拖不到",
    );
    const preview = mounted.container.querySelector("[data-testid=game-preview-frame]");
    assert.equal(
      preview.getAttribute("data-param-speed"),
      "5",
      "默认参数没有传到预览宿主，游戏还在用自己的内部滑块",
    );
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(
        window.HTMLInputElement.prototype,
        "value",
      )?.set;
      setter?.call(slider, "8");
      slider.dispatchEvent(new window.Event("input", { bubbles: true }));
      slider.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
    assert.equal(
      mounted.container
        .querySelector("[data-testid=game-preview-frame]")
        .getAttribute("data-param-speed"),
      "8",
      "拖了滑块之后预览宿主没收到新值，参数面板是空转",
    );
  } finally {
    registerGamePreviewHost(null);
    await mounted.unmount();
  }
});

test("专业模式叶子真挂 microStudio iframe，src 由生产函数算出", async () => {
  registerGamePreviewHost(TestPreviewHost);
  const mounted = await mountCompiled(
    "src/shell/game-editor/GameCodeStage.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.GameCodeStage, {
        item: gameItem(),
        onClose() {},
      }),
  );
  try {
    const button = mounted.container.querySelector("[data-testid=game-set-pro]");
    assert.ok(button, "壳桩没有把 adapter.mode.setMode 画成可点的专业模式按钮");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    assertLiveGameIframe(
      mounted.container.querySelector("[data-testid=game-hosted-frame]") ||
        mounted.container.querySelector("iframe[title='microStudio']"),
    );
  } finally {
    registerGamePreviewHost(null);
    await mounted.unmount();
  }
});

test("GameRoute 翻到 next 时，加载函数真的交出叶子并带上 item", async () => {
  setEditorCoreOverride("game", "next");
  try {
    assert.equal(
      (await import("../src/shell/editor-core-flags.ts")).resolveEditorCore("game"),
      "next",
    );
    const mounted = await mountCompiled(
      "src/shell/advanced-routes/GameRoute.tsx",
      routeStubs,
      (mod) =>
        React.createElement(mod.GameRoute, {
          item: gameItem(),
          onClose() {},
        }),
    );
    try {
      for (let i = 0; i < 40; i += 1) {
        if (mounted.container.querySelector("[data-testid=game-next-stage-loaded]")) {
          break;
        }
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      }
      const marker = mounted.container.querySelector(
        "[data-testid=game-next-stage-loaded]",
      );
      assert.ok(
        marker,
        "next 舞台加载函数没有交出 GameCodeStage。保留 if 行再 return null、或 {false && next}、或不传 item，用户翻不到新核。DOM=" +
          mounted.container.innerHTML.slice(0, 500),
      );
      assert.equal(marker.getAttribute("data-item-id"), "gm-gate");
      assert.equal(
        mounted.container.querySelector("[data-testid=game-next-missing-item]"),
        null,
      );
    } finally {
      await mounted.unmount();
    }
  } finally {
    setEditorCoreOverride("game", null);
    assert.equal(
      (await import("../src/shell/editor-core-flags.ts")).resolveEditorCore("game"),
      "legacy",
    );
    assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  }
});
