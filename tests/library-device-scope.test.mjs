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
        export const normalizeAbsoluteLibraryPath = (value) => {
          const path = String(value || "").trim();
          if (!path) return null;
          return path.startsWith("/") || /^[A-Za-z]:[\\\\/]/.test(path) ? path : null;
        };
      `),
    })
  );

async function loadLibraryAdapter() {
  return import(
    await compileModule("src/shell/library-scope-client.ts", {
      // 实现层直连 api/devices，不许经过 facades/devices ——
      // 那是 architecture:check 的域边界规则（实现模块不得依赖公开门面）。
      "../api/devices": dataModule(`
        export const listDevices = async () => ({ ok: true, data: [{
          device_id: "office-windows",
          platform: "windows",
          device_name: "公司 Windows",
          online: true,
          local_exec_enabled: true,
          granted_kinds: ["read"],
          last_seen_at: null,
        }] });
      `),
      "./local-task-client": dataModule(`
        export async function createLocalTask(...args) {
          globalThis.__w6TaskCalls.push(args);
          return { taskId: "task-fs-list", offline: false };
        }
        export function watchLocalTask(taskId, onUpdate) {
          globalThis.__w6WatchedTask = taskId;
          queueMicrotask(() => onUpdate(globalThis.__w6TaskUpdate));
          return () => {};
        }
      `),
    })
  );
}

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
    // 这里不能走「原生 setter + 派发 input 事件」那套常见写法。
    // 在本文件的 jsdom + React 18 组合里实测过：click 能通，input 事件也确实
    // 冒泡到了容器，但 React 的 onChange 仍然一次都不触发（被它自己的
    // 「值没变」判断吞掉），结果是 DOM 上有值、组件 state 还是空 ——
    // 于是「手动刷新」读到空路径，测试红得像是组件的错，其实是 harness 的错。
    // 所以直接取 React 挂在 DOM 节点上的 props 调 onChange，不碰它的事件系统。
    async setPath(value) {
      const input = host.querySelector('input[placeholder="输入绝对路径"]');
      assert.ok(input, "missing absolute path input");
      const propsKey = Object.keys(input).find((key) =>
        key.startsWith("__reactProps$"),
      );
      assert.ok(propsKey, "missing React props on the path input");
      await act(async () => {
        input[propsKey].onChange({ target: { value } });
      });
    },
    async flush() {
      await act(async () => {
        await new Promise((resolve) => queueMicrotask(resolve));
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
  let refreshPath = "";
  const view = await mount({
    devices: [office],
    snapshots: {
      [office.device_id]: {
        files: [{ name: "发票.xlsx", bytes: 2048, kind: "sheet" }],
        updatedAt: "2026-08-15T11:55:00Z",
      },
    },
    now: () => Date.parse("2026-08-15T12:00:00Z"),
    refreshLocalLibrary: async (_device, path) => {
      refreshes += 1;
      refreshPath = path;
      return { files: [], updatedAt: "2026-08-15T12:00:00Z" };
    },
  });
  try {
    await view.click("公司 Windows");
    assert.match(view.host.textContent, /更新于 5 分钟前/);
    assert.match(view.host.textContent, /本地文件的内容不会上传/);
    assert.match(view.host.textContent, /预览需要在 公司 Windows 上打开/);
    await view.setPath("/已授权/发票");
    await view.click("手动刷新");
    assert.equal(refreshes, 1);
    assert.equal(refreshPath, "/已授权/发票");
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

test("跨层刷新按 §4.1 发送绝对 path，设备 files 摘要最终渲染", async () => {
  const source = readFileSync(
    new URL("../src/shell/library-scope-client.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /await listDevices\(\)/);
  assert.doesNotMatch(source, /facades\//);
  assert.match(source, /createLocalTask\(device\.device_id, "fs\.list", \{\s*path: absolutePath,/);
  assert.doesNotMatch(source, /"fs\.list", \{\s*\}\)/);
  assert.match(source, /watchLocalTask\(/);
  assert.doesNotMatch(source, /fetch\s*\(/);
  assert.doesNotMatch(source, /setInterval|setTimeout/);

  globalThis.__w6TaskCalls = [];
  globalThis.__w6WatchedTask = "";
  globalThis.__w6TaskUpdate = {
    status: "succeeded",
    resultSummary: {
      files: [{ name: "发票.xlsx", bytes: 8, kind: "sheet" }],
    },
  };
  const adapter = await loadLibraryAdapter();
  const devices = await adapter.listLibraryDevices();
  const view = await mount({
    devices,
    refreshLocalLibrary: adapter.refreshDeviceLocalLibrary,
  });
  try {
    await view.click("公司 Windows");
    await view.setPath("  /已授权/发票  ");
    await view.click("手动刷新");
    await view.flush();
    assert.deepEqual(globalThis.__w6TaskCalls, [
      ["office-windows", "fs.list", { path: "/已授权/发票" }],
    ]);
    assert.equal(globalThis.__w6WatchedTask, "task-fs-list");
    assert.match(view.host.textContent, /发票\.xlsx/);
    assert.equal(
      view.host.querySelector("[data-library-state]").dataset.libraryState,
      "ready",
    );
  } finally {
    await view.close();
  }
  delete globalThis.__w6TaskCalls;
  delete globalThis.__w6WatchedTask;
  delete globalThis.__w6TaskUpdate;
});

test("空 path 与相对 path 在前端拦截，不创建 fs.list 任务", async () => {
  globalThis.__w6TaskCalls = [];
  globalThis.__w6TaskUpdate = { status: "succeeded", resultSummary: { files: [] } };
  const adapter = await loadLibraryAdapter();
  await assert.rejects(
    adapter.refreshDeviceLocalLibrary(office, "   "),
    /请输入这台设备已授权目录的绝对路径/,
  );
  await assert.rejects(
    adapter.refreshDeviceLocalLibrary(office, "桌面/发票"),
    /请输入这台设备已授权目录的绝对路径/,
  );
  assert.deepEqual(globalThis.__w6TaskCalls, []);
  assert.equal(
    adapter.normalizeAbsoluteLibraryPath("C:\\Users\\Ada\\Documents"),
    "C:\\Users\\Ada\\Documents",
  );
  delete globalThis.__w6TaskCalls;
  delete globalThis.__w6TaskUpdate;
});

test("path_outside_grant 在刷新界面显示设备名相关中文文案", async () => {
  globalThis.__w6TaskCalls = [];
  globalThis.__w6WatchedTask = "";
  globalThis.__w6TaskUpdate = {
    status: "denied",
    denyReason: "path_outside_grant",
  };
  const adapter = await loadLibraryAdapter();
  const view = await mount({
    devices: [office],
    refreshLocalLibrary: adapter.refreshDeviceLocalLibrary,
  });
  try {
    await view.click("公司 Windows");
    await view.setPath("/未授权/发票");
    await view.click("手动刷新");
    await view.flush();
    const alert = view.host.querySelector('[role="alert"]');
    assert.ok(alert);
    assert.match(
      alert.textContent,
      /这个路径不在公司 Windows已授权的目录范围内。/,
    );
    assert.doesNotMatch(alert.textContent, /path_outside_grant/);
  } finally {
    await view.close();
  }
  delete globalThis.__w6TaskCalls;
  delete globalThis.__w6WatchedTask;
  delete globalThis.__w6TaskUpdate;
});
