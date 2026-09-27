// P3：同一素材一条 flush。切模式先切，失败只进云朵；关闭立刻离开。
//
// 跑法：
//   node --test --import ./tests/helpers/assert-dom-guard.mjs \
//     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
//     tests/p3-pipeline.test.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import React, { act } from "react";

import { bindAdvancedDraftGate } from "../src/shell/advanced-draft-gates.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SHELL_SRC = resolve(HERE, "../src/shell/InlineAdvancedWorkbenchShell.tsx");

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
  url: "https://ppt.oceanleo.com/",
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

const handoff = await import(
  await compileModule("src/shell/advanced-routes/editor-handoff.ts", {
    "../office-editor/useOfficeArtifactSource": dataModule(
      "export function useOfficeArtifactSource() { return {}; }",
    ),
  }),
);

const { useAdvancedAutoSave } = await import(
  "../src/shell/use-advanced-autosave.ts"
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

const ITEM = {
  key: "artifact:p3-sheet",
  source: "artifact",
  id: "p3-sheet-1",
  title: "p3-sheet",
  kind: "sheet",
  siteId: "excel",
  favorite: false,
  meta: { root_asset_id: "root-p3-sheet" },
  artifactId: "artifact-p3",
};

test("saveBeforeLeavePro 只踢同一条 draft gate，失败也立刻放行，不再跑第二遍 binder", async () => {
  handoff.resetEditorHandoffForTests();
  let gateCalls = 0;
  let binderCalls = 0;
  let release;
  const unbindGate = bindAdvancedDraftGate("p3-one-flush", () => {
    gateCalls += 1;
    return new Promise((resolve) => {
      release = () => resolve({ ok: false, error: "offline" });
    });
  });
  const unbindBinder = handoff.bindProFaceHandoff("p3-one-flush", {
    hasUnsavedChanges: () => true,
    flush: async () => {
      binderCalls += 1;
      return false;
    },
  });
  try {
    let done = false;
    const leaving = handoff.saveBeforeLeavePro("p3-one-flush").then((ok) => {
      done = true;
      return ok;
    });
    await Promise.resolve();
    assert.equal(done, true, "切模式不得等 flush 回来");
    assert.equal(await leaving, true);
    assert.equal(gateCalls, 1);
    assert.equal(binderCalls, 0, "有 draft gate 时不许再走专业面第二条 flush");
    release();
    await sleep(0);
    assert.equal(binderCalls, 0);
  } finally {
    unbindGate();
    unbindBinder();
    handoff.resetEditorHandoffForTests();
  }
});

test("没有 draft gate 时 saveBeforeLeavePro 仍踢 binder flush，返回值不锁人", async () => {
  handoff.resetEditorHandoffForTests();
  let calls = 0;
  let finish;
  const unbind = handoff.bindProFaceHandoff("p3-binder-only", {
    hasUnsavedChanges: () => true,
    flush: () => {
      calls += 1;
      return new Promise((resolve) => {
        finish = () => resolve(false);
      });
    },
  });
  try {
    const leaving = handoff.saveBeforeLeavePro("p3-binder-only");
    assert.equal(await leaving, true);
    assert.equal(calls, 1);
    finish();
    await sleep(0);
    assert.equal(await handoff.saveBeforeLeavePro("p3-binder-only"), true);
  } finally {
    unbind();
    handoff.resetEditorHandoffForTests();
  }
});

test("flush 失败时云朵进入 error，切模式返回值仍是 true", async () => {
  const bed = {
    flushCalls: 0,
    hook: null,
    setInput: null,
  };
  bed.session = {
    sessionId: "session-p3",
    taskId: null,
    snapshot: () => ({}),
    ensure: async () => null,
    navigate: () => {},
    startNew: async () => null,
    renameTitle: async () => true,
    recordSavedItem: async () => true,
    registerFlush: () => {},
  };
  bed.flush = async () => {
    bed.flushCalls += 1;
    return { ok: false, error: "p3-flush-failed", status: 503 };
  };
  function Probe() {
    const [input, setInput] = React.useState({ dirty: true, revision: 1 });
    bed.setInput = setInput;
    bed.hook = useAdvancedAutoSave({
      key: ITEM.key,
      dirty: input.dirty,
      revision: input.revision,
      flush: bed.flush,
      session: bed.session,
    });
    return null;
  }
  const tree = await mount(React.createElement(Probe));
  try {
    await act(async () => {
      for (let i = 0; i < 4 && bed.hook.state !== "error"; i += 1) {
        const saved = await bed.hook.flushLatest();
        assert.equal(saved.ok, false);
      }
    });
    assert.equal(bed.hook.state, "error");
    assert.ok(bed.hook.errorMessage, "云朵必须带失败人话");
    const unbind = bindAdvancedDraftGate(ITEM.key, () => bed.hook.flushLatest());
    try {
      assert.equal(await handoff.saveBeforeLeavePro(ITEM.key), true);
    } finally {
      unbind();
    }
    await act(async () => {
      await sleep(0);
    });
    assert.equal(bed.hook.state, "error");
    assert.ok(bed.flushCalls >= 1);
  } finally {
    await tree.unmount();
  }
});

test("壳：关闭立刻 leaveAdvancedWorkbench；confirmation 只接重试；不再传 onSaveNow", () => {
  const shell = readFileSync(SHELL_SRC, "utf8");
  assert.match(shell, /leaveAdvancedWorkbench\(/);
  assert.doesNotMatch(shell, /onSaveNow\s*=/);
  assert.doesNotMatch(shell, /const saveNow\s*=/);
  const closeFn = shell.slice(
    shell.indexOf("const requestClose"),
    shell.indexOf("useEffect(() => {\n    const revision = adapter.closeRequestRevision"),
  );
  assert.match(closeFn, /leaveAdvancedWorkbench/);
  assert.doesNotMatch(closeFn, /confirmation/);
  assert.doesNotMatch(closeFn, /flushForExplicitSave|flushLatest|await /);
  assert.match(
    shell,
    /onRetrySave=\{\(\) => void \(adapter\.persistence\?\.confirmation \? flushForExplicitSave\(\) : autoSave\.retry\(\)\)\}/,
  );
  assert.match(
    shell,
    /confirmation 只影响显式重试/,
  );
});
