import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://oceanleo.com/library",
});
for (const [name, value] of Object.entries({
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const { LibraryScope, cloudReferenceForLocalFile, formatLibraryUpdatedAt } =
  await import(
    await compileModule("src/shell/library-scope.tsx", {
      "./library-scope-client": dataModule(`
        export const defaultLibraryScopeAdapter = {
          listDevices: async () => [],
          refreshLocalLibrary: async () => ({ files: [], updatedAt: Date.now() }),
        };
      `),
    })
  );

const office = {
  device_id: "office-windows",
  platform: "windows",
  device_name: "公司 Windows",
  online: true,
  local_exec_enabled: true,
  granted_kinds: ["read"],
  last_seen_at: "2026-08-15T11:59:00Z",
};
const home = {
  device_id: "home-mac",
  platform: "macos",
  device_name: "家里 Mac",
  online: false,
  local_exec_enabled: true,
  granted_kinds: ["read"],
  last_seen_at: "2026-08-14T08:00:00Z",
};

async function mount(props = {}) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(
        LibraryScope,
        props,
        React.createElement("div", { "data-cloud-item": true }, "云端作品甲"),
      ),
    );
  });
  return {
    host,
    root,
    async click(label) {
      const button = [...host.querySelectorAll("button")].find((candidate) =>
        candidate.textContent.includes(label),
      );
      assert.ok(button, `missing button: ${label}`);
      await act(async () => {
        button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
      });
    },
    async close() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test("库分区默认云端，多台设备各自出现一个带设备名的本地库入口", async () => {
  const view = await mount({ devices: [office, home] });
  try {
    assert.equal(view.host.querySelector("[data-library-scope]").dataset.libraryScope, "cloud");
    assert.match(view.host.textContent, /云端作品甲/);
    assert.match(view.host.textContent, /公司 Windows · 本地库/);
    assert.match(view.host.textContent, /家里 Mac · 本地库/);
    assert.equal(
      view.host.querySelector('button[aria-pressed="true"]').textContent.trim(),
      "云端库",
    );
  } finally {
    await view.close();
  }
});

test("离线设备显示明确离线态，不冒充空列表", async () => {
  const view = await mount({ devices: [home] });
  try {
    await view.click("家里 Mac");
    assert.equal(
      view.host.querySelector("[data-library-state]").dataset.libraryState,
      "offline",
    );
    assert.match(
      view.host.textContent,
      /家里 Mac 现在离线，看不到它的本地库。它上线后这里会恢复。/,
    );
    assert.doesNotMatch(view.host.textContent, /本地库是空的/);
  } finally {
    await view.close();
  }
});

test("在线设备的空摘要显示空库态，文案与离线态不同", async () => {
  const view = await mount({
    devices: [office],
    snapshots: {
      [office.device_id]: { files: [], updatedAt: "2026-08-15T11:55:00Z" },
    },
    now: () => Date.parse("2026-08-15T12:00:00Z"),
  });
  try {
    await view.click("公司 Windows");
    assert.equal(
      view.host.querySelector("[data-library-state]").dataset.libraryState,
      "empty",
    );
    assert.match(view.host.textContent, /公司 Windows 的本地库是空的/);
    assert.doesNotMatch(view.host.textContent, /现在离线/);
  } finally {
    await view.close();
  }
});

test("本地副本有标记，点击会切回并打开对应云端条目", async () => {
  let opened = "";
  const view = await mount({
    devices: [office],
    snapshots: {
      [office.device_id]: {
        files: [{ name: "发布会.PPTX", bytes: 4096, kind: "ppt" }],
        updatedAt: "2026-08-15T11:55:00Z",
      },
    },
    cloudItems: [
      { id: "artifact-deck", name: "发布会.pptx", bytes: 4096 },
    ],
    onOpenCloudItem: (id) => {
      opened = id;
    },
  });
  try {
    await view.click("公司 Windows");
    const copy = [...view.host.querySelectorAll("a")].find((link) =>
      link.textContent.includes("云端库的副本"),
    );
    assert.ok(copy);
    await act(async () => {
      copy.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    assert.equal(opened, "artifact-deck");
    assert.equal(view.host.querySelector("[data-library-scope]").dataset.libraryScope, "cloud");
    assert.match(view.host.textContent, /云端作品甲/);
  } finally {
    await view.close();
  }
});

test("本地库显示相对更新时间、手动刷新和不上传正文提示", async () => {
  let refreshes = 0;
  const view = await mount({
    devices: [office],
    snapshots: {
      [office.device_id]: {
        files: [{ name: "发票.xlsx", bytes: 2048, kind: "sheet" }],
        updatedAt: "2026-08-15T11:55:00Z",
      },
    },
    now: () => Date.parse("2026-08-15T12:00:00Z"),
    refreshLocalLibrary: async () => {
      refreshes += 1;
      return { files: [], updatedAt: "2026-08-15T12:00:00Z" };
    },
  });
  try {
    await view.click("公司 Windows");
    assert.match(view.host.textContent, /更新于 5 分钟前/);
    assert.match(view.host.textContent, /本地文件的内容不会上传/);
    assert.match(view.host.textContent, /预览需要在 公司 Windows 上打开/);
    await view.click("手动刷新");
    assert.equal(refreshes, 1);
  } finally {
    await view.close();
  }
});

test("副本关联按规范化文件名和可用字节数匹配", () => {
  assert.equal(
    cloudReferenceForLocalFile(
      { name: " Ａ.PPTX ", bytes: 9, kind: "ppt" },
      [
        { id: "wrong-size", name: "a.pptx", bytes: 10 },
        { id: "right", name: "a.pptx", bytes: 9 },
      ],
    )?.id,
    "right",
  );
  assert.equal(
    formatLibraryUpdatedAt(
      "2026-08-15T11:55:00Z",
      Date.parse("2026-08-15T12:00:00Z"),
    ),
    "5 分钟前",
  );
});

test("默认适配器只组合 W5 facade 与 W7 fs.list 客户端，不复制网络或轮询", async () => {
  const source = readFileSync(
    new URL("../src/shell/library-scope-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /devicesFacade\.listDevices\(\)/);
  assert.match(source, /createLocalTask\(device\.device_id, "fs\.list", \{\}\)/);
  assert.match(source, /watchLocalTask\(/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /setInterval|setTimeout/);

  globalThis.__w6TaskCalls = [];
  globalThis.__w6WatchedTask = "";
  const adapter = await import(
    await compileModule("src/shell/library-scope-client.ts", {
      "../facades/devices": dataModule(`
        export const devicesFacade = {
          listDevices: async () => ({ ok: true, data: [{
            device_id: "office-windows",
            platform: "windows",
            device_name: "公司 Windows",
            online: true,
            local_exec_enabled: true,
            granted_kinds: ["read"],
            last_seen_at: null,
          }] }),
        };
      `),
      "./local-task-client": dataModule(`
        export async function createLocalTask(...args) {
          globalThis.__w6TaskCalls.push(args);
          return { taskId: "task-fs-list", offline: false };
        }
        export function watchLocalTask(taskId, onUpdate) {
          globalThis.__w6WatchedTask = taskId;
          queueMicrotask(() => onUpdate({
            status: "succeeded",
            resultSummary: { files: [{ name: "发票.xlsx", bytes: 8, kind: "sheet" }] },
          }));
          return () => {};
        }
      `),
    })
  );
  const devices = await adapter.listLibraryDevices();
  const snapshot = await adapter.refreshDeviceLocalLibrary(devices[0]);
  assert.deepEqual(globalThis.__w6TaskCalls, [
    ["office-windows", "fs.list", {}],
  ]);
  assert.equal(globalThis.__w6WatchedTask, "task-fs-list");
  assert.deepEqual(snapshot.files, [
    { name: "发票.xlsx", bytes: 8, kind: "sheet" },
  ]);
  delete globalThis.__w6TaskCalls;
  delete globalThis.__w6WatchedTask;
});
