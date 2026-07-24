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
  const pane = source("../src/shell/workbench-embed.tsx");
  assert.match(route, /recovery:\s*\{/);
  assert.match(route, /advancedRecoveryKey\(embeddedAdapterId, item\)/);
  assert.match(route, /capture: captureEmbeddedRecovery/);
  assert.match(route, /restore: restoreEmbeddedRecovery/);
  assert.match(route, /recoveryGenerationRef\.current \+= 1/);
  assert.match(
    route,
    /handleRecoveryResult[\s\S]*?recoverySnapshotRef\.current = snapshot[\s\S]*?setDirty\(true\)/,
  );
  assert.match(route, /restoreEmbeddedRecovery[\s\S]*?return promise/);
  assert.match(route, /restored\.resolve\(true\)/);
  assert.match(
    route,
    /hostedMediaType !== "website" \|\| embeddedRecoveryReady/,
  );
  assert.match(
    route,
    /if \(hasRemoteRevision\) setEmbeddedRecoveryReady\(true\)[\s\S]*if \(!nextDirty\)/,
    "a clean website session must unlock recovery after publishing its revision",
  );
  assert.match(
    pane,
    /if \(phase !== "ready" \|\| !recoveryRestore\) return/,
    "restore may queue before handshake but cannot cross the iframe ready gate",
  );
});

test("editor issues preserve legacy fatal behavior and validate optional severity", () => {
  const warning = childRoundTrip({
    type: "error",
    message: "Preview is reconnecting",
    severity: "warning",
    code: "EDITOR_RECONNECTING",
    retryable: true,
  });
  assert.equal(warning?.severity, "warning");
  assert.equal(warning?.code, "EDITOR_RECONNECTING");
  assert.equal(warning?.retryable, true);
  assert.equal(
    childRoundTrip({
      type: "error",
      message: "Legacy fatal error",
    })?.type,
    "error",
    "v1 children without severity remain compatible",
  );
  assert.equal(
    childRoundTrip({
      type: "error",
      message: "Unknown severity",
      severity: "destructive",
    }),
    null,
  );
  assert.equal(
    childRoundTrip({
      type: "recovery-result",
      recoveryId: "restore-failed",
      ok: false,
      message: "stale source",
      code: "WEBSITE_RECOVERY_STALE_SOURCE",
      severity: "fatal",
    })?.code,
    "WEBSITE_RECOVERY_STALE_SOURCE",
  );

  const messages = source("../src/shell/use-embed-editor-messages.ts");
  const pane = source("../src/shell/workbench-embed.tsx");
  assert.match(messages, /message\.severity \|\| "fatal"/);
  assert.match(pane, /status\.severity === "fatal" \? "alert" : "status"/);
  assert.match(pane, /aria-live=\{status\.severity === "fatal"/);
  assert.match(pane, /status\.retryable \? 8_000 : 5_000/);
  assert.match(pane, /data-editor-status-severity/);
  assert.doesNotMatch(
    pane,
    /status && phase === "ready"[\s\S]{0,120}className="[^"]*bg-red-700/,
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
  const typedSave = {
    type: "artifact-updated",
    url: "https://api.oceanleo.com/v1/media/file/design-preview.png",
    previewUrl: "https://api.oceanleo.com/v1/media/file/design-preview.png",
    saveId: "save-design-8",
    revision: 8,
    meta: {
      artifact_id: "artifact-design",
      expected_artifact_revision_id: "revision-design-7",
      artifact_type: "composite_image",
      editor_project_url:
        "https://api.oceanleo.com/v1/media/file/design-project.json",
      design_document_url:
        "https://api.oceanleo.com/v1/media/file/design-project.json",
      editor_project_schema: "oceanleo.design-document.v1",
      source_format: "oceanleo.design-document.v1",
      design_document_revision: 8,
      preview_revision: 8,
      preview_static_frame: "final",
      requires_typed_artifact_commit: true,
    },
  };
  assert.equal(childRoundTrip(typedSave)?.type, "artifact-updated");
  assert.equal(
    childRoundTrip({
      ...typedSave,
      meta: { ...typedSave.meta, expected_artifact_revision_id: "" },
    }),
    null,
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

test("design composite handshake binds one scene source revision before open", () => {
  const route = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  const validator = source("../src/shell/design-composite-commit.ts");
  const host =
    source("../src/shell/workbench-embed.tsx") +
    source("../src/shell/use-embed-editor-messages.ts");

  assert.match(route, /item\.artifactType === "composite_image"/);
  assert.match(route, /source\.revisionId !== item\.revisionId/);
  assert.match(route, /item\.artifact\.sourceFormat !== DESIGN_SOURCE_FORMAT/);
  assert.match(route, /item\.artifact\.scene\.closureStatus !== "complete"/);
  assert.match(route, /refreshArtifactRendition/);
  assert.match(
    route,
    /verifyDesignCompositeSource\(\s*item,\s*binding,\s*abort\.signal,\s*\)/,
  );
  assert.match(route, /evidence\.sourceDigest !== normalizedDigest\(rendition\.digest\)/);
  assert.match(route, /validateDesignCompositeSource\(blob, item/);
  assert.match(validator, /design dependency closure 缺少图层资源/);
  assert.match(validator, /manifest\?\.schema !== DESIGN_DEPENDENCY_SCHEMA/);
  assert.match(
    route,
    /evidence\.closureDigest !== normalizedDigest\(item\.artifact\.scene\.closureDigest\)/,
  );
  assert.match(
    route,
    /normalizedDigest\(refreshed\.digest\) !== normalizedDigest\(source\.digest\)/,
  );
  assert.match(route, /url: undefined,[\s\S]*previewUrl: undefined/);
  assert.match(route, /design_document_url: source\.url/);
  assert.match(route, /source_digest: source\.digest/);
  assert.match(route, /source_handshake_id: designSourceBinding\.handshakeId/);
  assert.match(
    route,
    /source_project_revision: designSourceBinding\.evidence\.revision/,
  );
  assert.match(route, /dependency_closure_digest: scene\?\.closureDigest/);
  assert.match(route, /requires_typed_artifact_commit: true/);
  assert.match(route, /data-design-handshake=/);
  assert.match(route, /DESIGN_SOURCE_ACK_TYPE = "design-source-ack"/);
  assert.match(route, /event\.source !== frame\.contentWindow/);
  assert.match(route, /data\.instanceId !== frameInstanceId/);
  assert.match(route, /data\.artifactRevisionId !== item\.revisionId/);
  assert.match(route, /design-handshake-receipt-mismatch/);
  assert.match(route, /design-handshake-timeout/);
  assert.match(route, /designHandshakeReady/);
  assert.match(
    host,
    /message\.type === "ready"[\s\S]*?readyHandledRef\.current[\s\S]*?sendOpenAsset\(\)/,
  );
  assert.match(host, /event\.source !== iframeRef\.current\?\.contentWindow/);
  assert.match(host, /event\.origin !== editorOrigin/);
  assert.match(host, /typedCommitQueueRef\.current\.then/);
  assert.match(host, /artifactHeadRef\.current = committed/);
  assert.match(host, /artifactId: outcome\.artifactId/);
  assert.match(host, /revisionId: outcome\.revisionId/);
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
  assert.match(host, /status\.severity === "fatal" \? "alert" : "status"/);
});
