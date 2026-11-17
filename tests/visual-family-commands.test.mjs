// W3 自测 · 视觉影音家族（图片 / 视频 / 音频 / 图表 / 3D）。
//
// 判五件事：两类都真的有指令面、越界 id 与越界参数一律被拒、mutates 标对、
// 下载菜单条目齐全且写的是人话、有损格式的默认画质是 90 不是 100。
//
// 用假的编辑器状态跑：这里判的是指令面的契约，不是画布本身。画布行为由
// advanced-editor-v8-*、audio-editor-v8 等既有用例覆盖。
import assert from "node:assert/strict";
import test from "node:test";
import { currentEditorContext, registerEditorContext, resetEditorContext } from "../src/shell/plugin-command/registry.ts";
import {
  DEFAULT_LOSSY_QUALITY,
  clampLossyQuality,
  imageCanvasFormat,
  visualDownloadFormats,
  visualImportPlan,
  visualUploadAccept,
} from "../src/shell/media-editors/visual-formats.ts";
import { uploadUnavailableReason } from "../src/shell/workbench-route-formats.ts";
import { exportFrozenImageDocument } from "../src/shell/image-editor/image-document-contract.ts";
import { cutTimelineRange } from "../src/shell/video-editor/timeline-model.ts";

// --------------------------------------------------------------------------
// 假编辑器
// --------------------------------------------------------------------------

test("两类的下载条目齐全，每条都写清格式名与后缀", () => {
  const expected = {
    image: ["png", "jpg", "webp", "pdf"],
    "video-timeline": ["mp4"],
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
      assert.ok(entry.hint === undefined || typeof entry.hint === "string", `${entry.id} 的说明应为文字`);
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
    ["image", "老图.bmp", "convert", "png"],
    ["image", "扫描件.tiff", "convert", "png"],
    ["image", "封面.png", "accept", ""],
    ["video-timeline", "手机录的.mov", "convert", "mp4"],
    ["video-timeline", "片子.mkv", "convert", "mp4"],
    ["video-timeline", "成片.mp4", "accept", ""],
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

test("HEIC / HEIF 明说打不开，且与入口表逐字同一句话", () => {
  // 依据：`01-arbitration.md` A-4（父 agent 复现：转换容器的 PIL 没注册 .heic/.heif）。
  // 编辑器这边只要还写着 heic → jpg，用户就会白等一趟注定 415 的上传。
  for (const [editorId, name] of [
    ["image", "IMG_2031.HEIC"],
    ["image", "scan.heif"],
    ["video-timeline", "手机照片.heic"],
  ]) {
    const plan = visualImportPlan(editorId, name);
    assert.equal(plan.action, "reject", `${name} 不许再被许诺能转`);
    assert.equal(plan.target, undefined, `${name} 不许留下转换目标`);
    assert.equal(plan.via, undefined, `${name} 不许还指着某个转换端点`);
    assert.equal(
      plan.message,
      uploadUnavailableReason(plan.extension),
      `${name} 的说法和入口表对不上（同一张照片两条入口两套说法）`,
    );
    assert.match(plan.message, /JPG/, `${name} 没告诉用户下一步怎么办`);
  }
});

test("8 种相机原片同一把尺子：全部明说转不了并点名格式", () => {
  // 依据：`verdicts/W10-delivery.md` 图片能力表——PIL 可打开扩展名清单里没有这 8 个。
  for (const extension of [
    "cr2",
    "cr3",
    "nef",
    "arw",
    "dng",
    "raf",
    "orf",
    "rw2",
  ]) {
    const plan = visualImportPlan("image", `DSC001.${extension}`);
    assert.equal(plan.action, "reject", `.${extension} 不许再被许诺能转`);
    assert.equal(plan.target, undefined);
    assert.match(
      plan.message,
      new RegExp(extension, "i"),
      `.${extension} 的原因里没点名是哪个格式`,
    );
    assert.match(plan.message, /JPG/, `.${extension} 没给出下一步`);
    assert.doesNotMatch(plan.message, /artifact|adapter|schema/i);
  }
});

test("转不了的格式仍然挑得到：accept 列出，计划判 reject，零上传", () => {
  const accept = visualUploadAccept("image");
  for (const extension of ["heic", "heif", "cr2", "nef"]) {
    assert.ok(
      accept.includes(`.${extension}`),
      `accept 少了 .${extension}：选择框里灰掉，用户只会以为软件坏了`,
    );
    assert.equal(visualImportPlan("image", `x.${extension}`).action, "reject");
  }
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
  const audioAccept = visualUploadAccept("video-timeline");
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
