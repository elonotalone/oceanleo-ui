// Adapter contract tests, not a substitute for the real Library composition test.
import assert from "node:assert/strict";
import test from "node:test";
import { boundedAgentContent } from "../src/shell/plugin-command/bounded-agent-content.ts";
import { createVideoCommandSurface } from "../src/shell/video-editor/video-command-surface.ts";
import { guardPluginSurface } from "../src/shell/collab/adapters/visual-readonly.ts";

const deliver = async () => {};

test("video Agent context carries actual clip text, source placement and current selection", () => {
  const editor = { sourceReady: true, loadingSource: false, playheadMs: 1200,
    selectedClipId: "caption", selected: null,
    doc: { tracks: [{ id: "text", kind: "text", clips: [
      { id: "caption", start_ms: 500, duration_ms: 3000, text: "这是尚未保存的新字幕" },
    ] }] },
  };
  const surface = createVideoCommandSurface({ editor, deliver });
  const context = surface.agentContext();
  assert.equal(context.content.timeline.tracks[0].clips[0].text, "这是尚未保存的新字幕");
  assert.equal(context.content.selectedClipId, "caption");
  assert.match(context.note, /不能据此声称看过/);
  editor.loadingSource = true;
  assert.equal(surface.agentContext().ready, false);
});

test("bounded source excerpts remain valid JSON, explicitly truncated and credential-free", () => {
  const source = { title: "当前项目", access_token: "do-not-send", tracks: Array.from({ length: 200 }, (_, i) => ({
    id: `clip-${i}`, text: '字幕\\"\n'.repeat(2000), nested: { visible: true },
  })) };
  source.cycle = source;
  const context = boundedAgentContent(source);
  assert.equal(context.ready, true);
  assert.equal(context.truncated, true);
  const encoded = JSON.stringify(context.content);
  assert.ok(encoded.length <= 5500, `actual JSON length ${encoded.length}`);
  assert.equal(JSON.parse(encoded).title, "当前项目");
  assert.match(encoded, /clip-0/);
  assert.doesNotMatch(encoded, /do-not-send/);
  assert.match(context.note, /节选/);
  assert.equal(source.access_token, "do-not-send", "source editor data is never mutated");
});

test("view-only guard preserves current-file identity/content while still refusing mutations", async () => {
  let writes = 0;
  const context = { ready: true, kind: "text", content: "可读但不能写的当前正文" };
  const target = { artifactId: "file-a", revisionId: "rev-1", surfaceInstanceId: "surface-a" };
  const guarded = guardPluginSurface({
    editorId: "richdoc", workspaceScopeId: "workspace-a",
    describe: () => [{ id: "richdoc.write", mutates: true }], state: () => ({}),
    target: () => target, agentContext: () => context,
    run: () => { writes += 1; return { ok: true }; },
  }, true);
  assert.equal(guarded.target(), target);
  assert.equal(guarded.agentContext(), context);
  assert.equal(guarded.workspaceScopeId, "workspace-a");
  assert.equal((await guarded.run("richdoc.write", {})).ok, false);
  assert.equal(writes, 0);
});
