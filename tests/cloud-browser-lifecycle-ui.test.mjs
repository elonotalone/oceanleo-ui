import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { createRoot } from "react-dom/client";
import ts from "typescript";

import {
  cloudBrowserLifecycleIssue,
  cloudBrowserSessionCanHibernate,
  cloudBrowserSessionOpenAction,
  formatCloudBrowserLifecycleError,
} from "../src/shell/cloud-browser-session-data.ts";

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

const dom = new JSDOM("<!doctype html><html><body><main></main></body></html>", {
  pretendToBeVisual: true,
  url: "https://chat.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLFormElement: window.HTMLFormElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
  InputEvent: window.InputEvent,
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

const reactUrl = pathToFileURL(require.resolve("react")).href;
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;
const jsxRuntimeUrl = pathToFileURL(require.resolve("react/jsx-runtime")).href;

function dataModule(source) {
  return `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
}

const browserStubUrl = dataModule(`
  function state() {
    return globalThis.__cloudBrowserLifecycleTest;
  }
  function selected() {
    const current = state();
    return current.sessions.find((item) => item.id === current.selectedId) || null;
  }
  export function createCloudBrowser(...args) {
    const current = state();
    current.calls.create.push(args);
    const created = { ...current.createdSession };
    current.sessions = [
      created,
      ...current.sessions.filter((item) => item.id !== created.id),
    ];
    current.selectedId = created.id;
    return Promise.resolve({ ok: true, data: { session: created } });
  }
  export function createCloudBrowserOperationId() {
    return "operation-lifecycle-ui";
  }
  export function deleteCloudBrowser(sessionId) {
    state().calls.remove.push(sessionId);
    return Promise.resolve({ ok: true });
  }
  export function hibernateCloudBrowser(sessionId, operationId) {
    const current = state();
    current.calls.hibernate.push({ sessionId, operationId });
    const item = selected();
    Object.assign(item, {
      status: "hibernated",
      runtime_state: "absent",
      runtime_id: "",
    });
    return Promise.resolve({ ok: true, data: { status: "hibernated" } });
  }
  export function renameCloudBrowserSession(sessionId, title) {
    const item = state().sessions.find((value) => value.id === sessionId);
    Object.assign(item, { title });
    return Promise.resolve({ ok: true, data: { session: item } });
  }
  export function restoreCloudBrowserCheckpoint() {
    return Promise.resolve({ ok: true });
  }
  export function resumeCloudBrowser(sessionId, options) {
    const current = state();
    current.calls.resume.push({ sessionId, options });
    const item = selected();
    Object.assign(item, {
      status: "active",
      runtime_state: "ready",
      runtime_id: "runtime-resumed",
      incarnation: Math.max(1, item.incarnation || 0),
    });
    return Promise.resolve({ ok: true, data: { status: "active" } });
  }
`);
const uiStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(
      /\\\\{(\\\\w+)\\\\}/g,
      (_, key) => String(vars?.[key] ?? "{" + key + "}"),
    );
  }
`);
const liveStubUrl = dataModule(`
  export const DEFAULT_BROWSER_URL = "https://www.google.com/";
  export function pointInContainedFrame() {
    return null;
  }
  export function redactedDisplayUrl(value) {
    return String(value || "").replace(/[?#].*$/, "");
  }
`);
const controlsStubUrl = dataModule(`
  export function BrowserGlyph() {
    return null;
  }
`);
const workspaceStubUrl = dataModule(`
  export function useOptionalWorkspaceSession() {
    return { taskId: "task-current" };
  }
`);
const interactionStubUrl = dataModule(`
  function noop() {}
  export function useCloudBrowserInteraction() {
    const current = globalThis.__cloudBrowserLifecycleTest;
    return {
      rootRef: current.refs.root,
      viewportRef: current.refs.viewport,
      hiddenInputRef: current.refs.input,
      immersive: false,
      fullscreenMode: "native",
      immersiveControlsVisible: true,
      revealImmersiveControls: noop,
      handleCanvasFocus: noop,
      handlePointerDown: noop,
      handlePointerMove: noop,
      handlePointerUp: noop,
      handleWheel: noop,
      handleHiddenFocus: noop,
      handleHiddenBlur: noop,
      handleHiddenKeyDown: noop,
      handleBeforeInput: noop,
      handleInput: noop,
      handleCompositionStart: noop,
      handleCompositionUpdate: noop,
      handleCompositionEnd: noop,
      handlePaste: noop,
      toggleFullscreen: noop,
    };
  }
`);
const sessionDataStubUrl = dataModule(`
  import { useReducer } from ${JSON.stringify(reactUrl)};

  export function cloudBrowserSessionOpenAction(session) {
    if (!session) return "unavailable";
    const status = String(session.status || "");
    const runtimeState = String(session.runtime_state || "");
    if (
      (status === "active" || status === "warm") &&
      runtimeState === "ready" &&
      session.runtime_id &&
      session.incarnation > 0
    ) return "connect";
    if (
      ["created", "hibernated", "failed"].includes(status) &&
      (!runtimeState || runtimeState === "absent" || runtimeState === "dead")
    ) return "resume";
    return "unavailable";
  }
  export function cloudBrowserSessionCanHibernate(session, transportState) {
    return (
      transportState === "streaming" &&
      cloudBrowserSessionOpenAction(session) === "connect"
    );
  }
  export function cloudBrowserSessionNeedsResume(session) {
    return cloudBrowserSessionOpenAction(session) === "resume";
  }
  export function cloudBrowserLifecycleIssue(result, fallback) {
    const code =
      result?.detail?.code ||
      (typeof result?.error === "string" ? result.error : "");
    return {
      message: code ? fallback + ": " + code : fallback,
      code,
      operation: result?.detail?.operation || "",
      retryable:
        typeof result?.detail?.retryable === "boolean"
          ? result.detail.retryable
          : null,
      retryAfterSeconds: result?.detail?.retry_after_seconds ?? null,
      diagnostics: result?.detail?.diagnostics || {},
      status: result?.status || 0,
    };
  }
  export function formatCloudBrowserLifecycleError(result, fallback) {
    return cloudBrowserLifecycleIssue(result, fallback).message;
  }
  export function useCloudBrowserSessionData() {
    const [, forceRender] = useReducer((value) => value + 1, 0);
    const current = globalThis.__cloudBrowserLifecycleTest;
    const selected =
      current.sessions.find((item) => item.id === current.selectedId) || null;
    return {
      sessions: current.sessions,
      selectedId: current.selectedId,
      selected,
      checkpoints: [],
      checkpointsLoading: false,
      checkpointsError: "",
      deleteArmed: false,
      setDeleteArmed() {},
      async reload() {
        forceRender();
      },
      async refreshCheckpoints() {},
      chooseSession(sessionId) {
        current.selectedId = sessionId;
        forceRender();
      },
      upsertSession(session) {
        current.sessions = [
          session,
          ...current.sessions.filter((item) => item.id !== session.id),
        ];
        current.selectedId = session.id;
        forceRender();
      },
      clearSelection() {
        current.selectedId = "";
        forceRender();
      },
    };
  }
`);
const transportStubUrl = dataModule(`
  function noop() {}
  export function useCloudBrowserTransport(options) {
    const current = globalThis.__cloudBrowserLifecycleTest;
    return {
      protocol: 3,
      capabilities: {
        page_bookmark: false,
        session_checkpoint: false,
        clipboard: true,
        ime_composition: true,
        viewport_resize: false,
      },
      transportState: current.transportState,
      driving: current.driving,
      lease: current.lease,
      controlPending: current.controlPending,
      controlIntentSent: current.controlIntentSent,
      hasCanvasFrame: current.hasCanvasFrame,
      failureKind: null,
      canvasRef: current.refs.canvas,
      frameSizeRef: current.refs.frame,
      sendMutation: noop,
      async openLive(sessionId) {
        current.calls.open.push(sessionId);
        options.setLiveRequested(true);
        return true;
      },
      stopLive() {
        current.calls.stop += 1;
        options.setLiveRequested(false);
      },
      toggleControl: noop,
      cancelTakeover() {
        return true;
      },
      bookmarkCurrentPage() {
        return false;
      },
      createCheckpoint() {
        return false;
      },
    };
  }
`);

async function compileComponent(relativePath, additional = {}) {
  const sourcePath = resolve(relativePath);
  let source = await readFile(sourcePath, "utf8");
  for (const [specifier, replacement] of Object.entries({
    react: reactUrl,
    "react-dom": reactDomUrl,
    "../lib/browser": browserStubUrl,
    "../i18n/ui/useUI": uiStubUrl,
    "./cloud-browser-live": liveStubUrl,
    "./cloud-browser-session-data": sessionDataStubUrl,
    ...additional,
  })) {
    source = source.replaceAll(
      JSON.stringify(specifier),
      JSON.stringify(replacement),
    );
  }
  const compiled = ts
    .transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.ReactJSX,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.ES2022,
      },
      fileName: sourcePath,
    })
    .outputText.replaceAll(
      'from "react/jsx-runtime";',
      `from ${JSON.stringify(jsxRuntimeUrl)};`,
    );
  return dataModule(compiled);
}

const historyModuleUrl = await compileComponent(
  "src/shell/cloud-browser-history-view.tsx",
);
const chromeModuleUrl = await compileComponent(
  "src/shell/cloud-browser-chrome.tsx",
  {
    "./cloud-browser-history-view": historyModuleUrl,
    "./cloud-browser-transport-actions": pathToFileURL(
      resolve("src/shell/cloud-browser-transport-actions.ts"),
    ).href,
  },
);
const { CloudBrowserChrome } = await import(chromeModuleUrl);
const panelModuleUrl = await compileComponent(
  "src/shell/CloudBrowserPanel.tsx",
  {
    "./cloud-browser-chrome": chromeModuleUrl,
    "./cloud-browser-controls": controlsStubUrl,
    "./cloud-browser-interaction": interactionStubUrl,
    "./cloud-browser-transport": transportStubUrl,
    "./WorkspaceSession": workspaceStubUrl,
  },
);
const {
  BrowserPowerPrompt,
  CloudBrowserPanel,
} = await import(panelModuleUrl);

function browserSession(overrides = {}) {
  return {
    id: "session-active",
    session_version: 12,
    runtime_id: "runtime-active",
    incarnation: 3,
    protocol_version: 3,
    runtime_state: "ready",
    status: "active",
    task_id: "task-current",
    title: "Research",
    title_source: "user",
    created_at: "2026-07-23T00:00:00.000Z",
    ...overrides,
  };
}

function testState(sessions, selectedId = sessions[0]?.id || "") {
  return {
    sessions,
    selectedId,
    createdSession: browserSession({
      id: "session-new",
      task_id: null,
      title: "New browser",
    }),
    calls: {
      create: [],
      resume: [],
      hibernate: [],
      remove: [],
      open: [],
      stop: 0,
    },
    transportState: "streaming",
    driving: false,
    lease: {
      leaseId: "agent-lease",
      epoch: 4,
      holderKind: "agent",
      connectionId: "agent-connection",
    },
    controlPending: false,
    controlIntentSent: false,
    hasCanvasFrame: true,
    refs: {
      root: { current: null },
      viewport: { current: null },
      input: { current: null },
      canvas: { current: null },
      frame: { current: { width: 1280, height: 800 } },
    },
  };
}

async function mountPanel(state) {
  document.body.innerHTML = "<main></main>";
  globalThis.__cloudBrowserLifecycleTest = state;
  const container = document.querySelector("main");
  const root = createRoot(container);
  await act(async () => {
    root.render(
      React.createElement(CloudBrowserPanel, {
        taskId: "task-current",
      }),
    );
  });
  return {
    container,
    root,
    async unmount() {
      await act(async () => root.unmount());
      delete globalThis.__cloudBrowserLifecycleTest;
    },
  };
}

async function click(element) {
  assert.ok(element, "expected a clickable element");
  await act(async () => {
    element.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    await Promise.resolve();
  });
}

test("empty launch state offers only explicit new and history choices", async () => {
  const state = testState([]);
  const mounted = await mountPanel(state);
  try {
    const prompt = mounted.container.querySelector(
      "[data-cloud-browser-launch-prompt]",
    );
    assert.ok(prompt);
    assert.equal(
      prompt.querySelector("[data-cloud-browser-new]").textContent.trim(),
      "新建",
    );
    assert.equal(
      prompt
        .querySelector("[data-cloud-browser-open-history]")
        .textContent.trim(),
      "从历史中打开",
    );
    assert.doesNotMatch(prompt.textContent, /开机/);

    await click(prompt.querySelector("[data-cloud-browser-open-history]"));
    const dialog = document.body.querySelector(
      "[data-cloud-browser-checkpoints]",
    );
    assert.ok(dialog);
    assert.ok(dialog.querySelector("[data-cloud-browser-session-empty]"));
    assert.ok(dialog.querySelector("[data-cloud-browser-no-session-selected]"));

    await click(dialog.querySelector("[data-cloud-browser-history-close]"));
    await click(
      mounted.container.querySelector("[data-cloud-browser-new]"),
    );
    assert.deepEqual(state.calls.create, [["https://www.google.com/"]]);
    assert.deepEqual(state.calls.open, ["session-new"]);
  } finally {
    await mounted.unmount();
  }
});

test("structured lifecycle errors keep busy, configuration, and repository failures distinct", async () => {
  const busy = cloudBrowserLifecycleIssue(
    {
      status: 503,
      detail: {
        code: "EXECUTOR_BUSY",
        operation: "session_create",
        retryable: true,
        retry_after_seconds: 5,
        diagnostics: {
          component: "browser_executor",
          scope: "global",
          tier: "browser",
          state: "busy",
          live_nodes: 2,
          eligible_nodes: 2,
          capacity: 4,
          free_slots: 0,
          private_host: "executor.internal",
        },
      },
      headers: { "Retry-After": "5" },
    },
    "start failed",
  );
  assert.equal(
    busy.message,
    "start failed: EXECUTOR_BUSY · Retry-After 5s",
  );
  assert.equal(busy.operation, "session_create");
  assert.equal(busy.retryable, true);
  assert.equal(busy.retryAfterSeconds, 5);
  assert.equal(busy.diagnostics.free_slots, 0);
  assert.equal("private_host" in busy.diagnostics, false);

  assert.equal(
    formatCloudBrowserLifecycleError(
      { error: "HTTP 503", status: 503 },
      "start failed",
    ),
    "start failed: BROWSER_SERVICE_UNAVAILABLE",
  );
  assert.equal(
    formatCloudBrowserLifecycleError(
      { error: "BROWSER_NOT_CONFIGURED", status: 503 },
      "start failed",
    ),
    "start failed: BROWSER_NOT_CONFIGURED",
  );
  assert.equal(
    formatCloudBrowserLifecycleError(
      { error: "EXECUTOR_ORIGIN_REJECTED", status: 503 },
      "start failed",
    ),
    "start failed: EXECUTOR_ORIGIN_REJECTED",
  );
  assert.equal(
    cloudBrowserLifecycleIssue(
      {
        status: 502,
        detail: {
          code: "BROWSER_SESSION_LIST_UNAVAILABLE",
          operation: "session_list",
          retryable: true,
        },
      },
      "list failed",
    ).code,
    "BROWSER_SESSION_LIST_UNAVAILABLE",
  );
  assert.equal(
    cloudBrowserLifecycleIssue(
      {
        status: 502,
        detail: {
          code: "BROWSER_SESSION_CREATE_CONTRACT_INVALID",
          operation: "session_create",
          retryable: false,
        },
      },
      "create failed",
    ).code,
    "BROWSER_SESSION_CREATE_CONTRACT_INVALID",
  );

  document.body.innerHTML = "<main></main>";
  const container = document.querySelector("main");
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(
        React.createElement(BrowserPowerPrompt, {
          accent: "#4f46e5",
          busy: false,
          error: busy.message,
          historyLabel: "从历史中打开",
          lifecycleIssue: busy,
          newLabel: "新建",
          notice: "",
          onHistory() {},
          onNew() {},
        }),
      );
    });
    const alert = container.querySelector(
      "[data-cloud-browser-lifecycle-error]",
    );
    assert.equal(alert.dataset.cloudBrowserLifecycleCode, "EXECUTOR_BUSY");
    assert.equal(
      alert.dataset.cloudBrowserLifecycleOperation,
      "session_create",
    );
    assert.equal(alert.dataset.cloudBrowserLifecycleRetryable, "true");
    assert.equal(alert.dataset.cloudBrowserLifecycleRetryAfter, "5");
    assert.match(alert.textContent, /free_slots=0/);
    assert.doesNotMatch(alert.textContent, /executor\.internal/);
  } finally {
    await act(async () => root.unmount());
  }
});

test("history selection explicitly resumes the selected hibernated session", async () => {
  const active = browserSession();
  const hibernated = browserSession({
    id: "session-hibernated",
    status: "hibernated",
    runtime_state: "absent",
    runtime_id: "",
    incarnation: 8,
    title: "Saved checkout",
  });
  const state = testState([active, hibernated], active.id);
  const mounted = await mountPanel(state);
  try {
    await click(
      mounted.container.querySelector("[data-cloud-browser-open-history]"),
    );
    await click(
      document.body.querySelector(
        '[data-cloud-browser-session-option="session-hibernated"]',
      ),
    );
    const open = document.body.querySelector(
      "[data-cloud-browser-open-session]",
    );
    assert.equal(open.dataset.cloudBrowserSessionAction, "resume");
    assert.equal(open.disabled, false);
    assert.equal(open.textContent.trim(), "恢复");

    await click(open);
    assert.equal(state.calls.resume.length, 1);
    assert.equal(state.calls.resume[0].sessionId, hibernated.id);
    assert.deepEqual(state.calls.open, [hibernated.id]);
  } finally {
    await mounted.unmount();
  }
});

test("session owner can hibernate a healthy stream while only viewing", async () => {
  const active = browserSession();
  const state = testState([active]);
  const mounted = await mountPanel(state);
  try {
    await click(
      mounted.container.querySelector("[data-cloud-browser-open-history]"),
    );
    await click(
      document.body.querySelector("[data-cloud-browser-open-session]"),
    );
    const row = mounted.container.querySelector(
      "[data-cloud-browser-session-row]",
    );
    assert.equal(
      row.querySelector("[data-cloud-browser-live-state]")
        .dataset.cloudBrowserControlState,
      "agent-controlled",
    );
    assert.match(row.textContent, /Agent 正在控制/);
    const hibernate = row.querySelector("[data-cloud-browser-hibernate]");
    assert.equal(state.driving, false);
    assert.equal(hibernate.disabled, false);

    await click(hibernate);
    assert.deepEqual(state.calls.hibernate, [
      {
        sessionId: active.id,
        operationId: "operation-lifecycle-ui",
      },
    ]);
    assert.equal(state.calls.stop, 1);
    assert.match(
      mounted.container.querySelector(
        "[data-cloud-browser-lifecycle-notice]",
      ).textContent,
      /休眠/,
    );
  } finally {
    await mounted.unmount();
  }
});

test("invalid lifecycle and control states stay disabled and explicit", async () => {
  const restoring = browserSession({
    status: "restoring",
    runtime_state: "allocating",
  });
  assert.equal(cloudBrowserSessionOpenAction(restoring), "unavailable");
  assert.equal(
    cloudBrowserSessionCanHibernate(restoring, "streaming"),
    false,
  );

  const state = testState([restoring]);
  const mounted = await mountPanel(state);
  try {
    await click(
      mounted.container.querySelector("[data-cloud-browser-open-history]"),
    );
    const open = document.body.querySelector(
      "[data-cloud-browser-open-session]",
    );
    assert.equal(open.dataset.cloudBrowserSessionAction, "unavailable");
    assert.equal(open.disabled, true);
  } finally {
    await mounted.unmount();
  }

  document.body.innerHTML = "<main></main>";
  const container = document.querySelector("main");
  const root = createRoot(container);
  const baseProps = {
    accent: "#4f46e5",
    sessions: [browserSession()],
    selected: browserSession(),
    selectedId: "session-active",
    selectedOpenAction: "connect",
    transportState: "streaming",
    liveRequested: true,
    driving: false,
    lease: { leaseId: "", epoch: 4, holderKind: "free" },
    controlPending: false,
    controlIntentSent: false,
    hasCanvasFrame: true,
    busy: false,
    canBookmark: false,
    canCreateCheckpoint: false,
    canHibernate: false,
    deleteArmed: false,
    immersive: false,
    immersiveControlsVisible: true,
    checkpointsOpen: false,
    checkpoints: [],
    checkpointsLoading: false,
    checkpointsError: "",
    showPowerButton: true,
    onChooseSession() {},
    async onRenameSession() {
      return { ok: true };
    },
    onOpenOrResume() {},
    onStartNew() {},
    onHibernate() {},
    onDelete() {},
    onToggleControl() {},
    onCancelControl() {
      return true;
    },
    onBookmarkCurrentPage() {},
    onToggleCheckpoints() {},
    onCreateCheckpoint() {
      return false;
    },
    async onRestoreCheckpoint() {
      return { ok: true };
    },
    onToggleFullscreen() {},
  };
  try {
    await act(async () => {
      root.render(React.createElement(CloudBrowserChrome, baseProps));
    });
    let status = container.querySelector(
      "[data-cloud-browser-live-state]",
    );
    assert.equal(status.dataset.cloudBrowserControlState, "viewing");
    assert.match(status.textContent, /只读/);
    assert.match(
      container.querySelector("[data-cloud-browser-control]").textContent,
      /接管控制/,
    );
    assert.equal(
      container.querySelector("[data-cloud-browser-hibernate]").disabled,
      true,
    );

    await act(async () => {
      root.render(
        React.createElement(CloudBrowserChrome, {
          ...baseProps,
          lease: {
            leaseId: "agent-lease",
            epoch: 4,
            holderKind: "agent",
          },
          controlPending: true,
          controlIntentSent: true,
        }),
      );
    });
    status = container.querySelector("[data-cloud-browser-live-state]");
    assert.equal(status.dataset.cloudBrowserControlState, "pending");
    assert.match(status.textContent, /控制请求处理中/);
    assert.match(
      container.querySelector("[data-cloud-browser-control]").textContent,
      /交还 Agent/,
    );

    await act(async () => {
      root.render(
        React.createElement(CloudBrowserChrome, {
          ...baseProps,
          driving: true,
          lease: {
            leaseId: "human-lease",
            epoch: 5,
            holderKind: "human",
            connectionId: "connection-current",
          },
        }),
      );
    });
    status = container.querySelector("[data-cloud-browser-live-state]");
    assert.equal(status.dataset.cloudBrowserControlState, "driving");
    assert.match(status.textContent, /你正在控制/);

    await act(async () => {
      root.render(
        React.createElement(CloudBrowserChrome, {
          ...baseProps,
          lease: {
            leaseId: "other-human",
            epoch: 6,
            holderKind: "human",
            connectionId: "connection-other",
          },
        }),
      );
    });
    assert.equal(
      container.querySelector("[data-cloud-browser-control]").disabled,
      true,
    );
  } finally {
    await act(async () => root.unmount());
  }
});
