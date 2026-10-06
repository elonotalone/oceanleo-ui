// F08（work-chat 第二轮）：矢量图。
//  1. 只读：画布外层 inert（iframe 拿不到键盘和鼠标的编辑输入），且只读 / 可写切换不让画布重新挂载；
//  2. 本地有没保存的改动时，外部新版本到达不重新挂载画布，出现提示条；「看新版本」后才重新载入；
//     没有本地改动时照旧自动刷新；「保存我的」交给宿主照常保存。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvas = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvas) require.cache[canvasEntry] = previousCanvas;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "http://localhost/" });
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

const useUiStub = dataModule(
  `export function useUI(){ return (key, vars) => key.replace(/\\{(\\w+)\\}/g, (_m, n) => String(vars?.[n] ?? "")); }`,
);

const { VectorFrameGuard, VectorNewVersionBar } = await import(
  await compileModule("src/shell/collab/adapters/VectorCollabChrome.tsx", {
    "../../../i18n/ui/useUI": useUiStub,
  })
);

async function mount(element) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    rerender: (next) => act(async () => root.render(next)),
    unmount: () => act(async () => root.unmount()),
  };
}

// ---------------------------------------------------------------- 只读：inert

test("矢量图只读：画布外层 inert；可写时没有 inert；非矢量图原样返回子节点", () => {
  const pane = React.createElement("iframe", { title: "canvas" });
  const locked = renderToStaticMarkup(React.createElement(VectorFrameGuard, { enabled: true, readOnly: true }, pane));
  assert.match(locked, /<div[^>]*\sinert=""/);
  assert.match(locked, /data-vector-frame-guard="inert"/);
  assert.match(locked, /<iframe/);
  const open = renderToStaticMarkup(React.createElement(VectorFrameGuard, { enabled: true, readOnly: false }, pane));
  assert.doesNotMatch(open, /inert/);
  assert.match(open, /data-vector-frame-guard="open"/);
  const other = renderToStaticMarkup(React.createElement(VectorFrameGuard, { enabled: false, readOnly: true }, pane));
  assert.equal(other, '<iframe title="canvas"></iframe>');
});

test("矢量图只读 / 可写来回切换：画布只挂载一次（不重新挂载），inert 属性随之开关", async () => {
  let mounts = 0;
  let unmounts = 0;
  function Canvas() {
    React.useEffect(() => {
      mounts += 1;
      return () => {
        unmounts += 1;
      };
    }, []);
    return React.createElement("iframe", { title: "canvas" });
  }
  const view = (readOnly) =>
    React.createElement(VectorFrameGuard, { enabled: true, readOnly }, React.createElement(Canvas));
  const mounted = await mount(view(false));
  const guard = () => mounted.container.querySelector("[data-vector-frame-guard]");
  assert.equal(guard().hasAttribute("inert"), false);
  await mounted.rerender(view(true));
  assert.equal(guard().hasAttribute("inert"), true, "只读后画布 inert");
  await mounted.rerender(view(false));
  assert.equal(guard().hasAttribute("inert"), false);
  await mounted.rerender(view(true));
  assert.equal(mounts, 1);
  assert.equal(unmounts, 0);
  await mounted.unmount();
});

// ---------------------------------------------------------------- 提示条

test("新版本提示条：两个按钮各走各的回调；保存失败时有一句说明", async () => {
  const calls = [];
  const mounted = await mount(
    React.createElement(VectorNewVersionBar, {
      onKeepMine: () => calls.push("keep"),
      onSeeNew: () => calls.push("see"),
      saveFailed: false,
    }),
  );
  const bar = mounted.container.querySelector("[data-vector-new-version]");
  assert.ok(bar);
  assert.match(bar.textContent, /这张矢量图有了新版本，而你还有没保存的改动。/);
  assert.doesNotMatch(bar.textContent, /没能保存/);
  const keep = bar.querySelector("[data-vector-keep-mine]");
  const see = bar.querySelector("[data-vector-see-new]");
  assert.equal(keep.textContent, "保存我的");
  assert.equal(see.textContent, "看新版本");
  await act(async () => keep.click());
  await act(async () => see.click());
  assert.deepEqual(calls, ["keep", "see"]);
  await mounted.rerender(
    React.createElement(VectorNewVersionBar, { onKeepMine() {}, onSeeNew() {}, saveFailed: true }),
  );
  assert.match(mounted.container.textContent, /没能保存你的改动，请再试一次。/);
  await mounted.unmount();
});

// ---------------------------------------------------------------- 外部新版本 × 未保存的改动

function makeRoom() {
  const state = { handler: null, marked: [] };
  const room = {
    status: "synced",
    role: "editor",
    lock: { holder: { id: "me", name: "我" } },
    self: { id: "me" },
    acquireLock: async () => true,
    releaseLock() {},
    markSaved: (id) => state.marked.push(id),
    onExternalRevision(handler) {
      state.handler = handler;
      return () => {
        state.handler = null;
      };
    },
  };
  return { room, state };
}

async function loadHook(room) {
  const revisions = {};
  const mod = await import(
    await compileModule("src/shell/collab/adapters/use-vector-collab.ts", {
      "../../../lib/im/client": dataModule(`export function useImEnabled(){ return true; }`),
      "../../artifact-client": dataModule(
        `export async function getArtifactItem(id, revisionId){ return { data: globalThis.__F08_REVISIONS[revisionId] }; }`,
      ),
      "../index": dataModule(
        `export function useCollabRoom(){ return globalThis.__F08_ROOM; }
         export function useCollabRoomVersion(){ return 0; }`,
      ),
    })
  );
  globalThis.__F08_ROOM = room;
  globalThis.__F08_REVISIONS = revisions;
  return { ...mod, revisions };
}

function probe(useVectorCollab, getDirty) {
  const seen = { current: null };
  function Probe() {
    seen.current = useVectorCollab({ enabled: true, item: { artifactId: "art-1", title: "图" }, localDirty: getDirty() });
    return null;
  }
  return { seen, element: React.createElement(Probe) };
}

test("外部新版本：本地没有未保存的改动 → 自动刷新（换上新版本、重新挂载一次）", async () => {
  const { room, state } = makeRoom();
  const { useVectorCollab, revisions } = await loadHook(room);
  revisions.r2 = { key: "item-r2", revisionId: "r2" };
  const { seen, element } = probe(useVectorCollab, () => false);
  const mounted = await mount(element);
  assert.equal(seen.current.revisionNonce, 0);
  await act(async () => {
    state.handler("r2");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(seen.current.revisionNonce, 1);
  assert.equal(seen.current.revisionItem.key, "item-r2");
  assert.equal(seen.current.pendingRevision, null);
  assert.deepEqual(state.marked, ["r2"]);
  await mounted.unmount();
});

test("外部新版本：本地有未保存的改动 → 不重新挂载、出现待处理的新版本；「看新版本」后才换上", async () => {
  const { room, state } = makeRoom();
  const { useVectorCollab, revisions } = await loadHook(room);
  revisions.r2 = { key: "item-r2", revisionId: "r2" };
  revisions.r3 = { key: "item-r3", revisionId: "r3" };
  let dirty = true;
  const { seen, element } = probe(useVectorCollab, () => dirty);
  const mounted = await mount(element);
  await act(async () => {
    state.handler("r2");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(seen.current.revisionNonce, 0, "没保存的改动在，画布不能重新挂载");
  assert.equal(seen.current.revisionItem, null);
  assert.equal(seen.current.pendingRevision.key, "item-r2");
  assert.deepEqual(state.marked, [], "用户还没选，不告诉房间已采用");
  // 更新的外部版本覆盖更早暂存的那个
  await act(async () => {
    state.handler("r3");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.equal(seen.current.pendingRevision.key, "item-r3");
  assert.equal(seen.current.revisionNonce, 0);
  // 即使本地改动恰好清掉（比如撤销到干净），也不自动换：提示条一直在，直到用户选
  dirty = false;
  await mounted.rerender(element);
  assert.equal(seen.current.revisionNonce, 0);
  assert.equal(seen.current.pendingRevision.key, "item-r3");
  // 「看新版本」
  let accepted;
  await act(async () => {
    accepted = seen.current.acceptPendingRevision();
  });
  assert.equal(accepted, true);
  assert.equal(seen.current.revisionNonce, 1, "此时才重新挂载");
  assert.equal(seen.current.revisionItem.key, "item-r3");
  assert.equal(seen.current.pendingRevision, null);
  assert.deepEqual(state.marked, ["r3"]);
  await act(async () => {
    assert.equal(seen.current.acceptPendingRevision(), false, "没有暂存时什么也不做");
  });
  assert.equal(seen.current.revisionNonce, 1);
  await mounted.unmount();
});

test("「保存我的」存成功后：丢掉暂存的外部版本，画布不换", async () => {
  const { room, state } = makeRoom();
  const { useVectorCollab, revisions } = await loadHook(room);
  revisions.r2 = { key: "item-r2", revisionId: "r2" };
  const { seen, element } = probe(useVectorCollab, () => true);
  const mounted = await mount(element);
  await act(async () => {
    state.handler("r2");
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  assert.ok(seen.current.pendingRevision);
  await act(async () => seen.current.dropPendingRevision());
  assert.equal(seen.current.pendingRevision, null);
  assert.equal(seen.current.revisionNonce, 0);
  assert.equal(seen.current.revisionItem, null);
  await mounted.unmount();
});

test("decideExternalRevision：dirty → hold；干净 → apply", async () => {
  const { room } = makeRoom();
  const { decideExternalRevision } = await loadHook(room);
  assert.equal(decideExternalRevision({ localDirty: true }), "hold");
  assert.equal(decideExternalRevision({ localDirty: false }), "apply");
});

// ---------------------------------------------------------------- 接线与安全

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("EmbeddedRoute 矢量分支接线：dirty 传给 hook、画布包 VectorFrameGuard、提示条两个回调、存成功收提示条", () => {
  const src = read("src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.match(src, /useVectorCollab\(\{ enabled: vectorImage, item, localDirty: dirty \}\)/);
  assert.match(src, /<VectorFrameGuard enabled=\{vectorImage\} readOnly=\{vectorImage && vectorCollab\.readOnly\}>/);
  assert.match(src, /<VectorNewVersionBar[\s\S]*onKeepMine=\{\(\) => void keepMyVectorEdits\(\)\}[\s\S]*onSeeNew=\{seeNewVectorRevision\}/);
  assert.match(src, /vectorCollab\.dropPendingRevision\(\)/);
  // 「看新版本」要把宿主这边的未保存记号一起清掉
  const seeNew = src.slice(src.indexOf("const seeNewVectorRevision"), src.indexOf("const requestEditorClose"));
  assert.match(seeNew, /acceptPendingRevision\(\)/);
  assert.match(seeNew, /setDirty\(false\)/);
  // 原有的只读遮罩还在
  assert.match(src, /<VectorReadOnlyCover/);
});

test("安全：新增 / 改动的矢量图文件不碰 sandbox、postMessage、innerHTML 注入点，也不新增 iframe", () => {
  for (const path of [
    "src/shell/collab/adapters/VectorCollabChrome.tsx",
    "src/shell/collab/adapters/use-vector-collab.ts",
    "src/shell/collab/adapters/VisualViewOnlyPanel.tsx",
    "src/shell/collab/adapters/visual-readonly.ts",
  ]) {
    const src = read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    assert.doesNotMatch(src, /sandbox|postMessage|dangerouslySetInnerHTML|innerHTML|srcDoc|<iframe|createElement\("iframe"/i, path);
  }
  // EmbeddedRoute 里与 iframe 通信相关的两个入口一行没动：sandbox 字样与 postMessage 调用次数与 HEAD 一致由安全门核对；
  // 这里只钉住「矢量分支没有自己拼 iframe」
  const route = read("src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.doesNotMatch(route, /<iframe/);
});
