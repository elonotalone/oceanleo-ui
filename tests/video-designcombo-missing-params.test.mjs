// W24 A-90 行为闸：L1/L2 缺参数时不许替用户编造输入。
//
// 锁的是用户语义，不是源码里还有没有 0.1/0.8 或「字幕」这两个字（A-48）。
// 点「画面裁切」没框选 → 画面尺寸不变，用户看见「请先框选要保留的区域」。
// 点「加字幕」没正文 → 轨道里没有占位「字幕」。
// 点「关键帧」没表 → 片段上没有空动画。
//
// 辅闸在 facade 文件；本文件挂真 VideoDesigncomboStage，走编辑栏 onCommand。
// 只测 facade 锁不住 Stage 失败后再套默认矩形那条路（V9-red-1）。

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

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
  throw new Error("缺参数闸首屏不该发网络请求");
};

const ADAPTER_KEY = "__W24_VIDEO_ADAPTER";

const shellStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function AdvancedWorkbenchShell({ adapter }) {
    globalThis.${ADAPTER_KEY} = adapter;
    return jsxs("div", {
      "data-role": "video-shell",
      children: [
        adapter && adapter.contextToolbar ? adapter.contextToolbar : null,
        adapter && adapter.stage ? adapter.stage : null,
      ],
    });
  }
`);

const toolbarStubUrl = dataModule(`
  import { jsx, jsxs } from ${JSON.stringify(jsxRuntimeUrl)};
  export function SelectionToolbar({ context, onCommand }) {
    const controls = (context && context.controls) || [];
    return jsxs("div", {
      "data-role": "video-toolbar",
      children: controls.map((control) =>
        jsx(
          "button",
          {
            type: "button",
            "data-control-id": control.id,
            onClick: () =>
              onCommand({
                requestId: "w24-gate",
                selectionId: (context && context.id) || "",
                controlId: control.id,
              }),
          },
          control.id,
        ),
      ),
    });
  }
`);

const engineStubUrl = dataModule(`
  export class TimelinePreviewEngine {
    onTick = null;
    attachCanvas() {}
    setDoc() {}
    setTime() {}
    dispose() {}
  }
`);

const mediaStubUrl = dataModule(`
  export async function fetchMediaBlob() {
    throw new Error("缺参数闸不该去拉媒体");
  }
`);

const ioStubUrl = dataModule(`
  export async function saveProjectWorkingHead() {
    return { ok: false, error: "闸不存盘" };
  }
`);

const pluginStubUrl = dataModule(`
  export function usePluginCommandSurface() {}
`);

const renderStubUrl = dataModule(`
  export async function renderTimeline() { return ""; }
`);

const leafStubs = {
  "../AdvancedWorkbenchShell": shellStubUrl,
  "../SelectionToolbar": toolbarStubUrl,
  "./preview-engine": engineStubUrl,
  "../../lib/media-proxy": mediaStubUrl,
  "../doc-editors/doc-io": ioStubUrl,
  "../plugin-command": pluginStubUrl,
  "./render-client": renderStubUrl,
};

function videoItem() {
  return {
    key: "video-w24",
    source: "creation",
    id: "video-w24",
    title: "闸",
    kind: "video",
    siteId: "site",
    favorite: false,
    url: "https://example.com/gate.mp4",
    meta: {},
  };
}

function concealmentReason(node) {
  let current = node;
  while (current && current.nodeType === 1) {
    if (current.hidden === true || current.hasAttribute("hidden")) return "hidden";
    if (current.getAttribute("aria-hidden") === "true") return "aria-hidden";
    const style = String(current.getAttribute("style") || "");
    if (/display\s:\s*none/i.test(style) || /display\s*:\s*none/i.test(style)) {
      return "display:none";
    }
    const cls = String(current.getAttribute("class") || "");
    if (/(?:^|\s)(?:hidden|invisible|sr-only)(?:\s|$)/.test(cls)) {
      return `class ${cls}`;
    }
    current = current.parentElement;
  }
  return null;
}

function currentProject() {
  const adapter = globalThis[ADAPTER_KEY];
  assert.ok(adapter, "壳桩没接到 adapter，编辑栏命令走不到 Stage");
  const capture = adapter.persistence && adapter.persistence.recovery
    ? adapter.persistence.recovery.capture
    : null;
  assert.equal(typeof capture, "function", "闸要能读当前工程，recovery.capture 不见了");
  const project = capture();
  assert.ok(project && project.clips, "当前工程没有 clips，读不到用户的视频");
  return project;
}

function videoClip(project) {
  const clip = Object.values(project.clips).find((entry) => entry.type === "Video");
  assert.ok(clip, "时间线里没有视频片段，闸无从对照裁切前后");
  return clip;
}

async function waitForControl(container, controlId) {
  for (let i = 0; i < 30; i += 1) {
    if (container.querySelector(`[data-control-id="${controlId}"]`)) return;
    await act(async () => {
      await Promise.resolve();
    });
  }
  assert.ok(
    false,
    `时间线载入后编辑栏没有「${controlId}」按钮，用户点不到这条动作`,
  );
}

async function clickControl(container, controlId) {
  await waitForControl(container, controlId);
  const button = container.querySelector(`[data-control-id="${controlId}"]`);
  assert.ok(button, `编辑栏没有「${controlId}」按钮，用户点不到这条动作`);
  await act(async () => {
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  });
}

function visibleNoticeText(container) {
  const node = container.querySelector("[data-video-designcombo-notice]");
  assert.ok(
    node,
    "缺参数时用户必须看见告示条。只写入 status 而舞台不画，人看不见为什么没执行。",
  );
  const hidden = concealmentReason(node);
  assert.equal(
    hidden,
    null,
    `告示条还在 DOM 里，但被藏起来了（${hidden}）。jsdom 没有 layout，这条钉的是 hidden / aria-hidden / display:none / 藏起 class。`,
  );
  return String(node.textContent || "");
}

async function mountStage() {
  const url = await compileModule(
    "src/shell/video-editor/VideoDesigncomboStage.tsx",
    leafStubs,
  );
  const mod = await import(url);
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(mod.VideoDesigncomboStage, {
        item: videoItem(),
        onClose() {},
        siteId: "site",
        accent: "#4f46e5",
      }),
    );
  });
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
  await waitForControl(container, "crop-frame");
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
      delete globalThis[ADAPTER_KEY];
    },
  };
}

test("clicking crop without a selection does not shrink the video, and the person sees why", async () => {
  const mounted = await mountStage();
  try {
    const before = videoClip(currentProject());
    const beforeWidth = before.transform.width;
    const beforeHeight = before.transform.height;
    await clickControl(mounted.container, "crop-frame");
    const after = videoClip(currentProject());
    assert.equal(
      after.crop,
      undefined,
      "点裁切但没框选区域时，视频不会被改动",
    );
    assert.equal(
      after.transform.width,
      beforeWidth,
      "点裁切但没框选区域时，视频不会被改动",
    );
    assert.equal(
      after.transform.height,
      beforeHeight,
      "点裁切但没框选区域时，视频不会被改动",
    );
    const notice = visibleNoticeText(mounted.container);
    assert.match(notice, /请先框选要保留的区域/);
  } finally {
    await mounted.unmount();
  }
});

test("clicking add-caption without body text does not plant 字幕 on the timeline", async () => {
  const mounted = await mountStage();
  try {
    await clickControl(mounted.container, "add-caption");
    const project = currentProject();
    const captions = Object.values(project.clips).filter(
      (clip) => clip.type === "Caption",
    );
    assert.equal(
      captions.length,
      0,
      "字幕正文为空时，轨道里不会落下占位文字",
    );
    assert.equal(
      captions.some((clip) => clip.text === "字幕"),
      false,
      "字幕正文为空时，轨道里不会落下占位文字",
    );
    const notice = visibleNoticeText(mounted.container);
    assert.match(notice, /请先输入字幕正文/);
  } finally {
    await mounted.unmount();
  }
});

test("clicking keyframes without a table does not attach an empty animation", async () => {
  const mounted = await mountStage();
  try {
    const before = videoClip(currentProject());
    assert.equal(
      (before.animations || []).length,
      0,
      "载入后片段上不该先有关键帧",
    );
    await clickControl(mounted.container, "keyframes");
    const after = videoClip(currentProject());
    assert.equal(
      (after.animations || []).length,
      0,
      "关键帧缺失时，不会被当成有关键帧继续走",
    );
    const notice = visibleNoticeText(mounted.container);
    assert.match(notice, /请先给出关键帧/);
  } finally {
    await mounted.unmount();
  }
});
