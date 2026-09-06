// 游戏接线闸（W08）：Code 页 + 可玩预览；专业编辑不可用。
//
// 源码正则是辅闸。A-48：产品被破坏成用户可感知的样子时闸必须红。

import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { DEFAULT_EDITOR_CORE } from "../src/shell/editor-core-flags.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";
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
import {
  GAME_CODE_PAGE,
  GAME_PRO_UNAVAILABLE,
  gamePagesAdapter,
} from "../src/shell/game-editor/game-pages.ts";

const read = (relative) =>
  readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const route = read("src/shell/advanced-routes/GameRoute.tsx");
const leaf = read("src/shell/game-editor/GameCodeStage.tsx");
const gate = read("src/shell/game-editor/game-agent-gate.ts");
const routeCode = route
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/\/\/.*$/gm, "");

const MINIMAL_HTML =
  "<!doctype html><html><body><script>void 0</script></body></html>";
const NEXT_HTML =
  "<!doctype html><html><body><script>window.GAME=1</script></body></html>";

test("hosted-pro files are gone; route declares Code page", () => {
  assert.equal(
    existsSync(new URL("../src/shell/game-editor/game-microstudio-embed.ts", import.meta.url)),
    false,
  );
  assert.equal(
    existsSync(new URL("../src/shell/game-editor/GameHostedFrame.tsx", import.meta.url)),
    false,
  );
  assert.doesNotMatch(route, /microstudio/i);
  assert.doesNotMatch(leaf, /microstudio/i);
  assert.match(route, /gamePagesAdapter/);
  assert.match(route, /activePageId === "code"/);
  assert.match(route, /<GameCodeStage \{\.\.\.props\} pages=\{pages\} \/>/);
  assert.match(
    route,
    /dynamic\(\s*\(\) =>\s*import\("\.\.\/game-editor\/GameCodeStage"\)/,
  );
  assert.match(route, /function GameLegacyRoute/);
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.doesNotMatch(routeCode, /<iframe/i);
  assert.doesNotMatch(routeCode, /srcdoc/i);
  const pages = gamePagesAdapter("artifact", () => {});
  assert.equal(pages.proUnavailableReason, GAME_PRO_UNAVAILABLE);
  assert.deepEqual(pages.aux, [GAME_CODE_PAGE]);
  assert.equal(GAME_CODE_PAGE.id, "code");
  assert.equal(GAME_CODE_PAGE.label, "Code");
});

test("professional editor never mounts a hosted frame", () => {
  assert.equal(GAME_NEXT_DEFAULT_MODE, "normal");
  assert.equal(DEFAULT_EDITOR_MODE, "normal");
  const normal = applyGameNextMode("oceanleo-game-next", "normal");
  assert.equal(normal.showHostedEditor, false);
  const pro = applyGameNextMode("oceanleo-game-next", "pro");
  assert.equal(pro.showHostedEditor, false);
  assert.match(leaf, /gameModeUnavailable/);
  assert.match(leaf, /data-testid="game-code-editor"/);
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
  const parked = await runGameAgentCommand(port, "game.set-source", {
    source: NEXT_HTML,
  });
  assert.equal(writes.length, 0, "没令牌时源码一个字都不能写");
  assert.match(String(parked.message), /审阅/);
  const held = hostReviewSession.snapshot().parked;
  assert.ok(held, "提案必须真的交进审阅收件箱");
  assert.equal(typeof held.params[GAME_APPLY_TOKEN_KEY], "string");
  assert.equal(peekGameApplyToken("game.set-source", held.params), true);
  const applied = await runGameAgentCommand(port, "game.set-source", held.params);
  assert.equal(applied.ok, true);
  assert.equal(writes.length, 1);
  assert.equal(writes[0], NEXT_HTML);
  assert.match(gate, /planGameAgentDisposition/);
});

test("run/stop/reload are decided by a pure function, not an if in the button", () => {
  const stopped = planGamePreviewControl(GAME_PREVIEW_INITIAL, "stop");
  assert.equal(stopped.paused, true);
  assert.equal(isGamePreviewRunning(stopped), false);
  const running = planGamePreviewControl(stopped, "run");
  assert.equal(running.paused, false);
  const reloaded = planGamePreviewControl(running, "reload");
  assert.equal(reloaded.reloadKey, GAME_PREVIEW_INITIAL.reloadKey + 1);
  assert.match(leaf, /planGamePreviewControl/);
  assert.match(leaf, /data-testid="game-run"/);
});

test("next-core sources do not embed a DashScope key", () => {
  for (const text of [leaf, route, gate]) {
    assert.doesNotMatch(text, /sk-[a-zA-Z0-9]{8,}/);
    assert.doesNotMatch(text, /PLATFORM_DASHSCOPE_KEY\s*=\s*['"]/);
  }
});

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
        adapter && adapter.pages
          ? jsx("button", {
              type: "button",
              "data-testid": "game-select-code",
              onClick: () => adapter.pages.onSelectPage && adapter.pages.onSelectPage("code"),
              children: "Code",
            })
          : null,
        adapter && adapter.mode
          ? jsx("span", {
              "data-testid": "game-pro-unavailable",
              title: adapter.mode.unavailableReason || "",
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
    current = current.parentElement;
  }
  return null;
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

test("Code 页有代码编辑器与预览槽；运行/停止/重载改预览宿主 props", async () => {
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
    assert.ok(editor, "Code 页没有代码编辑器，用户改不了游戏");
    assert.equal(editor.tagName, "TEXTAREA");
    assert.equal(concealmentReason(editor), null);
    const preview = mounted.container.querySelector("[data-testid=game-preview-frame]");
    assert.ok(preview, "Code 页没有沙箱预览 iframe");
    assert.equal(
      mounted.container.querySelector("[data-testid=game-hosted-frame]"),
      null,
      "不该再挂专业托管 iframe",
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
    );
    await act(async () => {
      run.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
    assert.equal(
      mounted.container
        .querySelector("[data-testid=game-preview-frame]")
        .getAttribute("data-paused"),
      "false",
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
    assert.equal(after, before + 1);
    const reason = mounted.container.querySelector("[data-testid=game-pro-unavailable]");
    assert.ok(reason);
    assert.equal(reason.getAttribute("title"), "专业编辑即将到来");
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
    assert.ok(panel, "有 3 项参数声明时参数面板没画出来");
    const slider = mounted.container.querySelector("[data-testid=game-param-speed]");
    assert.ok(slider, "速度滑块不在");
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
    );
  } finally {
    registerGamePreviewHost(null);
    await mounted.unmount();
  }
});

test("GameRoute 点 Code 页真的交出 GameCodeStage 并带上 item", async () => {
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
    const reason = mounted.container.querySelector("[data-testid=game-pro-unavailable]");
    assert.ok(reason, "编辑页没有申报专业编辑不可用");
    assert.equal(reason.getAttribute("title"), "专业编辑即将到来");
    const button = mounted.container.querySelector("[data-testid=game-select-code]");
    assert.ok(button, "编辑页没有 Code 页签动作");
    await act(async () => {
      button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    });
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
      "点 Code 之后没有交出 GameCodeStage。DOM=" +
        mounted.container.innerHTML.slice(0, 500),
    );
    assert.equal(marker.getAttribute("data-item-id"), "gm-gate");
  } finally {
    await mounted.unmount();
  }
});
