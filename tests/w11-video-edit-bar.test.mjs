// 2026-10-23 编辑器整改波 W11：视频时间线编辑栏（D9 规范 id / D10 每个按钮都生效）、
// 翻转进预览像素路径、时间线两档配色对比度、签名素材地址不进工程。
import assert from "node:assert/strict";
import test from "node:test";

import {
  rotateClockwise90,
  runVideoClipCommand,
  videoClipSelection,
} from "../src/shell/video-editor/video-edit-bar.ts";
import { canonicalSelectionControls } from "../src/shell/edit-bar-canon-projection.ts";
import { drawTimelineVideoFrame } from "../src/shell/video-editor/preview-contract.ts";
import { normalizeTimelineDoc } from "../src/shell/video-editor/timeline-model.ts";
import { isExpiringArtifactGrantUrl } from "../src/shell/video-editor/video-timeline-source.ts";
import { compileModule, dataModule } from "./helpers/module-bench.mjs";

const tt = (zh) => zh;

function located(kind, extra = {}) {
  const clip = {
    id: "c1",
    start_ms: 1_000,
    duration_ms: 3_000,
    ...(kind === "text" ? { text: "Hi", style: {} } : { source_url: "https://cdn.example/a.mp4" }),
    ...extra,
  };
  return { clip, track: { id: "t1", kind, clips: [clip] } };
}

function recorder() {
  const calls = [];
  const fn = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    state: {
      patchClip: fn("patchClip"),
      patchClipTransient: fn("patchClipTransient"),
      moveClip: fn("moveClip"),
      trimClip: fn("trimClip"),
      setClipTiming: fn("setClipTiming"),
      setClipSpeed: fn("setClipSpeed"),
      duplicateSelectedClip: fn("duplicate"),
      deleteSelectedClip: fn("delete"),
      beginGesture: fn("begin"),
      endGesture: fn("end"),
      cancelGesture: fn("cancel"),
    },
  };
}

/** 每个控件一个「会改东西」的取值。 */
function sampleValue(control) {
  switch (control.kind) {
    case "toggle":
      return !control.value;
    case "color":
      return "#ff0000";
    case "select":
      return control.options.find((option) => option.value !== control.value)?.value;
    case "text":
      return "Changed";
    case "number":
    case "range":
      return Number(control.value) + (control.max !== undefined && Number(control.value) >= control.max ? -1 : 1);
    default:
      return undefined;
  }
}

test("W11 every emitted control runs a real mutation (D10: no dead buttons)", () => {
  for (const kind of ["video", "image", "text", "audio"]) {
    const extra = kind === "text"
      ? { style: { background: "#000000" }, transition_in: { type: "fade", duration_ms: 500 } }
      : { transition_in: { type: "fade", duration_ms: 500 } };
    const at = located(kind, extra);
    const context = videoClipSelection(at, tt);
    assert.ok(context.controls.length > 0, kind);
    for (const control of context.controls) {
      const { state, calls } = recorder();
      const handled = runVideoClipCommand(state, at, {
        version: 1,
        selectionId: "c1",
        controlId: control.id,
        value: sampleValue(control),
      });
      assert.equal(handled, true, `${kind}:${control.id} must be handled`);
      assert.ok(calls.length > 0, `${kind}:${control.id} must mutate the timeline`);
    }
  }
});

test("W11 unknown control ids are rejected, foreign selections are ignored", () => {
  const { state, calls } = recorder();
  const at = located("video");
  assert.equal(
    runVideoClipCommand(state, at, { version: 1, selectionId: "c1", controlId: "nope" }),
    false,
  );
  assert.equal(
    runVideoClipCommand(state, at, { version: 1, selectionId: "other", controlId: "opacity", value: 50 }),
    false,
  );
  assert.equal(calls.length, 0);
});

test("W11 canonical ids and order per clip kind (D9)", () => {
  const order = (kind) => {
    const projection = canonicalSelectionControls(videoClipSelection(located(kind), tt), tt);
    return projection.controls.filter((c) => c.canonId).map((c) => c.canonId);
  };
  assert.deepEqual(
    [...new Set(order("text"))],
    ["font-size", "bold", "text-color", "highlight", "align", "duplicate", "delete"],
  );
  assert.deepEqual(
    [...new Set(order("video"))],
    ["flip-x", "flip-y", "rotate", "image-fit", "duplicate", "delete"],
  );
  assert.deepEqual([...new Set(order("audio"))], ["duplicate", "delete"]);
  // 面板型规范项按 A-1：子控件进 position / adjust 面板，不另发 panel 控件。
  const video = videoClipSelection(located("video"), tt);
  assert.equal(video.controls.some((c) => c.kind === "panel"), false);
  assert.deepEqual(
    video.controls.filter((c) => c.inspectorGroup === "adjust").map((c) => c.id),
    ["brightness", "contrast", "saturation"],
  );
  assert.deepEqual(
    video.controls.filter((c) => c.inspectorGroup === "position").map((c) => c.id),
    ["position-x", "position-y", "position-scale", "position-angle"],
  );
  // 贴图没有调色与显示方式（预览/导出都不做）；音频没有视觉项。
  const image = videoClipSelection(located("image"), tt).controls.map((c) => c.id);
  assert.equal(image.includes("brightness"), false);
  assert.equal(image.includes("image-fit"), false);
  const audio = videoClipSelection(located("audio"), tt).controls.map((c) => c.id);
  for (const id of ["flip-x", "opacity", "position-x", "font-size"]) {
    assert.equal(audio.includes(id), false, id);
  }
  // 编辑器特有控件不带规范图标。
  for (const kind of ["video", "audio", "text", "image"]) {
    for (const c of videoClipSelection(located(kind), tt).controls) {
      if (["speed", "muted", "volume", "start-time", "duration", "source-in", "transition", "transition-duration", "text"].includes(c.id)) {
        assert.equal(c.icon, undefined, `${kind}:${c.id}`);
      }
    }
  }
});

test("W11 visible bar icons are pairwise distinct for every clip kind", () => {
  for (const kind of ["video", "image", "text", "audio"]) {
    const projection = canonicalSelectionControls(videoClipSelection(located(kind), tt), tt);
    const icons = projection.controls
      .filter((c) => c.icon && c.slot !== "inspector")
      .map((c) => c.icon);
    assert.equal(new Set(icons).size, icons.length, `${kind}: ${icons.join(",")}`);
  }
});

test("W11 flip and rotate commands patch the model; flips survive normalize", () => {
  const { state, calls } = recorder();
  const at = located("video", { rotation: 170 });
  runVideoClipCommand(state, at, { version: 1, selectionId: "c1", controlId: "flip-x", value: true });
  runVideoClipCommand(state, at, { version: 1, selectionId: "c1", controlId: "rotate" });
  assert.deepEqual(calls[0], ["patchClip", "c1", { flip_x: true }]);
  assert.deepEqual(calls[1], ["patchClip", "c1", { rotation: -100 }]);
  assert.equal(rotateClockwise90(0), 90);
  assert.equal(rotateClockwise90(90), 180);
  assert.equal(rotateClockwise90(180), -90);
  assert.equal(rotateClockwise90(-90), 0);
  const doc = normalizeTimelineDoc({
    width: 1280,
    height: 720,
    fps: 30,
    tracks: [
      { id: "v", kind: "video", clips: [{ id: "a", start_ms: 0, duration_ms: 1000, flip_x: true, flip_y: false, label: "Clip.mp4" }] },
      { id: "a", kind: "audio", clips: [] },
    ],
  });
  const clip = doc.tracks[0].clips[0];
  assert.equal(clip.flip_x, true);
  assert.equal("flip_y" in clip, false);
  assert.equal(clip.label, "Clip.mp4");
});

test("W11 slider gestures fold into one undo step", () => {
  const { state, calls } = recorder();
  const at = located("video");
  for (const phase of ["start", "update", "commit"]) {
    runVideoClipCommand(state, at, {
      version: 1,
      selectionId: "c1",
      controlId: "opacity",
      value: 40,
      transactionId: "tx",
      phase,
    });
  }
  assert.deepEqual(calls.map((c) => c[0]), ["begin", "patchClipTransient", "patchClipTransient", "end"]);
  assert.deepEqual(calls[1][2], { opacity: 0.4 });
});

test("W11 preview pixel path mirrors flipped video frames", () => {
  const calls = [];
  const ctx = {
    globalAlpha: 1,
    filter: "none",
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale(x, y) {
      calls.push(["scale", x, y]);
    },
    drawImage() {
      calls.push(["drawImage"]);
    },
  };
  const base = { id: "c", start_ms: 0, duration_ms: 1000 };
  drawTimelineVideoFrame(ctx, { videoWidth: 1920, videoHeight: 1080 }, { ...base, flip_x: true }, 1280, 720, 1);
  drawTimelineVideoFrame(ctx, { videoWidth: 1920, videoHeight: 1080 }, { ...base, flip_y: true }, 1280, 720, 1);
  drawTimelineVideoFrame(ctx, { videoWidth: 1920, videoHeight: 1080 }, base, 1280, 720, 1);
  assert.deepEqual(calls, [
    ["scale", -1, 1],
    ["drawImage"],
    ["scale", 1, -1],
    ["drawImage"],
    ["drawImage"],
  ]);
});

function luminance(hex) {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) =>
    c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("W11 timeline palette follows the site theme and meets contrast floors in both modes", async () => {
  let theme = "light";
  const module = await import(
    await compileModule("src/shell/video-editor/timeline-theme.ts", {
      "../plugin-theme": dataModule(
        "export function usePluginTheme() { return { theme: globalThis.__w11Theme }; }",
      ),
    })
  );
  globalThis.__w11Theme = theme;
  const light = module.useTimelinePalette();
  globalThis.__w11Theme = "dark";
  const dark = module.useTimelinePalette();
  assert.equal(light, module.TIMELINE_THEME_PALETTES.light);
  assert.equal(dark, module.TIMELINE_THEME_PALETTES.dark);
  assert.notEqual(light.track, dark.track);
  // 浅色档要真是浅色：轨道底亮度高于 0.8。
  assert.ok(luminance(light.track) > 0.8, light.track);
  for (const palette of [light]) {
    for (const [kind, colors] of Object.entries(palette.clips)) {
      assert.ok(contrast(colors.background, palette.track) >= 3, `${kind} block vs track`);
      assert.ok(contrast(colors.label, colors.background) >= 4.5, `${kind} label`);
    }
    assert.ok(contrast(palette.grid, palette.ruler) >= 4.5, "ruler text");
    assert.ok(contrast(palette.playhead, palette.track) >= 4.5, "playhead");
  }
});

test("W11 short-lived artifact grants are recognised so they never land in the project", () => {
  assert.equal(isExpiringArtifactGrantUrl("https://api.oceanleo.com/v1/artifact-renditions/access/abc123"), true);
  assert.equal(isExpiringArtifactGrantUrl("/v1/artifact-renditions/access/abc123?x=1"), true);
  assert.equal(isExpiringArtifactGrantUrl("https://api.oceanleo.com/v1/artifact-renditions/access/public"), false);
  assert.equal(isExpiringArtifactGrantUrl("https://cdn.example/a.mp4"), false);
  assert.equal(isExpiringArtifactGrantUrl(""), false);
});

test("W11 expired artifact grants in a project heal to a durable (or at least fresh) source", async () => {
  const { artifactGrantIdentity, healTimelineGrants, healGrantUrl, replaceClipSources } = await import(
    "../src/shell/video-editor/grant-heal.ts"
  );
  const payload = Buffer.from(JSON.stringify({ artifact: "art-1", revision: "rev-1", exp: 1 })).toString("base64url");
  const grant = `https://api.dev.oceanleo.com/v1/artifact-renditions/access/${payload}.sig`;
  assert.deepEqual(artifactGrantIdentity(grant), { artifactId: "art-1", revisionId: "rev-1" });
  assert.equal(artifactGrantIdentity("https://cdn.example/a.mp4"), null);
  const doc = {
    width: 1280,
    height: 720,
    fps: 30,
    tracks: [
      { id: "v", kind: "video", clips: [{ id: "a", start_ms: 0, duration_ms: 1000, source_url: grant }, { id: "b", start_ms: 1000, duration_ms: 1000, source_url: grant }] },
      { id: "t", kind: "text", clips: [{ id: "c", start_ms: 0, duration_ms: 1000, text: "x" }] },
    ],
  };
  const refreshed = [];
  const deps = {
    refresh: async (identity) => {
      refreshed.push(identity);
      return "https://api.dev.oceanleo.com/v1/artifact-renditions/access/fresh.sig";
    },
    importUrl: async () => "https://auth.oceanleo.com/storage/v1/object/public/media-uploads/u/v.mp4",
  };
  const map = await healTimelineGrants(doc, deps);
  assert.equal(refreshed.length, 1, "one refresh per distinct source");
  const healed = replaceClipSources(doc, map);
  assert.deepEqual(
    healed.tracks[0].clips.map((c) => c.source_url),
    [
      "https://auth.oceanleo.com/storage/v1/object/public/media-uploads/u/v.mp4",
      "https://auth.oceanleo.com/storage/v1/object/public/media-uploads/u/v.mp4",
    ],
  );
  assert.equal(healed.tracks[1], doc.tracks[1], "text tracks untouched");
  assert.equal(replaceClipSources(healed, map), healed, "no-op returns the same object");
  // 拷贝失败：退回新鲜地址，不抛。
  const fallback = await healGrantUrl(grant, "video", {
    ...deps,
    importUrl: async () => {
      throw new Error("500");
    },
  });
  assert.deepEqual(fallback, {
    url: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/fresh.sig",
    durable: false,
  });
  // 重签也失败：换不了（空串），交给预检如实报错。
  const none = await healGrantUrl(grant, "video", { ...deps, refresh: async () => "" });
  assert.equal(none.url, "");
});

test("W11 a typed timeline revision reopened from the library loads its project, not the cover image", async () => {
  const { planVideoTimelineSource, videoTimelineProjectSource } = await import(
    "../src/shell/video-editor/video-timeline-source.ts"
  );
  const typed = {
    source: "artifact",
    kind: "video",
    artifactId: "a1",
    url: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/cover.sig",
    meta: {
      source_format: "oceanleo.timeline.v1",
      source_url: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/project.sig",
      editor_manifest_url: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/manifest.sig",
    },
  };
  assert.deepEqual(videoTimelineProjectSource(typed), {
    url: "https://api.dev.oceanleo.com/v1/artifact-renditions/access/project.sig",
  });
  const plan = planVideoTimelineSource(typed);
  assert.equal(plan.kind, "remote");
  assert.equal(plan.url, typed.meta.source_url);
  // 本会话刚存过：路由合进 item 的 editor_project_url 优先。
  assert.equal(
    videoTimelineProjectSource({
      url: "x",
      meta: { editor_project_schema: "oceanleo.timeline.v1", editor_project_url: "https://p/j.json" },
    }).url,
    "https://p/j.json",
  );
  // 原始视频素材不是工程：照旧 seed。
  const raw = { source: "artifact", kind: "video", artifactId: "a2", url: "https://cdn.example/a.mp4", meta: { source_format: "mp4" } };
  assert.equal(videoTimelineProjectSource(raw), null);
  assert.equal(planVideoTimelineSource(raw).kind, "seed");
});

test("W11 library materials insert through the editor's own history (D2 command contract)", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile("src/shell/advanced-routes/VideoTimelineRoute.tsx", "utf8");
  assert.match(route, /withEditorHistoryCommand\(materialAdapter, \{/);
  assert.match(route, /documentId: materialDocumentId/);
  assert.match(route, /editor\.insertLibraryMedia\(/);
  const hook = await readFile("src/shell/video-editor/use-video-timeline.ts", "utf8");
  // 插入走 appendSourceClip → applyEdit（撤销栈），失败抛错不吞。
  assert.match(hook, /const insertLibraryMedia = useCallback\([\s\S]*?await appendSourceClip\(url, material\.media/);
  assert.doesNotMatch(
    hook.slice(hook.indexOf("const insertLibraryMedia"), hook.indexOf("const addMediaFile")),
    /catch \(/,
  );
});

test("W11 the second save starts from this tab's own committed head, never the stale opened revision", async () => {
  const heads = await import("../src/shell/doc-editors/editor-own-heads.ts");
  heads.resetOwnCommittedHeadsForTests();
  globalThis.__w11OwnHeadAfter = heads.ownHeadAfter;
  const { timelineSaveBase: fn } = await import(
    await compileModule("src/shell/video-editor/persistence.ts", {
      "../../lib/database": dataModule("export async function uploadFile() { return { ok: false }; }"),
      "../doc-editors/doc-io": dataModule("export async function saveProjectWorkingHead() { return { ok: false }; }"),
      "../doc-editors/editor-own-heads": dataModule(
        "export function ownHeadAfter(a, b) { return globalThis.__w11OwnHeadAfter(a, b); }",
      ),
      "./timeline-carrier": dataModule("export function assertPreviewResolution() { return { ok: true }; } export const TIMELINE_PROJECT_SCHEMA_ID = 'oceanleo.timeline.v1'; export class TimelineCarrierError extends Error {}"),
    })
  );
  const opened = { id: "a1", key: "a1", artifactId: "a1", revisionId: "r1", meta: { revision_id: "r1" } };
  assert.equal(fn(opened), opened, "nothing committed yet → the opened revision is the base");
  heads.noteOwnCommittedHead("a1", "r1", "r2");
  const base = fn(opened);
  assert.equal(base.revisionId, "r2");
  assert.equal(base.meta.revision_id, "r2");
  heads.noteOwnCommittedHead("a1", "r2", "r3", { ...opened, revisionId: "r3", meta: { revision_id: "r3", x: 1 } });
  assert.equal(fn(opened).revisionId, "r3");
  assert.equal(fn(opened).meta.x, 1);
  // 别人提交的版本不在本页链里：不改基线。
  assert.equal(fn({ ...opened, revisionId: "someone-else" }).revisionId, "someone-else");
  heads.resetOwnCommittedHeadsForTests();
});
