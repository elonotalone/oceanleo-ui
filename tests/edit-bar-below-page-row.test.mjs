/**
 * 编辑栏必须停在第二行页签底下：clamp 是纯函数，
 * 初始停靠 / 拖拽结束 / resize 三条路径都走它。
 */
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { compileModule } from "./helpers/module-bench.mjs";

const VIEWPORT = { left: 0, top: 0, right: 1440, bottom: 900 };
const BAR = { width: 1049, height: 102 };

const { clampEditBarBelowChrome, EDIT_BAR_BELOW_CHROME_GAP_PX } = await import(
  await compileModule("src/shell/edit-bar-dock-controller.tsx")
);

test("clampEditBarBelowChrome keeps top at or below chromeBottom+8", () => {
  assert.equal(EDIT_BAR_BELOW_CHROME_GAP_PX, 8);
  const overlapping = clampEditBarBelowChrome(
    { x: 320, y: 49 },
    84,
    VIEWPORT,
    BAR,
  );
  assert.equal(overlapping.y, 92);
  assert.ok(overlapping.y >= 84 + EDIT_BAR_BELOW_CHROME_GAP_PX);

  const alreadyBelow = clampEditBarBelowChrome(
    { x: 320, y: 200 },
    84,
    VIEWPORT,
    BAR,
  );
  assert.equal(alreadyBelow.y, 200);

  const afterResize = clampEditBarBelowChrome(
    { x: 320, y: 92 },
    120,
    VIEWPORT,
    BAR,
  );
  assert.equal(afterResize.y, 128);
  assert.ok(afterResize.y >= 120 + 8);
});

test("clampEditBarBelowChrome still clamps x to the viewport", () => {
  const pushed = clampEditBarBelowChrome(
    { x: -400, y: 0 },
    80,
    VIEWPORT,
    BAR,
  );
  assert.equal(pushed.x, 8);
  assert.equal(pushed.y, 88);
});

test("dock / drag / resize all call the same clamp in the controller", async () => {
  const source = await readFile(
    new URL("../src/shell/edit-bar-dock-controller.tsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /export function clampEditBarBelowChrome/);
  assert.match(source, /const finalize = \(point: FloatingToolbarPoint\): FloatingToolbarPoint =>/);
  assert.match(source, /clampEditBarBelowChrome\(point, chromeBottom, bounds, size\)/);
  assert.match(
    source,
    /if \(presentationRef\.current === "collapsed"\) \{[\s\S]*?return finalize\(base\);/,
  );
  assert.match(
    source,
    /if \(targetMode === "docked" && dockBounds && stage && layer && toolbar\) \{[\s\S]*?return finalize\(/,
  );
  assert.match(
    source,
    /const anchor = defaultPosition\(\);[\s\S]*?return finalize\(\{/,
  );
});

test("chrome frame exposes a measurable two-row container", async () => {
  const frame = await readFile(
    new URL("../src/shell/plugin-chrome/PluginChromeFrame.tsx", import.meta.url),
    "utf8",
  );
  assert.match(frame, /data-plugin-chrome-rows/);
  assert.match(frame, /--plugin-chrome-rows-height/);
  const toolbar = await readFile(
    new URL("../src/shell/FloatingContextToolbar.tsx", import.meta.url),
    "utf8",
  );
  assert.match(toolbar, /raiseChromeRowsAboveEditBar/);
  assert.match(toolbar, /data-plugin-page-row/);
});
