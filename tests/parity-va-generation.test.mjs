import test from "node:test";
import assert from "node:assert/strict";
import {
  createVideoProject, addProjectNode, registerAsset, updateProjectNode, projectHead,
  resolveCanvasInputs, canvasUpstreamOrder, canvasNodeHasOutput,
} from "../src/shell/video-canvas/engine/project-model.ts";
import {
  durableGraphForVideoNode, durableUuid, reconcileDurableVideoRun,
  submitDurableVideoGeneration, startDurableVideoPolling, prepareVideoQuote,
} from "../src/shell/video-canvas/engine/durable-video-adapter.ts";
import { bindCanvasGatewayImpl, bindCanvasFetchJson, generateAudio, generateImage, generateText, createDurableVideoRun } from "../src/shell/video-canvas/engine/canvas-gateway.ts";
import { executeCanvasCommand } from "../src/shell/video-canvas/engine/command-registry.ts";

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

test.afterEach(() => { bindCanvasGatewayImpl(); bindCanvasFetchJson(); });

test("resolver uses connected text output and image by port, and keeps audio/video typed", () => {
  let { project, ids: [script, image, video] } = fixture();
  project = updateProjectNode(project, script, "test", { text: "Scene one: ocean", prompt: "OLD prompt" });
  project = media(project, image);
  connect(project, script, video, { targetHandle: "in-script" });
  connect(project, image, video, { targetHandle: "in-first-frame" });
  const inputs = resolveCanvasInputs(project, video);
  assert.match(inputs.prompt, /Scene one/);
  assert.doesNotMatch(inputs.prompt, /OLD/);
  assert.equal(inputs.images.length, 1);
  assert.equal(inputs.inputs[1].type, "image");
  let extra = fixture(["audio", "video", "composite"]);
  extra.project = media(media(extra.project, extra.ids[0], "audio"), extra.ids[1], "video");
  connect(extra.project, extra.ids[0], extra.ids[2]); connect(extra.project, extra.ids[1], extra.ids[2]);
  assert.equal(resolveCanvasInputs(extra.project, extra.ids[2]).audio.length, 1);
  assert.equal(resolveCanvasInputs(extra.project, extra.ids[2]).videos.length, 1);
});

test("resolver names cycle, missing upstream output, dangling node, and mismatched port", () => {
  let { project, ids: [a, b] } = fixture(["image", "video"]);
  connect(project, a, b);
  assert.throws(() => resolveCanvasInputs(project, b), /还没有可用输出/);
  project = media(project, a);
  project.versions[project.headVersionId].graph.edges[0].targetHandle = "in-audio";
  assert.throws(() => resolveCanvasInputs(project, b), /类型不匹配/);
  project.versions[project.headVersionId].graph.edges[0].targetHandle = null;
  connect(project, b, a);
  assert.throws(() => resolveCanvasInputs(project, b), /形成循环/);
  const missing = fixture(["video"]); connect(missing.project, "deleted", missing.ids[0]);
  assert.throws(() => resolveCanvasInputs(missing.project, missing.ids[0]), /graph\.edges\[0\]\.sourceNodeId.*deleted.*不存在/);
});

test("t2v and i2v graphs snapshot wired input edges and durable first-frame asset ID", () => {
  let { project, ids: [text, image, video] } = fixture();
  project = updateProjectNode(project, text, "text", { text: "Camera follows waves" });
  connect(project, text, video);
  const t2v = durableGraphForVideoNode(projectHead(project).graph.nodes.find((node) => node.nodeId === video), project, {}, quote);
  assert.equal(t2v.nodes[0].operation, "video.generate.text");
  assert.match(t2v.nodes[0].normalized_params.prompt, /waves/);
  assert.equal(t2v.nodes[0].normalized_params.input_nodes[0].edge_id, durableUuid(`${text}-${video}`));
  project = media(project, image); connect(project, image, video);
  const assetId = projectHead(project).graph.nodes.find((node) => node.nodeId === image).assetId;
  const graph = durableGraphForVideoNode(projectHead(project).graph.nodes.find((node) => node.nodeId === video), project, { [assetId]: "registered-image" }, { ...quote, provider_model: "wan2.7-i2v" });
  assert.equal(graph.nodes[0].operation, "video.generate.image");
  assert.equal(graph.nodes[0].normalized_params.image_asset_id, "registered-image");
  assert.deepEqual(graph.nodes[0].input_asset_ids, ["registered-image"]);
  assert.equal(graph.nodes[0].cost.estimated_cost_nano, quote.cost.estimated_cost_nano);
  assert.equal(JSON.stringify(graph).includes("https://files.example"), false);
});

test("submit bootstraps project, registers i2v input, promotes graph, enqueues once", async () => {
  let { project, ids: [image, video] } = fixture(["image", "video"]);
  project = media(project, image); connect(project, image, video);
  let promoted, calls = [];
  bindCanvasGatewayImpl({
    quoteDurableVideo: async () => ({ ...quote, provider_model: "wan2.7-i2v" }),
    createDurableVideoProject: async () => { calls.push("project"); return { project_id: "p", head_version_id: "v1", head_epoch: 1 }; },
    registerDurableVideoInput: async () => { calls.push("input"); return { asset_id: "registered", content_sha256: "a".repeat(64) }; },
    promoteDurableVideoVersion: async (input) => { calls.push("version"); promoted = input.graph; return { project_id: "p", head_version_id: "v2", head_epoch: 2 }; },
    createDurableVideoRun: async () => { calls.push("run"); return { run_id: "r", created: true }; },
  });
  const submitted = await submitDurableVideoGeneration({ project, node: projectHead(project).graph.nodes.find((node) => node.nodeId === video), selectionEpoch: 1, commandRequestId: "request", onSynced: () => true });
  assert.deepEqual(calls, ["project", "input", "version", "run"]);
  assert.equal(promoted.nodes[0].operation, "video.generate.image");
  assert.equal(submitted.project.durable.runs[0].runId, "r");
});

test("finish/reopen attach exactly once to assets, video node and shot candidates", () => {
  let { project, ids: [video] } = fixture(["video"]);
  const shot = projectHead(project).shots[0];
  project = updateProjectNode(project, video, "shot", { shotId: shot.shotId });
  project = durable(project, video);
  const first = reconcileDurableVideoRun(JSON.parse(JSON.stringify(project)), "r", snapshot(video));
  const version = projectHead(first.project);
  assert.equal(version.takes.length, 1);
  assert.equal(version.takes[0].status, "candidate");
  assert.equal(version.shots[0].takeIds.length, 1);
  assert.equal(first.project.assets[version.graph.nodes[0].assetId].url, "https://files.example/result.mp4");
  const second = reconcileDurableVideoRun(first.project, "r", snapshot(video));
  assert.equal(second.project, first.project);
  assert.equal(projectHead(second.project).takes.length, 1);
});

test("failure/refund and ambiguous/cancel states remain honest; foreign run rejected", () => {
  const { project, ids: [video] } = fixture(["video"]);
  const source = durable(project, video);
  const failed = reconcileDurableVideoRun(source, "r", snapshot(video, "failed", { error_message: "vendor refused", refund_status: "refunded" }));
  assert.match(failed.message, /vendor refused/); assert.match(failed.message, /费用已退回/);
  assert.equal(projectHead(failed.project).graph.nodes[0].generation.status, "failed");
  assert.match(reconcileDurableVideoRun(source, "r", snapshot(video, "unknown_external_state")).message, /避免重复提交/);
  assert.match(reconcileDurableVideoRun(source, "r", snapshot(video, "cancelled")).message, /可能继续生成和计费/);
  assert.throws(() => reconcileDurableVideoRun(source, "r", { ...snapshot(video), project_id: "foreign" }), /another project/);
});

test("polling discovers lost receipt on reopen and preserves edits made while fetching", async () => {
  const { project, ids: [video] } = fixture(["video"]);
  let current = durable(project, video); current.durable.runs = [];
  let callback, stopped = false, resolveGet;
  bindCanvasGatewayImpl({ listDurableVideoRuns: async () => ({ items: [{ id: "r", command_request_id: "request", project_version_id: "remote-v", target_node_ids: [durableUuid(video)], status: "succeeded", created_at: "2026-11-15" }] }),
    getDurableVideoRun: () => new Promise((resolve) => { resolveGet = resolve; }),
  });
  const stop = startDurableVideoPolling({ getProject: () => current, apply: (next) => { current = next; }, schedule: (cb) => { callback = cb; return 1; }, clear: () => { stopped = true; } });
  callback(); await new Promise(setImmediate);
  current = updateProjectNode(current, video, "edit while polling", { title: "Kept title" });
  resolveGet(snapshot(video)); await new Promise(setImmediate);
  assert.equal(projectHead(current).graph.nodes[0].title, "Kept title");
  assert.equal(current.durable.runs[0].outputAssetIds.length, 1);
  stop(); assert.equal(stopped, true);
});

test("audio commands pass script output to voice/music and attach returned audio", async () => {
  let { project, ids: [script, audio] } = fixture(["script", "audio"]);
  project = updateProjectNode(project, script, "script", { text: "Welcome to the ocean" }); connect(project, script, audio);
  const calls = [];
  bindCanvasGatewayImpl({ generateAudio: async (input) => { calls.push(input); return { audio_url: "https://files.example/audio.mp3" }; } });
  const env = environment(project, audio);
  for (const mode of ["voice", "music"]) {
    const result = await executeCanvasCommand(request(env, `canvas.node.generate.${mode}`), env);
    assert.equal(result.status, "succeeded");
    assert.equal(env.getProject().assets[result.assetIds[0]].kind, "audio");
  }
  assert.deepEqual(calls.map((input) => input.mode), ["voice", "music"]);
  assert.equal(calls[0].text, "Welcome to the ocean");
});

test("chain uses dependency order, skips current output and stops after a failure", async () => {
  let { project, ids: [script, image, video] } = fixture();
  project = updateProjectNode(project, script, "prompt", { prompt: "Write a scene" });
  project = updateProjectNode(project, video, "prompt", { prompt: "Track camera" });
  connect(project, script, image); connect(project, image, video);
  assert.deepEqual(canvasUpstreamOrder(project, video).map((node) => node.nodeId), [script, image, video]);
  const calls = [], states = [];
  bindCanvasGatewayImpl({
    generateScript: async () => { calls.push("script"); return { text: "Waves roll" }; },
    generateImage: async (prompt) => { calls.push("image"); assert.match(prompt, /Waves roll/); return { images: ["https://files.example/frame.png"] }; },
    quoteDurableVideo: async () => quote,
    createDurableVideoProject: async () => { throw new Error("test stop before paid video"); },
  });
  const env = environment(project, video); env.reportNodeProgress = (id, status) => states.push([id, status]);
  const result = await executeCanvasCommand(request(env, "canvas.chain.run"), env);
  assert.equal(result.status, "failed"); assert.deepEqual(calls, ["script", "image"]);
  assert.equal(canvasNodeHasOutput(env.getProject(), projectHead(env.getProject()).graph.nodes.find((node) => node.nodeId === image)), true);
  assert.deepEqual(states.slice(0, 4), [[script, "running"], [script, "succeeded"], [image, "running"], [image, "succeeded"]]);
  calls.length = 0;
  await executeCanvasCommand(request(env, "canvas.chain.run"), env);
  assert.deepEqual(calls, [], "upstream current outputs must not be paid/generated again");
});

test("gateway fallback sends real audio/image-edit/chat routes and snake_case run body", async () => {
  const calls = [];
  bindCanvasFetchJson(async (url, init) => { calls.push({ url, body: JSON.parse(init.body) }); return url === "/v1/chat" ? { text: "done" } : { audio_url: "url", images: ["image"] }; });
  await generateAudio({ mode: "voice", text: "words" }); await generateAudio({ mode: "music", text: "waves", duration: 15 });
  await generateImage("edit", "16:9", { sourceUrls: ["https://files.example/reference.png"] }); await generateText("words");
  await createDurableVideoRun({ projectId: "p", commandId: "c", commandRequestId: "r", projectVersionId: "v", expectedHeadEpoch: 1, targetNodeIds: ["n"] });
  assert.deepEqual(calls.map((call) => call.url), ["/v1/audio/tts", "/v1/music/generate", "/v1/images/edit", "/v1/chat", "/v1/video-canvas/projects/p/runs"]);
  assert.equal(calls.at(-1).body.kind, "generate"); assert.equal(calls.at(-1).body.project_version_id, "v");
  assert.deepEqual(calls[2].body.image_urls, ["https://files.example/reference.png"]);
});

import { PW_VA_MESSAGES, PW_VA_SOURCE } from "../src/i18n/ui/messages/pw-va-copy.ts";
import { LOCALES } from "../src/i18n/config.ts";
test("new generation and node-error copy is complete in all 17 locales", () => {
  for (const locale of LOCALES) {
    assert.equal(Object.keys(PW_VA_MESSAGES[locale]).length, PW_VA_SOURCE.length + 3, locale);
    assert.ok(Object.values(PW_VA_MESSAGES[locale]).every((value) => typeof value === "string" && value.length > 0), locale);
  }
});

test("chain finishes script to image to durable i2v and exposes candidates without refresh", async () => {
  let { project, ids: [script, image, video] } = fixture();
  project = updateProjectNode(project, script, "prompt", { prompt: "Write a scene" });
  connect(project, script, image); connect(project, image, video);
  const calls = [];
  bindCanvasGatewayImpl({
    generateScript: async () => { calls.push("script"); return { text: "Waves" }; },
    generateImage: async () => { calls.push("image"); return { images: ["https://files.example/frame.png"] }; },
    quoteDurableVideo: async () => ({ ...quote, provider_model: "wan2.7-i2v" }),
    createDurableVideoProject: async () => ({ project_id: "p", head_version_id: "v1", head_epoch: 1 }),
    registerDurableVideoInput: async () => ({ asset_id: "registered", content_sha256: "a".repeat(64) }),
    promoteDurableVideoVersion: async () => ({ project_id: "p", head_version_id: "remote-v", head_epoch: 2 }),
    createDurableVideoRun: async () => { calls.push("video"); return { run_id: "r", created: true }; },
    getDurableVideoRun: async () => snapshot(video),
  });
  const env = environment(project, video);
  const result = await executeCanvasCommand(request(env, "canvas.chain.run"), env);
  assert.equal(result.status, "succeeded", result.message);
  assert.deepEqual(calls, ["script", "image", "video"]);
  assert.equal(projectHead(env.getProject()).takes.length, 1);
  assert.equal(env.getProject().durable.runs[0].status, "succeeded");
});

test("duplicate clicks cannot submit two simultaneous generations for one node", async () => {
  let { project, ids: [image] } = fixture(["image"]);
  project = updateProjectNode(project, image, "prompt", { prompt: "Waves" });
  let resolve, calls = 0;
  bindCanvasGatewayImpl({ generateImage: () => { calls += 1; return new Promise((done) => { resolve = done; }); } });
  const env = environment(project, image);
  const first = executeCanvasCommand(request(env, "canvas.node.generate.image"), env);
  const second = await executeCanvasCommand(request(env, "canvas.node.generate.image"), env);
  assert.equal(second.status, "disabled"); assert.equal(calls, 1);
  resolve({ images: ["https://files.example/frame.png"] });
  assert.equal((await first).status, "succeeded");
});

import { canvasSelectionContext, canvasSelectionDispatch } from "../src/shell/video-canvas/engine/canvas-selection-adapter.ts";
test("shared edit bar exposes audio generation and explicit chain actions with valid dispatch", () => {
  const { project, ids: [audio] } = fixture(["audio"]);
  const node = projectHead(project).graph.nodes[0];
  const context = canvasSelectionContext({ project, node, selectionEpoch: 1, imageMode: "generate", tt: (source) => source, availability: () => ({ enabled: true }) });
  assert.ok(context.controls.some((control) => control.id === "canvas.selection.prompt.set"));
  for (const id of ["canvas.node.generate.voice", "canvas.node.generate.music", "canvas.chain.run"]) {
    assert.ok(context.controls.some((control) => control.id === id), id);
    const dispatched = canvasSelectionDispatch({ controlId: id, requestId: "request", selectionId: audio, selectionRevision: project.headVersionId, selectionEpoch: 1 }, context);
    assert.equal(dispatched.commandId, id);
  }
});

test("canvas image canon controls translate to existing commands and reject stale revisions and epochs", () => {
  const { project, ids: [image] } = fixture(["image"]);
  const node = projectHead(project).graph.nodes[0];
  const context = canvasSelectionContext({ project, node, selectionEpoch: 7, imageMode: "retouch", tt: source => source,
    availability: commandId => commandId.endsWith(".crop") ? { enabled: false, reasonCode: "source-missing", reason: "Missing source" } : { enabled: true } });
  const message = { requestId: "request", selectionId: image, selectionRevision: project.headVersionId, selectionEpoch: 7 };
  for (const [id, commandId] of [
    ["crop", "canvas.node.update.local.crop"],
    ["rotate", "canvas.node.update.local.rotate"],
    ["flip-x", "canvas.node.update.local.flip-horizontal"],
    ["flip-y", "canvas.node.update.local.flip-vertical"],
    ["delete", "canvas.node.delete"],
  ]) {
    assert.ok(context.controls.some(control => control.id === id), id);
    assert.equal(context.controls.some(control => control.id === commandId), false, "the shell receives canonical identity");
    assert.equal(canvasSelectionDispatch({ ...message, controlId: id }, context).commandId, commandId);
    assert.equal(canvasSelectionDispatch({ ...message, controlId: commandId }, context).commandId, commandId, "old engine callers remain compatible");
    assert.equal(canvasSelectionDispatch({ ...message, controlId: id, selectionRevision: "stale" }, context), null);
    assert.equal(canvasSelectionDispatch({ ...message, controlId: id, selectionEpoch: 6 }, context), null);
  }
  assert.equal(context.controls.find(control => control.id === "crop").disabled, true);
  assert.match(context.controls.find(control => control.id === "crop").unavailableReason, /source-missing/);
  const specific = context.controls.find(control => control.id === "canvas.node.update.local.grid-split-4");
  assert.equal(specific.domain, "specific");
  assert.equal(specific.icon, undefined, "grid split does not borrow the crop capability");
  assert.equal(context.controls.find(control => control.id === "canvas.selection.adjust.brightness.set").inspectorGroup, "adjust");
  assert.equal(context.controls.find(control => control.id === "canvas.selection.position-x.set").inspectorGroup, "position");
  assert.equal(context.controls.find(control => control.id === "canvas.selection.prompt.set").inspectorIcon, undefined);
  const transaction = canvasSelectionDispatch({ ...message, controlId: "rotate", phase: "commit", transactionId: "rotation-1" }, context);
  assert.equal(transaction.phase, "commit");
  assert.equal(transaction.transactionId, "rotation-1");
  assert.equal(transaction.incoming.projectVersionId, project.headVersionId);
  assert.equal(transaction.incoming.selectionEpoch, 7);
  assert.equal(canvasSelectionDispatch({ ...message, controlId: "rotate", phase: "commit" }, context), null);
});

test("audio mode chosen in node properties is saved and used by Run this chain", async () => {
  let { project, ids: [audio] } = fixture(["audio"]);
  project = updateProjectNode(project, audio, "prompt", { prompt: "Calm ocean music" });
  const env = environment(project, audio);
  const changed = await executeCanvasCommand(request(env, "canvas.node.field.update", { field: "audioMode", value: "music" }), env);
  assert.equal(changed.status, "succeeded");
  assert.equal(projectHead(env.getProject()).graph.nodes[0].audioMode, "music");
  let used;
  bindCanvasGatewayImpl({ generateAudio: async (input) => { used = input.mode; return { audio_url: "https://files.example/music.mp3" }; } });
  const result = await executeCanvasCommand(request(env, "canvas.chain.run"), env);
  assert.equal(result.status, "succeeded"); assert.equal(used, "music");
});
