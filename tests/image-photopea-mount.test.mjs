/**
 * Photopea 挂载闸 + 画布内结构/皮肤的 jsdom 行为闸（A-48）。
 *
 * UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
 * UC-6: docs/architecture/oceanleo-untrusted-content-isolation.md §8.6
 *
 * 专业模式必须真挂 iframe；普通模式 iframe 不得存在。
 * 点结构/皮肤必须真切，切了不得碰文档。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";
import {
  TRUSTED_EMBED_EDITOR_BASES,
  UNTRUSTED_FRAME_SANDBOX,
  embedEditorFrameSandbox,
  isTrustedEmbedEditorBase,
} from "../src/shell/editor-sandbox-origin.ts";
import { PHOTOPEA_ORIGIN } from "../src/shell/image-editor/photopea-bridge.ts";
import {
  photopeaFrameSandbox,
  planPhotopeaMount,
} from "../src/shell/image-editor/photopea-mount.ts";
import { DESIGN_MODE_INITIAL_STATE } from "../src/shell/image-editor/design-mode/design-mode-state.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const hostSrc = read("src/shell/image-editor/ImagePhotopeaHost.tsx");
const frameSrc = read("src/shell/image-editor/PhotopeaFrame.tsx");
const switchSrc = read("src/shell/image-editor/ImageCanvasViewSwitch.tsx");

test("pro 档才允许挂 Photopea，normal 档不允许", () => {
  assert.equal(planPhotopeaMount(true).mount, true);
  assert.equal(planPhotopeaMount(false).mount, false);
});

test("Photopea sandbox 是不可信档，且不在 TRUSTED 表里", () => {
  // UC-3: docs/architecture/oceanleo-untrusted-content-isolation.md §8.3
  assert.equal(photopeaFrameSandbox(), UNTRUSTED_FRAME_SANDBOX);
  assert.equal(embedEditorFrameSandbox(PHOTOPEA_ORIGIN), UNTRUSTED_FRAME_SANDBOX);
  assert.equal(UNTRUSTED_FRAME_SANDBOX.includes("allow-same-origin"), false);
  assert.equal(isTrustedEmbedEditorBase(PHOTOPEA_ORIGIN), false);
  assert.equal(
    TRUSTED_EMBED_EDITOR_BASES.some((base) => /photopea/i.test(base)),
    false,
    "不许把 photopea.com 加进 TRUSTED_EMBED_EDITOR_BASES",
  );
});

test("Host 必须问 planPhotopeaMount，Frame 必须走共享沙箱与精确 origin", () => {
  // UC-3 / UC-6
  assert.match(hostSrc, /planPhotopeaMount\(showPhotopea\)/);
  assert.match(hostSrc, /if \(!planned\.mount\) return null/);
  assert.match(frameSrc, /sandbox=\{sandbox\}/);
  assert.match(frameSrc, /photopeaFrameSandbox\(\)/);
  assert.match(frameSrc, /referrerPolicy="no-referrer"/);
  assert.match(frameSrc, /postToPhotopea\(/);
  assert.match(frameSrc, /PHOTOPEA_ORIGIN/);
  assert.equal(
    /postMessage\([^,]+,\s*["']\*["']\)/.test(frameSrc),
    false,
    "UC-6: targetOrigin 不得为 *",
  );
  assert.equal(
    /["'`][^"'`\n]*allow-same-origin/.test(frameSrc),
    false,
    "UC-3: Photopea 渲染面不得内联 allow-same-origin 字符串",
  );
  assert.match(switchSrc, /applyCanvasViewClick\(state, choice\.mode, document\)/);
});

const require = createRequire(import.meta.url);
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
    current = current.parentElement;
  }
  return null;
}

function assertLivePhotopeaIframe(iframe) {
  assert.ok(iframe, "专业模式挂起来之后没有 iframe 节点，用户看不到 Photopea");
  assert.equal(iframe.tagName, "IFRAME");
  const src = iframe.getAttribute("src") || "";
  assert.ok(src.startsWith(`${PHOTOPEA_ORIGIN}#`), src);
  assert.equal(iframe.getAttribute("sandbox"), photopeaFrameSandbox());
  assert.equal(iframe.getAttribute("referrerpolicy") || iframe.getAttribute("referrerPolicy"), "no-referrer");
  const hidden = concealmentReason(iframe);
  assert.equal(hidden, null, `iframe 被藏起来了：${hidden}`);
}

async function mountCompiled(entry, element) {
  const url = await compileModule(entry, {});
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

test("普通模式不得出现 Photopea iframe", async () => {
  const mounted = await mountCompiled(
    "src/shell/image-editor/ImagePhotopeaHost.tsx",
    (mod) =>
      React.createElement(mod.ImagePhotopeaHost, { showPhotopea: false }),
  );
  try {
    assert.equal(
      mounted.container.querySelector("iframe"),
      null,
      "普通模式下 iframe 竟然存在",
    );
    assert.equal(mounted.container.querySelector("[data-testid=image-photopea-frame]"), null);
  } finally {
    await mounted.unmount();
  }
});

test("专业模式必须出现 Photopea iframe", async () => {
  const mounted = await mountCompiled(
    "src/shell/image-editor/ImagePhotopeaHost.tsx",
    (mod) =>
      React.createElement(mod.ImagePhotopeaHost, { showPhotopea: true }),
  );
  try {
    assertLivePhotopeaIframe(
      mounted.container.querySelector("[data-testid=image-photopea-frame]"),
    );
  } finally {
    await mounted.unmount();
  }
});

test("点皮肤必须切过去，并且不得改文档", async () => {
  const document = Object.freeze({ title: "同一份文件", n: 7 });
  const mounted = await mountCompiled(
    "src/shell/image-editor/ImageCanvasViewSwitch.tsx",
    (mod) => {
      function Harness() {
        const [state, setState] = React.useState(DESIGN_MODE_INITIAL_STATE);
        return React.createElement(mod.ImageCanvasViewSwitch, {
          state,
          document,
          onRoute(route) {
            setState(route.state);
            globalThis.__canvasViewRoute = route;
          },
        });
      }
      return React.createElement(Harness);
    },
  );
  try {
    const root = mounted.container.querySelector("[data-testid=image-canvas-view-switch]");
    assert.ok(root);
    assert.equal(root.getAttribute("data-canvas-view"), "photo");
    const skin = mounted.container.querySelector("[data-canvas-view-target=design]");
    assert.ok(skin, "没有皮肤按钮");
    await act(async () => {
      skin.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    await act(async () => {});
    assert.equal(
      mounted.container.querySelector("[data-testid=image-canvas-view-switch]")
        .getAttribute("data-canvas-view"),
      "design",
      "点了皮肤却没切",
    );
    const route = globalThis.__canvasViewRoute;
    assert.equal(route.kind, "preserve-document");
    assert.equal(route.document, document, "切了碰文档：交还的不是原来那份");
    assert.deepEqual(route.document, { title: "同一份文件", n: 7 });
  } finally {
    delete globalThis.__canvasViewRoute;
    await mounted.unmount();
  }
});
