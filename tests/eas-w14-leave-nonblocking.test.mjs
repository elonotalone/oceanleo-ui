// W14：点「←」立刻离开；未保存修订交给后台继续写，失败可重试，恢复快照保住内容。
// 今天的代码会红：卸载 dispose 掉控制器、离开要等/弹框、beforeunload 只看 editorDirty。

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import React, { act } from "react";

import { useAdvancedAutoSave } from "../src/shell/use-advanced-autosave.ts";
import { resetBackgroundSaverForTests } from "../src/shell/advanced-background-saver.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELL_SRC = resolve(HERE, "../src/shell/InlineAdvancedWorkbenchShell.tsx");
const PARTS_SRC = resolve(HERE, "../src/shell/inline-advanced-shell-parts.tsx");

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
  url: "https://excel.oceanleo.com/advanced/spreadsheet_editing",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function mount(element) {
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

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DEBOUNCE_SETTLE_MS = 2_000;

const ITEM = {
  key: "artifact:w14-sheet",
  source: "artifact",
  id: "w14-sheet-1",
  title: "w14-sheet",
  kind: "sheet",
  siteId: "excel",
  favorite: false,
  meta: { root_asset_id: "root-w14-sheet" },
  artifactId: "artifact-w14",
};

function createSession(recordCalls) {
  return {
    sessionId: "session-w14",
    taskId: null,
    snapshot: () => ({}),
    ensure: async () => null,
    navigate: () => {},
    startNew: async () => null,
    renameTitle: async () => true,
    recordSavedItem: async (item) => {
      recordCalls.push(item);
      return true;
    },
    registerFlush: () => {},
  };
}

function Probe({ bed, initial }) {
  const [input, setInput] = React.useState(initial);
  bed.setInput = setInput;
  bed.hook = useAdvancedAutoSave({
    key: input.key ?? ITEM.key,
    dirty: input.dirty,
    revision: input.revision,
    flush: bed.flush,
    session: bed.session,
  });
  return React.createElement(
    "button",
    {
      type: "button",
      "data-w14-back": true,
      onClick: () => {
        bed.leaveTicks.push(Date.now());
        bed.hook.handOffToBackground();
        bed.setOpen(false);
      },
    },
    "back",
  );
}

function LeaveHost({ bed, initial }) {
  const [open, setOpen] = React.useState(true);
  bed.setOpen = setOpen;
  if (!open) return null;
  return React.createElement(Probe, { bed, initial });
}

function createBed({ flushDelayMs = 0, failTimes = 0 } = {}) {
  const bed = {
    flushCalls: [],
    recordCalls: [],
    leaveTicks: [],
    inflight: 0,
    maxInflight: 0,
    failTimes,
    flushDelayMs,
    hook: null,
    setInput: null,
    setOpen: null,
  };
  bed.session = createSession(bed.recordCalls);
  bed.flush = async () => {
    bed.inflight += 1;
    bed.maxInflight = Math.max(bed.maxInflight, bed.inflight);
    const seq = bed.flushCalls.length + 1;
    bed.flushCalls.push({ seq, at: Date.now() });
    try {
      if (bed.flushDelayMs) await sleep(bed.flushDelayMs);
      if (bed.failTimes > 0) {
        bed.failTimes -= 1;
        return { ok: false, error: "w14-flush-failed" };
      }
      return { ok: true, item: { ...ITEM, revisionId: `rev-${seq}` } };
    } finally {
      bed.inflight -= 1;
    }
  };
  return bed;
}

test("离开路径不再等待、不再弹确认框", () => {
  const shell = readFileSync(SHELL_SRC, "utf8");
  const parts = readFileSync(PARTS_SRC, "utf8");
  assert.doesNotMatch(
    shell,
    /flushAdvancedWorkBeforeLeave|useLeaveGate|confirmLeave|askingLeave|ConfirmDialog/,
    "壳里不得再走等待冲刷或确认离开",
  );
  assert.doesNotMatch(parts, /export function useLeaveGate/);
  assert.match(shell, /handOffToBackground/);
  assert.doesNotMatch(
    shell,
    /showClose[\s\S]*onClose=\{requestClose\}|onClose=\{requestClose\}/,
  );
});

test("保存进行中点返回：同一拍卸载，没有对话框，卸载后那份修订仍被写入", async () => {
  resetBackgroundSaverForTests();
  const bed = createBed({ flushDelayMs: 80 });
  const tree = await mount(
    React.createElement(LeaveHost, {
      bed,
      initial: { dirty: true, revision: 4, key: ITEM.key },
    }),
  );
  const started = Date.now();
  await act(async () => {
    tree.container.querySelector("[data-w14-back]").click();
  });
  assert.equal(tree.container.querySelector("[data-w14-back]"), null);
  assert.equal(tree.container.querySelector("[role=dialog]"), null);
  assert.ok(
    Date.now() - started < 1_600,
    `离开不得等到自动保存防抖，实际 ${Date.now() - started}ms`,
  );
  await act(async () => {
    await sleep(DEBOUNCE_SETTLE_MS + 200);
  });
  assert.ok(
    bed.flushCalls.length >= 1,
    `卸载后待保存修订必须仍被写入，实际 ${bed.flushCalls.length} 次`,
  );
  assert.ok(bed.recordCalls.length >= 1);
  await tree.unmount();
});

test("最终失败出提示，点重试会再写一次", async () => {
  const {
    failedBackgroundSaveCount,
    handOff,
    hasPendingOrFailed,
    retry,
    snapshotBackgroundSaves,
  } = await import("../src/shell/advanced-background-saver.ts");
  const { AdvancedPersistenceController } = await import(
    "../src/shell/advanced-persistence-controller.ts"
  );
  resetBackgroundSaverForTests();
  const writes = [];
  let fail = true;
  const controller = new AdvancedPersistenceController({
    debounceMs: 0,
    maxRetries: 0,
    flushRevision: async (revision) => {
      writes.push(revision);
      if (fail) return { ok: false, error: "w14-final-fail" };
      return { ok: true, item: ITEM };
    },
    recordSavedItem: async () => true,
  });
  controller.observe({ revision: 1, dirty: true });
  handOff(ITEM.key, controller);
  await act(async () => {
    await sleep(50);
  });
  assert.equal(hasPendingOrFailed(), true);
  assert.ok(failedBackgroundSaveCount() >= 1);
  assert.ok(snapshotBackgroundSaves().some((job) => job.status === "failed"));
  fail = false;
  await retry(ITEM.key);
  await act(async () => {
    await sleep(50);
  });
  assert.ok(writes.length >= 2, "点重试必须再写一次");
  assert.equal(hasPendingOrFailed(), false);
  resetBackgroundSaverForTests();
});

test("失败后重开同一素材：内容从恢复快照回来，且不会两个控制器并发写", async () => {
  resetBackgroundSaverForTests();
  globalThis.__w14RecoveryStore = new Map();
  const storeStub = dataModule(`
    export function advancedRecoveryKey(editorId, item) {
      return editorId + ":" + item.key;
    }
    export async function writeAdvancedRecovery(record) {
      globalThis.__w14RecoveryStore.set(record.key, record);
    }
    export async function readAdvancedRecovery(key) {
      return globalThis.__w14RecoveryStore.get(key) || null;
    }
    export async function deleteAdvancedRecovery(key) {
      globalThis.__w14RecoveryStore.delete(key);
    }
  `);
  const { useAdvancedRecovery } = await import(
    await compileModule("src/shell/use-advanced-recovery.ts", {
      "./advanced-recovery-store": storeStub,
    })
  );
  const bed = createBed({ failTimes: 99, flushDelayMs: 20 });
  const restored = [];
  function Recoverable({ startDoc, startDirty, startRevision }) {
    const [doc, setDoc] = React.useState(startDoc);
    const [dirty, setDirty] = React.useState(startDirty);
    const [revision, setRevision] = React.useState(startRevision);
    const autoSave = useAdvancedAutoSave({
      key: ITEM.key,
      dirty,
      revision,
      flush: bed.flush,
      session: bed.session,
    });
    useAdvancedRecovery({
      editorId: "grid",
      revision,
      dirty,
      persistenceState: autoSave.state,
      recovery: {
        key: `grid:${ITEM.key}`,
        ready: true,
        capture: () => doc,
        restore: (payload) => {
          restored.push(payload);
          setDoc(payload);
          setDirty(true);
          setRevision((value) => value + 1);
          return true;
        },
      },
    });
    return React.createElement(
      "button",
      {
        type: "button",
        "data-w14-back": true,
        onClick: () => {
          autoSave.handOffToBackground();
          bed.setOpen?.(false);
        },
      },
      "back",
    );
  }
  function Host({ startDoc, startDirty, startRevision }) {
    const [open, setOpen] = React.useState(true);
    bed.setOpen = setOpen;
    if (!open) return null;
    return React.createElement(Recoverable, {
      startDoc,
      startDirty,
      startRevision,
    });
  }
  const tree = await mount(
    React.createElement(Host, {
      startDoc: { text: "kept-w14" },
      startDirty: true,
      startRevision: 1,
    }),
  );
  await act(async () => {
    await sleep(600);
  });
  await act(async () => {
    tree.container.querySelector("[data-w14-back]").click();
  });
  await act(async () => {
    await sleep(80);
  });
  await tree.unmount();
  const tree2 = await mount(
    React.createElement(Host, {
      startDoc: { text: "" },
      startDirty: false,
      startRevision: 0,
    }),
  );
  await act(async () => {
    await sleep(80);
  });
  assert.equal(
    bed.maxInflight,
    1,
    `同一素材不得两个控制器并发写，maxInflight=${bed.maxInflight}`,
  );
  assert.deepEqual(restored.at(-1), { text: "kept-w14" });
  await tree2.unmount();
  resetBackgroundSaverForTests();
});

test("beforeunload 只在有待保存或后台失败时挂", async () => {
  const { hasPendingOrFailed, shouldWarnBeforeUnload } = await import(
    "../src/shell/advanced-background-saver.ts"
  );
  resetBackgroundSaverForTests();
  assert.equal(shouldWarnBeforeUnload(false), false);
  assert.equal(shouldWarnBeforeUnload(true), true);
  assert.equal(hasPendingOrFailed(), false);
});

test("网站类适配器关闭自动保存时点返回立即离开、不弹框、不接手保存", async () => {
  const { leaveAdvancedWorkbench, hasPendingOrFailed } = await import(
    "../src/shell/advanced-background-saver.ts"
  );
  resetBackgroundSaverForTests();
  let closed = false;
  let handed = false;
  leaveAdvancedWorkbench({
    autoSaveEnabled: false,
    handOff: () => {
      handed = true;
    },
    closeDetail: () => {},
    onClose: () => {
      closed = true;
    },
  });
  assert.equal(closed, true);
  assert.equal(handed, false);
  assert.equal(hasPendingOrFailed(), false);
});
