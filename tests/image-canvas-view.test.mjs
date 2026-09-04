/**
 * 画布内结构 / 皮肤入口。点了必须真切，切了不得碰文档（A-48）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  CANVAS_VIEW_LABELS,
  applyCanvasViewClick,
  canvasViewChoices,
} from "../src/shell/image-editor/design-mode/canvas-view-switch.ts";
import {
  DESIGN_MODE_INITIAL_STATE,
  modeSwitchPreservesCarrier,
  planEditorModeSwitch,
} from "../src/shell/image-editor/design-mode/design-mode-state.ts";
import { fabricCarrierSkinDigest, fabricCarrierStructureDigest } from "../src/shell/image-editor/fabric-carrier-schema.ts";

function carrier() {
  return {
    schema: "oceanleo.fabric-carrier.v1",
    version: 1,
    title: "结构皮肤共用的一份文档",
    doc: { units: "px", dpi: 300, color_space: "sRGB" },
    artboards: [
      {
        id: "ab-01",
        page: 1,
        width: 1080,
        height: 1920,
        background: "#ffffff",
        fabric: { version: "6.9.1", objects: [{ type: "image", oceanleoId: "bg", oceanleoAxis: "skin" }] },
      },
    ],
    slots: [],
    fonts: [],
  };
}

test("结构 / 皮肤是 photo / design 的产品名，不是第三种模式", () => {
  assert.equal(CANVAS_VIEW_LABELS.photo, "结构");
  assert.equal(CANVAS_VIEW_LABELS.design, "皮肤");
  const choices = canvasViewChoices("photo");
  assert.deepEqual(
    choices.map((choice) => [choice.mode, choice.label, choice.pressed]),
    [
      ["photo", "结构", true],
      ["design", "皮肤", false],
    ],
  );
});

test("点了必须真切：从结构到皮肤，状态档位要变", () => {
  const document = carrier();
  const route = applyCanvasViewClick(DESIGN_MODE_INITIAL_STATE, "design", document);
  assert.equal(route.kind, "preserve-document");
  assert.equal(route.state.mode, "design", "点了皮肤却还停在结构，入口就是空转");
  assert.equal(route.state.rulerVisible, true);
  const planned = planEditorModeSwitch(DESIGN_MODE_INITIAL_STATE, "design", document);
  assert.deepEqual(route, planned, "入口必须把 planEditorModeSwitch 的 route 原样交还");
});

test("切了不得碰文档：交还的必须是进函数时那份文件", () => {
  const document = carrier();
  const before = JSON.parse(JSON.stringify(document));
  const beforeStructure = fabricCarrierStructureDigest(document);
  const beforeSkin = fabricCarrierSkinDigest(document);
  const route = applyCanvasViewClick(DESIGN_MODE_INITIAL_STATE, "design", document);
  assert.deepEqual(route.document, before);
  assert.deepEqual(document, before);
  assert.equal(fabricCarrierStructureDigest(route.document), beforeStructure);
  assert.equal(fabricCarrierSkinDigest(route.document), beforeSkin);
  assert.equal(modeSwitchPreservesCarrier(before, route.document), true);
});
