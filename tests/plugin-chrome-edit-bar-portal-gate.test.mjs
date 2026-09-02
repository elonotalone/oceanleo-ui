/**
 * chrome 编辑栏手势层：不许用「控制器还没抄到宿主」把拖拽关死。
 *
 * 操作员原话是设计画布 / 网站编辑 / 工作流三条 edit bar 拖不动。
 * 直接原因曾经是 `PluginChromeEditBarGestureLayer` 看见
 * `controller.portalRoot == null` 就把整层浮层卸掉，内容留在行里。
 * 那条降级是为了保住 AI 键（契约 §9），不能删；但宿主元素其实已经挂上、
 * 只是控制器那一帧还没抄到 `portalRoot` 时，必须补装手势，不能永远停在行里。
 *
 * 这份闸只读源码，不编组件：先红、再改。运行期补装见
 * `plugin-chrome-edit-bar-late-host.test.mjs`。
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const LAYER = resolve("src/shell/PluginChromeEditBarGestureLayer.tsx");

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

test("手势层不许只靠 controller.portalRoot 为 null 就把浮层关死", () => {
  const source = stripComments(readFileSync(LAYER, "utf8"));
  assert.doesNotMatch(
    source,
    /if\s*\(\s*!controller\.portalRoot\s*\)\s*return/,
    "看见 portalRoot 为 null 就 return children，宿主已经挂上也不会补装。" +
      "AI 键要留在行里的降级必须按「当前没有可挂的宿主元素」来判，" +
      "不能把控制器晚一拍抄到的状态当成没有宿主",
  );
});

test("手势层必须按活宿主补装，而不是把控制器状态当成唯一真相", () => {
  const source = stripComments(readFileSync(LAYER, "utf8"));
  assert.match(
    source,
    /readEditBarPortalHost|resolveEditBarGestureSurface/,
    "没有从活 ref 读宿主的入口——控制器 portalRoot 错过第一帧就会永远拖不动",
  );
  assert.match(
    source,
    /kind === "inline"|surface\.kind === "inline"/,
    "没有「没有宿主就留在行里」的分支——删掉降级会让 AI 键在浮层没起来时消失",
  );
});
