// 消息浮层：圆角悬浮版面、贴底自适应高度、拖拽阈值与编辑栏一致。
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DRAG_START_PX,
  DRAG_START_TOUCH_PX,
  MESSAGES_HEADER_HEIGHT_PX,
  MESSAGES_OVERLAY_RADIUS_PX,
  MESSAGES_OVERLAY_Z,
  MESSAGES_SIDEBAR_EXPANDED_PX,
  MESSAGES_VIEWPORT_MARGIN_PX,
  defaultOverlayOffset,
  dragStartThreshold,
  overlayBox,
} from "../src/shell/messages/overlay-geometry.ts";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(join(here, "..", rel), "utf8");

const DESKTOP = { width: 1440, height: 900 };

test("默认停在侧栏右边靠下：从铃铛这一侧长出来，四角圆角都看得见", () => {
  const width = 420;
  const offset = defaultOverlayOffset(DESKTOP, width);
  assert.equal(offset.x, MESSAGES_SIDEBAR_EXPANDED_PX + MESSAGES_VIEWPORT_MARGIN_PX);
  assert.equal(offset.y, DESKTOP.height - MESSAGES_VIEWPORT_MARGIN_PX - 640);
  const box = overlayBox({
    offset,
    width,
    preferredHeight: 640,
    viewport: DESKTOP,
  });
  assert.equal(box.left, offset.x);
  assert.equal(box.top, offset.y);
  assert.equal(box.width, width);
  assert.equal(box.height, 640);
  assert.equal(box.radius, MESSAGES_OVERLAY_RADIUS_PX);
  assert.ok(box.left + box.width <= DESKTOP.width - MESSAGES_VIEWPORT_MARGIN_PX);
  assert.ok(box.top >= MESSAGES_VIEWPORT_MARGIN_PX);
  assert.ok(box.left < DESKTOP.width / 2, "贴着左侧栏，不要再闪到右上角");
});

test("拖到页面下方：高度跟着视口缩短，四角仍是同一圆角，标题栏还在", () => {
  const box = overlayBox({
    offset: { x: 900, y: 700 },
    width: 420,
    preferredHeight: 640,
    viewport: DESKTOP,
  });
  assert.equal(box.radius, MESSAGES_OVERLAY_RADIUS_PX);
  assert.equal(box.height, DESKTOP.height - 700 - MESSAGES_VIEWPORT_MARGIN_PX);
  assert.ok(box.height < 640, "贴底时显示的内容变少");
  assert.ok(box.height >= MESSAGES_HEADER_HEIGHT_PX, "标题栏必须留在视口里");
  assert.equal(box.top + box.height, DESKTOP.height - MESSAGES_VIEWPORT_MARGIN_PX);
});

test("拖过底边：不能把标题栏推出视口，高度收到标题栏那么高", () => {
  const box = overlayBox({
    offset: { x: 900, y: 880 },
    width: 420,
    preferredHeight: 640,
    viewport: DESKTOP,
  });
  assert.equal(box.top, DESKTOP.height - MESSAGES_VIEWPORT_MARGIN_PX - MESSAGES_HEADER_HEIGHT_PX);
  assert.equal(box.height, MESSAGES_HEADER_HEIGHT_PX);
  assert.equal(box.radius, MESSAGES_OVERLAY_RADIUS_PX);
});

test("左右也夹在视口内，宽度不够时跟着变窄", () => {
  const narrow = overlayBox({
    offset: { x: -200, y: 20 },
    width: 420,
    preferredHeight: 640,
    viewport: { width: 360, height: 640 },
  });
  assert.equal(narrow.left, MESSAGES_VIEWPORT_MARGIN_PX);
  assert.ok(narrow.width <= 360 - MESSAGES_VIEWPORT_MARGIN_PX * 2);
  assert.equal(narrow.radius, MESSAGES_OVERLAY_RADIUS_PX);
});

test("放大态仍是悬浮圆角，不是贴边全屏", () => {
  const box = overlayBox({
    offset: { x: 0, y: 0 },
    width: 420,
    preferredHeight: 640,
    viewport: DESKTOP,
    expanded: true,
  });
  assert.ok(box.left >= MESSAGES_VIEWPORT_MARGIN_PX);
  assert.ok(box.top >= MESSAGES_VIEWPORT_MARGIN_PX);
  assert.ok(box.width < DESKTOP.width);
  assert.ok(box.height < DESKTOP.height);
  assert.equal(box.radius, MESSAGES_OVERLAY_RADIUS_PX);
});

test("层级常量低于站内 Modal(1000)、高于页面输入框(z-30)", () => {
  assert.equal(MESSAGES_OVERLAY_Z, 999);
  assert.ok(MESSAGES_OVERLAY_Z > 30);
  assert.ok(MESSAGES_OVERLAY_Z < 1000);
});

test("拖拽按下阈值与编辑栏逐字相同：鼠标 4px、触屏 8px", () => {
  const bar = read("src/shell/edit-bar-dock-controller.tsx");
  assert.match(bar, /const DRAG_START_PX = 4;/);
  assert.match(bar, /const DRAG_START_TOUCH_PX = 8;/);
  assert.equal(DRAG_START_PX, 4);
  assert.equal(DRAG_START_TOUCH_PX, 8);
  assert.equal(dragStartThreshold("mouse"), 4);
  assert.equal(dragStartThreshold("pen"), 4);
  assert.equal(dragStartThreshold("touch"), 8);
});
