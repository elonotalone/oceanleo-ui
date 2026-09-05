// 操作台生成：点「生成」不算产出，第一份产物落地才建档。
//
// 用户侧的标准（2026-09-05）：输入了内容、AI 还没生成就中止 —— 不进「我的任务」；
// AI 生成了内容 —— 进「我的任务」。这份测试钉的是 useConsoleRun 那条链：
//   begin 只 attach（createConsoleRun 的 session_id 为 null）；
//   finish 带 artifact 才 output，并把新建会话回绑到这条运行；
//   begin → fail 全程不 POST /v1/agent/sessions。
//
// 真挂 hook 跑，不靠源码正则冒充行为。装台照抄 pdf-workbench-hook-runtime。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

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
  url: "https://word.oceanleo.com/workspace",
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

const SESSIONS_URL = "/v1/agent/sessions";
const OUTPUT_SESSION_ID = "sess-output-1";

const sessionCreates = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = String(typeof input === "string" ? input : input?.url || "");
  const method = String(init.method || "GET").toUpperCase();
  if (url.includes(SESSIONS_URL) && method === "POST") {
    sessionCreates.push({ url, method });
    return new Response(JSON.stringify({ id: OUTPUT_SESSION_ID }), {
      status: 201,
      headers: { "content-type": "application/json" },
    });
  }
  if (typeof originalFetch === "function") return originalFetch(input, init);
  return new Response("{}", { status: 200 });
};

globalThis.__consoleRunHarness = {
  create: [],
  update: [],
  workspace: null,
};

const { useConsoleRun } = await import(
  await compileModule("src/shell/useConsoleRun.ts", {
    "../lib/agent": dataModule(`
      export function createConsoleRun(body) {
        const harness = globalThis.__consoleRunHarness;
        harness.create.push({
          ...body,
          session_id: body.sessionId || null,
        });
        return Promise.resolve({
          ok: true,
          data: {
            task_id: "run-1",
            status: "running",
            session_id: body.sessionId || null,
          },
        });
      }
      export function updateConsoleRun(taskId, body) {
        const harness = globalThis.__consoleRunHarness;
        harness.update.push({
          taskId,
          ...body,
          session_id: body.sessionId || null,
        });
        return Promise.resolve({ ok: true, data: { task_id: taskId, ok: true } });
      }
    `),
    "./WorkspaceSession": dataModule(`
      export function useOptionalWorkspaceSession() {
        return globalThis.__consoleRunHarness.workspace;
      }
    `),
  })
);

function makeWorkspace() {
  const saveCalls = [];
  const workspace = {
    siteId: "word",
    appId: "word.write",
    readOnly: false,
    availability: "ready",
    session: null,
    sessionId: "",
    saveCalls,
    async saveSnapshot(state, version, options) {
      saveCalls.push({ state, version, options });
      if (options?.intent === "output") {
        await fetch(SESSIONS_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: options.title || "" }),
        });
        const session = { id: OUTPUT_SESSION_ID };
        workspace.session = session;
        workspace.sessionId = session.id;
        return { ok: true, session };
      }
      return { ok: true, deferred: true };
    },
    async artifactContext() {
      return null;
    },
  };
  return workspace;
}

function resetHarness() {
  sessionCreates.length = 0;
  const harness = globalThis.__consoleRunHarness;
  harness.create = [];
  harness.update = [];
  harness.workspace = makeWorkspace();
  return harness;
}

function RunHost({ apiRef }) {
  const api = useConsoleRun({
    siteId: "word",
    agentId: "word.write",
  });
  apiRef.current = api;
  return null;
}

async function withRun(fn) {
  const harness = resetHarness();
  const apiRef = { current: null };
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(RunHost, { apiRef }));
  });
  try {
    await fn(apiRef.current, harness);
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
}

const beginArgs = {
  prompt: "一份大纲",
  appId: "word.write",
  opsState: { topic: "一份大纲" },
};

test("begin 只 attach，createConsoleRun 的 session_id 为 null", async () => {
  await withRun(async (run, harness) => {
    let taskId = "";
    await act(async () => {
      taskId = await run.begin(beginArgs);
    });
    assert.equal(taskId, "run-1");
    assert.equal(harness.create.length, 1);
    assert.equal(harness.create[0].session_id, null);
    const beginSaves = harness.workspace.saveCalls.filter(
      (call) => call.options?.intent,
    );
    assert.ok(beginSaves.length >= 1);
    assert.equal(beginSaves[0].options.intent, "attach");
  });
});

test("finish 带 artifact 时 saveSnapshot 的 intent 是 output", async () => {
  await withRun(async (run, harness) => {
    let taskId = "";
    await act(async () => {
      taskId = await run.begin(beginArgs);
    });
    harness.workspace.saveCalls.length = 0;
    await act(async () => {
      await run.finish(taskId, {
        opsState: { topic: "一份大纲" },
        artifact: {
          type: "doc",
          title: "一份大纲",
          format: "markdown",
          content: "正文",
        },
      });
    });
    assert.equal(harness.workspace.saveCalls.length, 1);
    assert.equal(harness.workspace.saveCalls[0].options.intent, "output");
  });
});

test("finish 只带 opsState 时 saveSnapshot 的 intent 是 attach", async () => {
  await withRun(async (run, harness) => {
    let taskId = "";
    await act(async () => {
      taskId = await run.begin(beginArgs);
    });
    harness.workspace.saveCalls.length = 0;
    await act(async () => {
      await run.finish(taskId, { opsState: { topic: "一份大纲" } });
    });
    assert.equal(harness.workspace.saveCalls.length, 1);
    assert.equal(harness.workspace.saveCalls[0].options.intent, "attach");
  });
});

test("begin → fail 全程不 POST /v1/agent/sessions", async () => {
  await withRun(async (run) => {
    let taskId = "";
    await act(async () => {
      taskId = await run.begin(beginArgs);
    });
    await act(async () => {
      await run.fail(taskId);
    });
    assert.equal(sessionCreates.length, 0);
    assert.ok(
      sessionCreates.every((call) => call.method !== "POST"),
    );
  });
});

test("begin → finish(带 artifact) 建一次会话并回绑 session_id", async () => {
  await withRun(async (run, harness) => {
    let taskId = "";
    await act(async () => {
      taskId = await run.begin(beginArgs);
    });
    await act(async () => {
      await run.finish(taskId, {
        opsState: { topic: "一份大纲" },
        artifact: {
          type: "doc",
          title: "一份大纲",
          format: "markdown",
          content: "正文",
        },
      });
    });
    assert.equal(sessionCreates.length, 1);
    assert.equal(sessionCreates[0].method, "POST");
    assert.match(sessionCreates[0].url, /\/v1\/agent\/sessions/);
    const finishUpdate = harness.update.find((call) => call.status === "done");
    assert.ok(finishUpdate);
    assert.equal(finishUpdate.session_id, OUTPUT_SESSION_ID);
    assert.equal(finishUpdate.sessionId, OUTPUT_SESSION_ID);
  });
});

const agentChatSource = await readFile(
  new URL("../src/shell/AgentChat.tsx", import.meta.url),
  "utf8",
);
const workbenchSource = await readFile(
  new URL("../src/shell/AdvancedContentWorkbench.tsx", import.meta.url),
  "utf8",
);

test("AgentChat 发送只 attach，首条 assistant 才 output", () => {
  assert.match(
    agentChatSource,
    /startNew\(\{[\s\S]*?intent: "attach"/,
  );
  assert.match(
    agentChatSource,
    /ensureActive\(\{[\s\S]*?intent: "attach"/,
  );
  assert.match(
    agentChatSource,
    /message\.role === "assistant"[\s\S]*?ensureActive\(\{[\s\S]*?intent: "output"/,
  );
  assert.doesNotMatch(
    agentChatSource,
    /无法创建工作会话，请稍后重试/,
  );
});

test("AdvancedContentWorkbench：打开/ensure/改名只 attach，保存素材才 output", () => {
  assert.doesNotMatch(workbenchSource, /firstUseEnsuredRef/);
  assert.doesNotMatch(workbenchSource, /void ensure\(null\)/);
  assert.match(
    workbenchSource,
    /const ensure = useCallback\([\s\S]*?intent: "attach"[\s\S]*?intent: "attach"/,
  );
  assert.match(
    workbenchSource,
    /const recordSavedItem = useCallback\([\s\S]*?intent: "output"[\s\S]*?intent: "output"/,
  );
  assert.match(
    workbenchSource,
    /const renameTitle = useCallback\([\s\S]*?intent: "attach"/,
  );
  assert.match(
    workbenchSource,
    /workspace\.startNew\(\{[\s\S]*?intent: "attach"/,
  );
  assert.equal(
    [...workbenchSource.matchAll(/intent: "output"/g)].length,
    2,
  );
  assert.equal(
    [...workbenchSource.matchAll(/intent: "attach"/g)].length,
    4,
  );
});

globalThis.React = React;
globalThis.__workbenchHarness = {
  workspace: null,
  sessionActions: null,
};

function routeStub(exportName) {
  return dataModule(`
    export function ${exportName}() {
      return globalThis.React.createElement("div", { "data-workbench-editor": ${JSON.stringify(exportName)} });
    }
  `);
}

function makeWorkbenchWorkspace() {
  const ensureCalls = [];
  const workspace = {
    session: null,
    sessionId: null,
    taskId: null,
    siteId: "word",
    appId: "advanced:doc",
    availability: "ready",
    readOnly: false,
    mode: "workspace",
    error: null,
    ensureCalls,
    async ensureActive(options) {
      ensureCalls.push(options || {});
      if (options?.intent === "output") {
        await fetch(SESSIONS_URL, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title: options.title || "" }),
        });
        const session = {
          id: OUTPUT_SESSION_ID,
          snapshot: options.snapshot || {},
          schema_version: options.schemaVersion || 2,
          title: options.title || "",
        };
        workspace.session = session;
        workspace.sessionId = session.id;
        return session;
      }
      return workspace.session;
    },
    async bindTask() {
      return workspace.session;
    },
    async saveSnapshot() {
      return { ok: true, session: workspace.session };
    },
    async startNew() {
      return null;
    },
  };
  return workspace;
}

const workbenchStubs = {
  "next/dynamic": dataModule(`
    export default function dynamic() {
      return function StubRoute() {
        return globalThis.React.createElement("div", { "data-workbench-editor": "stub" });
      };
    }
  `),
  "next/navigation": dataModule(`
    export function useRouter(){ return { replace(){}, push(){}, prefetch(){} }; }
    export function useSearchParams(){ return new URLSearchParams(); }
    export function usePathname(){ return "/advanced/doc"; }
  `),
  "../lib/lazy-with-retry": dataModule(`
    export function chunkRetryLoader(_id, load){ return load; }
    export function withChunkRetry(_id, Comp){ return Comp; }
  `),
  "../lib/telemetry/errors": dataModule(`
    export function reportAutosaveError(){}
  `),
  "./WorkspaceSession": dataModule(`
    export function WorkspaceSessionProvider({ children }){ return children; }
    export function useOptionalWorkspaceSession(){
      return globalThis.__workbenchHarness.workspace;
    }
    export function useWorkspaceSession(){
      return globalThis.__workbenchHarness.workspace;
    }
  `),
  "./advanced-session-context": dataModule(`
    export const AdvancedSessionContext = {
      Provider({ value, children }) {
        globalThis.__workbenchHarness.sessionActions = value;
        return children;
      },
    };
    export function useAdvancedSession(){
      return globalThis.__workbenchHarness.sessionActions;
    }
  `),
  "./workbench-material-provider": dataModule(`
    export function WorkbenchMaterialProvider({ children }){ return children; }
  `),
  "./AdvancedWorkbenchStage": dataModule(`
    export function AdvancedWorkbenchBlankStage(){ return null; }
  `),
  "./WorkbenchErrorBoundary": dataModule(`
    export function WorkbenchErrorBoundary({ children }){ return children; }
  `),
  "./advanced-routes/WorkbenchRouteLoading": dataModule(`
    export function WorkbenchRouteLoading(){ return null; }
    export function WorkbenchRouteChunkError(){ return null; }
  `),
  "./advanced-routes/UnsupportedRoute": routeStub("UnsupportedRoute"),
  "./advanced-routes/VideoTimelineRoute": routeStub("VideoTimelineRoute"),
  "./advanced-routes/AudioRoute": routeStub("AudioRoute"),
  "./advanced-routes/ImageRoute": routeStub("ImageRoute"),
  "./advanced-routes/PdfRoute": routeStub("PdfRoute"),
  "./advanced-routes/Model3DRoute": routeStub("Model3DRoute"),
  "./advanced-routes/RichDocRoute": routeStub("RichDocRoute"),
  "./advanced-routes/GridRoute": routeStub("GridRoute"),
  "./advanced-routes/DeckRoute": routeStub("DeckRoute"),
  "./advanced-routes/EmbeddedRoute": routeStub("EmbeddedRoute"),
  "./advanced-routes/ChartRoute": routeStub("ChartRoute"),
  "./advanced-routes/GameRoute": routeStub("GameRoute"),
  "./advanced-routes/VideoCanvasRoute": routeStub("VideoCanvasRoute"),
};

let workbenchModule = null;
async function loadWorkbench() {
  if (!workbenchModule) {
    workbenchModule = await import(
      await compileModule(
        "src/shell/AdvancedContentWorkbench.tsx",
        workbenchStubs,
      )
    );
  }
  return workbenchModule;
}

const savedDocItem = {
  key: "doc-1",
  source: "artifact",
  id: "doc-1",
  title: "未保存文档",
  kind: "document",
  siteId: "word",
  favorite: false,
  url: "https://asset.oceanleo.com/doc/gate.md",
  meta: { advanced_editor_route: "richdoc" },
};

async function mountAdvancedWorkbench() {
  sessionCreates.length = 0;
  const workspace = makeWorkbenchWorkspace();
  globalThis.__workbenchHarness = {
    workspace,
    sessionActions: null,
  };
  const { AdvancedContentWorkbench } = await loadWorkbench();
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(AdvancedContentWorkbench, {
        item: savedDocItem,
        siteId: "word",
      }),
    );
  });
  await act(async () => {});
  return {
    workspace,
    get sessionActions() {
      return globalThis.__workbenchHarness.sessionActions;
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

test("高级工作台挂载 ready 后不 POST /v1/agent/sessions", async () => {
  const mounted = await mountAdvancedWorkbench();
  try {
    assert.equal(sessionCreates.length, 0);
    assert.equal(mounted.workspace.ensureCalls.length, 0);
    assert.equal(mounted.workspace.session, null);
  } finally {
    await mounted.unmount();
  }
});

test("recordSavedItem 落一份素材后建档一次", async () => {
  const mounted = await mountAdvancedWorkbench();
  try {
    assert.ok(mounted.sessionActions);
    let recorded = false;
    await act(async () => {
      recorded = await mounted.sessionActions.recordSavedItem({
        ...savedDocItem,
        id: "doc-saved",
        title: "已保存文档",
      });
    });
    assert.equal(recorded, true);
    assert.equal(sessionCreates.length, 1);
    assert.equal(sessionCreates[0].method, "POST");
    assert.match(sessionCreates[0].url, /\/v1\/agent\/sessions/);
    assert.equal(
      mounted.workspace.ensureCalls.filter((call) => call.intent === "output")
        .length,
      1,
    );
  } finally {
    await mounted.unmount();
  }
});
