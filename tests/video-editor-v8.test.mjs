import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import ts from "typescript";

import {
  normalizeTimelineDoc,
} from "../src/shell/video-editor/timeline-model.ts";
import {
  drawTimelineVideoFrame,
} from "../src/shell/video-editor/preview-contract.ts";
import {
  timelineAnchorMs,
  timelineMsAtClientPoint,
  timelineScrollLeftForAnchor,
} from "../src/shell/video-editor/timeline-viewport.ts";

test("Video keeps only native px/s zoom and drop time includes scroll", async () => {
  const [route, stage] = await Promise.all([
    readFile(
      resolve("src/shell/advanced-routes/VideoTimelineRoute.tsx"),
      "utf8",
    ),
    readFile(
      resolve("src/shell/video-editor/VideoTimelineStage.tsx"),
      "utf8",
    ),
  ]);
  assert.doesNotMatch(route, /\bviewport\s*:/);
  assert.match(stage, /data-video-timeline-native-zoom/);
  assert.match(stage, /px\/s/);

  assert.equal(
    timelineMsAtClientPoint(
      { clientX: 140, clientY: 80 },
      { left: -860, top: 20, bottom: 160, pxPerSecond: 100 },
      250,
    ),
    10_000,
  );
  assert.equal(
    timelineMsAtClientPoint(
      { clientX: 140, clientY: 180 },
      { left: -860, top: 20, bottom: 160, pxPerSecond: 100 },
      250,
    ),
    250,
  );
});

test("timeline zoom preserves the viewport-center time anchor", () => {
  const anchorMs = timelineAnchorMs(720, 400, 80);
  assert.equal(anchorMs, 14_000);
  const nextScrollLeft = timelineScrollLeftForAnchor(anchorMs, 400, 160);
  assert.equal(nextScrollLeft, 1_840);
  assert.equal(timelineAnchorMs(nextScrollLeft, 400, 160), anchorMs);
});

test("preview pixel path applies every exposed visual property once", () => {
  const calls = [];
  const context = {
    globalAlpha: 1,
    filter: "none",
    save() {
      calls.push(["save"]);
    },
    translate(x, y) {
      calls.push(["translate", x, y]);
    },
    rotate(value) {
      calls.push(["rotate", value]);
    },
    drawImage(_source, x, y, width, height) {
      calls.push(["drawImage", x, y, width, height]);
    },
    restore() {
      calls.push(["restore"]);
    },
  };
  const clip = {
    id: "clip",
    start_ms: 0,
    duration_ms: 1_000,
    fit: "contain",
    scale: 0.5,
    x: 0.25,
    y: 0.75,
    rotation: 90,
    opacity: 0.6,
    brightness: 0.2,
    contrast: 1.4,
    saturation: 0.7,
  };
  const spec = drawTimelineVideoFrame(
    context,
    { videoWidth: 1_920, videoHeight: 1_080 },
    clip,
    1_280,
    720,
    0.5,
  );
  assert.equal(spec.drawWidth, 640);
  assert.equal(spec.drawHeight, 360);
  assert.equal(spec.centerX, 320);
  assert.equal(spec.centerY, 540);
  assert.equal(spec.rotationRadians, Math.PI / 2);
  assert.equal(spec.alpha, 0.3);
  assert.equal(
    spec.filter,
    "brightness(1.2) contrast(1.4) saturate(0.7)",
  );
  assert.deepEqual(calls, [
    ["save"],
    ["translate", 320, 540],
    ["rotate", Math.PI / 2],
    ["drawImage", -320, -180, 640, 360],
    ["restore"],
  ]);
  assert.equal(context.globalAlpha, 0.3);
  assert.equal(context.filter, spec.filter);
});

test("canonical preview/export model clamps source bounds and preserves properties", async () => {
  const timeline = normalizeTimelineDoc({
    width: 1_280,
    height: 720,
    fps: 30,
    tracks: [
      {
        id: "video",
        kind: "video",
        clips: [
          {
            id: "clip",
            start_ms: 120,
            duration_ms: 10_000,
            source_url: "https://cdn.example/video.mp4",
            source_duration_ms: 5_000,
            in_ms: 1_000,
            speed: 2,
            volume: 1.75,
            muted: false,
            fit: "cover",
            scale: 0.6,
            x: 0.2,
            y: 0.8,
            opacity: 0.55,
            rotation: -35,
            brightness: 0.15,
            contrast: 1.25,
            saturation: 1.4,
            transition_in: { type: "crossfade", duration_ms: 450 },
          },
        ],
      },
    ],
  });
  const [clip] = timeline.tracks[0].clips;
  assert.equal(clip.duration_ms, 2_000);
  assert.deepEqual(
    {
      speed: clip.speed,
      volume: clip.volume,
      fit: clip.fit,
      scale: clip.scale,
      x: clip.x,
      y: clip.y,
      opacity: clip.opacity,
      rotation: clip.rotation,
      brightness: clip.brightness,
      contrast: clip.contrast,
      saturation: clip.saturation,
      transition: clip.transition_in,
    },
    {
      speed: 2,
      volume: 1.75,
      fit: "cover",
      scale: 0.6,
      x: 0.2,
      y: 0.8,
      opacity: 0.55,
      rotation: -35,
      brightness: 0.15,
      contrast: 1.25,
      saturation: 1.4,
      transition: { type: "crossfade", duration_ms: 450 },
    },
  );
  const { timelineRenderRequestBody } = await loadRenderContract();
  const body = timelineRenderRequestBody(
    { timeline, title: "all-properties", site_id: "video" },
    "request-1",
  );
  assert.deepEqual(body.timeline, timeline);
  assert.equal(body.request_id, "request-1");
});

async function loadRenderContract() {
  const sourcePath = resolve("src/shell/video-editor/render-contract.ts");
  const modelUrl = pathToFileURL(
    resolve("src/shell/video-editor/timeline-model.ts"),
  ).href;
  const source = (await readFile(sourcePath, "utf8")).replace(
    'from "./timeline-model";',
    `from ${JSON.stringify(modelUrl)};`,
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

async function loadMediaProbe() {
  const sourcePath = resolve("src/shell/video-editor/media-probe.ts");
  const source = (await readFile(sourcePath, "utf8")).replace(
    'import { canvasSafeUrl } from "../../lib/media-proxy";',
    'const canvasSafeUrl = (value) => value;',
  );
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(compiled).toString("base64")}`
  );
}

test("metadata probe reports duration and video dimensions and releases source", async () => {
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  let released = false;
  const media = {
    duration: 1.25,
    videoWidth: 640,
    videoHeight: 360,
    onloadedmetadata: null,
    onerror: null,
    removeAttribute(name) {
      if (name === "src") released = true;
    },
    load() {},
    set src(_value) {
      queueMicrotask(() => this.onloadedmetadata?.());
    },
  };
  globalThis.document = {
    createElement(kind) {
      assert.equal(kind, "video");
      return media;
    },
  };
  globalThis.window = {
    setTimeout,
    clearTimeout,
  };
  try {
    const { probeMediaSource } = await loadMediaProbe();
    assert.deepEqual(await probeMediaSource("https://cdn.example/x.mp4", "video"), {
      durationMs: 1_250,
      width: 640,
      height: 360,
    });
    assert.equal(released, true);
  } finally {
    globalThis.document = previousDocument;
    globalThis.window = previousWindow;
  }
});

const converterAvailable =
  spawnSync("docker", ["inspect", "oceanleo-convert"], {
    stdio: "ignore",
  }).status === 0;

test(
  "FFmpeg pixel and ffprobe smoke matches preview geometry and opacity",
  {
    timeout: 30_000,
    skip: !converterAvailable,
  },
  () => {
    const python = [
      "import json, subprocess, tempfile",
      "from pathlib import Path",
      "from timeline import _timeline_command",
      "with tempfile.TemporaryDirectory() as directory:",
      " root = Path(directory)",
      " source = root / 'source.mp4'",
      " subprocess.run(['ffmpeg','-y','-f','lavfi','-i','color=c=red:s=64x36:r=10:d=1','-f','lavfi','-i','sine=frequency=440:duration=1','-shortest','-c:v','libx264','-pix_fmt','yuv420p','-c:a','aac',str(source)], check=True, capture_output=True)",
      " doc = {'width':64,'height':36,'fps':10,'tracks':[{'id':'video','kind':'video','clips':[{'id':'clip','source_url':'source','start_ms':0,'duration_ms':700,'in_ms':100,'speed':1.25,'volume':1.5,'muted':False,'fit':'cover','scale':0.5,'x':0.25,'y':0.5,'opacity':0.5,'rotation':15,'brightness':0.05,'contrast':1.1,'saturation':0.9,'transition_in':{'type':'fade','duration_ms':200}}]}]}",
      " out, command = _timeline_command(doc, {'source': source}, root, probed_stream_types={'source': {'video','audio'}})",
      " subprocess.run(command, check=True, capture_output=True)",
      " graph = command[command.index('-filter_complex') + 1]",
      " probe = json.loads(subprocess.run(['ffprobe','-v','error','-show_entries','stream=width,height:format=duration','-of','json',str(out)], check=True, capture_output=True).stdout)",
      " frame = subprocess.run(['ffmpeg','-v','error','-ss','0.5','-i',str(out),'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'], check=True, capture_output=True).stdout",
      " def pixel(x, y):",
      "  offset = (y * 64 + x) * 3",
      "  return list(frame[offset:offset + 3])",
      " print(json.dumps({'probe': probe, 'graph': graph, 'center': pixel(16,18), 'outside': pixel(50,18)}))",
    ].join("\n");
    const rendered = spawnSync(
      "docker",
      [
        "exec",
        "-w",
        "/app",
        "oceanleo-convert",
        "python3",
        "-c",
        python,
      ],
      { encoding: "utf8", timeout: 25_000 },
    );
    assert.equal(rendered.status, 0, rendered.stderr);
    const result = JSON.parse(rendered.stdout.trim().split("\n").at(-1));
    const metadata = result.probe;
    assert.equal(metadata.streams[0].width, 64);
    assert.equal(metadata.streams[0].height, 36);
    assert.ok(Number(metadata.format.duration) >= 0.6);
    assert.match(result.graph, /trim=start=0\.100:end=0\.975/);
    assert.match(result.graph, /setpts=\(PTS-STARTPTS\)\/1\.25/);
    assert.match(
      result.graph,
      /eq=brightness=0\.0500:contrast=1\.1000:saturation=0\.9000/,
    );
    assert.match(result.graph, /rotate=15\.000\*PI\/180/);
    assert.match(result.graph, /colorchannelmixer=aa=0\.5000/);
    assert.match(result.graph, /volume=1\.500/);
    assert.match(result.graph, /fade=t=in:st=0:d=0\.200:alpha=1/);
    const center = result.center;
    const outside = result.outside;
    assert.ok(center[0] >= 105 && center[0] <= 145, center);
    assert.ok(center[1] < 25 && center[2] < 25, center);
    assert.ok(outside.every((channel) => channel < 20), outside);
  },
);
