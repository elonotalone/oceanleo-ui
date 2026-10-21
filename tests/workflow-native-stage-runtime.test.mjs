import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import { applyParkedReview, gateSurfaceForAgent } from "../src/shell/agent-review/gate.ts";
import { hostReviewSession } from "../src/shell/agent-review/session.ts";
import { WorkspaceSessionContext } from "../src/shell/workspace-session-context.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// Real React/DOM mounting, following the repo's jsdom-in-fabric test pattern.
// No browser or Playwright is used. The only editor-engine boundary below is
// EmbedEditorPane: it records the real Stage props and lets this test deliver
// capture/restore acknowledgements as a deterministic native-frame transport.
const require = createRequire(import.meta.url);
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
  url: "https://oceanleo.com/",
});
const { window } = dom;
for (const [name, value] of Object.entries({
  window,
  document: window.document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  HTMLInputElement: window.HTMLInputElement,
  HTMLTextAreaElement: window.HTMLTextAreaElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  MouseEvent: window.MouseEvent,
  CustomEvent: window.CustomEvent,
  localStorage: window.localStorage,
  requestAnimationFrame: window.requestAnimationFrame.bind(window),
  cancelAnimationFrame: window.cancelAnimationFrame.bind(window),
  getComputedStyle: window.getComputedStyle.bind(window),
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const reactNs = await import("react");
const React = reactNs.createElement ? reactNs : reactNs.default;
const { act } = reactNs.act ? reactNs : React;
const { createRoot } = await import("react-dom/client");

const splitPaneStub = dataModule("export function useWorkspacePane(){ return null; }");
const advancedShellStub = dataModule(
  "export function AdvancedWorkbenchShell({adapter}){ return adapter.stage; }",
);
const frameStub = dataModule(`
  export function embedEditorBase(){ return "https://video-frame.test"; }
  export function EmbedEditorPane(props){
    globalThis.__workflowNativeFrameProps = props;
    return null;
  }
`);
const collabStub = dataModule(`
  export function useEntityCollab(){
    return {readOnly:false, saveGate:true, room:null, collab:null, markSaved(){}};
  }
  export function useLockedEditCollab(){
    return {readOnly:false, mayWrite:true, collab:null, markSaved(){}};
  }
`);
const uiStub = dataModule("export function useUI(){ return (message) => message; }");
const mediaStub = dataModule(`
  export { isFirstPartyMediaUrl } from ${JSON.stringify(pathToFileURL(require.resolve("../src/lib/media-proxy.ts")).href)};
  export async function fetchMediaBlob(){ throw new Error('unexpected remote source read'); }
`);
const dynamicStub = dataModule("export default function dynamic(){ return function DynamicPlaceholder(){ return null; }; }");
const failurePanelStub = dataModule("export function EditorSourceFailurePanel(){ return null; }");
const useImStub = dataModule("export function useImEnabled(){ return false; }");
const preferLocalStub = dataModule("export function usePreferLocalRemoteEditor(){ return false; }");

// Keep the production Stage, plugin-command registry/hook, CanvasCollabLink,
// target normalization, workflow bridge, and shared review gate real. These
// stubs cover only shell chrome, auth/collab transports, and the iframe boundary.
const stubs = {
  "../AdvancedWorkbenchShell": advancedShellStub,
  "../SplitWorkspace": splitPaneStub,
  "../workbench-embed": frameStub,
  "../collab/adapters/use-entity-collab": collabStub,
  "../../i18n/ui/useUI": uiStub,
  "../../lib/media-proxy": mediaStub,
  "../../lib/im/client": useImStub,
  "../use-prefer-local-editors": preferLocalStub,
  "../doc-editors/EditorSourceFailurePanel": failurePanelStub,
  "next/dynamic": dynamicStub,
};

const { VideoCanvasStage } = await import(
  await compileModule("src/shell/workflow-carrier/VideoCanvasStage.tsx", stubs)
);
const commandModule = await import(
  await compileModule("src/shell/plugin-command/index.ts", stubs)
);
const { currentPluginCommandSurface, resetPluginCommandSurface } = commandModule;
const inboxModule = await import(
  await compileModule("src/shell/agent-review/inbox.ts", stubs)
);
const { rememberedChips, resetAgentReviewInbox } = inboxModule;

const SCHEMA = "oceanleo.canvas.collab.v1";
const SCOPE = "workflow-stage-runtime-scope";
const initialNativeGraph = () => ({
  nodes: [
    {
      nodeId: "source-node",
      kind: "video",
      title: "素材输入",
      position: { x: 100, y: 100 },
      localEditRecipe: [],
    },
  ],
  edges: [],
});

const snapshot = (revision, graph, supportsAgentWrite = true) => ({
  revision,
  payload: {
    schema: SCHEMA,
    op: "state",
    loaded: true,
    ...(supportsAgentWrite ? { agentWriteProtocol: 1 } : {}),
    versionId: `native-v${revision}`,
    nodes: graph.nodes,
    edges: graph.edges,
  },
});

function item(id = "workflow-one", revisionId = "r1") {
  return {
    key: `artifact:${id}:${revisionId}`,
    id,
    artifactId: id,
    revisionId,
    artifactType: "workflow",
    kind: "workflow",
    title: id,
    meta: {
      graph: {
        nodes: [
          {
            id: "source-node",
            kind: "video",
            label: "素材输入",
            x: 100,
            y: 100,
            ports: {},
          },
        ],
        edges: [],
      },
    },
  };
}

async function tick(milliseconds = 0) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, milliseconds));
  });
}

async function waitFor(predicate, message, timeout = 2500) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = predicate();
    if (value) return value;
    await tick(10);
  }
  assert.fail(message);
}

async function renderStage(openItem = item()) {
  resetPluginCommandSurface();
  resetAgentReviewInbox();
  globalThis.__workflowNativeFrameProps = null;
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  const render = async (nextItem) => {
    await act(async () => {
      root.render(
        React.createElement(
          WorkspaceSessionContext.Provider,
          { value: { activeFileScopeId: SCOPE } },
          React.createElement(VideoCanvasStage, {
            item: nextItem,
            taskId: "workflow-task",
            siteId: "oceanleo",
            onClose() {},
          }),
        ),
      );
    });
    await tick(0);
  };
  await render(openItem);
  await waitFor(() => globalThis.__workflowNativeFrameProps, "Stage did not mount the native-frame boundary");
  return {
    host,
    async render(nextItem) {
      await render(nextItem);
    },
    async cleanup() {
      await act(async () => root.unmount());
      host.remove();
      await tick(0);
      resetPluginCommandSurface();
      resetAgentReviewInbox();
      globalThis.__workflowNativeFrameProps = null;
    },
  };
}

function frameProps() {
  const props = globalThis.__workflowNativeFrameProps;
  assert.ok(props, "native-frame boundary should be mounted");
  return props;
}

async function requestAndReplyCapture(graph, revision, supportsAgentWrite = true) {
  const props = await waitFor(
    () => {
      const value = frameProps();
      return value.recoveryCaptureRequestId ? value : null;
    },
    "Stage did not request a native capture",
  );
  const recoveryId = props.recoveryCaptureRequestId;
  await act(async () => {
    props.onRecoverySnapshot({
      recoveryId,
      ok: true,
      snapshot: snapshot(revision, graph, supportsAgentWrite),
    });
  });
}

async function initializeStage(view, graph = initialNativeGraph(), revision = 41, supportsAgentWrite = true) {
  await act(async () => frameProps().onProjectManifest?.());
  await tick(330);
  await requestAndReplyCapture(graph, revision, supportsAgentWrite);
  const controlProps = await waitFor(
    () => frameProps().recoveryRestore?.snapshot?.payload?.op === "control" ? frameProps() : null,
    "Stage did not send the real CanvasCollabLink control message",
  );
  const control = controlProps.recoveryRestore;
  await act(async () => {
    controlProps.onRecoveryResult({ recoveryId: control.recoveryId, ok: true });
  });
  await requestAndReplyCapture(graph, revision, supportsAgentWrite);
  const surface = currentPluginCommandSurface();
  assert.ok(surface, "actual plugin command surface registered by Stage");
  assert.deepEqual(surface.target(), {
    workspaceScopeId: SCOPE,
    editorId: "workflow",
    artifactId: "workflow-one",
    revisionId: "r1",
    artifactType: "workflow",
    editRevision: revision,
    surfaceInstanceId: surface.target().surfaceInstanceId,
  });
  const context = surface.agentContext?.();
  assert.equal(context?.ready, true, "native capture must be the content source for this exact target");
  assert.match(JSON.stringify(context?.content), /source-node|素材输入/);
  return surface;
}

function applyPatchAtNativeBoundary(graph, snapshotValue) {
  const payload = snapshotValue.payload;
  const nodes = graph.nodes.map((node) => ({ ...node }));
  const edges = graph.edges.map((edge) => ({ ...edge }));
  for (const id of payload.nodes.remove) {
    const index = nodes.findIndex((node) => node.nodeId === id);
    if (index >= 0) nodes.splice(index, 1);
  }
  for (const patch of payload.nodes.upsert) {
    const index = nodes.findIndex((node) => node.nodeId === patch.id);
    const next = { ...(index >= 0 ? nodes[index] : {}), ...patch.set, nodeId: patch.id };
    if (index >= 0) nodes[index] = next;
    else nodes.push(next);
  }
  for (const id of payload.edges.remove) {
    const index = edges.findIndex((edge) => edge.edgeId === id);
    if (index >= 0) edges.splice(index, 1);
  }
  for (const patch of payload.edges.upsert) {
    const index = edges.findIndex((edge) => edge.edgeId === patch.id);
    const next = { ...(index >= 0 ? edges[index] : {}), ...patch.set, edgeId: patch.id };
    if (index >= 0) edges[index] = next;
    else edges.push(next);
  }
  return { nodes, edges };
}

async function stageAgentWrite(surface, params = { kind: "text", label: "用户接受的标题" }) {
  const agent = gateSurfaceForAgent(surface, hostReviewSession);
  const parkedResult = await agent.run("workflow.add-node", params);
  assert.equal(parkedResult.ok, true);
  assert.match(parkedResult.message, /审阅/);
  const parked = hostReviewSession.snapshot().parked;
  assert.ok(parked, "real shared gate parks the mutation before native delivery");
  let pending;
  await act(async () => {
    pending = applyParkedReview(surface, parked);
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  const restoreProps = await waitFor(
    () => frameProps().recoveryRestore?.snapshot?.payload?.op === "patch" ? frameProps() : null,
    "accepted proposal was not delivered to the native frame boundary",
  );
  return { parkedResult, parked, pending, restoreProps, restore: restoreProps.recoveryRestore };
}

test("mounted Stage advertises only a native command and the shared accepted review changes the live graph", async () => {
  const view = await renderStage();
  try {
    const graph = initialNativeGraph();
    const surface = await initializeStage(view, graph);
    assert.deepEqual(
      surface.describe().map((spec) => spec.id),
      ["workflow.add-node"],
      `non-executable workflow chips are suggestions, not mutating Agent commands; mode=${view.host.querySelector("[data-collab-mode]")?.getAttribute("data-collab-mode")}, state=${JSON.stringify(surface.state())}, frame=${JSON.stringify({ captureId: frameProps().recoveryCaptureRequestId, restore: frameProps().recoveryRestore?.snapshot?.payload?.op })}`,
    );
    assert.ok(
      surface.state().chips.includes("workflow.chip.gen"),
      "natural-language workflow suggestions remain available in the editor state",
    );
    assert.ok(rememberedChips("workflow")?.some((chip) => chip.id === "workflow.chip.gen"));
    const unknownChip = await gateSurfaceForAgent(surface, hostReviewSession).run(
      "workflow.chip.gen",
      {},
    );
    assert.equal(unknownChip.ok, true, "the generic gate may park an unadvertised id, but cannot execute it");
    const unadvertisedParked = hostReviewSession.snapshot().parked;
    assert.ok(unadvertisedParked);
    const rejectedUnknown = await applyParkedReview(surface, unadvertisedParked);
    assert.equal(rejectedUnknown.ok, false, "registry refuses acceptance for a command the Stage does not advertise");
    assert.equal(
      hostReviewSession.snapshot().parked?.proposal.proposalId,
      unadvertisedParked.proposal.proposalId,
      "acceptance cannot call the old chip dispatcher and park a second proposal",
    );
    hostReviewSession.reset();

    const accepted = await stageAgentWrite(surface);
    assert.equal(accepted.restore.snapshot.expectedNativeRevision, 41);
    assert.equal(accepted.restore.snapshot.payload.op, "patch");
    assert.equal(accepted.restore.snapshot.payload.nodes.upsert[0].set.title, "用户接受的标题");
    assert.equal(graph.nodes.length, 1, "agent proposal alone does not mutate the visible graph");

    const request = accepted.restore;
    let liveNativeRevision = 41;
    graph.nodes.splice(0, graph.nodes.length, ...applyPatchAtNativeBoundary(graph, request.snapshot).nodes);
    liveNativeRevision += 1;
    await act(async () => {
      accepted.restoreProps.onRecoveryResult({
        recoveryId: request.recoveryId,
        ok: true,
        revision: liveNativeRevision,
        expectedNativeRevision: 41,
      });
    });
    await requestAndReplyCapture(graph, liveNativeRevision, true);

    const result = await accepted.pending;
    assert.equal(result.ok, true, result.message);
    assert.equal(graph.nodes.length, 2, "the simulated native frame now owns the accepted node");
    assert.equal(graph.nodes[1].title, "用户接受的标题");
    assert.equal(hostReviewSession.snapshot().status, "open", "the real shared gate keeps apply status separate from transport completion");
    hostReviewSession.markApplied(result.revision);
    assert.equal(hostReviewSession.snapshot().status, "applied");
  } finally {
    await view.cleanup();
  }
});

test("old native receiver is not offered a write and workflow chips cannot create a second parked proposal", async () => {
  const view = await renderStage();
  try {
    const surface = await initializeStage(view, initialNativeGraph(), 41, false);
    assert.deepEqual(surface.describe(), [], "missing native write capability means no executable add command");
    const gatedChip = await gateSurfaceForAgent(surface, hostReviewSession).run("workflow.chip.gen", {});
    assert.equal(gatedChip.ok, true, "the generic gate can only make a review record for an unknown id");
    const parkedChip = hostReviewSession.snapshot().parked;
    assert.ok(parkedChip);
    const rejectedChip = await applyParkedReview(surface, parkedChip);
    assert.equal(rejectedChip.ok, false, "old receiver cannot accept a chip as an executable command");
    assert.equal(hostReviewSession.snapshot().parked?.proposal.proposalId, parkedChip.proposal.proposalId);
    hostReviewSession.reset();
    assert.deepEqual(await surface.run("workflow.chip.gen", {}), {
      ok: false,
      message: "当前编辑器现在一条指令都没有，「workflow.chip.gen」无法执行。",
    });
    assert.deepEqual(await surface.run("workflow.add-node", { kind: "text", label: "不应写入" }), {
      ok: false,
      message: "当前编辑器现在一条指令都没有，「workflow.add-node」无法执行。",
    });
    assert.equal(hostReviewSession.snapshot().parked, null);
    assert.notEqual(frameProps().recoveryRestore?.snapshot?.payload?.op, "patch");
    assert.ok(rememberedChips("workflow")?.length, "read-only suggestion chips remain available");
  } finally {
    await view.cleanup();
  }
});

test("native CAS stale revision fails closed without mutating the visible graph", async () => {
  const view = await renderStage();
  try {
    const graph = initialNativeGraph();
    const surface = await initializeStage(view, graph, 41, true);
    const accepted = await stageAgentWrite(surface);
    assert.equal(accepted.restore.snapshot.expectedNativeRevision, 41);

    // The frame transport stub models the receiver seeing a newer live native
    // version than the CAS guard. It refuses before applying the patch.
    const currentNativeRevision = 42;
    await act(async () => {
      accepted.restoreProps.onRecoveryResult({
        recoveryId: accepted.restore.recoveryId,
        ok: false,
        revision: currentNativeRevision,
        expectedNativeRevision: 41,
      });
    });
    const result = await accepted.pending;
    assert.equal(result.ok, false);
    assert.match(result.message, /拒绝|原生版本比较/);
    assert.equal(graph.nodes.length, 1);
    assert.equal(hostReviewSession.snapshot().status, "open", "a failed receiver must not be marked applied");
  } finally {
    await view.cleanup();
  }
});

test("target/instance switch and unmount cancel pending writes and ignore late old-frame acknowledgements", async () => {
  const view = await renderStage();
  try {
    const graph = initialNativeGraph();
    const surface = await initializeStage(view, graph, 41, true);
    const accepted = await stageAgentWrite(surface);
    const oldFrame = accepted.restoreProps;
    await view.render(item("workflow-two", "r7"));
    const switchResult = await accepted.pending;
    assert.equal(switchResult.ok, false);
    assert.match(switchResult.message, /重新载入|切换/);
    assert.equal(currentPluginCommandSurface()?.target()?.artifactId, "workflow-two");
    await act(async () => {
      oldFrame.onRecoveryResult({
        recoveryId: accepted.restore.recoveryId,
        ok: true,
        revision: 42,
        expectedNativeRevision: 41,
      });
    });
    assert.equal(graph.nodes.length, 1, "late acknowledgement from the old target cannot mutate the new file");
  } finally {
    await view.cleanup();
  }

  const instanceView = await renderStage();
  try {
    const graph = initialNativeGraph();
    const surface = await initializeStage(instanceView, graph, 46, true);
    const accepted = await stageAgentWrite(surface);
    const oldFrame = accepted.restoreProps;
    await act(async () => oldFrame.onProtocolReset?.());
    const resetResult = await accepted.pending;
    assert.equal(resetResult.ok, false);
    assert.match(resetResult.message, /重新载入|切换/);
    await act(async () => {
      oldFrame.onRecoveryResult({
        recoveryId: accepted.restore.recoveryId,
        ok: true,
        revision: 47,
        expectedNativeRevision: 46,
      });
    });
    assert.equal(graph.nodes.length, 1, "ack from the reset frame instance is ignored");
  } finally {
    await instanceView.cleanup();
  }

  const unmountView = await renderStage();
  const surface = await initializeStage(unmountView, initialNativeGraph(), 51, true);
  const accepted = await stageAgentWrite(surface);
  const oldFrame = accepted.restoreProps;
  await unmountView.cleanup();
  const result = await Promise.race([
    accepted.pending,
    new Promise((resolve) => setTimeout(() => resolve({ ok: "pending" }), 80)),
  ]);
  assert.equal(result.ok, false, "unmount must settle the pending write promptly, not wait for its 12-second timeout");
  await act(async () => {
    oldFrame.onRecoveryResult({
      recoveryId: accepted.restore.recoveryId,
      ok: true,
      revision: 52,
      expectedNativeRevision: 51,
    });
  });
});
