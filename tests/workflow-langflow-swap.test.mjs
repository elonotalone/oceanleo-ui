/**
 * W15 判据 1 / 4：flow JSON ↔ Langflow 转换、chips、默认送审的纯函数路由。
 * 接线（iframe / 画布槽）在 workflow-langflow-wiring.test.mjs。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  validAgentChips,
  validReviewProposal,
} from "../src/shell/hosted-editor/index.ts";
import { chipsForEditor } from "../src/shell/quick-actions/catalog.ts";
import {
  rememberEditorChips,
  resetAgentReviewInbox,
} from "../src/shell/agent-review/inbox.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import {
  DEFAULT_EDITOR_CORE,
  resolveEditorCore,
} from "../src/shell/editor-core-flags.ts";
import {
  decodeLangflowHandle,
  encodeLangflowHandle,
  fromLangflowFlow,
  langflowRoundTripMatches,
  toLangflowFlow,
} from "../src/shell/workflow-carrier/langflow-flow-json.ts";
import {
  WORKFLOW_LANGFLOW_EMBED_ORIGIN,
  assessLangflowRunnability,
  buildWorkflowFlowInitEnvelope,
  canBuildWorkflowLangflowEmbedUrl,
  workflowLangflowEmbedBase,
} from "../src/shell/workflow-carrier/langflow-embed.ts";
import {
  WORKFLOW_AGENT_CHIPS,
  workflowAgentChipsAreValid,
  workflowToolsManifestChips,
} from "../src/shell/workflow-carrier/l4-chips.ts";
import {
  dispatchWorkflowAgentChip,
  isWorkflowHumanStamp,
  routeWorkflowChip,
} from "../src/shell/workflow-carrier/agent-route.ts";
import {
  WORKFLOW_LANGFLOW_DEFAULT_MODE,
  applyWorkflowEditorMode,
} from "../src/shell/workflow-carrier/langflow-mode.ts";
import { DEFAULT_EDITOR_MODE } from "../src/shell/hosted-editor/index.ts";

function port(name, dataType) {
  return { name, dataType, required: true };
}

function sampleGraph() {
  return {
    nodes: [
      {
        id: "src-a",
        kind: "source",
        label: "素材",
        x: 0,
        y: 0,
        assetId: "asset-main",
        params: { gain: 1 },
        ports: { inputs: [], outputs: [port("out", "video")] },
      },
      {
        id: "branch-a",
        kind: "branch",
        label: "分流",
        x: 240,
        y: 0,
        params: { expr: "score > 0.5" },
        ports: {
          inputs: [port("in", "video")],
          outputs: [port("yes", "video"), port("no", "video")],
        },
      },
      {
        id: "out-a",
        kind: "output",
        label: "成片",
        x: 480,
        y: 0,
        ports: { inputs: [port("final", "video")], outputs: [] },
      },
    ],
    edges: [
      {
        id: "e1",
        fromNodeId: "src-a",
        fromPort: "out",
        toNodeId: "branch-a",
        toPort: "in",
      },
      {
        id: "e2",
        fromNodeId: "branch-a",
        fromPort: "yes",
        toNodeId: "out-a",
        toPort: "final",
        condition: "ok",
      },
    ],
  };
}

test("video-canvas stays legacy; default mode is normal", () => {
  assert.equal(DEFAULT_EDITOR_CORE, "legacy");
  assert.equal(resolveEditorCore("video-canvas"), "legacy");
  assert.equal(WORKFLOW_LANGFLOW_DEFAULT_MODE, "normal");
  assert.equal(WORKFLOW_LANGFLOW_DEFAULT_MODE, DEFAULT_EDITOR_MODE);
});

test("round-trip keeps nodes, edges, ports, params, conditions", () => {
  const graph = sampleGraph();
  assert.equal(langflowRoundTripMatches(graph), true);
  const exported = toLangflowFlow(graph, { flowId: "f1", name: "demo" });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const back = fromLangflowFlow(exported.flow);
  assert.equal(back.ok, true);
  if (!back.ok) return;
  assert.equal(back.graph.nodes.length, 3);
  assert.equal(back.graph.edges.length, 2);
  const yes = back.graph.edges.find((edge) => edge.id === "e2");
  assert.equal(yes?.fromPort, "yes");
  assert.equal(yes?.toPort, "final");
  assert.equal(yes?.condition, "ok");
  const branch = back.graph.nodes.find((node) => node.id === "branch-a");
  assert.equal(branch?.params.expr, "score > 0.5");
});

test("handle encoding uses Langflow oe-quote and both spacing forms", () => {
  const handle = { dataType: "source", id: "n1", name: "out", output_types: ["OceanLeoVideo"] };
  const spaced = encodeLangflowHandle(handle, true);
  const compact = encodeLangflowHandle(handle, false);
  assert.match(spaced, /\u0153/);
  assert.doesNotMatch(spaced, /"/);
  assert.equal(spaced.includes(": "), true);
  assert.equal(compact.includes(":"), true);
  assert.equal(compact.includes(": "), false);
  assert.deepEqual(decodeLangflowHandle(spaced).name, "out");
  assert.deepEqual(decodeLangflowHandle(compact).id, "n1");
});

test("dangling edges and foreign nodes fail closed with a human reason", () => {
  const dangling = toLangflowFlow(
    {
      nodes: sampleGraph().nodes.slice(0, 1),
      edges: sampleGraph().edges,
    },
    { flowId: "x", name: "x" },
  );
  assert.equal(dangling.ok, false);
  if (dangling.ok) return;
  assert.match(dangling.message, /连线/);

  const exported = toLangflowFlow(sampleGraph(), { flowId: "f", name: "f" });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  exported.flow.data.nodes.push({
    id: "OpenAIModel-abcde",
    type: "genericNode",
    position: { x: 1, y: 1 },
    data: { id: "OpenAIModel-abcde", type: "OpenAIModel", node: { template: {} } },
  });
  const back = fromLangflowFlow(exported.flow);
  assert.equal(back.ok, true);
  if (!back.ok) return;
  assert.equal(back.warnings.length > 0, true);
  assert.match(back.warnings[0], /Langflow 原生节点/);
});

test("runnability names the missing OceanLeo component package", () => {
  const exported = toLangflowFlow(sampleGraph(), { flowId: "f", name: "f" });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const blocked = assessLangflowRunnability(exported.flow, {
    componentsInstalled: false,
  });
  assert.equal(blocked.runnable, false);
  assert.equal(
    blocked.blockers.some((row) => row.code === "flow-component-not-installed"),
    true,
  );
  const okRun = assessLangflowRunnability(exported.flow, {
    componentsInstalled: true,
  });
  assert.equal(okRun.runnable, true);
});

test("init envelope carries flow, never a token, and starts in normal", () => {
  const exported = toLangflowFlow(sampleGraph(), { flowId: "f", name: "f" });
  assert.equal(exported.ok, true);
  if (!exported.ok) return;
  const envelope = buildWorkflowFlowInitEnvelope("inst-1", {
    flow: exported.flow,
    readOnly: false,
    title: "demo",
  });
  assert.equal(envelope.mode, "normal");
  assert.equal(envelope.flow, exported.flow);
  assert.equal(Object.prototype.hasOwnProperty.call(envelope, "token"), false);
  assert.equal(WORKFLOW_LANGFLOW_EMBED_ORIGIN, "https://flow.oceanleo.app");
  assert.equal(canBuildWorkflowLangflowEmbedUrl(workflowLangflowEmbedBase()), true);
});

test("eight tools-manifest v2 chips pass the host validator; a ninth does not", () => {
  assert.equal(workflowAgentChipsAreValid(), true);
  const manifest = workflowToolsManifestChips();
  assert.equal(manifest.manifestVersion, 2);
  assert.equal(manifest.chips.length, 8);
  assert.equal(validAgentChips(manifest.chips), true);
  assert.ok(manifest.chips.some((chip) => chip.id === "workflow.chip.gen"));
  const ninth = { ...manifest.chips[0], id: "workflow.chip.ninth", label: "第九条" };
  assert.equal(validAgentChips([...manifest.chips, ninth]), false);
});

test("unstamped mutating chip routes to review; graph is not written", () => {
  resetAgentReviewInbox();
  const graph = sampleGraph();
  const extra = {
    ...graph,
    nodes: [
      ...graph.nodes,
      {
        id: "extra",
        kind: "filter",
        x: 10,
        y: 10,
        ports: { inputs: [], outputs: [] },
      },
    ],
  };
  const routed = routeWorkflowChip({
    chipId: "workflow.chip.gen",
    graph,
    revision: 0,
    proposedGraph: extra,
  });
  assert.equal(routed.kind, "review");
  if (routed.kind !== "review") return;
  assert.equal(validReviewProposal(routed.proposal), true);
  const dispatched = dispatchWorkflowAgentChip({
    chipId: "workflow.chip.gen",
    graph,
    revision: 0,
    proposedGraph: extra,
  });
  assert.equal(dispatched.parked, true);
  assert.equal(dispatched.graph.nodes.length, 3);
  assert.equal(hostReviewSession.snapshot().parked?.proposal.commandId, "workflow.chip.gen");
  resetAgentReviewInbox();
});

test("only an explicit human stamp executes; typos still review", () => {
  const graph = sampleGraph();
  const extra = {
    ...graph,
    nodes: [...graph.nodes, { id: "n2", kind: "text", x: 1, y: 1, ports: { inputs: [], outputs: [] } }],
  };
  assert.equal(isWorkflowHumanStamp("user"), true);
  assert.equal(isWorkflowHumanStamp("USER"), false);
  assert.equal(isWorkflowHumanStamp("agent"), false);
  assert.equal(isWorkflowHumanStamp(undefined), false);
  const human = dispatchWorkflowAgentChip({
    chipId: "workflow.chip.gen",
    origin: "l1",
    graph,
    revision: 0,
    proposedGraph: extra,
  });
  assert.equal(human.route.kind, "execute");
  assert.equal(human.graph.nodes.length, extra.nodes.length);
  const typo = routeWorkflowChip({
    chipId: "workflow.chip.gen",
    origin: "Human",
    graph,
    revision: 0,
  });
  assert.equal(typo.kind, "review");
  const missing = routeWorkflowChip({
    chipId: "workflow.chip.nope",
    origin: "user",
    graph,
    revision: 0,
  });
  assert.equal(missing.kind, "reject");
});

test("mode plan hides the canvas in pro and only then shows the hosted iframe", () => {
  const normal = applyWorkflowEditorMode("wf-1", "normal");
  const pro = applyWorkflowEditorMode("wf-1", "pro");
  assert.equal(normal.showCanvas, true);
  assert.equal(normal.showHostedEditor, false);
  assert.equal(pro.showCanvas, false);
  assert.equal(pro.showHostedEditor, true);
  assert.equal(pro.message.type, "set-mode");
  assert.equal(pro.message.mode, "pro");
});

test("remembered workflow chips surface eight entries for the host catalog", () => {
  resetAgentReviewInbox();
  assert.equal(chipsForEditor("workflow", null).length > 0, true);
  const remembered = rememberEditorChips(
    "workflow",
    workflowToolsManifestChips().chips,
  );
  assert.equal(remembered, true);
  assert.equal(chipsForEditor("workflow", null).length, 8);
  assert.equal(
    chipsForEditor("workflow", null)
      .map((chip) => chip.id)
      .join(","),
    WORKFLOW_AGENT_CHIPS.map((chip) => chip.id).join(","),
  );
  resetAgentReviewInbox();
});
