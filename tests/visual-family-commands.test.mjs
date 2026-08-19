// W3 自测 · 视觉影音家族（图片 / 视频 / 音频 / 图表 / 3D）。
//
// 判五件事：五类都真的有指令面、越界 id 与越界参数一律被拒、mutates 标对、
// 下载菜单条目齐全且写的是人话、有损格式的默认画质是 90 不是 100。
//
// 用假的编辑器状态跑：这里判的是指令面的契约，不是画布本身。画布行为由
// advanced-editor-v8-*、chart-editor-*、audio-editor-v8 等既有用例覆盖。
import assert from "node:assert/strict";
import test from "node:test";

import {
  currentPluginCommandSurface,
  readPluginCommandState,
  registerPluginCommandSurface,
  resetPluginCommandSurface,
} from "../src/shell/plugin-command/registry.ts";
import { PLUGIN_COMMAND_STATE_MAX_BYTES } from "../src/shell/plugin-command/types.ts";
import {
  DEFAULT_LOSSY_QUALITY,
  clampLossyQuality,
  imageCanvasFormat,
  visualDownloadFormats,
  visualImportPlan,
  visualUploadAccept,
} from "../src/shell/media-editors/visual-formats.ts";
import { exportFrozenImageDocument } from "../src/shell/image-editor/image-document-contract.ts";
import { visualCommandIdErrors } from "../src/shell/media-editors/visual-command-kit.ts";
import { createImageCommandSurface } from "../src/shell/image-editor/image-command-surface.ts";
import { createVideoCommandSurface } from "../src/shell/video-editor/video-command-surface.ts";
import { createAudioCommandSurface } from "../src/shell/media-editors/audio-command-surface.ts";
import { createChartCommandSurface } from "../src/shell/chart-editor/chart-command-surface.ts";
import { createModel3DCommandSurface } from "../src/shell/media-editors/model3d-command-surface.ts";
import { cutTimelineRange } from "../src/shell/video-editor/timeline-model.ts";
import { parseChartValues } from "../src/shell/chart-editor/chart-command-surface.ts";

// --------------------------------------------------------------------------
// 假编辑器
// --------------------------------------------------------------------------

function calls() {
  const log = [];
  const record =
    (name, result) =>
    (...args) => {
      log.push([name, ...args]);
      return typeof result === "function" ? result(...args) : result;
    };
  return { log, record };
}

function fakeImageEditor(overrides = {}) {
  const { log, record } = calls();
  return {
    log,
    editor: {
      loading: false,
      cropping: false,
      error: "",
      dirty: false,
      editRevision: 7,
      doc: { width: 1080, height: 720 },
      canvasBackground: "#ffffff",
      layers: [{ id: "l1" }, { id: "l2" }],
      selected: { id: "l2", kind: "text" },
      zoom: 1,
      exportFormat: "png",
      exportQuality: DEFAULT_LOSSY_QUALITY,
      startCrop: record("startCrop"),
      setCropRatio: record("setCropRatio"),
      confirmCrop: record("confirmCrop", async () => undefined),
      resizeDoc: record("resizeDoc"),
      rotateTarget: record("rotateTarget"),
      addText: record("addText"),
      setSelectedText: record("setSelectedText"),
      setCanvasBackground: record("setCanvasBackground"),
      ...overrides,
    },
  };
}

function fakeVideoEditor(overrides = {}) {
  const { log, record } = calls();
  return {
    log,
    editor: {
      loadingSource: false,
      sourceReady: true,
      exporting: false,
      error: "",
      dirty: false,
      editRevision: 3,
      durationMs: 10_000,
      playheadMs: 1_000,
      playing: false,
      selectedClipId: "clip-a",
      doc: {
        width: 1920,
        height: 1080,
        fps: 30,
        tracks: [
          {
            id: "track-v",
            kind: "video",
            clips: [
              {
                id: "clip-a",
                start_ms: 0,
                duration_ms: 6_000,
                source_url: "https://cdn.example.com/a.mp4",
              },
              {
                id: "clip-b",
                start_ms: 6_000,
                duration_ms: 4_000,
                source_url: "https://cdn.example.com/b.mp4",
              },
            ],
          },
        ],
      },
      cutRange: record("cutRange", true),
      deleteClip: record("deleteClip", true),
      patchClip: record("patchClip"),
      setClipSpeed: record("setClipSpeed"),
      addMediaUrl: record("addMediaUrl", async () => undefined),
      seek: record("seek"),
      ...overrides,
    },
  };
}

function fakeAudioEditor(overrides = {}) {
  const { log, record } = calls();
  return {
    log,
    editor: {
      loading: false,
      error: "",
      dirty: false,
      editRevision: 2,
      duration: 30,
      currentTime: 4,
      playing: false,
      selection: null,
      fadeDuration: 1.5,
      gain: 100,
      editRange: record("editRange", async () => true),
      applyGainRange: record("applyGainRange", async () => true),
      applyFade: record("applyFade"),
      seekTo: record("seekTo"),
      ...overrides,
    },
  };
}

function fakeChartEditor(overrides = {}) {
  const { log, record } = calls();
  return {
    log,
    editor: {
      loading: false,
      sourceReady: true,
      carrierState: "ready",
      error: "",
      dirty: false,
      editRevision: 5,
      activeSeriesId: "series-1",
      document: {
        option: {
          title: { text: "季度营收" },
          legend: { show: true },
          xAxis: { data: ["一季", "二季", "三季"] },
          series: [
            { id: "series-1", name: "营收", type: "bar", data: [1, 2, 3] },
            { id: "series-2", name: "成本", type: "line", data: [1, 1, 1] },
          ],
        },
      },
      patchSeries: record("patchSeries"),
      setTitle: record("setTitle"),
      setLegend: record("setLegend"),
      addSeries: record("addSeries"),
      removeSeries: record("removeSeries"),
      ...overrides,
    },
  };
}

function fakeModel3DEditor(overrides = {}) {
  const { log, record } = calls();
  return {
    log,
    editor: {
      loading: false,
      modelLoaded: true,
      downloading: false,
      capturing: false,
      saving: false,
      dirty: false,
      editRevision: 1,
      sourceFormat: "glb",
      azimuth: 30,
      elevation: 12,
      zoom: 100,
      autoRotate: false,
      background: "#101010",
      animations: ["Idle", "Walk"],
      animationPlaying: false,
      sceneNodes: [{ id: "n1" }],
      materials: [{ name: "m1" }],
      annotations: [],
      setOrbit: record("setOrbit"),
      setZoom: record("setZoom"),
      resetCamera: record("resetCamera"),
      setAutoRotate: record("setAutoRotate"),
      selectAnimation: record("selectAnimation"),
      setAnimationPlaying: record("setAnimationPlaying"),
      ...overrides,
    },
  };
}

function deliverSpy() {
  const seen = [];
  return {
    seen,
    deliver: async (...args) => {
      seen.push(args);
    },
  };
}

/** 五类的「刚打开、什么都还没动」的指令面。 */
function allSurfaces() {
  return [
    {
      editorId: "image",
      surface: createImageCommandSurface({
        editor: fakeImageEditor().editor,
        deliver: deliverSpy().deliver,
      }),
    },
    {
      editorId: "video-timeline",
      surface: createVideoCommandSurface({
        editor: fakeVideoEditor().editor,
        deliver: deliverSpy().deliver,
      }),
    },
    {
      editorId: "audio",
      surface: createAudioCommandSurface({
        editor: fakeAudioEditor().editor,
        deliver: deliverSpy().deliver,
      }),
    },
    {
      editorId: "chart-editor@1",
      surface: createChartCommandSurface({
        editor: fakeChartEditor().editor,
        deliver: deliverSpy().deliver,
      }),
    },
    {
      editorId: "threed",
      surface: createModel3DCommandSurface({
        editor: fakeModel3DEditor().editor,
        deliver: deliverSpy().deliver,
      }),
    },
  ];
}

// --------------------------------------------------------------------------
// 指令面本身
// --------------------------------------------------------------------------

test("五类编辑器都挂得上指令面，且 describe() 至少五条", () => {
  for (const { editorId, surface } of allSurfaces()) {
    resetPluginCommandSurface();
    const unregister = registerPluginCommandSurface(surface);
    const active = currentPluginCommandSurface();
    assert.ok(active, `${editorId} 没有挂上指令面`);
    assert.equal(active.editorId, editorId);
    const specs = active.describe();
    assert.ok(
      specs.length >= 5,
      `${editorId} 只声明了 ${specs.length} 条指令，任务书要求至少 5 条`,
    );
    unregister();
  }
  resetPluginCommandSurface();
});

test("每条指令的 id 前缀逐字等于 editorId，名字是中文且不含「插件」", () => {
  for (const { editorId, surface } of allSurfaces()) {
    const errors = visualCommandIdErrors(editorId, surface.describe());
    assert.deepEqual(errors, [], `${editorId} 的指令声明有问题：${errors}`);
  }
});

test("会改文档的标 mutates:true，只读的标 false", () => {
  const expectations = {
    "image.crop-to-ratio": true,
    "image.resize-canvas": true,
    "image.rotate": true,
    "image.add-text": true,
    "image.set-background": true,
    "image.export": false,
    "video-timeline.cut-range": true,
    "video-timeline.delete-clip": true,
    "video-timeline.set-clip-volume": true,
    "video-timeline.set-clip-speed": true,
    "video-timeline.insert-media": true,
    "video-timeline.seek": false,
    "video-timeline.export": false,
    "audio.keep-range": true,
    "audio.cut-range": true,
    "audio.set-volume": true,
    "audio.fade": true,
    "audio.seek": false,
    "audio.export": false,
    "chart-editor@1.set-chart-type": true,
    "chart-editor@1.set-title": true,
    "chart-editor@1.set-series-values": true,
    "chart-editor@1.toggle-legend": true,
    "chart-editor@1.add-series": true,
    "chart-editor@1.remove-series": true,
    "chart-editor@1.export": false,
    "threed.describe-formats": false,
    "threed.set-view": true,
    "threed.zoom": true,
    "threed.reset-camera": true,
    "threed.set-auto-rotate": true,
    "threed.play-animation": true,
    "threed.export": false,
  };
  const seen = new Set();
  for (const { surface } of allSurfaces()) {
    for (const spec of surface.describe()) {
      assert.equal(
        typeof spec.mutates,
        "boolean",
        `${spec.id} 没有标 mutates`,
      );
      assert.ok(spec.id in expectations, `${spec.id} 没有被本用例钉住`);
      assert.equal(
        spec.mutates,
        expectations[spec.id],
        `${spec.id} 的 mutates 标错了`,
      );
      seen.add(spec.id);
    }
  }
  const missing = Object.keys(expectations).filter((id) => !seen.has(id));
  assert.deepEqual(missing, [], `这些指令没有出现：${missing}`);
});

test("越界 id 一律被拒，不静默兜底", async () => {
  for (const { editorId, surface } of allSurfaces()) {
    resetPluginCommandSurface();
    registerPluginCommandSurface(surface);
    const active = currentPluginCommandSurface();
    for (const id of [
      "",
      "richdoc.insert-heading",
      `${editorId}.does-not-exist`,
      `${editorId}`,
      "../../etc/passwd",
    ]) {
      const result = await active.run(id, {});
      assert.equal(result.ok, false, `${editorId} 竟然接受了 id「${id}」`);
      assert.ok(result.message.trim(), `${editorId} 拒绝了但没说原因`);
    }
  }
  resetPluginCommandSurface();
});

test("未声明的参数、类型不对的参数、越界数值一律被拒", async () => {
  const { editor } = fakeImageEditor();
  const surface = createImageCommandSurface({
    editor,
    deliver: deliverSpy().deliver,
  });
  resetPluginCommandSurface();
  registerPluginCommandSurface(surface);
  const active = currentPluginCommandSurface();

  const unknownParam = await active.run("image.resize-canvas", {
    width: 100,
    height: 100,
    sneaky: 1,
  });
  assert.equal(unknownParam.ok, false);

  const wrongType = await active.run("image.resize-canvas", {
    width: "100",
    height: 100,
  });
  assert.equal(wrongType.ok, false);

  const tooBig = await active.run("image.resize-canvas", {
    width: 99_999,
    height: 100,
  });
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.message, /8000/);

  const notInteger = await active.run("image.resize-canvas", {
    width: 100.5,
    height: 100,
  });
  assert.equal(notInteger.ok, false);

  const badEnum = await active.run("image.crop-to-ratio", { ratio: "7:3" });
  assert.equal(badEnum.ok, false);

  const missingRequired = await active.run("image.crop-to-ratio", {});
  assert.equal(missingRequired.ok, false);

  const overLongText = await active.run("image.add-text", {
    text: "字".repeat(201),
  });
  assert.equal(overLongText.ok, false);
  resetPluginCommandSurface();
});

test("合法参数真的落到编辑器上", async () => {
  const image = fakeImageEditor();
  const imageSurface = createImageCommandSurface({
    editor: image.editor,
    deliver: deliverSpy().deliver,
  });
  const cropped = await imageSurface.run("image.crop-to-ratio", {
    ratio: "16:9",
  });
  assert.equal(cropped.ok, true);
  assert.deepEqual(
    image.log.map(([name]) => name),
    ["startCrop", "setCropRatio", "confirmCrop"],
  );
  assert.equal(cropped.revision, 7);

  const text = fakeImageEditor();
  const textSurface = createImageCommandSurface({
    editor: text.editor,
    deliver: deliverSpy().deliver,
  });
  const added = await textSurface.run("image.add-text", {
    text: "季度复盘",
    style: "heading",
  });
  assert.equal(added.ok, true);
  assert.deepEqual(text.log[0], ["addText", "heading"]);
  assert.deepEqual(text.log[1], ["setSelectedText", { value: "季度复盘" }]);

  const audio = fakeAudioEditor();
  const audioSurface = createAudioCommandSurface({
    editor: audio.editor,
    deliver: deliverSpy().deliver,
  });
  const cut = await audioSurface.run("audio.cut-range", {
    startSeconds: 2,
    endSeconds: 5,
  });
  assert.equal(cut.ok, true);
  assert.deepEqual(audio.log[0], ["editRange", "delete", 2, 5]);

  const chart = fakeChartEditor();
  const chartSurface = createChartCommandSurface({
    editor: chart.editor,
    deliver: deliverSpy().deliver,
  });
  const typed = await chartSurface.run("chart-editor@1.set-chart-type", {
    type: "line",
  });
  assert.equal(typed.ok, true);
  assert.deepEqual(chart.log[0], ["patchSeries", "series-1", { type: "line" }]);

  const model = fakeModel3DEditor();
  const modelSurface = createModel3DCommandSurface({
    editor: model.editor,
    deliver: deliverSpy().deliver,
  });
  const view = await modelSurface.run("threed.set-view", {
    azimuth: 45,
    elevation: 20,
  });
  assert.equal(view.ok, true);
  assert.deepEqual(model.log[0], ["setOrbit", 45, 20]);
});

test("导出指令把格式交给路由，不自己猜", async () => {
  const spy = deliverSpy();
  const surface = createImageCommandSurface({
    editor: fakeImageEditor().editor,
    deliver: spy.deliver,
  });
  const done = await surface.run("image.export", {
    format: "jpg",
    quality: 72,
  });
  assert.equal(done.ok, true);
  assert.deepEqual(spy.seen, [["jpg", 72]]);

  const fallback = deliverSpy();
  const surface2 = createImageCommandSurface({
    editor: fakeImageEditor().editor,
    deliver: fallback.deliver,
  });
  await surface2.run("image.export", { format: "webp" });
  assert.deepEqual(
    fallback.seen,
    [["webp", DEFAULT_LOSSY_QUALITY]],
    "没给画质时必须落在默认 90，不许悄悄按 100 出",
  );
});

test("状态变了，能做的事就跟着变；消失的指令再调就是失败", async () => {
  const loading = createImageCommandSurface({
    editor: fakeImageEditor({ loading: true }).editor,
    deliver: deliverSpy().deliver,
  });
  assert.deepEqual(loading.describe(), [], "还在载入时不该列出任何指令");
  const refused = await loading.run("image.resize-canvas", {
    width: 10,
    height: 10,
  });
  assert.equal(refused.ok, false);

  const cropping = createImageCommandSurface({
    editor: fakeImageEditor({ cropping: true }).editor,
    deliver: deliverSpy().deliver,
  });
  assert.equal(
    cropping.describe().some((spec) => spec.id === "image.crop-to-ratio"),
    false,
    "已经在裁剪中就不该再列出裁剪指令",
  );

  const stopped = createVideoCommandSurface({
    editor: fakeVideoEditor({ sourceReady: false }).editor,
    deliver: deliverSpy().deliver,
  });
  assert.deepEqual(stopped.describe(), [], "源没验过时不该列出任何指令");

  const singleSeries = fakeChartEditor();
  singleSeries.editor.document.option.series =
    singleSeries.editor.document.option.series.slice(0, 1);
  const chart = createChartCommandSurface({
    editor: singleSeries.editor,
    deliver: deliverSpy().deliver,
  });
  assert.equal(
    chart.describe().some((spec) => spec.id === "chart-editor@1.remove-series"),
    false,
    "只剩一个系列时不该列出删除系列",
  );

  const noModel = createModel3DCommandSurface({
    editor: fakeModel3DEditor({ modelLoaded: false }).editor,
    deliver: deliverSpy().deliver,
  });
  const ids = noModel.describe().map((spec) => spec.id);
  assert.deepEqual(
    ids,
    ["threed.describe-formats"],
    "没有模型时只该剩下能力探测这一条",
  );
});

test("state() 是有界摘要，序列化后不超过 4096 字节", () => {
  for (const { editorId, surface } of allSurfaces()) {
    resetPluginCommandSurface();
    registerPluginCommandSurface(surface);
    const snapshot = readPluginCommandState();
    assert.ok(snapshot, `${editorId} 读不到现状摘要`);
    assert.equal(snapshot.truncated, false, `${editorId} 的摘要被截断了`);
    assert.ok(
      snapshot.byteSize <= PLUGIN_COMMAND_STATE_MAX_BYTES,
      `${editorId} 的摘要 ${snapshot.byteSize} 字节，超过上限`,
    );
    assert.ok(snapshot.byteSize > 2, `${editorId} 的摘要是空的`);
  }
  resetPluginCommandSurface();
});

test("片段特别多时，视频摘要仍然收得住", () => {
  const many = fakeVideoEditor();
  many.editor.doc.tracks[0].clips = Array.from({ length: 400 }, (_, index) => ({
    id: `clip-${index}`,
    start_ms: index * 1000,
    duration_ms: 1000,
    source_url: `https://cdn.example.com/very-long-name-${index}.mp4`,
  }));
  const surface = createVideoCommandSurface({
    editor: many.editor,
    deliver: deliverSpy().deliver,
  });
  resetPluginCommandSurface();
  registerPluginCommandSurface(surface);
  const snapshot = readPluginCommandState();
  assert.equal(snapshot.truncated, false);
  assert.ok(snapshot.byteSize <= PLUGIN_COMMAND_STATE_MAX_BYTES);
  assert.equal(snapshot.state.clipCount, 400);
  assert.equal(snapshot.state.clips.length, 12);
  resetPluginCommandSurface();
});

// --------------------------------------------------------------------------
// 下载菜单
// --------------------------------------------------------------------------

test("五类的下载条目齐全，每条都写清格式名与后缀", () => {
  const expected = {
    image: ["png", "jpg", "webp"],
    "video-timeline": ["mp4", "webm"],
    audio: ["wav", "mp3", "m4a"],
    "chart-editor@1": ["png", "svg", "json"],
    threed: ["glb", "png"],
  };
  for (const [editorId, formats] of Object.entries(expected)) {
    const entries = visualDownloadFormats(editorId);
    assert.deepEqual(
      entries.map((entry) => entry.format),
      formats,
      `${editorId} 的下载格式不齐`,
    );
    for (const entry of entries) {
      assert.match(
        entry.label,
        new RegExp(`\\(\\.${entry.format}\\)$`),
        `「${entry.label}」没把后缀写清楚`,
      );
      assert.ok(entry.hint.trim(), `${entry.id} 没有一句话说明`);
      assert.equal(entry.label.includes("插件"), false);
    }
    const ids = entries.map((entry) => entry.id);
    assert.equal(new Set(ids).size, ids.length, `${editorId} 的条目 id 重复`);
  }
});

test("有损格式的默认画质是 90，越界值被夹回区间", () => {
  assert.equal(DEFAULT_LOSSY_QUALITY, 90);
  assert.equal(clampLossyQuality(undefined), 90);
  assert.equal(clampLossyQuality("nonsense"), 90);
  assert.equal(clampLossyQuality(1), 20);
  assert.equal(clampLossyQuality(1000), 100);
  assert.equal(clampLossyQuality(77), 77);
  const lossy = visualDownloadFormats("image").filter((entry) => entry.lossy);
  assert.deepEqual(
    lossy.map((entry) => entry.format),
    ["jpg", "webp"],
    "png 不该被当成有损格式",
  );
});

test("图片本地导出：菜单选什么格式，画布就按什么 MIME 与画质出", async () => {
  const seen = [];
  const fakeCanvas = {
    viewportTransform: [2, 0, 0, 2, 30, 40],
    setViewportTransform(transform) {
      seen.push(["viewport", [...transform]]);
      this.viewportTransform = [...transform];
    },
    requestRenderAll() {
      seen.push(["render"]);
    },
    toCanvasElement(multiplier, region) {
      seen.push(["raster", multiplier, region]);
      return {
        toBlob(callback, mimeType, quality) {
          seen.push(["toBlob", mimeType, quality]);
          callback({ type: mimeType, size: 1024 });
        },
      };
    },
  };
  assert.equal(imageCanvasFormat("jpg"), "jpeg");
  assert.equal(imageCanvasFormat("webp"), "webp");
  assert.equal(imageCanvasFormat("png"), "png");
  assert.equal(imageCanvasFormat("bmp"), "png", "认不出的格式退回 PNG，不许猜");

  const jpg = await exportFrozenImageDocument(
    fakeCanvas,
    { width: 1080, height: 720 },
    {
      format: imageCanvasFormat("jpg"),
      // makeExportBlob 把百分比换算成 0–1，这里跟它逐字一致。
      quality: DEFAULT_LOSSY_QUALITY / 100,
      multiplier: 1,
    },
  );
  assert.equal(jpg.type, "image/jpeg");
  assert.deepEqual(
    seen.find((entry) => entry[0] === "toBlob"),
    ["toBlob", "image/jpeg", 0.9],
    "JPG 必须按 90 出，不许悄悄按 100",
  );
  assert.deepEqual(
    seen[0],
    ["viewport", [1, 0, 0, 1, 0, 0]],
    "导出前要把视口归一，否则导出的是当前缩放后的画面",
  );
  assert.deepEqual(
    seen.filter((entry) => entry[0] === "viewport")[1],
    ["viewport", [2, 0, 0, 2, 30, 40]],
    "导出后要把用户的视口还回去",
  );
  assert.deepEqual(
    seen.find((entry) => entry[0] === "raster"),
    ["raster", 1, { left: 0, top: 0, width: 1080, height: 720 }],
  );

  const webp = await exportFrozenImageDocument(
    fakeCanvas,
    { width: 800, height: 800 },
    { format: imageCanvasFormat("webp"), quality: 0.9, multiplier: 2 },
  );
  assert.equal(webp.type, "image/webp");

  const png = await exportFrozenImageDocument(
    fakeCanvas,
    { width: 800, height: 800 },
    { format: imageCanvasFormat("png"), quality: 1, multiplier: 1 },
  );
  assert.equal(png.type, "image/png");
});

// --------------------------------------------------------------------------
// 上传归一化
// --------------------------------------------------------------------------

test("冷门格式有归一化去处，去不了的给人话", () => {
  const cases = [
    ["image", "IMG_2031.HEIC", "convert", "jpg"],
    ["image", "scan.heif", "convert", "jpg"],
    ["image", "老图.bmp", "convert", "png"],
    ["image", "扫描件.tiff", "convert", "png"],
    ["image", "DSC001.cr2", "convert", "jpg"],
    ["image", "封面.png", "accept", ""],
    ["video-timeline", "手机录的.mov", "convert", "mp4"],
    ["video-timeline", "片子.mkv", "convert", "mp4"],
    ["video-timeline", "成片.mp4", "accept", ""],
    ["audio", "录音.flac", "convert", "mp3"],
    ["audio", "播客.ogg", "convert", "mp3"],
    ["audio", "配音.wav", "accept", ""],
  ];
  for (const [editorId, name, action, target] of cases) {
    const plan = visualImportPlan(editorId, name);
    assert.equal(plan.action, action, `${name} 的处置不对`);
    if (action === "convert") {
      assert.equal(plan.target, target, `${name} 该转成 ${target}`);
      assert.ok(plan.message.trim(), `${name} 转失败时没有人话`);
      assert.equal(plan.message.includes("adapter"), false);
      assert.equal(plan.message.includes("schema"), false);
    }
  }
});

test("3D 只认 GLB 与 glTF，别的格式明说打不开且不假装能转", () => {
  for (const format of ["obj", "stl", "fbx", "dae", "blend"]) {
    const plan = visualImportPlan("threed", `模型.${format}`);
    assert.equal(plan.action, "reject", `.${format} 不该被当成能转`);
    assert.match(plan.message, /GLB/);
    assert.equal(plan.target, undefined);
  }
  for (const format of ["glb", "gltf"]) {
    assert.equal(visualImportPlan("threed", `模型.${format}`).action, "accept");
  }
  const accept = visualUploadAccept("threed");
  assert.equal(accept.includes(".obj"), false, "accept 里不许出现打不开的格式");
  assert.ok(accept.includes(".glb"));
});

test("图表只读 CSV / TSV，xlsx 给的是「另存为 CSV」而不是沉默", () => {
  assert.equal(visualImportPlan("chart-editor@1", "数据.csv").action, "accept");
  const xlsx = visualImportPlan("chart-editor@1", "台账.xlsx");
  assert.equal(xlsx.action, "reject");
  assert.match(xlsx.message, /CSV/);
});

test("没有后缀、认不出的文件都有明确交代", () => {
  const noExtension = visualImportPlan("image", "剪贴板粘的东西");
  assert.equal(noExtension.action, "reject");
  assert.ok(noExtension.message.trim());
  const unknown = visualImportPlan("image", "东西.xyz");
  assert.equal(unknown.action, "reject");
  assert.match(unknown.message, /xyz/);
});

test("上传 accept 覆盖原生格式与所有能自动转的格式", () => {
  const imageAccept = visualUploadAccept("image");
  for (const extension of [".png", ".jpg", ".heic", ".bmp", ".tiff", ".cr2"]) {
    assert.ok(imageAccept.includes(extension), `accept 少了 ${extension}`);
  }
  const audioAccept = visualUploadAccept("audio");
  for (const extension of [".mp3", ".wav", ".flac", ".ogg"]) {
    assert.ok(audioAccept.includes(extension), `accept 少了 ${extension}`);
  }
});

// --------------------------------------------------------------------------
// 剪段与数据解析
// --------------------------------------------------------------------------

test("剪掉一段时间：所有轨道一起剪，后面的左移接上", () => {
  const doc = {
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [
      {
        id: "v",
        kind: "video",
        clips: [
          { id: "a", start_ms: 0, duration_ms: 4000, source_url: "a.mp4" },
          { id: "b", start_ms: 4000, duration_ms: 4000, source_url: "b.mp4" },
        ],
      },
      {
        id: "s",
        kind: "audio",
        clips: [
          { id: "m", start_ms: 0, duration_ms: 8000, source_url: "m.mp3" },
        ],
      },
    ],
  };
  const next = cutTimelineRange(doc, 2000, 5000);
  const video = next.tracks[0].clips;
  assert.equal(video[0].duration_ms, 2000, "前半段该被裁到 2 秒");
  assert.equal(video[1].start_ms, 2000, "后面的片段该左移到剪口");
  assert.equal(video[1].duration_ms, 3000);
  assert.equal(video[1].in_ms, 1000, "源内起点要跟着走，否则画面会跳");
  const audio = next.tracks[1].clips;
  assert.equal(audio.length, 2, "声音轨也要一起剪，不然声画错位");
  assert.equal(audio[0].duration_ms, 2000);
  assert.equal(audio[1].start_ms, 2000);
  assert.equal(doc.tracks[0].clips[0].duration_ms, 4000, "原文档不许被改");
});

test("剪口太窄、或范围内没内容时，时间线原样不动", () => {
  const doc = {
    width: 1920,
    height: 1080,
    fps: 30,
    tracks: [
      {
        id: "v",
        kind: "video",
        clips: [{ id: "a", start_ms: 0, duration_ms: 4000 }],
      },
    ],
  };
  assert.equal(cutTimelineRange(doc, 1000, 1050), doc, "不足 100ms 不该动");
  assert.equal(cutTimelineRange(doc, 9000, 9000), doc);
});

test("图表数据串解析：有一格不是数字就整条不收", () => {
  assert.deepEqual(parseChartValues("12, 20,16"), {
    ok: true,
    values: [12, 20, 16],
  });
  const bad = parseChartValues("12, 二十, 16");
  assert.equal(bad.ok, false);
  assert.match(bad.message, /第 2 个值/);
  assert.equal(parseChartValues("   ").ok, false);
  assert.equal(
    parseChartValues(Array.from({ length: 201 }, () => "1").join(",")).ok,
    false,
  );
});

test("图表改数据时分类数对不上就拒绝，不许把空位当 0 补齐", async () => {
  const chart = fakeChartEditor();
  const surface = createChartCommandSurface({
    editor: chart.editor,
    deliver: deliverSpy().deliver,
  });
  const wrongCount = await surface.run("chart-editor@1.set-series-values", {
    values: "1,2",
  });
  assert.equal(wrongCount.ok, false);
  assert.match(wrongCount.message, /3 个/);
  assert.deepEqual(chart.log, []);
  const right = await surface.run("chart-editor@1.set-series-values", {
    values: "4,5,6",
    seriesId: "series-2",
  });
  assert.equal(right.ok, true);
  assert.deepEqual(chart.log[0], [
    "patchSeries",
    "series-2",
    { data: [4, 5, 6] },
  ]);
});

test("3D 能力探测照实报，不给「传上来试试」的暗示", async () => {
  const surface = createModel3DCommandSurface({
    editor: fakeModel3DEditor().editor,
    deliver: deliverSpy().deliver,
  });
  const report = await surface.run("threed.describe-formats", {});
  assert.equal(report.ok, true);
  assert.match(report.message, /\.glb/);
  assert.match(report.message, /\.obj/);
  assert.match(report.message, /导出 GLB/);
});
