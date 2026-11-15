import "./helpers/w1-jsdom-window.mjs";
import assert from "node:assert/strict";
import test from "node:test";
import { addProjectNode, createVideoProject, projectHead, parseVideoProject, projectSourceForStorage, projectTimelineDocument, projectToFlow, canvasImageAppearance, projectForTypedArtifactCommit } from "../src/shell/video-canvas/engine/project-model.ts";
import { canvasSelectionContext, canvasSelectionDispatch, canvasCompositionDocument } from "../src/shell/video-canvas/engine/canvas-selection-adapter.ts";
import { executeCanvasCommand, commandAvailability } from "../src/shell/video-canvas/engine/command-registry.ts";
import { hydrateVideoTimelineDoc } from "../src/shell/video-editor/video-timeline-source.ts";
import { pinVideoProjectAssets } from "../src/shell/workflow-carrier/video-project-material.ts";
import { saveVideoProject } from "../src/shell/workflow-carrier/video-project-save.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const rootId = "11111111-1111-4111-8111-111111111111";
let serial = 0;
function fixture() {
  const project = createVideoProject("Canvas renderer parity");
  const head = project.versions[project.headVersionId];
  head.scenes = [{ sceneId: "scene", title: "Scene", shotIds: ["shot"] }];
  head.shots = [{ shotId: "shot", sceneId: "scene", title: "Shot", intendedDurationSeconds: 3, storyboardId: "board", takeIds: ["take"], approvedTakeId: "take" }];
  head.storyboards = [{ storyboardId: "board", shotId: "shot", frameAssetIds: ["image"] }];
  head.takes = [{ takeId: "take", shotId: "shot", assetId: "video", status: "approved" }];
  for (const kind of ["image", "video"]) project.assets[kind] = { assetId: kind, kind, origin: "import", immutable: true, title: kind,
    url: `https://cdn.example.test/${kind}.${kind === "image" ? "png" : "mp4"}`, durationSeconds: 3, createdAt: new Date().toISOString() };
  return project;
}
function engine(project, additions = {}) {
  let selected = null, epoch = 1;
  const env = { getProject: () => project, setProject: (next) => { project = next; }, getSelectedNodeId: () => selected,
    setSelectedNodeId: (id) => { selected = id; epoch++; }, getSelectionEpoch: () => epoch,
    getImageMode: () => "retouch", setImageMode() {}, setStatus() {}, setWorkspaceView() {}, screenCenter: () => ({ x: 0, y: 0 }), ...additions };
  return { env, get project() { return project; }, select(id) { selected = id; epoch++; },
    context() { return canvasSelectionContext({ project, node: projectHead(project).graph.nodes.find((node) => node.nodeId === selected),
      selectionEpoch: epoch, imageMode: "retouch", tt: (value) => value, availability: (id, args) => commandAvailability(id, env, args) }); },
    run(commandId, args = {}, overrides = {}) { return executeCanvasCommand({ commandId, requestId: `new-renderer-${++serial}`,
      projectVersionId: project.headVersionId, selectionEpoch: epoch, surface: "protocol", args, ...overrides }, env); },
    async change(controlId, value) { const context = this.context(); const dispatch = canvasSelectionDispatch({ controlId, value,
      selectionId: context.id, selectionRevision: context.revision, selectionEpoch: context.epoch, requestId: `new-control-${++serial}` }, context);
      assert.ok(dispatch, controlId); const result = await this.run(dispatch.commandId, dispatch.args, dispatch.incoming);
      assert.equal(result.status, "succeeded", result.message); return result; } };
}
async function saveReopen(project) {
  let written;
  const base = { id: rootId, key: rootId, artifactId: rootId, revisionId: "r1", artifactType: "workflow", kind: "workflow", title: project.title, meta: {} };
  const saved = await saveVideoProject({ base, doc: projectSourceForStorage(project), editRevision: projectHead(project).revision }, async ({ file }) => {
    written = await file.text(); return { ok: true, revisionId: "r2", item: { ...base, revisionId: "r2" } };
  });
  assert.equal(saved.ok, true); return parseVideoProject(written);
}

test("all three canvas text kinds persist real renderer fields, pixel line-height conversion and leading/trailing newlines", async () => {
  let project = fixture(); const ids = [];
  for (const kind of ["text", "script", "subtitle"]) { const result = addProjectNode(project, kind, { x: 0, y: 0 }, { text: "\n甲A\n乙B\n", shotId: "shot" }); project = result.project; ids.push(result.nodeId); }
  const runtime = engine(project);
  for (const id of ids) {
    runtime.select(id);
    const context = runtime.context();
    for (const control of ["font-family", "italic", "underline", "strike", "line-height", "letter-spacing", "vertical-text"]) assert.ok(context.controls.some((entry) => entry.id === control));
    const line = context.controls.find((entry) => entry.id === "line-height"); assert.deepEqual([line.kind, line.unit, line.suffix, line.step], ["number", "px", "px", 1]);
    for (const [control, value] of [["font-size", 60], ["font-family", "Noto Sans CJK SC"], ["italic", true], ["underline", true], ["strike", true], ["line-height", 90], ["letter-spacing", 3], ["vertical-text", true], ["align", "justify"]]) await runtime.change(control, value);
    if (context.controls.some((control) => control.id === "canvas.selection.include-in-video.set")) await runtime.change("canvas.selection.include-in-video.set", true);
  }
  const reopened = await saveReopen(runtime.project); const composed = canvasCompositionDocument(reopened);
  const direct = projectTimelineDocument(reopened); assert.deepEqual(direct.document, composed.document);
  const clips = composed.document.tracks.find((track) => track.kind === "text").clips; assert.equal(clips.length, 3);
  for (const clip of clips) { assert.equal(clip.text, "\n甲A\n乙B\n"); assert.equal(clip.style.font_family, "Noto Sans CJK SC"); assert.equal(clip.style.line_height, 1.5);
    assert.equal(clip.style.letter_spacing, 3); assert.equal(clip.style.italic, true); assert.equal(clip.style.underline, true); assert.equal(clip.style.strike, true); assert.equal(clip.style.vertical_text, true); assert.equal(clip.style.align, "justify"); }
  assert.deepEqual(hydrateVideoTimelineDoc(composed.projectDocument), composed.document);
  const flow = projectToFlow(reopened, (node) => ({ ...node })); assert.equal(flow.nodes.find((node) => node.id === ids[0]).data.params.textStyle.italic, true);
});

test("text clear-format preserves timing, content and inclusion while resetting every new field; invalid and stale edits do not mutate", async () => {
  const added = addProjectNode(fixture(), "text", { x: 0, y: 0 }, { text: " Keep \n", shotId: "shot" });
  const node = added.project.versions[added.project.headVersionId].graph.nodes.find((node) => node.nodeId === added.nodeId); node.params = { includeInVideo: true, startMs: 100, durationMs: 900 };
  const runtime = engine(added.project); runtime.select(added.nodeId);
  for (const [id, value] of [["font-family", "monospace"], ["italic", true], ["underline", true], ["strike", true], ["line-height", 72], ["letter-spacing", 4], ["vertical-text", true]]) await runtime.change(id, value);
  const before = runtime.project.headVersionId;
  for (const [field, value] of [["font_family", "Bad Font"], ["line_height", Infinity], ["letter_spacing", 101]]) assert.equal((await runtime.run("canvas.node.text-style.update", { field, value })).status, "failed");
  assert.equal((await runtime.run("canvas.node.text-style.update", { field: "italic", value: false }, { selectionEpoch: 0 })).status, "rejected"); assert.equal(runtime.project.headVersionId, before);
  await runtime.change("clear-format"); const reopened = await saveReopen(runtime.project); const clip = canvasCompositionDocument(reopened).document.tracks.find((track) => track.kind === "text").clips[0];
  assert.deepEqual([clip.start_ms, clip.duration_ms, clip.text], [100, 900, " Keep \n"]); assert.equal(clip.style.italic, false); assert.equal(clip.style.vertical_text, false); assert.equal(clip.style.letter_spacing, 0);
});

test("image settings keep one recipe per setting and enter the actual render/handoff document only after explicit inclusion", async () => {
  const added = addProjectNode(fixture(), "image", { x: 0, y: 0 }, { assetId: "image", shotId: "shot" }); const runtime = engine(added.project); runtime.select(added.nodeId);
  assert.equal(canvasCompositionDocument(runtime.project).document.tracks.some((track) => track.kind === "image"), false);
  for (const [id, value] of [["radius", 20], ["radius", 34], ["opacity", 80], ["opacity", 64], ["border", 5], ["canvas.selection.border-color.set", "#123456"], ["image-fit", "cover"], ["alt", "可读说明"], ["canvas.selection.include-in-video.set", true]]) await runtime.change(id, value);
  await runtime.run("canvas.node.update.local.crop"); await runtime.run("canvas.node.update.local.adjust", { brightness: 1.2, contrast: 1.3, saturation: 0.7, exposure: 0 });
  const reopened = await saveReopen(runtime.project); const current = projectHead(reopened).graph.nodes.find((node) => node.nodeId === added.nodeId);
  for (const operation of ["radius", "opacity", "border", "image-fit"]) assert.equal(current.localEditRecipe.filter((step) => step.operation === operation).length, 1);
  const cut = projectTimelineDocument(reopened); const clip = cut.document.tracks.find((track) => track.kind === "image").clips[0];
  assert.deepEqual([clip.radius, clip.opacity, clip.border, clip.fit, clip.alt], [34, 0.64, { width: 5, color: "#123456" }, "cover", "可读说明"]);
  assert.deepEqual(clip.crop, { x: 0.06, y: 0.06, width: 0.88, height: 0.88 }); assert.equal(clip.contrast, 1.3); assert.equal(clip.saturation, 0.7); assert.ok(Math.abs(clip.brightness - 0.2) < 1e-9);
  assert.equal(clip.scale, 0.3); assert.ok(cut.inputAssetIds.includes(current.assetId)); assert.deepEqual(hydrateVideoTimelineDoc(cut.projectDocument), cut.document);
});

test("image legacy recipe last setting wins with bounded values and canvas controls reflect params", () => {
  const appearance = canvasImageAppearance({ localEditRecipe: [{ operation: "opacity", parameters: { opacity: 0.8 } }, { operation: "opacity", parameters: { opacity: 0.5 } }, { operation: "radius", parameters: { radius: 100000 } }, { operation: "border", parameters: { width: -2, color: "bad" } }], params: { fit: "stretch", alt: "a".repeat(2500) } });
  assert.equal(appearance.opacity, 0.5); assert.equal(appearance.radius, 1000); assert.deepEqual(appearance.border, { width: 0, color: "#000000" }); assert.equal(appearance.fit, "stretch"); assert.equal(appearance.alt.length, 2000);
});

const pickedLibraryImage = { artifactId: "22222222-2222-4222-8222-222222222222", revisionId: "77777777-7777-4777-8777-777777777777", title: "Library photo", kind: "image" };
const fullRendition = { url: "https://gateway.example.test/v1/artifact-renditions/access/private-grant", digest: "a".repeat(64), mediaType: "image/png", byteSize: 3, width: 400, height: 300 };

test("Library replacement checks private full metadata, preserves identity and saves no grants before and after source closure pinning", async () => {
  const added = addProjectNode(fixture(), "image", { x: 9, y: 17 }, { assetId: "image", shotId: "shot" });
  let checked = 0;
  const runtime = engine(added.project, { pickLibraryImage: async () => pickedLibraryImage,
    refreshLibraryImage: async (identity, purpose) => { checked++; assert.deepEqual([identity.artifactId, identity.revisionId, purpose], [pickedLibraryImage.artifactId, pickedLibraryImage.revisionId, "full"]); return { ok: true, data: fullRendition }; } });
  runtime.select(added.nodeId); const oldHead = runtime.project.headVersionId;
  await runtime.change("canvas.selection.library.replace"); assert.equal(checked, 1);
  const replaced = projectHead(runtime.project).graph.nodes.find((node) => node.nodeId === added.nodeId); assert.notEqual(replaced.assetId, "image"); assert.deepEqual(replaced.position, { x: 9, y: 17 }); assert.equal(replaced.shotId, "shot");
  assert.equal(runtime.project.versions[oldHead].graph.nodes.find((node) => node.nodeId === added.nodeId).assetId, "image");
  assert.ok(projectHead(runtime.project).storyboards[0].frameAssetIds.includes(replaced.assetId));
  const imported = runtime.project.assets[replaced.assetId]; assert.equal(imported.url, undefined); assert.equal(imported.sourceDependency, undefined); assert.equal(imported.contentDigest, fullRendition.digest);
  await runtime.change("canvas.selection.include-in-video.set", true);
  const reopened = await saveReopen(runtime.project); const unpinned = projectTimelineDocument(reopened).document.tracks.find((track) => track.kind === "image").clips[0];
  assert.deepEqual(unpinned.library_source, { artifactId: pickedLibraryImage.artifactId, revisionId: pickedLibraryImage.revisionId, rendition: "full" }); assert.equal(unpinned.source_ref, undefined); assert.equal(unpinned.source_url, undefined);
  const saved = pinVideoProjectAssets(reopened, rootId, "22222222-2222-4222-8222-222222222222"); const asset = saved.assets[replaced.assetId];
  assert.equal(asset.url, undefined); assert.equal(asset.sourceDependency.artifactId, rootId); assert.ok(asset.sourceDependency.path.startsWith("assets/"));
  const clip = projectTimelineDocument(saved).document.tracks.find((track) => track.kind === "image").clips[0]; assert.deepEqual(clip.source_ref, { artifactId: rootId, revisionId: asset.sourceDependency.revisionId, path: asset.sourceDependency.path }); assert.equal(clip.library_source, undefined);
  saved.assets[replaced.assetId].previewUrl = fullRendition.url; saved.assets[replaced.assetId].url = fullRendition.url;
  const snapshot = projectSourceForStorage(saved); assert.equal(snapshot.assets[replaced.assetId].url, undefined); assert.equal(snapshot.assets[replaced.assetId].previewUrl, undefined); assert.doesNotMatch(JSON.stringify(snapshot), /private-grant/);
  assert.doesNotThrow(() => projectForTypedArtifactCommit(saved, rootId));
});

test("Library cancel, invalid identity, denied full access and stale asynchronous selections cannot change the head", async () => {
  const added = addProjectNode(fixture(), "image", { x: 0, y: 0 }, { assetId: "image" });
  const runtime = engine(added.project, { pickLibraryImage: async () => null }); runtime.select(added.nodeId); const old = runtime.project.headVersionId;
  assert.equal((await runtime.run("canvas.node.asset.replace-library")).status, "succeeded"); assert.equal(runtime.project.headVersionId, old);
  runtime.env.pickLibraryImage = async () => ({ artifactId: rootId, revisionId: "bad", title: "Bad" }); assert.equal((await runtime.run("canvas.node.asset.replace-library")).status, "failed");
  runtime.env.pickLibraryImage = async () => pickedLibraryImage; runtime.env.refreshLibraryImage = async () => ({ ok: false }); assert.equal((await runtime.run("canvas.node.asset.replace-library")).status, "failed"); assert.equal(runtime.project.headVersionId, old);
  runtime.env.refreshLibraryImage = async () => { runtime.select(added.nodeId); return { ok: true, data: fullRendition }; };
  assert.equal((await runtime.run("canvas.node.asset.replace-library")).status, "failed"); assert.equal(runtime.project.headVersionId, old);
  const malformed = structuredClone(runtime.project); malformed.assets.image.librarySource = { artifactId: rootId, revisionId: "bad", rendition: "full" }; assert.throws(() => parseVideoProject(malformed), /Library image reference/);
});

test("selected canvas image opens the actual Library picker, filters nonimages and resolves the selected private identity", async () => {
  const React = await import("react"); const { act } = React; const { createRoot } = await import("react-dom/client");
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const identity = { artifactId: rootId, revisionId: "33333333-3333-4333-8333-333333333333", title: "Library image", kind: "image" };
  const loaded = await import(await compileModule("src/shell/video-canvas/engine/LeoNode.tsx", {
    "@xyflow/react": dataModule(`export function Handle(){return null}; export const Position={Left:'left',Right:'right'};`),
    "../../../i18n": dataModule(`export function useUI(){return value=>value}`),
    "../../../i18n/ui/useUI": dataModule(`export function useUI(){return value=>value}`),
    "../../artifact-client": dataModule(`export * from "${new URL("../src/shell/artifact-client.ts", import.meta.url).href}"; export async function refreshArtifactRendition(){return {ok:false}}; export async function listMyArtifacts(){return {ok:true,data:{items:[${JSON.stringify(identity)}, {artifactId:'44444444-4444-4444-8444-444444444444',revisionId:'44444444-4444-4444-8444-444444444444',title:'A document',kind:'doc'}]}}}`),
  }));
  const container = document.createElement("div"); document.body.append(container); const root = createRoot(container);
  const base = { nodeId: "preview-image", title: "Image", kind: "image", text: "Hello", params: {}, localEditRecipe: [], commandAvailability: {}, hostProvidesEditBar: true, onCommand() {} };
  try {
    await act(async () => root.render(React.createElement(loaded.LeoNode, { id: base.nodeId, data: base, selected: true })));
    let pending; await act(async () => { pending = loaded.requestCanvasLibraryImage(base.nodeId); await new Promise(resolve => setTimeout(resolve, 5)); });
    assert.ok(container.querySelector("[data-composer-library-picker]"));
    for (let attempt = 0; attempt < 20 && !container.querySelector("[data-composer-library-item]"); attempt++) await act(async () => new Promise(resolve => setTimeout(resolve, 10)));
    assert.equal(container.querySelectorAll("[data-composer-library-item]").length, 1, container.textContent);
    await act(async () => container.querySelector("[data-composer-library-item]").click()); assert.deepEqual(await pending, identity);
    assert.equal(container.querySelector("[role=dialog]"), null);
    const calls = [], pixelWrites = [];
    const context = { clearRect() {}, save() {}, restore() {}, translate() {}, rotate() {}, scale() {}, beginPath() {}, clip() {}, stroke() {},
      roundRect(...args) { calls.push(["radius", ...args]); }, drawImage(...args) { calls.push(["image", ...args]); },
      getImageData() { return { data: new Uint8ClampedArray([0, 0, 0, 255]) }; }, putImageData(pixels) { pixelWrites.push([...pixels.data]); } };
    const oldContext = window.HTMLCanvasElement.prototype.getContext;
    window.HTMLCanvasElement.prototype.getContext = () => context;
    try {
      const styledImage = { ...base, asset: { assetId: "photo", url: "https://cdn.example.test/photo.png" },
        imagePreviewFrame: { width: 1920, height: 1080, scale: 0.3 },
        localEditRecipe: [{ operation: "adjust", parameters: { brightness: 1.2, contrast: 1, saturation: 1, exposure: 0 } }],
        params: { crop: { x: 0.25, y: 0, width: 0.5, height: 1 }, fit: "cover", radius: 34, border: { width: 5, color: "#123456" }, opacity: 0.64, alt: "Image description" } };
      await act(async () => root.render(React.createElement(loaded.LeoNode, { id: base.nodeId, data: styledImage, selected: true })));
      const image = container.querySelector("img"); Object.defineProperties(image, { naturalWidth: { value: 400 }, naturalHeight: { value: 200 } });
      await act(async () => image.dispatchEvent(new window.Event("load")));
      assert.deepEqual(pixelWrites.at(-1), [51, 51, 51, 255]);
      const draw = calls.filter(call => call[0] === "image").at(-1); draw.slice(2, 6).forEach((value, index) => assert.ok(Math.abs(value - [100, 43.75, 200, 112.5][index]) < 1e-9));
      assert.equal(context.globalAlpha, 0.64); assert.ok(Math.abs(context.lineWidth - 3.75) < 1e-9); assert.equal(container.querySelector("canvas").getAttribute("aria-label"), "Image description");
    } finally { window.HTMLCanvasElement.prototype.getContext = oldContext; }
    const text = { ...base, kind: "text", text: "\n甲A\n", params: { textStyle: { font_family: "serif", italic: true, underline: true, strike: true, line_height: 1.8, letter_spacing: 3, vertical_text: true } } };
    await act(async () => root.render(React.createElement(loaded.LeoNode, { id: base.nodeId, data: text, selected: true })));
    const preview = container.querySelector("[data-canvas-text-preview]"); assert.equal(preview.style.fontStyle, "italic"); assert.ok(preview.style.textDecoration.includes("line-through")); assert.equal(preview.style.lineHeight, "1.8"); assert.equal(preview.style.letterSpacing, "3px"); assert.equal(preview.textContent, text.text.split("\n").map(line => Array.from(line).join("\n")).join("\n"));
  } finally { await act(async () => root.unmount()); container.remove(); }
});

test("Library replacement works without canvas root identity, disabled read-only controls do not dispatch, and opacity converts percent to scalar", async () => {
  const added = addProjectNode(fixture(), "image", { x: 0, y: 0 }, { assetId: "image" }); const runtime = engine(added.project); runtime.select(added.nodeId);
  const control = runtime.context().controls.find((control) => control.id === "canvas.selection.library.replace"); assert.equal(control.disabled, undefined);
  const readOnly = canvasSelectionContext({ project: runtime.project, node: projectHead(runtime.project).graph.nodes.find((node) => node.nodeId === added.nodeId), selectionEpoch: 1, imageMode: "retouch", tt: value => value, availability: () => ({ enabled: false, reason: "Read-only" }) });
  assert.equal(readOnly.controls.find(control => control.id === "canvas.selection.library.replace").disabled, true);
  assert.equal(canvasSelectionDispatch({ controlId: "canvas.selection.library.replace", selectionId: readOnly.id, selectionRevision: readOnly.revision, selectionEpoch: 1, requestId: "read-only" }, readOnly), null);
  await runtime.change("opacity", 64); const opacity = runtime.context().controls.find((control) => control.id === "opacity"); assert.deepEqual([opacity.value, opacity.min, opacity.max, opacity.step], [64, 0, 100, 1]);
  assert.equal(projectHead(runtime.project).graph.nodes.find((node) => node.nodeId === added.nodeId).params.opacity, 0.64);
});
