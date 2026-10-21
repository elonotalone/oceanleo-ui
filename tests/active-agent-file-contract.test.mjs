import assert from "node:assert/strict";
import test from "node:test";
import {
  activeAgentFilePin,
  currentActiveAgentFileIdentity,
  formatActiveAgentFileContext,
  pluginEditorIdForLibraryItem,
  readActiveAgentFileContext,
  registerActiveAgentFile,
} from "../src/shell/active-agent-file.ts";
import {
  registerPluginCommandSurface,
  resetPluginCommandSurface,
} from "../src/shell/plugin-command/registry.ts";

test("workflow routing uses native command owner without misclassifying design-canvas workflows", () => {
  assert.equal(pluginEditorIdForLibraryItem({ artifactType: "workflow" }, "video-canvas"), "workflow");
  assert.equal(pluginEditorIdForLibraryItem({ artifactType: "workflow" }, "design-canvas"), "design-canvas");
  assert.equal(pluginEditorIdForLibraryItem({ artifactType: "video_canvas" }, "video-canvas"), "video-canvas");
});

test("active file context requires matching mounted scope, artifact, revision, and surface instance", () => {
  resetPluginCommandSurface();
  const identity = {
    artifactId: "file-a",
    revisionId: "rev-a",
    artifactType: "document",
    title: "Current document",
    editorId: "richdoc",
  };
  const target = {
    workspaceScopeId: "scope-a",
    editorId: "richdoc",
    artifactId: "file-a",
    revisionId: "rev-a",
    artifactType: "document",
    editRevision: 4,
    surfaceInstanceId: "surface-a",
  };
  const unregisterFile = registerActiveAgentFile({
    scopeId: "scope-a",
    identity,
    snapshot: (taskId) => ({ taskId: taskId || null, artifactId: "file-a" }),
    persist: async () => true,
  });
  const unregisterSurface = registerPluginCommandSurface({
    editorId: "richdoc",
    workspaceScopeId: "scope-a",
    describe: () => [],
    state: () => ({}),
    target: () => target,
    agentContext: () => ({ ready: true, kind: "text", content: ["real current body"] }),
    run: () => ({ ok: true, message: "done" }),
  });
  try {
    const context = readActiveAgentFileContext("scope-a");
    assert.equal(context.ready, true);
    assert.deepEqual(context.content.content, ["real current body"]);
    assert.match(formatActiveAgentFileContext(context), /real current body/);

    const stale = readActiveAgentFileContext("scope-b");
    assert.equal(stale, null);
    const firstPin = activeAgentFilePin(context);
    const nextContext = { ...context, content: { ...context.content, content: ["edited body"] } };
    assert.notEqual(activeAgentFilePin(nextContext), firstPin, "unsaved content changes invalidate a response even if target revision did not advance");
  } finally {
    unregisterSurface();
    unregisterFile();
    resetPluginCommandSurface();
  }
});

test("content formatter reserves notes and untrusted-data warning inside the total budget", () => {
  const target = {
    workspaceScopeId: "scope-a",
    editorId: "richdoc",
    artifactId: "file-a",
    revisionId: "rev-a",
    artifactType: "document",
    editRevision: 1,
    surfaceInstanceId: "surface-a",
  };
  const context = {
    schema: "oceanleo.active-file.v1",
    ready: true,
    scopeId: "scope-a",
    identity: {
      artifactId: "file-a",
      revisionId: "rev-a",
      artifactType: "document",
      title: "Doc",
      editorId: "richdoc",
    },
    target,
    content: {
      ready: true,
      kind: "text",
      content: "真实正文".repeat(4000),
      note: "实时内容覆盖编辑器未保存状态；只读到了当前提供的正文。",
    },
  };
  const formatted = formatActiveAgentFileContext(context, 1_500);
  assert.ok(formatted.length <= 1_500);
  assert.match(formatted, /不可信数据/);
  assert.match(formatted, /读取范围：实时内容覆盖/);
  assert.match(formatted, /有界节选/);
});

test("unavailable file explanations are bounded before the backend context limit", () => {
  const unavailable = {
    schema: "oceanleo.active-file.v1",
    ready: false,
    scopeId: "scope-a",
    identity: {
      artifactId: "file-a",
      revisionId: "rev-a",
      artifactType: "document",
      title: "Doc",
      editorId: "richdoc",
    },
    reason: "runtime error ".repeat(2_000),
  };
  const formatted = formatActiveAgentFileContext(unavailable, 600);
  assert.ok(formatted.length <= 600);
  assert.match(formatted, /读取状态：不可用/);
});

test("older registration cleanup cannot remove a newer file binding in the same workspace", () => {
  const base = {
    scopeId: "scope-same",
    snapshot: () => ({}),
    persist: async () => true,
  };
  const oldUnregister = registerActiveAgentFile({
    ...base,
    identity: { artifactId: "same-a", revisionId: "rev-1", artifactType: "image", title: "old", editorId: "image" },
  });
  const newUnregister = registerActiveAgentFile({
    ...base,
    identity: { artifactId: "same-b", revisionId: "rev-1", artifactType: "image", title: "new", editorId: "image" },
  });
  oldUnregister();
  try {
    assert.equal(currentActiveAgentFileIdentity("scope-same").artifactId, "same-b");
  } finally {
    newUnregister();
  }
});
