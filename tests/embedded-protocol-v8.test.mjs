import assert from "node:assert/strict";
import test from "node:test";

import {
  asEditorToHostMessage,
  asHostToEditorMessage,
  EDITOR_PROTOCOL,
  isEditorRecoverySnapshot,
  isTrustedEditorOrigin,
} from "../src/shell/editor-protocol.ts";
import {
  classifyProjectManifest,
  projectActionGroup,
} from "../src/shell/editor-protocol-validation.mjs";

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
});

test("manifest role/placement split pages.aux from document actions; first row has no project-view buttons", () => {
  const classified = classifyProjectManifest({
    revision: "project-r9",
    views: [
      { id: "preview", label: "编辑", role: "artifact", active: true, icon: "pages" },
      { id: "code", label: "Code", role: "page", active: false, icon: "file" },
      { id: "database", label: "Database", role: "page", active: false, icon: "library" },
      { id: "dashboard", label: "Dashboard", role: "page", active: false, icon: "tasks" },
    ],
    actions: [
      { id: "reload", label: "重新加载", placement: "document" },
      { id: "apply", label: "套用" },
      { id: "zip", label: "下载 ZIP", placement: "download" },
    ],
  });
  assert.deepEqual(
    classified.auxViews.map((view) => view.id),
    ["code", "database", "dashboard"],
  );
  assert.equal(classified.artifactViewId, "preview");
  assert.equal(classified.activePageId, "artifact");
  assert.deepEqual(
    classified.documentActions.map((action) => action.id),
    ["reload", "apply"],
  );
  assert.deepEqual(
    classified.downloadActions.map((action) => action.id),
    ["zip"],
  );
  assert.equal(
    classifyProjectManifest({
      revision: 1,
      views: [
        { id: "code", label: "Code", active: true },
        { id: "preview", label: "编辑", role: "artifact", active: false },
      ],
      actions: [],
    }).activePageId,
    "code",
  );

  const accepted = childRoundTrip({
    type: "project-manifest",
    manifest: {
      revision: "project-r9",
      views: [
        {
          id: "preview",
          label: "编辑",
          icon: "pages",
          active: true,
          role: "artifact",
        },
        { id: "code", label: "Code", icon: "file", active: false, role: "page" },
      ],
      actions: [
        { id: "reload", label: "重新加载", placement: "document" },
        { id: "zip", label: "下载 ZIP", placement: "download" },
      ],
    },
  });
  assert.equal(accepted?.type, "project-manifest");
  assert.equal(accepted?.manifest.views[0].role, "artifact");
  assert.equal(accepted?.manifest.actions[1].placement, "download");
});

// 规范 v2 §4（plugin-chrome X3）：manifest 动作按 `group` 三分——edit 进编辑栏、
// save 进第一行保存菜单、download 进第一行下载菜单。宿主只看 group / placement，
// 不按 label / id 猜；不写 group 时由 placement 推（download → download，其余 → edit）。
test("manifest action.group splits edit / save / download; save never reaches the edit bar", () => {
  const classified = classifyProjectManifest({
    revision: "project-r10",
    views: [
      { id: "preview", label: "编辑", role: "artifact", active: true },
      { id: "code", label: "Code", role: "page", active: false },
    ],
    actions: [
      { id: "device-mobile", label: "手机", group: "edit" },
      { id: "device-desktop", label: "桌面" },
      { id: "apply", label: "套用草稿", group: "save" },
      { id: "save", label: "保存", group: "save", placement: "document" },
      { id: "discard", label: "放弃草稿", group: "save" },
      { id: "reload", label: "重新加载", group: "save" },
      { id: "zip", label: "下载 ZIP", placement: "download" },
      { id: "png", label: "下载截图", group: "download" },
    ],
  });
  assert.deepEqual(
    classified.documentActions.map((action) => action.id),
    ["device-mobile", "device-desktop"],
  );
  assert.deepEqual(
    classified.saveActions.map((action) => action.id),
    ["apply", "save", "discard", "reload"],
  );
  assert.deepEqual(
    classified.downloadActions.map((action) => action.id),
    ["zip", "png"],
  );
  assert.equal(projectActionGroup({ group: "save", placement: "download" }), "save");
  assert.equal(projectActionGroup({ placement: "download" }), "download");
  assert.equal(projectActionGroup({}), "edit");
  assert.equal(projectActionGroup(undefined), "edit");

  // 合法 group 原样透传；非法 group 整条 manifest 丢掉。
  const accepted = childRoundTrip({
    type: "project-manifest",
    manifest: {
      revision: "project-r10",
      views: [{ id: "preview", label: "编辑", role: "artifact", active: true }],
      actions: [
        { id: "apply", label: "套用草稿", group: "save" },
        { id: "device-mobile", label: "手机", group: "edit" },
      ],
    },
  });
  assert.equal(accepted?.type, "project-manifest");
  assert.equal(accepted?.manifest.actions[0].group, "save");
  assert.equal(accepted?.manifest.actions[1].group, "edit");
  const errors = [];
  const originalError = console.error;
  console.error = (...args) => errors.push(args.map(String).join(" "));
  try {
    assert.equal(
      childRoundTrip({
        type: "project-manifest",
        manifest: {
          revision: "project-r10",
          views: [{ id: "preview", label: "编辑", active: true }],
          actions: [{ id: "publish", label: "Publish", group: "header" }],
        },
      }),
      null,
    );
  } finally {
    console.error = originalError;
  }
  assert.ok(errors.some((line) => line.includes("invalid action.group")));
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
});
