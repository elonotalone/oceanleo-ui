// F07 测试台：两个模拟客户端共享同一份文档（yjs），各自跑真实的 use-entity-collab。
// 只替身「房间」和几个与协同无关的壳依赖（语言、IM 开关）；bind-json-state / entity-undo / 适配器都是真的。
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act } from "react";
import * as Y from "yjs";
import { compileModule, dataModule, realModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://media.dev.oceanleo.com/advanced/video",
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
  KeyboardEvent: window.KeyboardEvent,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent ?? window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

export { React, act, window };
export const document = window.document;
export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export async function mount(element) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(next);
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/** 等所有挂起的 effect / 微任务落定。 */
export async function settle(times = 3) {
  for (let i = 0; i < times; i += 1) {
    await act(async () => {
      await sleep(0);
    });
  }
}

const SHOWCASE_USERS = {
  A: { id: "u1", name: "甲", color: "hsl(1, 70%, 45%)", avatar_url: null },
  B: { id: "u2", name: "乙", color: "hsl(2, 70%, 45%)", avatar_url: null },
};

/**
 * 两个文档互相同步：A 的每次事务更新原样应用到 B，反之亦然。
 * 房间 id 就是 artifactId（"A" / "B"）；use-entity-collab 的 useCollabRoom 替身按它取房间。
 */
export function makeWorld() {
  const docs = { A: new Y.Doc(), B: new Y.Doc() };
  const queue = { A: [], B: [] };
  docs.A.on("update", (update, origin) => {
    if (origin !== "net") queue.B.push(update);
  });
  docs.B.on("update", (update, origin) => {
    if (origin !== "net") queue.A.push(update);
  });
  const rooms = {};
  for (const key of ["A", "B"]) {
    const listeners = new Set();
    rooms[key] = {
      roomKey: key,
      doc: docs[key],
      role: "editor",
      status: "synced",
      self: SHOWCASE_USERS[key],
      needsSeed: key === "A",
      isSaver: key === "A",
      lock: null,
      peers: [],
      seeded: [],
      saved: [],
      completeSeed(roots) {
        this.seeded.push(roots);
        this.needsSeed = false;
      },
      onExternalRevision() {
        return () => undefined;
      },
      markSaved(id) {
        this.saved.push(id);
      },
      subscribe(cb) {
        listeners.add(cb);
        return () => listeners.delete(cb);
      },
      destroy() {},
    };
  }
  const world = {
    docs,
    rooms,
    readOnly: { A: false, B: false },
    /** 把积压的更新送到对面（模拟网络送达）。 */
    flush() {
      while (queue.A.length || queue.B.length) {
        for (const update of queue.B.splice(0)) Y.applyUpdate(docs.B, update, "net");
        for (const update of queue.A.splice(0)) Y.applyUpdate(docs.A, update, "net");
      }
    },
  };
  /** 在 act 里送达并等落定（对方的更新会触发 React 状态变化）。 */
  world.sync = async () => {
    await act(async () => world.flush());
    await settle();
  };
  globalThis.__f07World = world;
  return world;
}

/** 编译真实的 use-entity-collab：房间 / 读写钩子换成读 `globalThis.__f07World` 的替身。 */
export async function loadEntityCollab() {
  const bindUrl = realModule("src/shell/collab/bind-json-state.ts");
  return import(
    await compileModule("src/shell/collab/adapters/use-entity-collab.ts", {
      "../index": dataModule(`
        export { bindJsonState } from ${JSON.stringify(bindUrl)};
        export const useCollabRoom = ({ resource, enabled }) =>
          enabled && resource ? globalThis.__f07World.rooms[resource.id] ?? null : null;
        export const useCollabReadOnly = (room) => Boolean(room && globalThis.__f07World.readOnly[room.roomKey]);
        export const useCollabSaveGate = (room) => Boolean(room && room.isSaver);
        export const useCollabRoomVersion = () => undefined;
      `),
      "../../../lib/im/client": dataModule(`export const useImEnabled = () => true;`),
      "../../../i18n/ui/useUI": dataModule(`
        export const useUI = () => (text, vars) =>
          vars ? String(text).replace(/\\{(\\w+)\\}/g, (_, key) => String(vars[key] ?? "")) : String(text);
      `),
    }),
  );
}

export { compileModule, dataModule, realModule };
