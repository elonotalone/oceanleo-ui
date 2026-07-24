import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  asEditorToHostMessage,
  asHostToEditorMessage,
  EDITOR_PROTOCOL,
} from "../src/shell/editor-protocol.ts";
import { imageFitScales } from "../src/shell/image-editor/fabric-geometry.ts";
import {
  clampFloatingToolbar,
  sameFloatingToolbarPoint,
} from "../src/shell/floating-toolbar-geometry.ts";
import {
  partitionSelectionControls,
  SELECTION_TOOLBAR_VIEWPORT_MAX,
} from "../src/shell/selection-toolbar-layout.ts";
import {
  beginWorkbenchMaterialDrag,
  canPerformWorkbenchMaterial,
  endWorkbenchMaterialDrag,
  getWorkbenchMaterialRuntimeSnapshot,
  materialScopeKey,
  performWorkbenchMaterial,
  registerWorkbenchMaterialAdapter,
} from "../src/shell/workbench-material-registry.ts";
import { editorCapabilityFor } from "../src/shell/workbench-routes.ts";

function source(path) {
  return readFileSync(new URL(path, import.meta.url), "utf8");
}

function fileItem(filename, mime = "") {
  return {
    key: `file:${filename}`,
    source: "artifact",
    id: filename,
    title: filename,
    kind: "file",
    siteId: "excel",
    url: `https://asset.oceanleo.com/${filename}`,
    favorite: false,
    meta: { mime },
  };
}

test("selection toolbar keeps every primary capability at every width", () => {
  const controls = Array.from({ length: 12 }, (_, index) => ({
    id: `control-${index}`,
    kind: "action",
    label: `C${index}`,
    ...(index > 8 ? { placement: "more" } : {}),
  }));
  const measured = new Map(controls.map((control) => [control.id, 48]));
  const wide = partitionSelectionControls(
    controls,
    measured,
    960,
  );
  assert.equal(wide.visible.length, 9);
  assert.equal(wide.overflow.length, 3);
  assert.match(SELECTION_TOOLBAR_VIEWPORT_MAX, /100dvw/);

  const prioritized = [
    { id: "core-a", kind: "action", label: "A" },
    { id: "extra", kind: "action", label: "Extra", placement: "more" },
    { id: "core-b", kind: "action", label: "B" },
    { id: "tool", kind: "action", label: "Tool", placement: "tools" },
  ];
  const narrow = partitionSelectionControls(
    prioritized,
    new Map(prioritized.map((control) => [control.id, 80])),
    240,
  );
  assert.deepEqual(narrow.visible.map((control) => control.id), [
    "core-a",
    "core-b",
  ]);
  assert.deepEqual(narrow.overflow.map((control) => control.id), ["extra"]);

  const toolbar =
    source("../src/shell/SelectionToolbar.tsx") +
    source("../src/shell/SelectionToolbarSelectControl.tsx") +
    source("../src/shell/selection-inspector-host.tsx") +
    source("../src/shell/anchored-popover.tsx");
  assert.match(toolbar, /aria-haspopup="dialog"/);
  assert.match(toolbar, /event\.key (?:===|!==) "Escape"/);
  assert.match(toolbar, /onBlur=\{\(event\) =>/);
  assert.match(toolbar, /overflow\.length > 0/);
  assert.match(toolbar, /className="[^"]*w-72/);
  assert.match(toolbar, /computeAnchoredPopoverPosition/);
  assert.match(toolbar, /maxInlineSize: SELECTION_TOOLBAR_VIEWPORT_MAX/);
  assert.doesNotMatch(toolbar, /width:\s*`min\(/);
  assert.doesNotMatch(toolbar, /Math\.min\(7|selectionToolbarBudget/);
  assert.doesNotMatch(toolbar, /calc\(100vw-2rem\),100%/);
  assert.match(toolbar, /openTransientPanel/);
  assert.match(toolbar, /SelectionInspectorPanel/);
  assert.match(toolbar, /data-selection-inspector-fallback/);
});

test("Fabric main image is movable and its image geometry commands are concrete", () => {
  assert.deepEqual(
    imageFitScales({ width: 100, height: 50 }, { width: 200, height: 200 }, "contain"),
    { scaleX: 2, scaleY: 2 },
  );
  assert.deepEqual(
    imageFitScales({ width: 100, height: 50 }, { width: 200, height: 200 }, "cover"),
    { scaleX: 4, scaleY: 4 },
  );
  assert.deepEqual(
    imageFitScales({ width: 100, height: 50 }, { width: 200, height: 200 }, "fill"),
    { scaleX: 2, scaleY: 4 },
  );

  const core = source(
    "../src/shell/image-editor/fabric-controller-core.ts",
  );
  const controller = source("../src/shell/image-editor/fabric-controller.ts");
  const runtime = source("../src/shell/image-editor/editor-runtime.ts");
  const toolbar = source(
    "../src/shell/image-editor/FabricImageContextToolbar.tsx",
  );
  const commands = source(
    "../src/shell/image-editor/fabric-image-commands.ts",
  );
  assert.match(core, /background\.oceanleoRole = undefined/);
  assert.match(core, /setLocked\(background, false\)/);
  assert.match(core, /this\.canvas\.setActiveObject\(background\)/);
  assert.doesNotMatch(core, /setLocked\(background, true\)/);
  assert.match(controller, /setSelectedGeometry/);
  assert.match(controller, /setSelectedImageFit/);
  assert.match(controller, /backgroundIndex >= 0 \? backgroundIndex \+ 1 : 0/);
  assert.match(controller, /role === "docbg" \|\| role === "background"/);
  assert.match(runtime, /target\.oceanleoRole === "background"/);
  assert.match(runtime, /target\.oceanleoRole = undefined/);
  assert.match(runtime, /setLocked\(target, false\)/);
  for (const id of [
    "replace-panel",
    "image-fit",
    "filter-panel",
    "flip-x",
    "flip-y",
    "radius",
    "shadow",
    "opacity",
    "position-x",
    "position-y",
    "object-width",
    "object-height",
    "angle",
    "lock",
    "duplicate",
    "delete",
    "layer-up",
    "layer-down",
  ]) {
    assert.match(toolbar, new RegExp(`id: "${id}"`), id);
  }
  assert.match(toolbar, /"crop-apply" : "crop-start"/);
  assert.match(commands, /case "image-fit"/);
  assert.match(commands, /case "position-x"/);
  assert.match(commands, /case "layer-up"/);
});

test("all spreadsheet formats use the lightweight Grid route", () => {
  for (const extension of ["xlsx", "xls", "xlsm", "ods"]) {
    assert.deepEqual(editorCapabilityFor(fileItem(`budget.${extension}`)).route, {
      type: "grid",
    });
  }
  assert.deepEqual(
    editorCapabilityFor(
      fileItem(
        "opaque",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      ),
    ).route,
    { type: "grid" },
  );

  const route = source("../src/shell/advanced-routes/GridRoute.tsx");
  const stage = source("../src/shell/doc-editors/GridStage.tsx");
  const contextToolbar = source(
    "../src/shell/doc-editors/GridContextToolbar.tsx",
  );
  const state = source("../src/shell/doc-editors/use-grid-editor.ts");
  assert.match(route, /contextToolbar: editor\.selectedCell \?/);
  assert.match(state, /selectedCell: hasSelectedCell \? selection\.focus : null/);
  assert.match(stage, /\{editor\.selectedCell && \(/);
  assert.match(stage, /role="tablist"/);
  assert.doesNotMatch(stage, /筛选当前列/);
  assert.match(contextToolbar, /id: "filter-query"/);
  assert.match(contextToolbar, /id: "header-row"/);
});

test("material adapter runtime bridges right libraries to the mounted editor scope", async () => {
  const scope = materialScopeKey("design", "poster-v7-test");
  const sourceItem = {
    ...fileItem("hero.png", "image/png"),
    artifactId: "hero-artifact",
    revisionId: "hero-r1",
    artifactType: "single_file_image",
    artifact: {
      artifactId: "hero-artifact",
      revisionId: "hero-r1",
      sourceFormat: "png",
    },
  };
  let received = null;
  const unregister = registerWorkbenchMaterialAdapter(scope, {
    id: "test-image-adapter",
    actions: ["insert"],
    command: {
      version: 1,
      history: "editor-command",
      createCommand: (_action, item) => ({
        schema: "oceanleo.editor-command.v1",
        commandId: "insert-hero",
        historyGroupId: "history-hero",
        action: "insert",
        source: {
          artifactId: item.artifactId,
          revisionId: item.revisionId,
          artifactType: item.artifactType,
          sourceFormat: item.artifact.sourceFormat,
        },
        target: {
          documentId: "poster",
        },
        strategy: { mode: "insert-new-object" },
        expectedRevision: { targetRevisionId: "poster-r1" },
        cas: { expectedRevisionId: "poster-r1" },
      }),
      execute: (command, item, placement) => {
        received = { action: command.action, item, placement };
      },
    },
    accepts: (item, action) => item.kind === "file" && action === "insert",
    mutate: () => {
      throw new Error("typed Insert must execute through command history");
    },
  });
  assert.equal(canPerformWorkbenchMaterial(scope, "insert", sourceItem), true);
  beginWorkbenchMaterialDrag(scope, sourceItem);
  const dragged = getWorkbenchMaterialRuntimeSnapshot(scope).draggedItem;
  assert.notEqual(dragged, sourceItem);
  assert.equal(dragged?.id, sourceItem.id);
  await performWorkbenchMaterial(scope, "insert", sourceItem, {
    source: "drop",
    clientX: 120,
    clientY: 80,
  });
  assert.equal(received.action, "insert");
  assert.notEqual(received.item, sourceItem);
  assert.deepEqual(received.placement, {
    source: "drop",
    clientX: 120,
    clientY: 80,
  });
  endWorkbenchMaterialDrag(scope);
  assert.equal(getWorkbenchMaterialRuntimeSnapshot(scope).draggedItem, null);
  unregister();
  assert.deepEqual(getWorkbenchMaterialRuntimeSnapshot(scope).actions, []);

  const resultCanvas = source("../src/shell/ResultCanvas.tsx");
  const stage = source("../src/shell/AdvancedWorkbenchStage.tsx");
  assert.match(resultCanvas, /onMaterialDragStart=\{workbenchMaterials\.beginMaterialDrag\}/);
  assert.match(resultCanvas, /<MyLibrary[\s\S]*?draggableMaterials/);
  assert.match(stage, /types\.includes\(WORKBENCH_MATERIAL_MIME\)/);
  assert.match(stage, /event\.preventDefault\(\)/);
});

test("advanced action bar is native PaneHeader chrome with fixed direct download", () => {
  const split = source("../src/shell/SplitWorkspace.tsx");
  const shell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  const bar = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  assert.match(split, /setRightEditorHeader/);
  assert.match(shell, /rightPaneSlot\.setRightLabel\(liveHeaderNode\)/);
  assert.match(shell, /rightPaneSlot\.setRightEditorHeader\(true\)/);
  assert.doesNotMatch(shell, /absolute left-2 right-2 top-2/);
  assert.match(bar, /adapter\.directDownload/);
  assert.match(bar, /standaloneActions\.map\(\(action\)/);
  assert.match(bar, /action\.group === "download"/);
  assert.match(bar, /data-workspace-download-menu/);

  for (const route of [
    "AudioRoute",
    "ChartRoute",
    "DeckRoute",
    "GridRoute",
    "ImageRoute",
    "Model3DRoute",
    "PdfRoute",
    "RichDocRoute",
    "VideoTimelineRoute",
    "EmbeddedRoute",
  ]) {
    assert.match(
      source(`../src/shell/advanced-routes/${route}.tsx`),
      /directDownload:/,
      route,
    );
  }
});

test("embedded direct export is a validated request/result protocol, never fake success", () => {
  const instanceId = "editor-v7";
  assert.deepEqual(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        type: "export-request",
        instanceId,
        exportId: "export-1",
        format: "default",
      },
      instanceId,
    )?.type,
    "export-request",
  );
  assert.deepEqual(
    asEditorToHostMessage(
      {
        protocol: EDITOR_PROTOCOL,
        type: "export-result",
        instanceId,
        exportId: "export-1",
        ok: false,
        message: "not supported",
      },
      instanceId,
    )?.type,
    "export-result",
  );
  const embedded = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  assert.match(embedded, /嵌入编辑器未响应导出协议/);
  assert.match(embedded, /onExportResult=\{handleExportResult\}/);
  assert.doesNotMatch(embedded, /requestRemoteExport[\s\S]*?Promise\.resolve/);
});

test("embedded viewport protocol exposes one shared bottom-right zoom control", () => {
  const instanceId = "editor-viewport";
  assert.equal(
    asEditorToHostMessage(
      {
        protocol: EDITOR_PROTOCOL,
        type: "viewport-changed",
        instanceId,
        viewport: { value: 75, min: 10, max: 300, step: 1, canFit: true },
      },
      instanceId,
    )?.type,
    "viewport-changed",
  );
  assert.equal(
    asHostToEditorMessage(
      {
        protocol: EDITOR_PROTOCOL,
        type: "viewport-command",
        instanceId,
        commandId: "zoom-1",
        value: 80,
      },
      instanceId,
    )?.type,
    "viewport-command",
  );
  const embedded = source("../src/shell/advanced-routes/EmbeddedRoute.tsx");
  const controls = source("../src/shell/AdvancedStageControls.tsx");
  assert.match(embedded, /onViewportChange=\{setRemoteViewport\}/);
  assert.match(embedded, /setValue: \(value\) => sendViewportCommand/);
  assert.doesNotMatch(embedded, /nativeChrome: \{ toolbar: true, viewport: true \}/);
  assert.match(controls, /scheduleZoom/);
  assert.match(controls, /viewport\.fit/);
  assert.match(controls, /<output/);
  assert.doesNotMatch(controls, /animateZoom|performance\.now/);
});

test("floating toolbar geometry spans the workspace without escaping its bounds", () => {
  assert.deepEqual(
    clampFloatingToolbar(
      { x: 1_500, y: -50 },
      { width: 1_200, height: 800 },
      { width: 500, height: 48 },
    ),
    { x: 684, y: 0 },
  );
  assert.equal(
    sameFloatingToolbarPoint({ x: 684, y: 0 }, { x: 684, y: 0 }),
    true,
  );
  const floating =
    source("../src/shell/FloatingContextToolbar.tsx") +
    source("../src/shell/edit-bar-dock-controller.tsx") +
    source("../src/shell/EditBarDockControls.tsx");
  const inlineShell = source("../src/shell/InlineAdvancedWorkbenchShell.tsx");
  assert.match(floating, /workspaceRootRef/);
  assert.match(floating, /createPortal/);
  assert.match(floating, /onLostPointerCapture/);
  assert.match(floating, /aria-keyshortcuts/);
  assert.match(
    inlineShell,
    /style=\{\{ zIndex: 2_147_483_010 \}\}/,
    "viewport and fullscreen controls must stay clickable above a dragged toolbar",
  );
});

test("normal autosave progress is icon-only while actionable errors remain visible", () => {
  const bar = source("../src/shell/AdvancedWorkspaceActionBar.tsx");
  const embed = source("../src/shell/workbench-embed.tsx");
  const pdf = source("../src/shell/media-editors/PdfStage.tsx");
  const richdoc = source("../src/shell/doc-editors/RichDocStage.tsx");
  assert.match(bar, /CloudAutoSaveIcon/);
  assert.match(bar, /onRetrySave/);
  assert.doesNotMatch(
    embed,
    /tt\("修改已保存"\)|tt\("有未保存的修改"\)|正在连接编辑器|编辑器已连接/,
  );
  assert.match(embed, /status\.severity === "fatal" \? "alert" : "status"/);
  const library = source("../src/shell/WorkspaceLibrary.tsx");
  const artifactActions = source("../src/shell/ArtifactActions.tsx");
  assert.doesNotMatch(library, /"彻底删除"|此操作无法撤销/);
  assert.match(artifactActions, /aria-describedby/);
  assert.match(artifactActions, /unavailableReason/);
  assert.doesNotMatch(pdf, /有未保存的 PDF 修改/);
  assert.doesNotMatch(richdoc, /已保存到我的库/);
  for (const route of ["AudioRoute", "GridRoute", "RichDocRoute"]) {
    const contents = source(`../src/shell/advanced-routes/${route}.tsx`);
    assert.doesNotMatch(contents, /有未保存的修改|已保存到我的库/, route);
  }
  for (const [path, message] of [
    ["../src/shell/image-editor/use-fabric-image-editor.ts", /可编辑工程与预览已自动保存|已保存一个版本；之后的修改仍未保存/],
    ["../src/shell/doc-editors/use-deck-editor.ts", /PPTX 新版本已保存|已保存一个 PPTX 版本/],
    ["../src/shell/media-editors/use-pdf-workbench.ts", /setNotice\(tt\("已保存到我的库"\)\)|已保存一个版本；之后的修改仍未保存/],
    ["../src/shell/media-editors/use-model3d-save.ts", /3D 视图副本已保存|已保存一个视图副本/],
    ["../src/shell/video-editor/use-video-timeline.ts", /草稿已保存到我的库|已保存一个草稿版本/],
    ["../src/shell/chart-editor/use-chart-workbench.ts", /图表新版本已保存|已保存一个版本；之后的修改仍未保存/],
  ]) {
    assert.doesNotMatch(source(path), message, path);
  }
});
