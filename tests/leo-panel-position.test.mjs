import assert from "node:assert/strict";
import test from "node:test";

import {
  LEO_PANEL_ANCHOR_GAP,
  LEO_PANEL_DEFAULT_MARGIN,
  LEO_PANEL_VIEWPORT_MARGIN,
  LEO_PANEL_WIDTH,
  leoPanelCompactSize,
  panelBox,
} from "../src/shell/leo/leo-position.ts";

const VIEWPORT = { width: 1024, height: 768 };

test("紧凑态尺寸：384 × min(560, 视口高 − 24)", () => {
  assert.deepEqual(leoPanelCompactSize(VIEWPORT), { width: 384, height: 560 });
  assert.deepEqual(leoPanelCompactSize({ width: 1024, height: 400 }), {
    width: 384,
    height: 376,
  });
  // 窄视口：宽夹进左右边距。
  assert.deepEqual(leoPanelCompactSize({ width: 300, height: 768 }), {
    width: 300 - LEO_PANEL_VIEWPORT_MARGIN * 2,
    height: 560,
  });
});

test("锚点定位：底边 = anchor.top − 8，右边 = anchor.right", () => {
  const anchor = { left: 460, top: 600, right: 500, bottom: 628, width: 40, height: 28 };
  const box = panelBox({ anchor, viewport: VIEWPORT });
  assert.equal(box.width, LEO_PANEL_WIDTH);
  assert.equal(box.height, 560);
  assert.equal(box.left + box.width, anchor.right);
  assert.equal(anchor.top - (box.top + box.height), LEO_PANEL_ANCHOR_GAP);
});

test("锚点越界夹紧：靠顶的锚点把面板夹回视口内", () => {
  const anchor = { left: 20, top: 100, right: 60, bottom: 128, width: 40, height: 28 };
  const box = panelBox({ anchor, viewport: VIEWPORT });
  assert.equal(box.top, LEO_PANEL_VIEWPORT_MARGIN);
  assert.equal(box.left, LEO_PANEL_VIEWPORT_MARGIN);
});

test("拖拽位优先于锚点", () => {
  const anchor = { left: 460, top: 600, right: 500, bottom: 628, width: 40, height: 28 };
  const dragged = { left: 40, top: 40 };
  const box = panelBox({ anchor, viewport: VIEWPORT, dragged });
  assert.equal(box.left, 40);
  assert.equal(box.top, 40);
});

test("拖拽位越界同样夹紧", () => {
  const box = panelBox({
    viewport: VIEWPORT,
    dragged: { left: 5000, top: -100 },
  });
  assert.equal(box.left, VIEWPORT.width - LEO_PANEL_VIEWPORT_MARGIN - 384);
  assert.equal(box.top, LEO_PANEL_VIEWPORT_MARGIN);
});

test("放大态：94vw × 90vh 居中，压过锚点与拖拽位", () => {
  const box = panelBox({
    anchor: { left: 460, top: 600, right: 500, bottom: 628, width: 40, height: 28 },
    viewport: VIEWPORT,
    dragged: { left: 40, top: 40 },
    expanded: true,
  });
  assert.equal(box.width, Math.round(VIEWPORT.width * 0.94));
  assert.equal(box.height, Math.round(VIEWPORT.height * 0.9));
  assert.equal(box.left, Math.round((VIEWPORT.width - box.width) / 2));
  assert.equal(box.top, Math.round((VIEWPORT.height - box.height) / 2));
});

test("无锚点无拖拽：右下角默认位（边距 20）", () => {
  const box = panelBox({ viewport: VIEWPORT });
  assert.equal(box.left, VIEWPORT.width - LEO_PANEL_DEFAULT_MARGIN - 384);
  assert.equal(box.top, VIEWPORT.height - LEO_PANEL_DEFAULT_MARGIN - 560);
});
