// ============================================================================
// W09 · 一条路由崩溃不许带走工作台
// ----------------------------------------------------------------------------
// W09 之前只有**一个** `WorkbenchErrorBoundary` 包着整棵编辑器树，而它的失败态是
//
//     createPortal(fallback, document.body)   +   fixed inset-0 z-[2147483000]
//
// 于是「一件素材的编辑器有问题」被呈现成「整个工作台没了」：一张 max-z 全视口遮罩
// 盖住外壳、编辑栏、素材库。**问题不在「边界包得太大」，在失败态的呈现方式**——
// 这份测试锁的就是这一点，所以它断言的是 DOM 的形状，不是边界的层数。
//
// 锁四件事：
//   ① 路由级边界接住崩溃之后，`document.body` **不多一个直接子节点**（没有 portal）；
//   ② 文档里**没有** `fixed` / `z-[2147483000]` 的全视口遮罩；
//   ③ 渲染在边界之外的外壳 / 编辑栏 / 素材库节点**仍在 DOM 里**，且仍可交互；
//   ④ 换 `routeId` + `key` 到另一条路由 ⇒ 新边界从未 error 过，正常渲染。
//
// 外加两条把「两级边界不是冗余」钉住的对照：
//   ⑤ `scope="workbench"`（外层，非 embedded）**仍然**整页接管 —— 外壳自己崩了的时候
//      窗格里没有可信内容，整页接管才是对的。两级各管一件事，改回单级会同时输掉一件；
//   ⑥ 上报事件里**没有** `error.message`，而窗格内给用户看的 `<pre>` 里**有**。
//      同一次崩溃，两个方向的要求相反，这条把它们同时钉住。
//
// 用 jsdom 而不是 `renderToStaticMarkup`：`componentDidCatch` 必须真的发生
// （SSR 下错误边界不参与），而 ①②③ 判的都是真实 DOM 的形状。
// jsdom 与 `createRoot` 的取法照抄 `tests/workbench-toolbar-rendered.test.mjs`。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

// ── jsdom（从 fabric 的 node_modules 里取，`canvas` 打哑，同样板） ─────────────
const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/library/poster",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  SVGElement: window.SVGElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

// ── 被测模块 ────────────────────────────────────────────────────────────────
// `./library-data` 在边界里是 `import type`，编译期就被抹掉，不进模块图。
// `../lib/telemetry/errors` 是 `.ts`，编译台把它解析成 `file://` 真模块 ⇒
// 下面 `import("../src/lib/telemetry/index.ts")` 拿到的是**同一份实例**，
// 环形缓冲与 sink 注册都是共享的。
const boundaryUrl = await compileModule("src/shell/WorkbenchErrorBoundary.tsx");
const { WorkbenchErrorBoundary } = await import(boundaryUrl);
const telemetry = await import("../src/lib/telemetry/index.ts");

const ITEM = Object.freeze({
  key: "creation:poster-1",
  source: "creation",
  id: "poster-1",
  title: "季度汇报海报",
  kind: "image",
  siteId: "image",
  url: "https://image.oceanleo.com/assets/poster-1.png",
  favorite: false,
  meta: {},
});

/** 崩在 render 里 —— 错误边界只接得到 render / lifecycle 抛出来的。 */
function Boom({ message = "editor exploded" }) {
  throw new Error(message);
}

function Editor() {
  return React.createElement("div", { "data-real-editor": true }, "editor body");
}

/**
 * 宿主：外壳 / 编辑栏 / 素材库都渲染在**边界之外**，也就是真实结构里的样子
 * （`AdvancedContentWorkbench.tsx:580-594` 的两级边界只包 `{editor}`）。
 * ③ 判的就是这三个节点在崩溃之后还在不在。
 */
function Harness({ routeId, routeKey, crash, scope, contained, message }) {
  return React.createElement(
    "div",
    { "data-workbench-host": true },
    React.createElement("div", { "data-workbench-shell": true }, "外壳"),
    React.createElement(
      "button",
      { type: "button", "data-workbench-edit-bar": true },
      "编辑栏",
    ),
    React.createElement("div", { "data-workbench-library": true }, "素材库"),
    React.createElement(
      WorkbenchErrorBoundary,
      {
        key: routeKey,
        ...(scope ? { scope } : {}),
        ...(contained === undefined ? {} : { contained }),
        routeId,
        item: ITEM,
        onClose() {},
      },
      crash
        ? React.createElement(Boom, { message })
        : React.createElement(Editor),
    ),
  );
}

async function mount(props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Harness, props));
  });
  return {
    container,
    async rerender(next) {
      await act(async () => {
        root.render(React.createElement(Harness, next));
      });
    },
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

/**
 * React 把边界接住的错误照样往 `console.error` 打一份，边界自己也打一份。
 * 这里静音只为让测试输出可读；**返回捕获的内容**，所以静音不会顺手藏掉真问题。
 */
function muteConsoleError() {
  const captured = [];
  const original = console.error;
  console.error = (...args) => void captured.push(args);
  return {
    captured,
    restore() {
      console.error = original;
    },
  };
}

function collectTelemetry() {
  const events = [];
  telemetry.resetTelemetry();
  telemetry.configureTelemetry({ consoleSeverity: "off" });
  telemetry.registerTelemetrySink({ id: "route-isolation-test", receive: (e) => events.push(e) });
  return events;
}

/**
 * 全视口遮罩的签名。判 `className` 文本而不是算样式：jsdom 不跑 Tailwind，
 * 而这些 utility 类名**就是**部署上去的那份呈现，判它是判真东西。
 */
function overlayNodes() {
  return Array.from(document.querySelectorAll("*")).filter((node) => {
    const cls = typeof node.className === "string" ? node.className : "";
    return cls.includes("z-[2147483000]") || /(?:^|\s)fixed(?:\s|$)/.test(cls);
  });
}

test("路由级边界：一条编辑器崩了，body 不多 portal、没有全视口遮罩、外壳仍在", async () => {
  const events = collectTelemetry();
  const mounted = await mount({
    routeId: "threed",
    routeKey: "model-3d-editor@1:model:poster-1",
    crash: false,
    scope: "route",
  });
  const muted = muteConsoleError();
  try {
    // 崩之前的基线：先把 body 的直接子节点数记下来。
    const bodyChildrenBefore = document.body.children.length;
    assert.ok(mounted.container.querySelector("[data-real-editor]"), "崩之前该有真编辑器");
    assert.equal(overlayNodes().length, 0, "崩之前就不该有遮罩");

    await mounted.rerender({
      routeId: "threed",
      routeKey: "model-3d-editor@1:model:poster-1",
      crash: true,
      scope: "route",
    });

    // 边界确实接住了（不是「没崩」造成的假绿）。
    const placeholder = mounted.container.querySelector("[data-workbench-route-error]");
    assert.ok(placeholder, "路由级失败态没渲染出来 ⇒ 边界没接到，这条测试什么都没验");
    assert.equal(placeholder.getAttribute("role"), "alert");
    assert.equal(placeholder.dataset.chunkFailureKind, "crash");
    assert.equal(mounted.container.querySelector("[data-real-editor]"), null);

    // ① 没有 portal：body 的直接子节点一个都没多。
    assert.equal(
      document.body.children.length,
      bodyChildrenBefore,
      "body 多了直接子节点 ⇒ 失败态又 portal 到 body 上去了",
    );
    // 失败态必须留在编辑器窗格内（即挂在自己的容器里）。
    assert.ok(
      mounted.container.contains(placeholder),
      "失败态跑到容器外面去了 ⇒ 它不在编辑器窗格内",
    );

    // ② 没有全视口遮罩。
    assert.deepEqual(
      overlayNodes().map((node) => node.className),
      [],
      "文档里出现了 fixed / z-[2147483000] 遮罩 ⇒ 一条路由的崩溃又盖住整页了",
    );
    // 就地占位的正面证据：`grid h-full` 而不是 `absolute inset-0` / `fixed inset-0`。
    assert.match(placeholder.className, /\bgrid\b/);
    assert.match(placeholder.className, /\bh-full\b/);
    assert.doesNotMatch(placeholder.className, /\bfixed\b|\babsolute\b|\binset-0\b/);

    // ③ 外壳、编辑栏、素材库全都还在，且编辑栏仍然是可交互的真按钮。
    for (const hook of [
      "[data-workbench-shell]",
      "[data-workbench-edit-bar]",
      "[data-workbench-library]",
    ]) {
      const node = mounted.container.querySelector(hook);
      assert.ok(node, `${hook} 不在 DOM 里了 ⇒ 一条路由的崩溃带走了它`);
      assert.ok(document.contains(node), `${hook} 已从文档里摘掉`);
    }
    const editBar = mounted.container.querySelector("[data-workbench-edit-bar]");
    assert.equal(editBar.disabled, false, "编辑栏还在但点不动，等于也被带走了");
    let clicked = 0;
    editBar.addEventListener("click", () => {
      clicked += 1;
    });
    await act(async () => {
      editBar.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
      await Promise.resolve();
    });
    assert.equal(clicked, 1, "崩溃之后编辑栏收不到点击 ⇒ 有东西盖在它上面");

    // 遥测：route 作用域是可恢复的（用户还能切别的素材）。
    const caught = events.filter((event) => event.name === "boundary.catch");
    assert.equal(caught.length, 1);
    assert.equal(caught[0].source, "error-boundary");
    assert.equal(caught[0].severity, "error");
    assert.equal(caught[0].detail.recoverable, true);
    assert.equal(caught[0].detail.surface, "workbench-route");
    assert.equal(caught[0].detail.routeId, "threed");
    assert.equal(caught[0].detail.boundary, "workbench:route");
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});

test("换到另一条路由：新边界从未 error 过，正常渲染，失败态不残留", async () => {
  collectTelemetry();
  const mounted = await mount({
    routeId: "threed",
    routeKey: "model-3d-editor@1:model:poster-1",
    crash: false,
    scope: "route",
  });
  const muted = muteConsoleError();
  try {
    await mounted.rerender({
      routeId: "threed",
      routeKey: "model-3d-editor@1:model:poster-1",
      crash: true,
      scope: "route",
    });
    assert.ok(
      mounted.container.querySelector("[data-workbench-route-error]"),
      "前置条件：先得真的崩一次",
    );

    // 用户在左侧切到另一件素材：`key` 与 `routeId` 一起换 ⇒ React 挂一个新实例，
    // 新实例的 state.error 是 null，所以该正常渲染。
    await mounted.rerender({
      routeId: "image",
      routeKey: "image-editor@1:image:poster-2",
      crash: false,
      scope: "route",
    });

    assert.ok(
      mounted.container.querySelector("[data-real-editor]"),
      "切到别的路由之后还是失败态 ⇒ 边界的 key 没绑住路由标识，崩溃被带过去了",
    );
    assert.equal(mounted.container.querySelector("[data-workbench-route-error]"), null);
    assert.equal(overlayNodes().length, 0);
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});

test("外层 workbench 边界仍然整页接管：两级各管一件事，不是冗余", async () => {
  const events = collectTelemetry();
  // 不传 scope ⇒ 默认 "workbench"；不传 contained ⇒ 非 embedded，走 portal 那一支。
  const mounted = await mount({
    routeId: undefined,
    routeKey: "shell",
    crash: false,
  });
  const muted = muteConsoleError();
  try {
    const bodyChildrenBefore = document.body.children.length;
    await mounted.rerender({ routeId: undefined, routeKey: "shell", crash: true });

    // 外壳自己崩了：窗格里没有可信内容可显示，整页接管是**对的**。
    // 这条与第一条测试的 ①② 完全相反，所以「把内层改回单一边界」不可能同时满足两边。
    assert.equal(
      document.body.children.length,
      bodyChildrenBefore + 1,
      "外层边界没有 portal 到 body ⇒ 它的整页接管行为被改掉了",
    );
    const overlay = overlayNodes();
    assert.equal(overlay.length, 1, "外层失败态该正好是一张全视口遮罩");
    assert.match(overlay[0].className, /z-\[2147483000\]/);
    assert.match(overlay[0].className, /\bfixed\b/);
    assert.equal(overlay[0].getAttribute("role"), "dialog");
    assert.equal(overlay[0].getAttribute("aria-modal"), "true");
    // 外层不是路由级失败态，别把两者混起来。
    assert.equal(document.querySelector("[data-workbench-route-error]"), null);

    const caught = events.filter((event) => event.name === "boundary.catch");
    assert.equal(caught.length, 1);
    assert.equal(caught[0].detail.boundary, "workbench:workbench");
    // 外壳崩了用户没有下一步可走 —— 与 route 作用域的 true 相对。
    assert.equal(caught[0].detail.recoverable, false);
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});

test("同一次崩溃：事件里没有 error.message，窗格内给用户看的 pre 里有", async () => {
  const events = collectTelemetry();
  // 编辑器的错误消息经常直接嵌着素材文件名，这是最容易把用户内容带进管道的口子。
  const message = "无法解析 季度汇报-v3.xlsx";
  const mounted = await mount({
    routeId: "grid",
    routeKey: "grid-editor@1:sheet:poster-3",
    crash: false,
    scope: "route",
  });
  const muted = muteConsoleError();
  try {
    await mounted.rerender({
      routeId: "grid",
      routeKey: "grid-editor@1:sheet:poster-3",
      crash: true,
      scope: "route",
      message,
    });

    const placeholder = mounted.container.querySelector("[data-workbench-route-error]");
    assert.ok(placeholder);

    // 给用户看：他自己的文件名当然该出现在他自己的屏幕上。
    assert.match(placeholder.textContent, /季度汇报-v3\.xlsx/);

    // 送进管道：一个字都不许有。
    const caught = events.filter((event) => event.name === "boundary.catch");
    assert.equal(caught.length, 1);
    const serialized = JSON.stringify(caught[0]);
    assert.doesNotMatch(serialized, /季度汇报/, "文件名进了遥测事件");
    assert.doesNotMatch(serialized, /\.xlsx/, "扩展名进了遥测事件");
    assert.doesNotMatch(serialized, /无法解析/, "错误消息正文进了遥测事件");
    // 换成够用的东西：errorName + 不可逆指纹。
    assert.equal(caught[0].detail.errorName, "Error");
    assert.match(String(caught[0].detail.fingerprint), /^[0-9a-f]{8}$/);
  } finally {
    muted.restore();
    await mounted.unmount();
  }
});
