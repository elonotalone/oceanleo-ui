/**
 * W6-r2: valid stored source loads, a representative edit mutates it, a commit
 * stub receives the modified payload, and reopening restores that payload.
 * Failure regressions stay fail-closed (no blank overwrite).
 */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { preferLocalRemoteEditor } from "../src/shell/client-local-editors.ts";
import {
  localRemoteEditorWorkbenchChoice,
  storedEditorProjectUrl,
} from "../src/shell/advanced-routes/stored-editor-project.ts";
import {
  hydrateWebsiteLocalSource,
  planWebsiteLocalSource,
  websiteLocalSourceFromItem,
} from "../src/shell/advanced-routes/non-richdoc-source-gate.ts";
import { existingWebsiteSource } from "../src/shell/website-local/blank-website-source.ts";
import { applyWebsiteCommand } from "../src/shell/website-local/website-command-surface.ts";
import { serializeWebsiteSource } from "../src/shell/website-source-carrier/website-source-validate.ts";
import { parseWebsiteSource } from "../src/shell/website-source-carrier/website-source-validate.ts";
import { blankDesignDocument } from "../src/shell/design-canvas/blank-design-document.ts";
import {
  hydrateDesignCanvasSource,
  planDesignCanvasSource,
  serializeDesignCanvasSource,
} from "../src/shell/design-canvas/design-canvas-source.ts";
import { applyDesignCommand } from "../src/shell/design-canvas/design-command-surface.ts";
import { parseDesignDocumentProject } from "../src/shell/image-editor/design-document-schema.ts";
import {
  hydrateWorkflowGraph,
  planWorkflowGraphFromItem,
} from "../src/shell/workflow-carrier/workflow-graph-source.ts";
import { addVideoCanvasNode } from "../src/shell/workflow-carrier/video-canvas-local-session.ts";
import { flushVideoCanvasGraph } from "../src/shell/workflow-carrier/video-canvas-leave.ts";
import {
  createFabricImageProject,
  parseFabricImageProject,
} from "../src/shell/image-editor/editor-persistence.ts";
import { imageSaveAdmitted } from "../src/shell/image-editor/image-source-ready.ts";
import { parseVideoProjectEnvelope } from "../src/shell/media-editors/source-integrity.mjs";
import {
  addClipToTrack,
  createEmptyDoc,
  isTimelineDoc,
  patchClipIn,
} from "../src/shell/video-editor/timeline-model.ts";
import { planGamePreviewControl } from "../src/shell/game-editor/game-preview-controls.ts";

const embedded = readFileSync(
  "src/shell/advanced-routes/EmbeddedRoute.tsx",
  "utf8",
);

function stubCommit(payload) {
  return { revisionId: "rev-next", payload };
}

test("stored projects skip credentialed source-tree descriptors for readable delivery bytes", async () => {
  const sourceTree = "/v1/artifacts/00000000-0000-4000-8000-000000000001/revisions/00000000-0000-4000-8000-000000000002/source-tree/@source";
  const project = blankDesignDocument("已有设计稿的完整工程标题");
  const deliveryUrl = "https://files.example.test/design.json";
  const item = {
    artifactId: "design-root",
    meta: { editor_project_url: sourceTree },
    artifact: { renditions: { source: { url: sourceTree } } },
    url: deliveryUrl,
  };
  assert.equal(storedEditorProjectUrl(item), deliveryUrl);
  let fetched = "";
  const result = await hydrateDesignCanvasSource(planDesignCanvasSource(item), async (url) => {
    fetched = url;
    return serializeDesignCanvasSource(project);
  });
  assert.equal(result.ok, true);
  assert.equal(fetched, deliveryUrl);
  assert.equal(storedEditorProjectUrl({ artifact: item.artifact }), "");
});

test("web default dispatches website/design remotes to hosted embed, not the inline-only local core", () => {
  assert.equal(preferLocalRemoteEditor("website"), false);
  assert.equal(preferLocalRemoteEditor("design-canvas"), false);
  assert.equal(localRemoteEditorWorkbenchChoice(false), "hosted-embed");
  assert.equal(localRemoteEditorWorkbenchChoice(true), "local-core");
  assert.match(embedded, /preferLocalWebsite/);
  assert.match(embedded, /WebsiteLocalRoute/);
  assert.match(embedded, /preferLocalDesignCanvas/);
  assert.match(embedded, /DesignCanvasLocalRoute/);
  assert.match(embedded, /<EmbedEditorPane/);
});

test("website: durable without inline meta loads a valid remote website-source@1; malformed stays fail-closed", async () => {
  const stored = existingWebsiteSource("操作员已有的网站工程");
  const wrapped = JSON.stringify({
    schema: "website-source@1",
    version: 1,
    data: stored,
  });
  const plan = planWebsiteLocalSource({
    artifactId: "web-art",
    title: "已有网站",
    meta: { editor_project_url: "https://cdn.test/site.json" },
  });
  assert.equal(plan.kind, "remote");
  const loaded = await hydrateWebsiteLocalSource(plan, async () => wrapped);
  assert.equal(loaded.ok, true);
  assert.ok(loaded.source.pages.length > 0);
  const edited = applyWebsiteCommand(loaded.source, "website.set-theme-accent", {
    accent: "#112233",
  });
  assert.equal(edited.ok, true);
  assert.notEqual(edited.source.theme.accent, loaded.source.theme.accent);
  const committed = stubCommit(serializeWebsiteSource(edited.source));
  const reopened = parseWebsiteSource(committed.payload);
  assert.equal(reopened.theme.accent, "#112233");
  assert.equal(reopened.pages.length, stored.pages.length);

  const missing = websiteLocalSourceFromItem({
    artifactId: "web-art",
    title: "已有网站",
  });
  assert.equal(missing.ok, false);
  assert.match(missing.error, /未改用空白稿覆盖原件/);

  const invalid = await hydrateWebsiteLocalSource(
    planWebsiteLocalSource({
      artifactId: "web-art",
      meta: { websiteSource: { not: "website-source@1" } },
    }),
    async () => wrapped,
  );
  assert.equal(invalid.ok, false);
  assert.match(invalid.error, /未改用空白稿覆盖原件/);
});

test("design: valid remote design-document loads, title edit serializes, reopen restores", async () => {
  const stored = blankDesignDocument("本地设计稿 W10");
  const plan = planDesignCanvasSource({
    artifactId: "design-art",
    meta: { editor_project_url: "https://cdn.test/design.json" },
  });
  assert.equal(plan.kind, "remote");
  const loaded = await hydrateDesignCanvasSource(plan, async () =>
    JSON.stringify(stored),
  );
  assert.equal(loaded.ok, true);
  const edited = applyDesignCommand(loaded.project, "design-canvas.set-title", {
    text: "修订后的设计稿标题",
  });
  assert.equal(edited.ok, true);
  const committed = stubCommit(serializeDesignCanvasSource(edited.project));
  const reopened = parseDesignDocumentProject(committed.payload);
  assert.equal(reopened.title, "修订后的设计稿标题");

  const invalid = planDesignCanvasSource({
    artifactId: "design-art",
    meta: { designDocument: { not: "oceanleo.design-document.v1" } },
  });
  assert.equal(invalid.kind, "fail");
});

test("workflow: stored graph loads, add-node mutates, flush stub reopens the same nodes", async () => {
  const graph = {
    nodes: [
      {
        id: "src",
        kind: "source",
        label: "素材",
        x: 0,
        y: 0,
        ports: { outputs: [{ name: "out", dataType: "video" }] },
      },
    ],
    edges: [],
  };
  const item = {
    key: "local:wf",
    id: "wf-1",
    title: "流程图",
    kind: "video_canvas",
    meta: { graph },
  };
  const plan = planWorkflowGraphFromItem(item);
  assert.equal(plan.kind, "ready");
  const loaded = await hydrateWorkflowGraph(plan, async () => {
    throw new Error("inline graph must not fetch");
  });
  assert.equal(loaded.ok, true);
  const edited = addVideoCanvasNode(loaded.graph, "filter", "fx1", "滤镜");
  assert.equal(edited.nodes.length, 2);
  const flushed = flushVideoCanvasGraph(item, edited, { sourceReady: true });
  assert.equal(flushed.ok, true);
  const reopened = planWorkflowGraphFromItem(flushed.item);
  assert.equal(reopened.kind, "ready");
  assert.equal(reopened.graph.nodes.at(-1).id, "fx1");

  const durableMissing = planWorkflowGraphFromItem({
    key: "artifact:wf",
    source: "artifact",
    id: "wf-2",
    title: "库里的流程",
    artifactId: "wf-art",
    revisionId: "wf-rev",
    artifactType: "workflow",
    meta: {},
    artifact: { artifactId: "wf-art", revisionId: "wf-rev", renditions: {} },
  });
  assert.equal(durableMissing.kind, "fail");
  const refused = flushVideoCanvasGraph(item, { nodes: [], edges: [] }, {
    sourceReady: false,
    error: "工作流源未成功载入，未改用空白图画覆盖原件。",
  });
  assert.equal(refused.ok, false);
});

test("image: save refuses blank overwrite until sourceReady; snapshot edit reopens", () => {
  assert.equal(
    imageSaveAdmitted({
      loading: false,
      sourceReady: false,
      sceneDiagnostic: { message: "分层工程缺失" },
    }).ok,
    false,
  );
  assert.equal(
    imageSaveAdmitted({
      loading: false,
      sourceReady: true,
      sceneDiagnostic: null,
    }).ok,
    true,
  );
  const snapshot = {
    json: { objects: [{ type: "rect", fill: "#111111" }] },
    doc: { width: 1080, height: 1080 },
    canvasBackground: "#ffffff",
  };
  const project = createFabricImageProject(snapshot);
  const edited = createFabricImageProject({
    ...snapshot,
    json: { objects: [{ type: "rect", fill: "#ff00aa" }] },
    canvasBackground: "#112233",
  });
  const committed = stubCommit(JSON.stringify(edited));
  const reopened = parseFabricImageProject(JSON.parse(committed.payload));
  assert.ok(reopened);
  assert.equal(reopened.snapshot.canvasBackground, "#112233");
  assert.equal(reopened.snapshot.json.objects[0].fill, "#ff00aa");
  assert.equal(project.snapshot.canvasBackground, "#ffffff");
});

test("video-timeline: valid stored envelope loads, clip edit serializes, reopen restores text", () => {
  const doc = createEmptyDoc();
  const textTrack = doc.tracks.find((track) => track.kind === "text");
  const withClip = addClipToTrack(doc, textTrack.id, {
    id: "clip_text_1",
    start_ms: 0,
    duration_ms: 3000,
    text: "片头字幕",
  });
  assert.equal(isTimelineDoc(withClip), true);
  const envelope = JSON.stringify({
    schema: "oceanleo.timeline.v1",
    version: 1,
    data: withClip,
  });
  const loaded = parseVideoProjectEnvelope(envelope);
  const edited = patchClipIn(loaded, "clip_text_1", { text: "修订后的字幕" });
  const committed = stubCommit(
    JSON.stringify({ schema: "oceanleo.timeline.v1", version: 1, data: edited }),
  );
  const reopened = parseVideoProjectEnvelope(committed.payload);
  assert.equal(
    reopened.tracks.find((track) => track.kind === "text").clips[0].text,
    "修订后的字幕",
  );
});

test("game Code preview buttons change playback state; play preview stays non-editable", () => {
  const stopped = planGamePreviewControl({ paused: false, reloadKey: 3 }, "stop");
  assert.equal(stopped.paused, true);
  assert.equal(stopped.reloadKey, 3);
  const reloaded = planGamePreviewControl(stopped, "reload");
  assert.equal(reloaded.paused, false);
  assert.equal(reloaded.reloadKey, 4);
  const code = readFileSync("src/shell/game-editor/GameCodeStage.tsx", "utf8");
  assert.match(code, /planGamePreviewControl/);
  assert.match(code, /data-testid="game-run"/);
  const play = readFileSync("src/shell/advanced-routes/GameRoute.tsx", "utf8");
  assert.doesNotMatch(play, /usePluginCommandSurface/);
});
