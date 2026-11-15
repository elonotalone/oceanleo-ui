import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const client = await import(await compileModule("src/shell/video-canvas/engine/canvas-delivery-client.ts", {
  "../../../lib/agent": dataModule("export async function authed(path,init){globalThis.__vbNet.requests.push({path,body:JSON.parse(init.body)}); return globalThis.__vbNet.handoff}"),
  "../../workspace-actions": dataModule("export function dispatchWorkspaceAction(event){globalThis.__vbNet.opened.push(event)}"),
  "../../video-editor/render-client": dataModule(`
    export async function submitRenderJob(payload,signal,id){globalThis.__vbNet.submissions.push({payload,id}); if(signal?.aborted)throw signal.reason; return id;}
    export async function getRenderJob(id){return globalThis.__vbNet.state;}
    export async function cancelRenderJob(id){globalThis.__vbNet.cancellations.push(id);}
  `),
}));

beforeEach(() => {
  globalThis.__vbNet = { requests: [], submissions: [], cancellations: [], opened: [],
    state: { status: "done", url: "https://cdn.example.test/film.mp4", artifact_id: "film", revision_id: "r1" },
    handoff: { ok: true, data: { artifact_id: "timeline", revision_id: "r2" } } };
});
const source = { projectId: "canvas", projectVersionId: "v1", shots: [{ shotId: "s", takeId: "t", assetId: "a" }], inputAssetIds: ["a"] };
const timeline = { width: 1080, height: 1920, fps: 24, tracks: [{ id: "v", kind: "video", clips: [{ id: "c", start_ms: 0, duration_ms: 1000, source_url: "https://cdn.example.test/shot.mp4" }] }] };
const input = () => ({ requestId: "command-1", title: "Film", timeline, canvasSource: source });

test("render forwards the composed cut and lineage with a stable id and returns typed Library identity", async () => {
  const receipt = await client.renderComposedCanvas(input());
  assert.deepEqual(receipt.libraryItem, { artifactId: "film", revisionId: "r1" });
  assert.equal(receipt.url, globalThis.__vbNet.state.url);
  const submitted = globalThis.__vbNet.submissions[0];
  assert.match(submitted.id, /^[a-f0-9]{32}$/);
  assert.deepEqual(submitted.payload.timeline, timeline);
  assert.deepEqual(submitted.payload.canvas_source, source);
  await client.renderComposedCanvas(input());
  assert.equal(globalThis.__vbNet.submissions[1].id, submitted.id);
});

test("gateway restart reports cancellation and refund rather than successful or durable rendering", async () => {
  globalThis.__vbNet.state = { status: "canceled", error_code: "gateway_restart", refund_status: "refunded" };
  await assert.rejects(client.renderComposedCanvas(input()), (error) => error.code === "gateway_restart" && /费用已自动退回/.test(error.message));
});

test("a flat video URL without a Library artifact is never accepted as delivered", async () => {
  delete globalThis.__vbNet.state.artifact_id;
  await assert.rejects(client.renderComposedCanvas(input()), /没有返回我的库条目/);
});

test("abort after ambiguous admission cancels the idempotent job even without a POST response", async () => {
  const controller = new AbortController(); controller.abort(new DOMException("Aborted", "AbortError"));
  await assert.rejects(client.renderComposedCanvas({ ...input(), signal: controller.signal }), (error) => error.cancelled === true);
  assert.equal(globalThis.__vbNet.cancellations[0], globalThis.__vbNet.submissions[0].id);
});

test("handover sends an editable timeline envelope and protects existing timeline edits with its expected revision", async () => {
  const project = { schema: "oceanleo.timeline.v1", version: 1, data: timeline, canvasSource: source };
  const identity = await client.handoffCanvasTimeline({ projectDocument: JSON.stringify(project), title: "Cut", previous: { artifactId: "timeline", revisionId: "r1" } });
  assert.deepEqual(identity, { artifactId: "timeline", revisionId: "r2" });
  assert.equal(globalThis.__vbNet.requests[0].path, "/v1/video/render-timeline/handoff");
  assert.deepEqual(globalThis.__vbNet.requests[0].body.project, project);
  assert.equal(globalThis.__vbNet.requests[0].body.expected_revision_id, "r1");
  globalThis.__vbNet.handoff = { ok: false, error: "revision conflict" };
  await assert.rejects(client.handoffCanvasTimeline({ projectDocument: JSON.stringify(project), title: "Cut" }), /revision conflict/);
});

test("the handover opens the ordinary Library editor using the typed item identity", () => {
  client.openCanvasLibraryItem({ artifactId: "timeline", revisionId: "r2" });
  assert.deepEqual(globalThis.__vbNet.opened[0].action, { version: 1, tab: "mine", itemId: "timeline", revisionId: "r2", intent: "edit" });
});
