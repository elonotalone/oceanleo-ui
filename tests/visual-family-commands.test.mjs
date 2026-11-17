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
      assert.equal(typeof entry.hint, "string", `${entry.id} 的说明应为文字`);
