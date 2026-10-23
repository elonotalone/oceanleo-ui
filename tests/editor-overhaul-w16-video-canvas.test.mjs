// 2026-10-23 editor overhaul W16 — video canvas (xyflow) edits the stored v2 project
// itself: official template kinds open, moves / params / links / deletes go through one
// undo stack, every save is a typed revision, the edit bar speaks the canonical vocabulary,
// and the canvas follows the site theme (light is light, not inverted dark).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  VIDEO_PROJECT_V2_SCHEMA,
  addVideoDocNode,
  connectVideoDocNodes,
  createVideoProjectDoc,
  duplicateVideoDocNodes,
  moveVideoDocNodes,
  parseVideoProjectDoc,
  removeVideoDocElements,
  serializeVideoProjectDoc,
  videoDocGraph,
} from "../src/shell/workflow-carrier/video-project-doc.ts";
import {
  patchVideoNodeField,
  videoNodeText,
  videoNodeTextField,
} from "../src/shell/workflow-carrier/video-project-node-fields.ts";
import {
  EMPTY_VIDEO_SELECTION,
  VIDEO_NODE_PARAMS_GROUP,
  applyVideoProjectSelectionCommand,
  videoProjectSelectionContext,
} from "../src/shell/workflow-carrier/video-project-selection.ts";
import {
  saveVideoProject,
  videoProjectSaveInput,
} from "../src/shell/workflow-carrier/video-project-save.ts";
import { VIDEO_CANVAS_PALETTES } from "../src/shell/workflow-carrier/video-canvas-theme.ts";
import {
  isNativeVideoProjectItem,
  loadVideoProjectDoc,
} from "../src/shell/workflow-carrier/workflow-graph-source.ts";
import { videoPreviewLayout } from "../src/shell/workflow-carrier/video-project-preview.ts";
import {
  canonicalSelectionControls,
  finalizeEditBarIcons,
} from "../src/shell/edit-bar-canon-projection.ts";
import { partitionSelectionInspectorControls } from "../src/shell/selection-inspector-groups.ts";
import { EDIT_BAR_CANON_ICON_SET } from "../src/shell/edit-bar-canon.ts";

const tt = (text, vars) =>
  vars ? text.replace(/\{(\w+)\}/g, (_m, key) => String(vars[key] ?? "")) : text;

/** Shape of the 41 public templates (10-23 SQL): prompt/generate/timeline/delivery, params.* fields. */
function officialTemplate() {
  return {
    schema: VIDEO_PROJECT_V2_SCHEMA,
    schemaVersion: 2,
    projectId: "project_t",
    title: "观点解说·四段反转",
    headVersionId: "v1",
    versions: {
      v1: {
        versionId: "v1",
        revision: 1,
        graph: {
          nodes: [
            { nodeId: "n1", kind: "prompt", title: "简报", position: { x: 0, y: 0 }, params: { prompt: "四段反转" } },
            { nodeId: "n2", kind: "generate", title: "镜头一", position: { x: 260, y: 0 }, params: { prompt: "街头", durationSeconds: 4 } },
            { nodeId: "n3", kind: "timeline", title: "时间线", position: { x: 520, y: 0 } },
            { nodeId: "n4", kind: "delivery", title: "成片", position: { x: 780, y: 0 } },
          ],
          edges: [
            { edgeId: "e1", sourceNodeId: "n1", targetNodeId: "n2" },
            { edgeId: "e2", sourceNodeId: "n2", targetNodeId: "n3" },
          ],
        },
        scenes: [{ sceneId: "s1", untouched: true }],
      },
    },
    assets: {},
    lineage: [{ keep: "me" }],
    operationReceipts: { r: 1 },
  };
}

function parsed() {
  const result = parseVideoProjectDoc(officialTemplate());
  assert.equal(result.ok, true, result.error);
  return result.doc;
}

test("official template kinds (prompt / generate) open for editing instead of failing", () => {
  const doc = parsed();
  assert.deepEqual(videoDocGraph(doc).nodes.map((node) => node.kind), ["prompt", "generate", "timeline", "delivery"]);
  assert.equal(parseVideoProjectDoc({ ...officialTemplate(), headVersionId: "missing" }).ok, false);
  assert.equal(
    parseVideoProjectDoc({
      ...officialTemplate(),
      versions: { v1: { graph: { nodes: [], edges: [{ edgeId: "e", sourceNodeId: "a", targetNodeId: "b" }] } } },
    }).ok,
    false,
    "dangling edges fail closed",
  );
});

test("graph edits change only the head graph; everything else stays byte-identical", () => {
  const doc = parsed();
  let next = moveVideoDocNodes(doc, [{ id: "n2", x: 300.4, y: 40 }]);
  next = connectVideoDocNodes(next, { source: "n3", target: "n4" });
  const before = JSON.parse(serializeVideoProjectDoc(doc));
  const after = JSON.parse(serializeVideoProjectDoc(next));
  assert.deepEqual(after.lineage, before.lineage);
  assert.deepEqual(after.operationReceipts, before.operationReceipts);
  assert.deepEqual(after.versions.v1.scenes, before.versions.v1.scenes);
  assert.deepEqual(after.versions.v1.graph.nodes[1].position, { x: 300, y: 40 });
  assert.equal(after.versions.v1.graph.edges.length, 3);
  assert.equal(after.versions.v1.graph.nodes[0].kind, "prompt", "kind is never rewritten");
  assert.equal(before.versions.v1.graph.edges.length, 2, "previous snapshot is untouched (undo stack)");
  assert.equal(connectVideoDocNodes(next, { source: "n3", target: "n4" }), null, "no duplicate link");
  assert.equal(connectVideoDocNodes(next, { source: "n3", target: "n3" }), null, "no self loop");
  const removed = removeVideoDocElements(next, ["n2"], []);
  assert.deepEqual(videoDocGraph(removed).edges.map((edge) => edge.edgeId).includes("e1"), false);
});

test("node params write back where they live (params.* for templates, top level for core)", () => {
  const node = videoDocGraph(parsed()).nodes[1];
  assert.equal(videoNodeTextField(node), "prompt");
  const edited = patchVideoNodeField(node, { field: "text", value: "夜市" });
  assert.equal(edited.params.prompt, "夜市");
  assert.equal(Object.hasOwn(edited, "prompt"), false);
  assert.equal(videoNodeText(edited), "夜市");
  const longer = patchVideoNodeField(edited, { field: "durationSeconds", value: 9999 });
  assert.equal(longer.params.durationSeconds, 600);
  const core = { nodeId: "x", kind: "script", title: "", position: { x: 0, y: 0 } };
  assert.equal(patchVideoNodeField(core, { field: "text", value: "旁白" }).text, "旁白");
  const locked = patchVideoNodeField(core, { field: "locked", value: true });
  assert.equal(locked.locked, true);
  assert.equal(Object.hasOwn(patchVideoNodeField(locked, { field: "locked", value: false }), "locked"), false);
});

test("edit bar: node gets canonical object ids, unique icons, specific params after the object group", () => {
  const doc = parsed();
  const context = videoProjectSelectionContext(doc, { nodeIds: ["n2"], edgeIds: [] }, { tt, readOnly: false });
  assert.equal(context.bar, "object");
  // Same pipeline as SelectionToolbar: canonical projection → panel partition → icon finalize.
  const projection = canonicalSelectionControls(context, tt);
  const bar = finalizeEditBarIcons(partitionSelectionInspectorControls(projection.controls).compact);
  assert.deepEqual(
    bar.map((control) => control.canonId || control.id),
    ["position", "lock", "duplicate", "delete", `selection-inspector-${VIDEO_NODE_PARAMS_GROUP}`],
    "object group in canonical order, then the editor-specific params panel",
  );
  const canon = bar.map((control) => control.canonId).filter(Boolean);
  assert.equal(canon.includes("arrange"), false, "a flow graph has no layers");
  const params = context.controls.filter((control) => control.inspectorGroup === VIDEO_NODE_PARAMS_GROUP);
  assert.deepEqual(params.map((control) => control.id), ["node-title", "node-text", "node-duration", "node-ratio"]);
  assert.equal(EDIT_BAR_CANON_ICON_SET.has(params[0].inspectorIcon), false, "specific panel never borrows a canonical icon");
  const icons = bar.map((control) => control.icon).filter(Boolean);
  assert.equal(new Set(icons).size, icons.length, "no duplicate icons on one bar");
  const edge = videoProjectSelectionContext(doc, { nodeIds: [], edgeIds: ["e1"] }, { tt, readOnly: false });
  assert.deepEqual(edge.controls.map((control) => control.id), ["delete"]);
  assert.equal(videoProjectSelectionContext(doc, EMPTY_VIDEO_SELECTION, { tt, readOnly: false }), null);
});

test("edit bar commands: duplicate selects copies, lock hides delete, params commit only on commit phase", () => {
  const doc = parsed();
  const one = { nodeIds: ["n2"], edgeIds: [] };
  const dup = applyVideoProjectSelectionCommand(doc, one, { controlId: "duplicate" });
  assert.equal(videoDocGraph(dup.doc).nodes.length, 5);
  assert.notEqual(dup.selection.nodeIds[0], "n2");
  assert.equal(applyVideoProjectSelectionCommand(doc, one, { controlId: "node-title", value: "新", phase: "update" }), null);
  const renamed = applyVideoProjectSelectionCommand(doc, one, { controlId: "node-title", value: "新镜头", phase: "commit" });
  assert.equal(videoDocGraph(renamed.doc).nodes[1].title, "新镜头");
  const locked = applyVideoProjectSelectionCommand(doc, one, { controlId: "lock", value: true });
  const lockedContext = videoProjectSelectionContext(locked.doc, one, { tt, readOnly: false });
  assert.equal(lockedContext.controls.some((control) => control.id === "delete"), false);
  assert.equal(applyVideoProjectSelectionCommand(locked.doc, one, { controlId: "delete" }), null);
  const moved = applyVideoProjectSelectionCommand(doc, one, { controlId: "position-x", value: 512 });
  assert.equal(videoDocGraph(moved.doc).nodes[1].position.x, 512);
  const gone = applyVideoProjectSelectionCommand(doc, { nodeIds: [], edgeIds: ["e1"] }, { controlId: "delete" });
  assert.equal(videoDocGraph(gone.doc).edges.length, 1);
  assert.deepEqual(gone.selection, EMPTY_VIDEO_SELECTION);
  const copies = duplicateVideoDocNodes(doc, ["n1", "n2"]);
  assert.equal(videoDocGraph(copies.doc).edges.length, 3, "the link between copied nodes is copied too");
});

const durableItem = () => ({
  key: "artifact:a:r1",
  source: "artifact",
  id: "a",
  title: "观点解说·四段反转",
  kind: "video_canvas",
  siteId: "video",
  favorite: false,
  artifactId: "11111111-1111-4111-8111-111111111111",
  revisionId: "22222222-2222-4222-8222-222222222222",
  artifactType: "workflow",
  meta: { source_format: VIDEO_PROJECT_V2_SCHEMA },
  artifact: { sourceFormat: VIDEO_PROJECT_V2_SCHEMA, renditions: { source: { url: "https://media.test/s.json" } } },
});

test("save is a typed workflow revision whose source is the v2 JSON itself", async () => {
  const doc = parsed();
  const input = videoProjectSaveInput({ base: durableItem(), doc, editRevision: 3 });
  assert.equal(input.sourceFormat, VIDEO_PROJECT_V2_SCHEMA);
  assert.equal(input.sourceMediaType, "application/json");
  assert.equal(input.artifactRevision.artifactType, "workflow");
  assert.equal(input.project, undefined, "no editor-JSON envelope: the source is the project");
  assert.deepEqual(JSON.parse(await input.file.text()), JSON.parse(serializeVideoProjectDoc(doc)));
  const next = { ...durableItem(), revisionId: "33333333-3333-4333-8333-333333333333" };
  const ok = await saveVideoProject({ base: durableItem(), doc, editRevision: 3 }, async () => ({
    ok: true, item: next, revisionId: next.revisionId, error: "",
  }));
  assert.deepEqual([ok.ok, ok.revisionId], [true, next.revisionId]);
  const failed = await saveVideoProject({ base: durableItem(), doc, editRevision: 4 }, async () => ({
    ok: false, error: "网络断开", revisionId: "",
  }));
  assert.deepEqual(failed, { ok: false, error: "网络断开" });
  const same = await saveVideoProject({ base: durableItem(), doc, editRevision: 5 }, async () => ({
    ok: true, item: durableItem(), revisionId: durableItem().revisionId, error: "",
  }));
  assert.equal(same.ok, false, "a receipt that does not advance the revision is not 'saved'");
  const local = await saveVideoProject({ base: { ...durableItem(), artifactId: "" }, doc, editRevision: 1 }, async () => {
    throw new Error("must not be called");
  });
  assert.equal(local.ok, false);
});

test("route sends v2 items to the editable stage and loads the stored source without fallback", async () => {
  assert.equal(isNativeVideoProjectItem(durableItem()), true);
  assert.equal(isNativeVideoProjectItem({ ...durableItem(), meta: {}, artifact: undefined }), false);
  const wrapped = JSON.stringify({ schema: "x", version: 1, data: officialTemplate() });
  const loaded = await loadVideoProjectDoc(durableItem(), async () => wrapped);
  assert.equal(loaded.ok, true);
  const empty = await loadVideoProjectDoc(durableItem(), async () => "");
  assert.equal(empty.ok, false);
  const route = readFileSync(new URL("../src/shell/advanced-routes/VideoCanvasRoute.tsx", import.meta.url), "utf8");
  assert.match(route, /isNativeVideoProjectItem\(props\.item\)/);
  const stage = readFileSync(new URL("../src/shell/workflow-carrier/VideoProjectStage.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(stage, /readOnlyNativeV2|nativeV2ReadOnlyProjection/, "v2 is not a read-only projection any more");
  assert.doesNotMatch(stage, /flushVideoCanvasGraph/, "v2 never saves through the meta.graph receipt");
});

test("theme: light and dark are distinct, light is a real light surface; no hard-coded white in the canvas", () => {
  const { light, dark } = VIDEO_CANVAS_PALETTES;
  assert.equal(light.nodeBg, "#ffffff");
  assert.notEqual(dark.nodeBg, light.nodeBg);
  assert.notEqual(dark.nodeText, light.nodeText);
  const canvas = readFileSync(new URL("../src/shell/workflow-carrier/VideoProjectCanvas.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(canvas, /#fff\b|bg-white|text-black|text-stone-900/);
  assert.match(canvas, /colorMode=\{theme\}/);
  assert.match(canvas, /<MiniMap/);
  const layout = videoPreviewLayout([{ x: 0, y: 0 }, { x: 2000, y: 900 }]);
  assert.ok(layout.scale > 0 && layout.scale < 1);
});

test("a blank v2 project has the core's top-level shape and accepts new nodes", () => {
  const doc = createVideoProjectDoc("空白");
  const added = addVideoDocNode(doc, { kind: "video", title: "视频", position: { x: 1, y: 2 }, prompt: "" });
  assert.equal(videoDocGraph(added.doc).nodes[0].nodeId, added.id);
  assert.equal(parseVideoProjectDoc(JSON.parse(serializeVideoProjectDoc(added.doc))).ok, true);
});
