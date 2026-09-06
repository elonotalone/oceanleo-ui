// 音频换核接线闸（W10 · editor-core-swap）。
//
// 源码正则是辅闸。A-48：专业模式必须真挂 <iframe>，src origin 是
// https://audio.oceanleo.app，sandbox 走 embedEditorFrameSandbox()。
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
import { UNTRUSTED_FRAME_SANDBOX, embedEditorFrameSandbox } from "../src/shell/editor-sandbox-origin.ts";
import {
  AUDIO_NEXT_DEFAULT_MODE,
  applyAudioNextMode,
} from "../src/shell/media-editors/audio-next-mode.ts";
import {
  audioAgentChipsAreValid,
  audioToolsManifestChips,
} from "../src/shell/media-editors/audio-next-l4-chips.ts";
import {
  AUDIO_HOSTED_EMBED_ORIGIN,
  audioHostedEmbedBase,
  canBuildAudioEmbedUrl,
  buildAudioEmbedUrl,
} from "../src/shell/media-editors/audio-hosted-embed.ts";
import {
  AUDIO_PLAYLIST_L1_IDS,
  keepWindowsAfterCut,
  runAudioPlaylistCommand,
} from "../src/shell/media-editors/audio-playlist-engine.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/AudioRoute.tsx");
const leaf = read("src/shell/media-editors/AudioPlaylistStage.tsx");
const frame = read("src/shell/media-editors/AudioHostedFrame.tsx");
const mount = read("src/shell/media-editors/audio-playlist-mount.ts");
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

test("the dual-core flag is resolved once, at the top of the route", () => {
  assert.match(route, /if \(resolveEditorCore\("audio"\) === "next"\)/);
  assert.doesNotMatch(routeCode, /from ["']waveform-playlist["']/);
  assert.doesNotMatch(routeCode, /import\(["']waveform-playlist["']\)/);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/media-editors\/AudioPlaylistStage"\)/,
  );
  assert.match(route, /\{ ssr: false, loading: \(\) => null \}/);
  assert.match(route, /<AudioPlaylistStage \{\.\.\.props\} \/>/);
  assert.match(route, /function AudioLegacyRoute/);
  assert.match(route, /useAudioWorkbench/);
  assert.match(route, /<AudioStage editor=\{editor\} accent=\{accent\} \/>/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
});

test("第二行不报 aux；mode.setMode 交给壳（专业编辑页）", () => {
  assert.match(route, /pages:\s*\{\s*\}/);
  assert.doesNotMatch(route, /aux:\s*\[/);
  assert.match(route, /setMode:\s*setEditorMode/);
});

test("professional mode uses buildSetModeMessage and only then shows AudioMass", () => {
  assert.equal(AUDIO_NEXT_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  assert.match(leaf, /applyAudioNextMode/);
  assert.match(leaf, /useState<EditorMode>\(DEFAULT_EDITOR_MODE\)/);
  assert.match(leaf, /mode: \{ current: mode, setMode: applyMode \}/);
  assert.match(leaf, /postAudioInit/);
  assert.match(leaf, /hostedSessionRef/);
  assert.match(leaf, /base64ToBytes\(payload\.audioBase64\)/);
  assert.match(leaf, /bufferRef\.current = decoded/);
  assert.doesNotMatch(routeCode, /postMessage/);

  const normal = applyAudioNextMode("oceanleo-audio-next", "normal");
  assert.equal(normal.mode, "normal");
  assert.equal(normal.message.type, "set-mode");
  assert.equal(normal.showHostedEditor, false);

  const pro = applyAudioNextMode("oceanleo-audio-next", "pro");
  assert.equal(pro.mode, "pro");
  assert.equal(pro.showHostedEditor, true);
  assert.equal(pro.message.mode, "pro");
});

test("AudioMass iframe is untrusted: no allow-same-origin, exact targetOrigin", () => {
  assert.equal(
    embedEditorFrameSandbox("https://audio.oceanleo.app"),
    UNTRUSTED_FRAME_SANDBOX,
  );
  assert.equal(UNTRUSTED_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.match(frame, /embedEditorFrameSandbox/);
  assert.match(frame, /referrerPolicy="no-referrer"/);
  assert.match(frame, /postMessage\(checked, AUDIO_HOSTED_EMBED_ORIGIN\)/);
  assert.doesNotMatch(frame, /postMessage\([^,]+,\s*"\*"\)/);
  assert.doesNotMatch(frame, /allow-same-origin/);
  assert.equal(AUDIO_HOSTED_EMBED_ORIGIN, "https://audio.oceanleo.app");
  assert.equal(audioHostedEmbedBase(), AUDIO_HOSTED_EMBED_ORIGIN);
  assert.equal(canBuildAudioEmbedUrl(AUDIO_HOSTED_EMBED_ORIGIN), true);
  assert.throws(
    () =>
      buildAudioEmbedUrl({
        instanceId: "aud-1",
        hostOrigin: "https://oceanleo.com",
        extra: { token: "nope" },
      }),
    /凭据/,
  );
});

test("the eight audio chips satisfy the contract validator", () => {
  assert.equal(audioAgentChipsAreValid(), true);
  const fields = audioToolsManifestChips();
  assert.equal(fields.manifestVersion, 2);
  assert.equal(fields.chips.length, 8);
  assert.equal(new Set(fields.chips.map((chip) => chip.id)).size, 8);
  assert.ok(fields.chips.some((chip) => chip.id === "audio.chip.cut-by-text"));
  assert.match(leaf, /audioToolsManifestChips/);
  assert.match(leaf, /buildAudioReviewProposal/);
});

test("L1 ids map onto waveform-playlist events, not a homegrown engine", () => {
  assert.ok(AUDIO_PLAYLIST_L1_IDS.includes("crop"));
  assert.ok(AUDIO_PLAYLIST_L1_IDS.includes("delete"));
  assert.ok(AUDIO_PLAYLIST_L1_IDS.includes("mute"));
  assert.match(mount, /import\("waveform-playlist"\)/);
  const events = [];
  const port = {
    emit(event, ...args) {
      events.push([event, ...args]);
    },
    getDuration: () => 10,
    getCurrentTime: () => 0,
    getTimeSelection: () => ({ start: 1, end: 3 }),
    trackCount: () => 2,
  };
  assert.equal(runAudioPlaylistCommand(port, "crop").event, "trim");
  assert.equal(runAudioPlaylistCommand(port, "fade-in").event, "fadein");
  assert.equal(runAudioPlaylistCommand(port, "mute").event, "mute");
  const cut = runAudioPlaylistCommand(port, "delete", {
    startSeconds: 2,
    endSeconds: 4,
  });
  assert.equal(cut.ok, true);
  assert.equal(cut.action, "delete-range");
  assert.deepEqual(keepWindowsAfterCut(10, 2, 4), [
    { start: 0, end: 2 },
    { start: 4, end: 10 },
  ]);
});

test("next-core sources do not embed a DashScope key", () => {
  for (const text of [leaf, frame, mount, route]) {
    assert.doesNotMatch(text, /sk-[a-zA-Z0-9]{8,}/);
    assert.doesNotMatch(text, /PLATFORM_DASHSCOPE_KEY\s*=\s*['"]/);
  }
});

// ── A-48 行为闸：jsdom 真挂叶子，看节点，不扫 <iframe> 字符串 ─────────────
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

const AUDIO_ORIGIN = "https://audio.oceanleo.app";
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
  throw new Error("音频接线闸首屏不该发网络请求");
};

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    return jsxs("div", {
      "data-role": "audio-next-shell",
      children: [
        adapter && adapter.mode
          ? jsx("button", {
              type: "button",
              "data-testid": "audio-set-pro",
              onClick: () => adapter.mode.setMode("pro"),
              children: "专业模式",
            })
          : null,
        adapter && adapter.stage ? adapter.stage : null,
      ],
    });
  }
`);
const mediaStubUrl = dataModule(`
  export async function fetchMediaBlob() {
    throw new Error("音频叶子闸不该去拉媒体");
  }
`);
const authStubUrl = dataModule(`
  export async function accessToken() { return ""; }
`);
const configStubUrl = dataModule(`
  export const GATEWAY_BASE = "https://api.oceanleo.com";
`);
const dbStubUrl = dataModule(`
  export async function uploadFile() { return { url: "" }; }
`);
const ioStubUrl = dataModule(`
  export async function saveFileToLibrary() { return { ok: false }; }
`);
const pluginStubUrl = dataModule(`
  export function usePluginCommandSurface() {}
`);
const mountStubUrl = dataModule(`
  export async function mountWaveformPlaylist() {
    return {
      emit() {},
      getDuration: () => 0,
      getCurrentTime: () => 0,
      getTimeSelection: () => ({ start: 0, end: 0 }),
      trackCount: () => 0,
    };
  }
`);
const panelStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AudioTranscriptPanel() { return jsx("div", { "data-role": "transcript-stub" }); }
`);
const toolbarStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AudioPlaylistToolbar() { return jsx("div", { "data-role": "toolbar-stub" }); }
`);
const nextStageMarkerUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AudioPlaylistStage(props) {
    if (!props || !props.item) {
      return jsx("div", { "data-testid": "audio-next-missing-item" });
    }
    return jsx("div", {
      "data-testid": "audio-next-stage-loaded",
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
const audioWorkbenchStubUrl = dataModule(`
  import { jsx } from ${JSON.stringify(jsxRuntimeUrl)};
  export function useAudioWorkbench() {
    return { download() {} };
  }
  export function AudioControls() { return null; }
  export function AudioStage() {
    return jsx("div", { "data-testid": "audio-legacy-stage" });
  }
`);
const emptyFnUrl = dataModule(`
  export function createAudioCommandSurface() { return {}; }
  export async function convertMediaBlob() { return new Blob(); }
  export function downloadVisualBlob() {}
  export function withExtension(name) { return name; }
  export function normalizeVisualUploads(files) { return files; }
  export function visualDownloadFormats() { return []; }
  export function visualUploadAccept() { return "*"; }
  export function AudioContextToolbar() { return null; }
  export function useWorkbenchMaterialAdapter() { return null; }
`);

const leafStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../../lib/media-proxy": mediaStubUrl,
  "../../lib/auth/client": authStubUrl,
  "../../lib/auth/config": configStubUrl,
  "../../lib/database": dbStubUrl,
  "../doc-editors/doc-io": ioStubUrl,
  "../plugin-command": pluginStubUrl,
  "./audio-playlist-mount": mountStubUrl,
  "./AudioTranscriptPanel": panelStubUrl,
  "./AudioPlaylistToolbar": toolbarStubUrl,
};

const routeStubs = {
  "next/dynamic": dynamicStubUrl,
  "../media-editors/AudioPlaylistStage": nextStageMarkerUrl,
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../../lib/media-proxy": mediaStubUrl,
  "../plugin-command": pluginStubUrl,
  "../media-editors/AudioWorkbench": audioWorkbenchStubUrl,
  "../media-editors/audio-command-surface": emptyFnUrl,
  "../media-editors/visual-convert-client": emptyFnUrl,
  "../media-editors/visual-import-normalize": emptyFnUrl,
  "../media-editors/visual-formats": emptyFnUrl,
  "../media-editors/AudioContextToolbar": emptyFnUrl,
  "../workbench-material-provider": emptyFnUrl,
};

function audioItem() {
  return {
    key: "aud-gate",
    source: "artifact",
    id: "aud-gate",
    title: "闸",
    kind: "audio",
    siteId: "website",
    favorite: false,
    meta: {},
  };
}

function concealmentReason(node) {
  let current = node;
  while (current && current.nodeType === 1) {
    if (current.hasAttribute("hidden")) return "hidden";
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

function assertLiveAudioIframe(iframe) {
  assert.ok(iframe, "专业模式挂起来之后没有 iframe 节点，用户看不到 AudioMass");
  assert.equal(iframe.tagName, "IFRAME", "画布节点不是 iframe（标签被换成别的了）");
  const src = iframe.getAttribute("src") || "";
  assert.ok(src, "iframe 的 src 是空的，用户看见的是无法构造嵌入地址");
  assert.equal(
    new URL(src).origin,
    AUDIO_ORIGIN,
    `iframe src origin 不是 audio 托管域：${src}`,
  );
  const expectedSandbox = embedEditorFrameSandbox(AUDIO_ORIGIN);
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

test("jsdom 挂上 AudioHostedFrame 后，画布是真 iframe 而不是 fallback", async () => {
  const { buildAudioEmbedUrl } = await import(
    "../src/shell/media-editors/audio-hosted-embed.ts"
  );
  const src = buildAudioEmbedUrl({
    instanceId: "aud-gate",
    hostOrigin: "https://oceanleo.com",
    assetTitle: "闸",
  });
  const mounted = await mountCompiled(
    "src/shell/media-editors/AudioHostedFrame.tsx",
    {},
    (mod) =>
      React.createElement(mod.AudioHostedFrame, {
        instanceId: "aud-gate",
        hostOrigin: "https://oceanleo.com",
        src,
        title: "AudioMass",
        onReady() {},
        onSnapshot() {},
        onError() {},
      }),
  );
  try {
    assertLiveAudioIframe(mounted.container.querySelector("iframe"));
  } finally {
    await mounted.unmount();
  }
});

test("专业模式叶子真挂 AudioMass iframe，src 由生产函数算出", async () => {
  const mounted = await mountCompiled(
    "src/shell/media-editors/AudioPlaylistStage.tsx",
    leafStubs,
    (mod) =>
      React.createElement(mod.AudioPlaylistStage, {
        item: audioItem(),
        onClose() {},
      }),
  );
  try {
    assert.equal(
      mounted.container.querySelector("iframe"),
      null,
      "普通模式不该挂 AudioMass iframe",
    );
    const button = mounted.container.querySelector("[data-testid=audio-set-pro]");
    assert.ok(button, "壳桩没有把 adapter.mode.setMode 交给可点入口，「专业编辑」页切不过去");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    assertLiveAudioIframe(mounted.container.querySelector("iframe"));
  } finally {
    await mounted.unmount();
  }
});

test("AudioRoute 翻到 next 时，加载函数真的交出叶子并带上 item", async () => {
  setEditorCoreOverride("audio", "next");
  try {
    assert.equal(
      (await import("../src/shell/editor-core-flags.ts")).resolveEditorCore("audio"),
      "next",
    );
    const mounted = await mountCompiled(
      "src/shell/advanced-routes/AudioRoute.tsx",
      routeStubs,
      (mod) =>
        React.createElement(mod.AudioRoute, {
          item: audioItem(),
          onClose() {},
        }),
    );
    try {
      for (let i = 0; i < 40; i += 1) {
        if (mounted.container.querySelector("[data-testid=audio-next-stage-loaded]")) {
          break;
        }
        await act(async () => {
          await new Promise((resolve) => setTimeout(resolve, 20));
        });
      }
      const marker = mounted.container.querySelector(
        "[data-testid=audio-next-stage-loaded]",
      );
      assert.ok(
        marker,
        "next 舞台加载函数没有交出 AudioPlaylistStage。保留 if 行再 return null、或 {false && next}、或不传 item，用户翻不到新核。DOM=" +
          mounted.container.innerHTML.slice(0, 500),
      );
      assert.equal(marker.getAttribute("data-item-id"), "aud-gate");
      assert.equal(
        mounted.container.querySelector("[data-testid=audio-next-missing-item]"),
        null,
      );
      assert.equal(
        mounted.container.querySelector("[data-testid=audio-legacy-stage]"),
        null,
      );
    } finally {
      await mounted.unmount();
    }
  } finally {
    setEditorCoreOverride("audio", null);
    assert.equal(
      (await import("../src/shell/editor-core-flags.ts")).resolveEditorCore("audio"),
      "legacy",
    );
    assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  }
});
