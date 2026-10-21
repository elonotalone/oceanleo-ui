import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import test from "node:test";
import { createRequire } from "node:module";
import React, { act } from "react";
import { pathToFileURL } from "node:url";

// The focused test runner uses Node's strip-only TypeScript mode, which does
// not support parameter properties used by FabricEditorCore. Compile the real
// implementation and its relative TS dependencies in memory for this test.
const require = createRequire(import.meta.url);
const ts = require("typescript");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    if (
      error?.code === "MODULE_NOT_FOUND" &&
      parent?.filename &&
      (request.startsWith(".") || request.startsWith("/")) &&
      !/\.[a-z0-9]+$/i.test(request)
    ) {
      try {
        return originalResolveFilename.call(this, `${request}.ts`, parent, isMain, options);
      } catch {}
    }
    throw error;
  }
};
Module._extensions[".ts"] = (module, filename) => {
  const source = readFileSync(filename, "utf8");
  const compiled = ts.transpileModule(source, {
    fileName: filename,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      moduleResolution: ts.ModuleResolutionKind.NodeJs,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  });
  module._compile(compiled.outputText, filename);
};
const { FabricEditorCore } = require("../src/shell/image-editor/fabric-controller-core.ts");
const { captureSnapshot } = require("../src/shell/image-editor/editor-runtime.ts");
import {
  firstForkReceiptMatches,
  imageEditorOpenIdentity,
  imageSaveAdmitted,
  imageStageShowsSourceLoadOverlay,
  isNewImageSourceSession,
} from "../src/shell/image-editor/image-source-ready.ts";

function makeSnapshot(objects) {
  return {
    json: { objects: structuredClone(objects) },
    doc: { width: 100, height: 80 },
    canvasBackground: "#ffffff",
  };
}

function makeControllerForHistory(initialObjects) {
  const controller = Object.create(FabricEditorCore.prototype);
  const canvas = {
    objects: structuredClone(initialObjects),
    viewportTransform: [1, 0, 0, 1, 0, 0],
    width: 800,
    height: 600,
    getObjects() { return this.objects; },
    toObject() { return { objects: structuredClone(this.objects) }; },
    loadFromJSON(snapshot) {
      this.objects = structuredClone(snapshot.objects || []);
      return Promise.resolve(this);
    },
    setDimensions({ width, height }) { this.width = width; this.height = height; },
    setViewportTransform(value) { this.viewportTransform = value; },
    requestRenderAll() {},
    moveObjectTo() {},
    bringObjectToFront() {},
    discardActiveObject() {},
  };
  Object.assign(controller, {
    canvas,
    container: null,
    doc: { width: 100, height: 80 },
    canvasBackground: "#ffffff",
    currentSnapshot: makeSnapshot(initialObjects),
    undoStack: [],
    redoStack: [],
    restoring: false,
    destroyed: false,
    readOnly: false,
    gestureBase: null,
    restoreAbort: null,
    callbacks: { onDocumentChange() {}, onChange() {}, onError(message) { throw new Error(message); } },
    // The restore path calls these visual helpers after the real history load.
    styleObject() {},
    selectPreferredUnlockedImage() { return false; },
    emit() {},
  });
  return controller;
}

test("deleting a layer, saving the resulting state, then undo/redo uses controller history", async () => {
  let documentChanges = 0;
  const controller = makeControllerForHistory([
    { oceanleoId: "layer-1", text: "keep me" },
  ]);
  controller.callbacks.onDocumentChange = () => { documentChanges += 1; };

  // This is the controller's normal delete commit: current canvas is empty,
  // and commit records the pre-delete snapshot on its real undo stack.
  controller.canvas.objects = [];
  controller.commit();
  assert.equal(controller.undoStack.length, 1);
  assert.equal(controller.canvas.objects.length, 0);
  assert.equal(documentChanges, 1, "delete commit is the first autosave change");

  // A save receipt only changes external URLs / artifact head; the controller
  // receives no replacement snapshot, so its delete history remains available.
  const saveReceipt = { revisionId: "rev-2", previewUrl: "preview-2" };
  assert.equal(saveReceipt.revisionId, "rev-2");
  assert.equal(controller.undoStack.length, 1);

  controller.undo();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(controller.canvas.objects, [{ oceanleoId: "layer-1", text: "keep me" }]);
  assert.equal(documentChanges, 2, "undo emits a document change for autosave");

  controller.redo();
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepEqual(controller.canvas.objects, []);
  assert.equal(documentChanges, 3, "redo emits a document change for autosave");
  assert.equal(controller.undoStack.length, 1, "redo can be undone again");
});

test("temporary crop rectangles are excluded from durable Fabric snapshots", () => {
  const snapshot = captureSnapshot(
    {
      toObject: () => ({
        objects: [
          { oceanleoId: "image-1", oceanleoKind: "image" },
          { oceanleoId: "crop-1", oceanleoRole: "crop" },
        ],
      }),
    },
    { width: 100, height: 80 },
    "#ffffff",
  );
  assert.deepEqual(snapshot.json.objects, [
    { oceanleoId: "image-1", oceanleoKind: "image" },
  ]);
});

test("readiness admits saves only after a successful source load", () => {
  assert.deepEqual(
    imageSaveAdmitted({ loading: true, sourceReady: false, sceneDiagnostic: null }),
    { ok: false, error: "图片源尚未载入完成，未把空白画布当作可保存稿。" },
  );
  assert.equal(
    imageSaveAdmitted({ loading: false, sourceReady: false, sceneDiagnostic: null }).ok,
    false,
  );
  assert.equal(
    imageSaveAdmitted({ loading: false, sourceReady: true, sceneDiagnostic: null }).ok,
    true,
  );
  assert.equal(imageStageShowsSourceLoadOverlay({ loading: true, sourceReady: false }), true);
  assert.equal(imageStageShowsSourceLoadOverlay({ loading: true, sourceReady: true }), false);
});

test("first fork receipt keeps its source open; a second artifact on that root opens separately", () => {
  const template = {
    key: "template:poster-1",
    nonce: 0,
    rootAssetId: "poster-1",
  };
  const firstFork = {
    key: "root:poster-1",
    nonce: 0,
    rootAssetId: "poster-1",
    artifactId: "artifact-a",
  };
  const secondFork = { ...firstFork, key: "artifact:artifact-b", artifactId: "artifact-b" };
  assert.equal(isNewImageSourceSession(template, firstFork), true);
  assert.equal(
    firstForkReceiptMatches({
      current: template,
      nonce: 0,
      rootAssetId: "poster-1",
      artifactId: "artifact-a",
      receipt: { rootAssetId: "poster-1", artifactId: "artifact-a" },
    }),
    true,
  );
  assert.equal(
    firstForkReceiptMatches({
      current: template,
      nonce: 0,
      rootAssetId: "poster-1",
      artifactId: "artifact-b",
      receipt: { rootAssetId: "poster-1", artifactId: "artifact-a" },
    }),
    false,
  );
  // The hook adopts firstFork's ID only after receiving its matching save
  // receipt, so the controller does not reload. Model that adopted session.
  const adoptedFirstFork = { ...template, artifactId: "artifact-a" };
  assert.equal(isNewImageSourceSession(adoptedFirstFork, firstFork), false);
  assert.equal(isNewImageSourceSession(firstFork, secondFork), true);
  assert.equal(
    imageEditorOpenIdentity({ artifactId: "artifact-a", meta: { root_asset_id: "poster-1" } }),
    "artifact:artifact-a",
  );
  assert.equal(
    imageEditorOpenIdentity({ id: "template-1", meta: {} }),
    "source:template-1",
    "a local source fallback cannot collide with the workbench's raw item id",
  );
});

test("useFabricImageEditor keeps the controller and undo history through a receipt, then autosaves undo", async () => {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = {
    id: canvasEntry,
    filename: canvasEntry,
    loaded: true,
    exports: {},
  };
  const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://design.oceanleo.com/advanced/image",
  });
  const savedGlobals = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
  })) {
    savedGlobals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;

  const editSession = require("../src/shell/user-edit-session.ts");
  editSession.resetUserEditSession();

  const pendingSaves = [];
  const controllers = [];
  let autoSave = null;
  const stubs = new Map([
    ["../../i18n/ui/useUI", { useUI: () => (value) => value }],
    ["../../lib/image-ai-edit", { aiEditImage: async () => "" }],
    ["../../lib/database", { uploadFile: async () => ({ ok: false }) }],
    ["../../lib/media-proxy", {
      canvasSafeUrl: (url) => url,
      fetchMediaBlob: async () => new Blob(),
      isFirstPartyMediaUrl: () => true,
    }],
    ["../advanced-features", { advancedEditorSourceFor: () => null }],
    ["../media-editors/visual-formats", { DEFAULT_LOSSY_QUALITY: 90 }],
    ["../doc-editors/artifact-save-contract", {
      artifactSaveStepMessage: (_step, fallback) => fallback,
    }],
    ["../artifact-client", {
      getArtifactItem: async () => ({ data: null }),
      refreshArtifactRendition: async () => ({ ok: false }),
    }],
    ["../artifact-contract", { renditionNeedsRefresh: () => false }],
    ["../library-data", { isDurableLibraryItem: (item) => Boolean(item?.artifactId) }],
    ["./editor-objects", {
      loadImageObject: async () => ({}),
      tagImageDependency() {},
      exportDocBlob: async (canvas) =>
        new Blob([JSON.stringify(canvas.toObject())], { type: "image/png" }),
    }],
    ["./editor-persistence", {
      clearLocalImageDraft() {},
      createFabricImageProject: (snapshot) => ({ snapshot }),
      downloadImageBlob() {},
      loadLocalImageDraft: () => null,
      parseFabricImageProject: () => null,
      persistCompositeImageProject: async () => { throw new Error("unexpected composite save"); },
      persistImageProject: (...args) => new Promise((resolve) => pendingSaves.push({ args, resolve })),
      saveLocalImageDraft() {},
    }],
    ["./fabric-controller", {
      FabricEditorController: function (_fabric, _element, _container, callbacks) {
        const controller = makeControllerForHistory([
          { oceanleoId: "layer-1", text: "original" },
        ]);
        controller.callbacks = callbacks;
        controller.getDocument = () => ({ canvas: controller.canvas, doc: controller.doc });
        controller.dispose = () => { controller.disposed = true; };
        controllers.push(controller);
        return controller;
      },
    }],
    ["./editor-runtime", { normalizeEditorSnapshot: (value) => value }],
    ["./image-scene-source", {
      IMAGE_SCENE_SOURCE_FORMAT: "scene",
      IMAGE_SCENE_SOURCE_SCHEMA: "scene/v1",
      ImageSceneSourceError: class ImageSceneSourceError extends Error {},
      assertImageDependencyAccess() {},
      artifactSceneClosureDigest: async () => "",
      imageDependencyNeedsRefresh: () => false,
      imageSceneDependencyRevisionIds: () => [],
      imageSceneWithResolvedDependencies: (value) => value,
      parseImageSceneSource: () => null,
      sha256Blob: async () => "",
      sha256Text: async () => "",
    }],
    ["./fabric-image-open", {
      canvasImageSource: async () => ({ canvasUrl: "" }),
      openFabricImagePixels: async () => ({ canvasUrl: "" }),
    }],
    ["./psd-composite", {
      PsdCompositeError: class PsdCompositeError extends Error {},
      isPsdSource: () => false,
    }],
    ["./advanced-draft-recovery", {
      capturePortableAdvancedDraft: async () => null,
      draftFromRecovery: () => null,
      noteAdvancedDraftPublished() {},
    }],
    ["./advanced-draft-restore", {
      DRAFT_READ_FAILED: "draft read failed",
      DRAFT_OTHER_FACE: "other face",
      useAdvancedDraftRestore: () => ({
        paused: false,
        restoredRevision: undefined,
        restoredPointer: undefined,
        error: undefined,
        retry: async () => ({ ok: false }),
      }),
    }],
    ["./advanced-draft", {
      ADVANCED_DRAFT_META_KEY: "advanced_server_draft",
      advancedDraftIdentity: (value) => ({ rootId: value.id, baseRevisionId: value.revisionId || value.id }),
      normalizeAdvancedDraftPointer: () => null,
      uploadAdvancedDraft: async () => null,
    }],
    ["./advanced-draft-gates", { bindAdvancedDraftGate: () => () => {} }],
    ["../lib/auth/autosave-error-message", { mapAutosaveErrorMessage: () => "save failed" }],
    ["./advanced-background-saver", { handOff() {}, takeBack: () => null }],
    ["./use-advanced-recovery", {
      advancedRecoverySupersededBySave: () => false,
      noteAdvancedSaveSucceeded() {},
    }],
    ["fabric", {}],
  ]);
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    const stub = stubs.get(request);
    if (stub) return stub;
    return originalLoad.call(this, request, parent, isMain);
  };

  const { useFabricImageEditor } = require("../src/shell/image-editor/use-fabric-image-editor.ts");
  const { useAdvancedAutoSave } = require("../src/shell/use-advanced-autosave.ts");
  const item = {
    id: "template-1",
    key: "template:template-1",
    title: "template",
    kind: "image",
    siteId: "design",
    favorite: false,
    meta: {},
    previewUrl: "",
    thumbUrl: "",
    url: "",
  };
  let itemState = item;
  let hook;
  function Probe() {
    hook = useFabricImageEditor(itemState, "design");
    const hostUserEditKey = editSession.userEditItemKey(itemState);
    React.useLayoutEffect(() => {
      editSession.syncOpenUserEditItem(hostUserEditKey);
      return () => {
        editSession.resetUserMutation(hostUserEditKey);
        if (editSession.activeUserEditItemKey() === hostUserEditKey) {
          editSession.bindActiveUserEditItem(null);
        }
      };
    }, [hostUserEditKey]);
    autoSave = useAdvancedAutoSave({
      key: hook.openIdentity,
      dirty: hook.dirty,
      revision: hook.editRevision,
      flush: async () => {
        const result = await hook.save();
        return result ? { ok: true } : { ok: false, error: "no image save" };
      },
      item: itemState,
      editorId: "image-editor",
      session: null,
    });
    return React.createElement("canvas", { ref: hook.stageCanvasRef });
  }
  const { createRoot } = await import("react-dom/client");
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(React.createElement(Probe)));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.equal(hook.loading, false);
  assert.equal(hook.sourceReady, true);
  assert.equal(hook.openIdentity, "source:template-1");
  assert.equal(controllers.length, 1);
  const controller = controllers[0];

  controller.canvas.objects = [];
  await act(async () => controller.commit());
  assert.equal(hook.dirty, true);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1_750)));
  assert.equal(pendingSaves.length, 1);
  assert.deepEqual(pendingSaves[0].args[0].json.objects, [], "deleted layer is the saved snapshot");
  const initialPreview = await pendingSaves[0].args[6]();
  assert.equal(await initialPreview.text(), JSON.stringify({ objects: [] }),
    "the first save's preview stays paired with its pre-edit snapshot");
  controller.canvas.objects = [{ oceanleoId: "layer-1", text: "edit during first save" }];
  await act(async () => controller.commit());
  assert.equal(editSession.userMutationGeneration(hook.openIdentity), 2);
  pendingSaves[0].resolve({
    previewUrl: "https://cdn.example/preview-1.png",
    projectUrl: "https://cdn.example/project-1.json",
    savedAt: "2026-10-21T00:00:00Z",
    versionId: "rev-1",
    item: {
      ...item,
      id: "artifact-a",
      key: "artifact:artifact-a:rev-1",
      source: "artifact",
      artifactId: "artifact-a",
      artifactType: "single_file_image",
      revisionId: "rev-1",
      meta: { root_asset_id: "template-1" },
    },
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
  assert.equal(hook.dirty, true, "first save receipt cannot clear an edit made during upload");
  assert.equal(controller.disposed, undefined, "save receipt must not dispose the live controller");
  assert.equal(controller.undoStack.length, 2, "save receipt preserves both the deletion and in-flight edit steps");

  await act(async () => new Promise((resolve) => setTimeout(resolve, 1_750)));
  assert.equal(pendingSaves.length, 2, "the in-flight first-save edit auto-flushes after the fork receipt");
  assert.equal(pendingSaves[1].args[0].json.objects[0].text, "edit during first save");
  assert.equal(pendingSaves[1].args[1].artifactId, "artifact-a",
    "the queued save uses the first receipt even before the parent rerenders");
  assert.equal(pendingSaves[1].args[1].revisionId, "rev-1",
    "the queued save commits against the receipt's latest base revision");
  pendingSaves[1].resolve({
    previewUrl: "https://cdn.example/preview-2.png",
    projectUrl: "https://cdn.example/project-2.json",
    savedAt: "2026-10-21T00:00:01Z",
    versionId: "rev-2",
    item: {
      ...item,
      id: "artifact-a",
      key: "artifact:artifact-a:rev-2",
      source: "artifact",
      artifactId: "artifact-a",
      artifactType: "single_file_image",
      revisionId: "rev-2",
      meta: { root_asset_id: "template-1", previous_revision_id: "rev-1" },
    },
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.equal(hook.dirty, false);
  assert.equal(controllers.length, 1, "both autosave receipts keep one mounted controller");

  // The parent had not rerendered for either receipt. Deliver its delayed rev-1
  // prop now; it must adopt the open identity but not roll the save head back.
  itemState = {
    ...item,
    id: "artifact-a",
    key: "artifact:artifact-a:rev-1",
    source: "artifact",
    artifactId: "artifact-a",
    artifactType: "single_file_image",
    revisionId: "rev-1",
    meta: { root_asset_id: "template-1" },
  };
  await act(async () => root.render(React.createElement(Probe)));
  assert.equal(controllers.length, 1, "first-fork receipt adopts the artifact without reloading the canvas");
  assert.equal(hook.openIdentity, "source:template-1", "the first-fork receipt keeps the editor session identity");
  assert.equal(controller.disposed, undefined);
  assert.equal(editSession.userMutationGeneration("template-1"), 0,
    "the real workbench first-fork key transition clears only its raw source bucket");
  assert.equal(editSession.userMutationGeneration(hook.openIdentity), 2,
    "namespaced image edits survive the workbench's first-fork bucket cleanup");

  await act(async () => controller.undo());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1_750)));
  assert.deepEqual(controller.canvas.objects, []);
  assert.equal(pendingSaves.length, 3, "undo after the fork auto-flushes without a manual save call");
  assert.deepEqual(pendingSaves[2].args[0].json.objects, []);
  assert.equal(pendingSaves[2].args[1].artifactId, "artifact-a");
  assert.equal(pendingSaves[2].args[1].revisionId, "rev-2",
    "a delayed stale parent prop cannot roll the authoritative save head back");
  pendingSaves[2].resolve({
    previewUrl: "https://cdn.example/preview-3.png",
    projectUrl: "https://cdn.example/project-3.json",
    savedAt: "2026-10-21T00:00:02Z",
    versionId: "rev-3",
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.equal(hook.dirty, false);
  assert.equal(controllers.length, 1, "autosave receipts keep one mounted controller and history");

  itemState = {
    ...itemState,
    id: "artifact-b",
    key: "artifact:artifact-b:rev-1",
    artifactId: "artifact-b",
    revisionId: "rev-1",
  };
  await act(async () => root.render(React.createElement(Probe)));
  assert.equal(hook.openIdentity, "artifact:artifact-b");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.equal(controllers.length, 2, "a different artifact sharing the same root loads as a new item");
  assert.equal(controller.disposed, true);

  const legacySource = {
    ...item,
    id: "legacy-template",
    key: "template:legacy-template",
    meta: {},
  };
  itemState = legacySource;
  await act(async () => root.render(React.createElement(Probe)));
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.equal(controllers.length, 3, "a genuinely new legacy source gets its own controller");
  const legacyController = controllers[2];
  legacyController.canvas.objects = [];
  await act(async () => legacyController.commit());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 1_750)));
  assert.equal(pendingSaves.length, 4);
  const legacyReceipt = {
    ...legacySource,
    id: "legacy-working-copy",
    key: "creation:legacy-working-copy",
    meta: { parent_asset_id: "legacy-template" },
  };
  pendingSaves[3].resolve({
    previewUrl: "https://cdn.example/legacy-preview.png",
    projectUrl: "https://cdn.example/legacy-project.json",
    savedAt: "2026-10-21T00:00:04Z",
    versionId: "legacy-version-1",
    item: legacyReceipt,
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.equal(hook.dirty, false);
  itemState = { ...legacyReceipt };
  await act(async () => root.render(React.createElement(Probe)));
  assert.equal(hook.openIdentity, "source:legacy-template",
    "an exact legacy save receipt keeps the original session identity through root metadata adoption");
  assert.equal(controllers.length, 3, "legacy receipt prop transition does not remount the controller");
  assert.equal(legacyController.disposed, undefined);
  assert.equal(legacyController.undoStack.length, 1, "legacy receipt prop transition preserves history");

  itemState = {
    ...legacySource,
    id: "legacy-sibling",
    key: "creation:legacy-sibling",
    meta: { parent_asset_id: "legacy-template" },
  };
  await act(async () => root.render(React.createElement(Probe)));
  assert.equal(hook.openIdentity, "source:legacy-sibling",
    "another legacy item on the same root does not inherit this save's alias");
  await act(async () => new Promise((resolve) => setTimeout(resolve, 30)));
  assert.equal(controllers.length, 4, "an unrelated same-root legacy item opens separately");
  assert.equal(legacyController.disposed, true);

  await act(async () => root.unmount());
  Module._load = originalLoad;
  editSession.resetUserEditSession();
  dom.window.close();
  for (const [name, descriptor] of savedGlobals) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
  delete globalThis.IS_REACT_ACT_ENVIRONMENT;
});
