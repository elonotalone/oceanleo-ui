import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  asEditorToHostMessage,
  asHostToEditorMessage,
  EDITOR_PROTOCOL,
  isEditorRecoverySnapshot,
  isTrustedEditorOrigin,
} from "../src/shell/editor-protocol.ts";

const instanceId = "embedded-v8-round-trip";
const envelope = (message) => ({
  protocol: EDITOR_PROTOCOL,
  instanceId,
  ...message,
});
const childRoundTrip = (message) =>
  asEditorToHostMessage(
    JSON.parse(JSON.stringify(envelope(message))),
    instanceId,
  );
const hostRoundTrip = (message) =>
  asHostToEditorMessage(
    JSON.parse(JSON.stringify(envelope(message))),
    instanceId,
  );
const source = (path) =>
  readFileSync(new URL(path, import.meta.url), "utf8");

test("history changes round-trip and embedded undo/redo consume child truth", () => {
  const history = childRoundTrip({
    type: "history-changed",
    history: { canUndo: true, canRedo: false, revision: 7 },
  });
  assert.equal(history?.type, "history-changed");
  assert.deepEqual(history?.history, {
    canUndo: true,
    canRedo: false,
    revision: 7,
  });
  assert.deepEqual(
    childRoundTrip({
      type: "history-changed",
      reason: "preview-mutation",
      history: {
        base_revision_id: "cloud-r4",
        draft_change_count: 3,
        undo_depth: 3,
        redo_depth: 1,
        history_version: 8,
      },
      headVersion: 4,
    })?.history,
    { canUndo: true, canRedo: true, revision: 8 },
  );
  assert.deepEqual(
    childRoundTrip({
      type: "history-changed",
      canUndo: false,
      canRedo: true,
      revision: "design-r12",
    })?.history,
    { canUndo: false, canRedo: true, revision: "design-r12" },
  );
  assert.equal(
    childRoundTrip({
      type: "history-changed",
      history: { canUndo: "yes", canRedo: false },
    }),
    null,
  );

  const route = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  const host =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/use-embed-editor-messages.ts");
  assert.match(host, /message\.type === "history-changed"/);
  assert.match(route, /canUndo: remoteHistoryState\.canUndo/);
  assert.match(route, /canRedo: remoteHistoryState\.canRedo/);
  assert.doesNotMatch(route, /canUndo:\s*true[\s\S]{0,80}canRedo:\s*true/);
});

test("tools and six project views are validated and commandable both ways", () => {
  const tools = childRoundTrip({
    type: "tools-manifest",
    revision: 4,
    tools: [
      {
        id: "design-shapes",
        label: "形状",
        icon: "elements",
        controlId: "insert-shape",
        choices: [
          { value: "rect", label: "矩形" },
          { value: "circle", label: "圆形" },
        ],
      },
    ],
  });
  assert.equal(tools?.type, "tools-manifest");
  assert.equal(tools?.tools[0]?.controlId, "insert-shape");

  const views = [
    ["preview", "Preview", "pages"],
    ["code", "Code", "file"],
    ["dashboard", "Dashboard", "tasks"],
    ["database", "Database", "library"],
    ["storage", "File storage", "uploads"],
    ["settings", "Settings", "settings"],
  ].map(([id, label, icon], index) => ({
    id,
    label,
    icon,
    active: index === 0,
  }));
  const manifest = childRoundTrip({
    type: "project-manifest",
    manifest: {
      revision: "project-r9",
      views,
      actions: [
        {
          id: "publish",
          label: "Publish",
          icon: "save",
          disabled: true,
        },
      ],
    },
  });
  assert.equal(manifest?.type, "project-manifest");
  assert.equal(manifest?.manifest.views.length, 6);
  assert.equal(
    hostRoundTrip({
      type: "project-view",
      requestId: "view-1",
      viewId: "code",
      manifestRevision: "project-r9",
    })?.type,
    "project-view",
  );
  assert.equal(
    hostRoundTrip({
      type: "project-action",
      requestId: "action-1",
      actionId: "publish",
      manifestRevision: "project-r9",
    })?.type,
    "project-action",
  );
  assert.equal(
    childRoundTrip({
      type: "project-result",
      requestId: "view-1",
      manifestRevision: "project-r9",
      ok: false,
      message: "project revision changed",
    })?.type,
    "project-result",
  );
  assert.equal(
    childRoundTrip({
      type: "project-manifest",
      manifest: {
        revision: 9,
        views: views.map((view) => ({ ...view, active: true })),
        actions: [],
      },
    }),
    null,
    "multiple active views must fail closed",
  );

  const route = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  const host =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/use-embed-editor-messages.ts");
  assert.match(route, /EMBEDDED_TOOLS_MANIFEST/);
  assert.match(route, /value: "tablet", label: "平板"/);
  assert.match(route, /remoteSelectionRevision/);
  assert.doesNotMatch(route, /selection\.id === "design-canvas"/);
  assert.match(route, /projectManifest\.views\.map/);
  assert.match(host, /onProtocolReset\?\.\(\)/);
  assert.doesNotMatch(route, /nativeChrome:\s*\{\s*toolbar:\s*true/);
});

test("recovery capture and restore preserve a real unconfirmed revision", () => {
  const snapshot = {
    revision: 12,
    confirmedRevision: 10,
    payload: {
      document: { id: "poster-1", layers: [{ id: "layer-1", x: 42 }] },
      historyCursor: 2,
    },
  };
  assert.equal(isEditorRecoverySnapshot(snapshot), true);
  assert.equal(
    hostRoundTrip({
      type: "recovery-capture",
      recoveryId: "capture-12",
    })?.type,
    "recovery-capture",
  );
  assert.equal(
    childRoundTrip({
      type: "recovery-snapshot",
      recoveryId: "capture-12",
      ok: true,
      snapshot,
    })?.type,
    "recovery-snapshot",
  );
  assert.deepEqual(
    hostRoundTrip({
      type: "recovery-restore",
      recoveryId: "restore-12",
      snapshot,
    })?.snapshot,
    snapshot,
  );
  assert.equal(
    childRoundTrip({
      type: "recovery-result",
      recoveryId: "restore-12",
      ok: true,
      revision: 12,
    })?.type,
    "recovery-result",
  );
  assert.equal(
    childRoundTrip({
      type: "recovery-snapshot",
      recoveryId: "capture-12",
      ok: true,
      snapshot: { ...snapshot, revision: -1 },
    }),
    null,
  );
  assert.equal(
    isEditorRecoverySnapshot({
      ...snapshot,
      revision: 9,
      confirmedRevision: 10,
    }),
    false,
  );

  const route = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.match(route, /recovery:\s*\{/);
  assert.match(route, /advancedRecoveryKey\(embeddedAdapterId, item\)/);
  assert.match(route, /capture: captureEmbeddedRecovery/);
  assert.match(route, /restore: restoreEmbeddedRecovery/);
  assert.match(route, /recoveryGenerationRef\.current \+= 1/);
  assert.match(
    route,
    /handleRecoveryResult[\s\S]*?recoverySnapshotRef\.current = snapshot[\s\S]*?setDirty\(true\)/,
  );
});

test("protocol remains fail-closed and save/export/dispose carry idempotency keys", () => {
  assert.equal(isTrustedEditorOrigin("https://website.oceanleo.com"), true);
  assert.equal(
    isTrustedEditorOrigin("https://website.oceanleo.com.evil.test"),
    false,
  );
  assert.equal(
    isTrustedEditorOrigin("https://website.oceanleo.com:444"),
    false,
  );
  assert.equal(
    asEditorToHostMessage(
      {
        ...envelope({
          type: "history-changed",
          history: { canUndo: false, canRedo: false },
        }),
        protocol: "oceanleo.editor.v999",
      },
      instanceId,
    ),
    null,
  );
  assert.equal(
    asEditorToHostMessage(
      envelope({
        type: "history-changed",
        history: { canUndo: false, canRedo: false },
      }),
      "another-instance",
    ),
    null,
  );
  assert.equal(
    hostRoundTrip({ type: "dispose" }),
    null,
    "dispose without a stable id is not accepted",
  );
  assert.equal(
    hostRoundTrip({ type: "dispose", disposeId: "dispose-1" })?.type,
    "dispose",
  );
  assert.equal(
    hostRoundTrip({ type: "save-request", saveId: "save-1" })?.saveId,
    "save-1",
  );
  assert.equal(
    hostRoundTrip({
      type: "export-request",
      exportId: "export-1",
      format: "default",
    })?.exportId,
    "export-1",
  );

  const host =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/use-embed-editor-messages.ts");
  const route = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.match(host, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(host, /event\.origin !== editorOrigin/);
  assert.match(host, /sentSaveRequestsRef/);
  assert.match(host, /sentExportRequestsRef/);
  assert.match(host, /disposeId/);
  assert.match(host, /artifactSaveOperationsRef/);
  assert.match(route, /return savePromiseRef\.current/);
  assert.match(route, /return exportResolverRef\.current\.promise/);
});

test("selection and project failures become host-visible errors", () => {
  const host =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/use-embed-editor-messages.ts");
  assert.match(
    host,
    /message\.type === "selection-result"[\s\S]*?!message\.ok[\s\S]*?setStatus/,
  );
  assert.match(
    host,
    /message\.type === "project-result"[\s\S]*?!message\.ok[\s\S]*?setStatus/,
  );
  assert.match(
    host,
    /latestProjectManifestRevisionRef\.current[\s\S]*?staleMessage[\s\S]*?onProjectResult/,
  );
  assert.match(host, /role="alert"/);
});
