import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  OPENVIDEO_PROJECT_SCHEMA,
  openVideoToTimeline,
  parseOpenVideoStoredProject,
} from "../src/shell/video-editor/openvideo-reader.ts";

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const owned = [
  ...walk("src/shell/video-editor"),
  ...walk("src/shell/workflow-carrier"),
  "src/shell/advanced-routes/VideoTimelineRoute.tsx",
  "src/shell/advanced-routes/VideoCanvasRoute.tsx",
  "src/shell/collab/adapters/video.ts",
  "src/shell/collab/adapters/workflow.ts",
].filter((file) => /\.(tsx?|mjs)$/.test(file));

test("the OpenVideo / designcombo vendor and facade are gone", () => {
  assert.equal(existsSync("src/shell/video-editor/vendor"), false);
  assert.equal(existsSync("src/shell/video-editor/designcombo"), false);
  assert.equal(existsSync("src/shell/video-editor/VideoDesigncomboStage.tsx"), false);
  assert.equal(existsSync("src/shell/video-editor/designcombo-save-preview.ts"), false);
});

test("nothing in the video cluster imports the vendor, designcombo stage, or a Pro mode", () => {
  for (const file of owned) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /react-video-editor|VideoDesigncomboStage|from "\.\/designcombo|video-editor\/designcombo/, file);
    assert.doesNotMatch(text, /usePluginMode|PluginModeSwitchGate|useModeSwitchReady|resolveEditorCore/, file);
    assert.doesNotMatch(text, /mode\s*===\s*["']pro["']/, file);
  }
});

test("VideoTimelineRoute has one mode and no pro page or hosted face", () => {
  const route = readFileSync("src/shell/advanced-routes/VideoTimelineRoute.tsx", "utf8");
  assert.doesNotMatch(route, /renderPro|enterProRef|next\/dynamic|iframe/);
  assert.doesNotMatch(route, /pages:\s*\{\s*pro/);
  assert.match(route, /VideoTimelineStage/);
});

test("a project stored by the retired pro face still reads, and the reader does not mutate it", () => {
  const stored = {
    schema: OPENVIDEO_PROJECT_SCHEMA,
    version: 1,
    data: {
      settings: { width: 1280, height: 720, fps: 24 },
      tracks: [
        { id: "t1", type: "video", clipIds: ["c1"] },
        { id: "t2", type: "caption", clipIds: ["c2"] },
      ],
      clips: {
        c1: {
          id: "c1",
          type: "Video",
          src: "https://example.com/a.mp4",
          timing: { display: { from: 1_000_000, to: 3_500_000 }, trim: { from: 250_000, to: 2_750_000 } },
          animations: [{ type: "keyframes" }],
        },
        c2: {
          id: "c2",
          type: "Caption",
          text: "你好",
          timing: { display: { from: 0, to: 1_000_000 } },
          style: { fontSize: 40 },
        },
      },
    },
  };
  const text = JSON.stringify(stored);
  const before = JSON.stringify(stored);
  const result = openVideoToTimeline(parseOpenVideoStoredProject(text));
  assert.equal(JSON.stringify(stored), before);
  assert.equal(result.doc.width, 1280);
  const video = result.doc.tracks.find((track) => track.kind === "video");
  const textTrack = result.doc.tracks.find((track) => track.kind === "text");
  assert.equal(video.clips[0].start_ms, 1000);
  assert.equal(video.clips[0].duration_ms, 2500);
  assert.equal(video.clips[0].in_ms, 250);
  assert.equal(textTrack.clips[0].text, "你好");
  assert.deepEqual(result.dropped, ["关键帧动画"]);
  assert.throws(() => parseOpenVideoStoredProject("{not json"), /无法解析/);
  assert.throws(() => parseOpenVideoStoredProject(JSON.stringify({ data: { foo: 1 } })), /打不开/);
});

test("stored-project route opens read-only until the user converts", () => {
  const route = readFileSync("src/shell/advanced-routes/VideoTimelineRoute.tsx", "utf8");
  assert.match(route, /storedReadOnly=\{!converted\}/);
  assert.match(route, /local: editor\.sourceReady && !storedReadOnly/);
  assert.match(route, /if \(storedReadOnly\) return \{ ok: true as const, item \}/);
});
