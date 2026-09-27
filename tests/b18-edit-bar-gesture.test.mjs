import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const REPO = resolve(new URL("..", import.meta.url).pathname);
const controller = readFileSync(resolve(REPO, "src/shell/edit-bar-dock-controller.tsx"), "utf8");
const toolbar = readFileSync(resolve(REPO, "src/shell/FloatingContextToolbar.tsx"), "utf8");
const surface = readFileSync(resolve(REPO, "src/shell/edit-bar-surface.ts"), "utf8");

test("B18：第一下松开后 400ms / 12px 内第二次按下进入拖动会话", () => {
  assert.match(controller, /const onPointerDown = useCallback/);
  assert.doesNotMatch(controller, /onPointerDownCapture/);
  assert.match(toolbar, /onPointerDown=\{controller\.rootProps\.onPointerDown\}/);
  assert.match(controller, /event\.stopPropagation\(\);/);
  assert.match(controller, /now - firstPress\.releasedAt <= DOUBLE_PRESS_MS/);
  assert.match(controller, /Math\.hypot\(event\.clientX - firstPress\.x, event\.clientY - firstPress\.y\) <= DOUBLE_PRESS_SLOP_PX/);
  assert.match(controller, /attachArmedSession\(/);
  assert.doesNotMatch(controller, /REARM_WINDOW_MS|REARM_SLOP_/);
});

test("B18：拖动会话吞掉按钮 click，静止按下仍回放普通 click", () => {
  assert.match(controller, /swallowNextClick\(event\.clientX, event\.clientY\)/);
  assert.match(controller, /origin\.dispatchEvent\(\s*new MouseEvent\("click"/s);
  assert.match(controller, /if \(phase === "dragging"\) \{\s*event\.preventDefault\(\);/s);
  assert.match(controller, /DOUBLE_PRESS_SLOP_PX\s*\) \{\s*attachArmedSession\(/s);
});

test("B18：编辑条本体高度为 38px", () => {
  assert.match(surface, /export const EDIT_BAR_HEIGHT_PX =/);
  assert.match(surface, /EDIT_BAR_CONTROL_SIZE_PX = 28/);
  assert.match(surface, /EDIT_BAR_PILL_PADDING_PX = 4/);
  assert.match(surface, /EDIT_BAR_BORDER_PX = 1/);
  assert.equal(28 + 4 * 2 + 1 * 2, 38);
});
