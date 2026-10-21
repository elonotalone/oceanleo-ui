import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  hydrateWorkflowGraph,
  parseStoredWorkflowGraph,
  planWorkflowGraphFromItem,
} from "../src/shell/workflow-carrier/workflow-graph-source.ts";

const ROOT_ID = "9c6ef0c3-34dc-4a80-ac80-ab269d31ba18";
const SOURCE_REVISION_ID = "0b7be1b1-4f3b-43f5-93fc-1fb210c42fda";
const SOURCE_URL = "https://files.example.test/current-video-project-v2.json";

function sourceDependencyRows(source) {
  const head = source.versions.find((version) => version.id === source.headVersionId);
  assert.ok(head, "actual v1 fixture must identify its exact current head");
  const assetPaths = new Map(
    head.graph.nodes
      .filter((node) => node.assetId && typeof node.params?.path === "string")
      .map((node) => [node.assetId, node.params.path]),
  );
  return source.assets.map((asset) => ({
    assetId: asset.id,
    artifactId: ROOT_ID,
    revisionId: SOURCE_REVISION_ID,
    path: assetPaths.get(asset.id),
    sha256: asset.sha256,
    mediaType: asset.mediaType,
    byteSize: asset.byteSize,
  }));
}

test("canonical video v2 source wins over stale inline graph and editor URL", async () => {
  const staleGraph = {
    nodes: [{ id: "stale-v1", kind: "source", label: "旧快照", x: 0, y: 0, ports: { outputs: [] } }],
    edges: [],
  };
  const item = {
    key: "artifact:video-v2",
    source: "artifact",
    id: ROOT_ID,
    artifactId: ROOT_ID,
    revisionId: "4723e956-b9be-4421-bd1f-929a1ebc4dbf",
    artifactType: "workflow",
    meta: {
      source_format: "oceanleo.video.project.v2",
      graph: staleGraph,
      editor_project_url: "https://files.example.test/stale-v1.json",
    },
    artifact: {
      sourceFormat: "oceanleo.video.project.v2",
      renditions: { source: { url: SOURCE_URL }, full: { url: "https://files.example.test/full.json" } },
    },
  };
  const plan = planWorkflowGraphFromItem(item);
  assert.deepEqual(plan, { kind: "remote", url: SOURCE_URL });

  const nativeSource = {
    schema: "oceanleo.video.project.v2",
    schemaVersion: 2,
    headVersionId: "v2-head",
    versions: {
      "stale-version": { versionId: "stale-version", graph: { nodes: [], edges: [] } },
      "v2-head": {
        versionId: "v2-head",
        graph: {
          nodes: [
            {
              nodeId: "v2-node",
              kind: "video",
              title: "当前 v2 head",
              position: { x: 120, y: 240 },
              localEditRecipe: [],
            },
          ],
          edges: [],
        },
      },
    },
  };
  const loaded = await hydrateWorkflowGraph(plan, async (url) => {
    assert.equal(url, SOURCE_URL);
    return JSON.stringify(nativeSource);
  });
  assert.equal(loaded.ok, true);
  assert.equal(loaded.graph.nodes.length, 1);
  assert.equal(loaded.graph.nodes[0].id, "v2-node");
  assert.equal(loaded.graph.nodes[0].label, "当前 v2 head");
  assert.deepEqual(loaded.graph.nodes[0].ports, { inputs: [], outputs: [] });
  assert.notEqual(loaded.graph.nodes[0].id, "stale-v1");
});

test("invalid native v2 head fails closed rather than falling back to a stale graph", async () => {
  const result = (() => {
    try {
      parseStoredWorkflowGraph(JSON.stringify({
        schema: "oceanleo.video.project.v2",
        schemaVersion: 2,
        headVersionId: "missing-head",
        versions: {
          "old-head": { versionId: "old-head", graph: { nodes: [], edges: [] } },
        },
      }));
      return { ok: true };
    } catch (error) {
      return { ok: false, error };
    }
  })();
  assert.equal(result.ok, false);
  assert.match(result.error.message, /head/);
});

test("every canonical core node kind has an explicit read-only host projection", () => {
  const kinds = [
    "text", "image", "video", "audio", "script", "model", "subtitle",
    "composite", "delivery", "director", "storyboard", "timeline",
  ];
  const project = {
    schema: "oceanleo.video.project.v2",
    schemaVersion: 2,
    headVersionId: "head",
    versions: {
      head: {
        versionId: "head",
        graph: {
          nodes: kinds.map((kind, index) => ({
            nodeId: `node-${kind}`,
            kind,
            title: `${kind} title`,
            position: { x: index * 20, y: index * 10 },
            localEditRecipe: [],
          })),
          edges: [
            {
              edgeId: "native-default-handle-edge",
              sourceNodeId: "node-director",
              targetNodeId: "node-storyboard",
            },
          ],
        },
      },
    },
  };
  const graph = parseStoredWorkflowGraph(JSON.stringify(project));
  assert.equal(graph.nodes.length, kinds.length);
  assert.deepEqual(graph.nodes.map((node) => node.nativeKind), kinds);
  assert.equal(graph.readOnlyNativeV2, true);
  assert.ok(graph.nodes.every((node) => node.kind));
  assert.deepEqual(
    [graph.edges[0].fromPort, graph.edges[0].toPort],
    ["out-media", "in-media"],
  );
});

const actualSourcePath = process.env.W04_ACTUAL_V1_SOURCE || "";
test("actual v1 source migrates through typed v2 and reopens with all active nodes, params, ports, and edges", {
  skip: !actualSourcePath,
}, async () => {
  const sourceBytes = readFileSync(actualSourcePath);
  assert.equal(
    createHash("sha256").update(sourceBytes).digest("hex"),
    "a9cf73ccd3ac858cdac83e09d7b616e8ebabfd715b65563dfb5c28c72fcd8b31",
    "test must exercise the exact actual Library source fixture",
  );
  const source = JSON.parse(sourceBytes.toString("utf8"));
  const core = await import("../../video/packages/gallery-editor/src/project-model.ts");
  const migration = core.migrateV1Workflow(source, {
    sourceDependencies: sourceDependencyRows(source),
  });
  assert.equal(migration.ok, true, JSON.stringify(migration.report.issues));
  const v2 = core.projectForTypedArtifactCommit(migration.project, ROOT_ID);
  const bytes = JSON.stringify(v2);

  const originalHead = source.versions.find((version) => version.id === source.headVersionId);
  const originalNodes = new Map(originalHead.graph.nodes.map((node) => [node.id, node]));
  const originalEdges = new Map(originalHead.graph.edges.map((edge) => [edge.id, edge]));
  const projected = parseStoredWorkflowGraph(bytes);
  assert.equal(projected.nodes.length, 9);
  assert.equal(projected.edges.length, 9);
  for (const node of projected.nodes) {
    const original = originalNodes.get(node.id);
    assert.ok(original, `projected node ${node.id} belongs to the original exact head`);
    assert.equal(node.kind, original.kind);
    assert.equal(node.label, original.label);
    assert.deepEqual({ x: node.x, y: node.y }, { x: original.x, y: original.y });
    assert.deepEqual(node.params, original.params);
    assert.deepEqual(node.ports, original.ports);
    assert.deepEqual(node.legacySourceNode, original);
  }
  for (const edge of projected.edges) {
    const original = originalEdges.get(edge.id);
    assert.ok(original, `projected edge ${edge.id} belongs to the original exact head`);
    assert.deepEqual(
      [edge.fromNodeId, edge.fromPort, edge.toNodeId, edge.toPort],
      [original.fromNodeId, original.fromPort, original.toNodeId, original.toPort],
    );
    assert.deepEqual(edge.legacySourceEdge, original);
  }
  assert.equal(new Set(projected.nodes.map((node) => node.id)).size, 9);
  assert.equal(new Set(projected.edges.map((edge) => edge.id)).size, 9);
  assert.equal(Object.keys(v2.assets).length, 3);
  assert.ok(Object.values(v2.assets).every((asset) => asset.sourceDependency?.artifactId === ROOT_ID));
  assert.doesNotMatch(bytes, /blob:|data:|artifact-renditions\/access/);
});
