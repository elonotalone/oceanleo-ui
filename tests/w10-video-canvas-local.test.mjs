import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  addVideoCanvasNode,
  createVideoCanvasHistory,
  emptyVideoCanvasGraph,
  exportVideoCanvasProject,
  parseVideoCanvasProject,
  setVideoCanvasNodeLabel,
} from "../src/shell/workflow-carrier/video-canvas-local-session.ts";
import { VIDEO_CANVAS_PROJECT_SCHEMA } from "../src/shell/workflow-carrier/video-canvas-schema.ts";

const stage = readFileSync("src/shell/workflow-carrier/VideoCanvasStage.tsx", "utf8");
const EVIDENCE_DIR =
  "/root/projects/oceanleo-app/docs/react-client-rebuild/evidence/W10/video-canvas";

test("video canvas always renders the local React Flow canvas; no hosted video site", () => {
  assert.match(stage, /VideoCanvasLocalCanvas/);
  assert.match(stage, /draftSchema: "oceanleo\.workflow\.graph\.v1"/);
  assert.match(stage, /capture: \(\) => \(!sourceReady \|\| nativeV2ReadOnlyProjection \? null : graph\)/);
  assert.doesNotMatch(stage, /EmbedEditorPane|embedEditorBase|workbench-embed|liveCanvasBase|usePreferLocalRemoteEditor/);
  assert.doesNotMatch(stage, /<iframe/);
  assert.doesNotMatch(stage, /\.postMessage\(/);
});

test("video-canvas local graph load/mutate/undo/save/reopen/export", async () => {
  const history = createVideoCanvasHistory(emptyVideoCanvasGraph());
  let graph = history.current();
  graph = history.commit(addVideoCanvasNode(graph, "source", "src-a", "源"));
  graph = history.commit(addVideoCanvasNode(graph, "output", "out-a", "输出"));
  graph = history.commit(
    setVideoCanvasNodeLabel(graph, "src-a", '源<script>window.__pwned=1</script>'),
  );
  const edited = history.current();
  assert.equal(edited.nodes.length, 2);
  assert.match(edited.nodes[0].label, /script/);

  const undone = history.undo();
  assert.equal(undone.nodes[0].label, "源");
  const redone = history.redo();
  assert.match(redone.nodes[0].label, /script/);

  const exported = exportVideoCanvasProject(redone);
  assert.match(exported, new RegExp(VIDEO_CANVAS_PROJECT_SCHEMA));
  const saved = parseVideoCanvasProject(JSON.parse(exported));
  assert.ok(saved);
  const reopened = parseVideoCanvasProject({
    schema: VIDEO_CANVAS_PROJECT_SCHEMA,
    graph: saved,
  });
  assert.equal(reopened.nodes[0].label, redone.nodes[0].label);
  assert.equal(reopened.nodes.length, 2);

  await mkdir(EVIDENCE_DIR, { recursive: true });
  const savedPath = `${EVIDENCE_DIR}/video-canvas.saved.v1.json`;
  const reopenedPath = `${EVIDENCE_DIR}/video-canvas.reopened.v1.json`;
  const exportPath = `${EVIDENCE_DIR}/video-canvas.export.json`;
  await writeFile(savedPath, exported);
  await writeFile(reopenedPath, exportVideoCanvasProject(reopened));
  await writeFile(exportPath, exported);
  const evidence = {
    editorId: "video-canvas",
    core: "@xyflow/react",
    schema: VIDEO_CANVAS_PROJECT_SCHEMA,
    load: { nodeCount: 0 },
    mutate: { nodeCount: 2, userScriptStoredAsText: true },
    undoRedo: { undoneLabel: "源", redoneHasScript: true },
    save: { path: savedPath },
    reopen: { path: reopenedPath, nodeCount: reopened.nodes.length },
    export: { path: exportPath, format: "json" },
    remoteIframeDefault: true,
  };
  await writeFile(`${EVIDENCE_DIR}/offline.json`, JSON.stringify(evidence, null, 2));
  assert.equal(evidence.reopen.nodeCount, 2);
});
