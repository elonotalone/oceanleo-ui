import test from "node:test";
import assert from "node:assert/strict";

const quote = { provider: "bailian-video", provider_model: "wan2.7-t2v", amount: 0.1, currency: "USD", cost: { estimated_cost_nano: 100000000, currency: "USD_NANO", pricing_input: {} } };
function fixture(kinds = ["script", "image", "video"]) {
  let project = createVideoProject("test");
  const ids = [];
  for (const kind of kinds) {
    const added = addProjectNode(project, kind, { x: ids.length * 300, y: 0 });
    project = added.project;
    ids.push(added.nodeId);
  }
  return { project, ids };
}
function connect(project, from, to, extra = {}) {
  project.versions[project.headVersionId].graph.edges.push({ edgeId: `${from}-${to}`, sourceNodeId: from, targetNodeId: to, ...extra });
  return project;
}
function media(project, nodeId, kind = "image") {
  const registered = registerAsset(project, { kind, origin: "upload", title: kind, url: `https://files.example/${kind}.png` });
  return updateProjectNode(registered.project, nodeId, "test", { assetId: registered.asset.assetId });
}
function durable(project, nodeId) {
  return { ...project, durable: { workspaceId: "w", projectId: "p", headVersionId: "remote-v", headEpoch: 1, graphFingerprint: "g", syncedLocalVersionId: project.headVersionId, syncedSelectionEpoch: 1,
    runs: [{ runId: "r", commandRequestId: "request", nodeId, remoteProjectVersionId: "remote-v", status: "queued", createdAt: "2026-11-15", updatedAt: "2026-11-15" }] } };
}
function snapshot(nodeId, status = "succeeded", extra = {}) {
  return { id: "r", project_id: "p", project_version_id: "remote-v", status, output_assets: status === "succeeded" ? [{ id: "remote-asset", node_id: durableUuid(nodeId), url: "https://files.example/result.mp4", duration_ms: 5000, mime_type: "video/mp4" }] : [], ...extra };
}
function environment(project, nodeId) {
  let current = project;
  let selected = nodeId;
  return {
    getProject: () => current, setProject: (next) => { current = next; }, setProjectMetadata: (next) => { current = next; },
    getSelectedNodeId: () => selected, setSelectedNodeId: (id) => { selected = id; }, getSelectionEpoch: () => 1,
    getImageMode: () => "generate", setImageMode() {}, getWorkspaceView: () => "graph", setWorkspaceView() {},
    getDurableVideoCapability: () => ({ enabled: true }), setStatus() {}, screenCenter: () => ({ x: 0, y: 0 }),
    openMaterialLibrary() {}, requestMediaUpload() {}, reportNodeProgress() {},
    saveProject: async () => ({ saveId: "s", projectVersionId: current.headVersionId, revision: 1, url: "https://files.example/project.json" }),
  };
}
const request = (env, commandId, args = {}) => ({ commandId, args, requestId: crypto.randomUUID(), projectVersionId: env.getProject().headVersionId, selectionEpoch: 1, surface: "compact" });

import { PW_VA_MESSAGES, PW_VA_SOURCE } from "../src/i18n/ui/messages/pw-va-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
test("retained generation copy is complete in all 17 locales", () => {
  for (const locale of LOCALES) {
    assert.equal(Object.keys(PW_VA_MESSAGES[locale]).length, PW_VA_SOURCE.length, locale);
    assert.ok(Object.values(PW_VA_MESSAGES[locale]).every((value) => typeof value === "string" && value.length > 0), locale);
  }
});
