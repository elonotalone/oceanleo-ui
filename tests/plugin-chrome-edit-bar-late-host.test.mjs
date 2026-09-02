/**
 * chrome 编辑栏：宿主晚挂时先保 AI 键，就绪后补装手势。
 *
 * 配 `plugin-chrome-edit-bar-portal-gate.test.mjs`（源码闸）一起守这件事。
 * 13 件插件的逐件可达仍由 `edit-bar-gesture-coverage.test.mjs` 负责；
 * 这里钉的是那三个 embed 类插件会踩到的「控制器 portalRoot 还是 null」路径，
 * 只测 `edit-bar-dock-state` 的状态机，不编真组件。
 *
 * 不要在这三条 `test()` 之后再 `compileModule` / `import()` 控制器：
 * Node 测试运行器会先把已登记的用例跑完，顶层后续的 `await import(floatingUrl)`
 * 才会去加载 `src/lib/motion/index.ts`。那份文件写的是无扩展名 `from "./spring"`，
 * 转译钩子已经卸了，原生 ESM 解析失败，整份文件被判红（三条断言其实全绿）。
 */
import assert from "node:assert/strict";
import test from "node:test";

import {
  readEditBarPortalHost,
  resolveEditBarGestureSurface,
} from "../src/shell/edit-bar-dock-state.ts";

test("没有宿主：留在行里，不上浮层", () => {
  assert.deepEqual(resolveEditBarGestureSurface(null), {
    kind: "inline",
    portalRoot: null,
  });
  assert.deepEqual(resolveEditBarGestureSurface(undefined), {
    kind: "inline",
    portalRoot: null,
  });
});

test("活宿主在、控制器 portalRoot 仍是 null：必须上手势", () => {
  const host = { parentElement: null };
  const portal = readEditBarPortalHost({
    liveHost: host,
    dockHost: null,
    stageHost: null,
    controllerPortalRoot: null,
  });
  assert.equal(portal, host);
  assert.deepEqual(resolveEditBarGestureSurface(portal), {
    kind: "floating",
    portalRoot: host,
  });
});

test("活宿主缺席时才退回控制器快照，快照也没有才 inline", () => {
  const snapshot = { parentElement: null };
  const dock = { parentElement: snapshot };
  assert.equal(
    readEditBarPortalHost({
      liveHost: null,
      dockHost: dock,
      stageHost: null,
      controllerPortalRoot: null,
    }),
    snapshot,
  );
  assert.equal(
    readEditBarPortalHost({
      liveHost: null,
      dockHost: null,
      stageHost: null,
      controllerPortalRoot: snapshot,
    }),
    snapshot,
  );
  assert.equal(
    readEditBarPortalHost({
      liveHost: null,
      dockHost: null,
      stageHost: null,
      controllerPortalRoot: null,
    }),
    null,
  );
});
