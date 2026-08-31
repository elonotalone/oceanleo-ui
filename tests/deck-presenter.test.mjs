// ============================================================================
// 演讲者模式的判据（W16）
// ----------------------------------------------------------------------------
// 这份文件锁五件事，每一件都对应「不锁住就会悄悄坏掉」的一条：
//
//   1. **动效与编辑器一致**（漂移锁）。9 条 keyframes 与两条 shorthand 在
//      `DeckStage.tsx` 与 `DeckPresenterView.tsx` 里各有一份，抽不出来共享
//      （DeckStage 不是 W16 的面）。所以这里去读 DeckStage 的源码逐条比对：
//      **谁单方面改了哪一边，这条当场红。** 这是「用户在编辑器里调的动效
//      放映时看不到，等于白调」那条判据的物理保证。
//   2. **动效要真的播放**。CSS 动画只在 `animation` 值变化时重启，连着两页
//      同一种切换时字符串一样，不换节点就一帧都不播——所以这里断言翻页后
//      带动效的那个节点**换了一个**。
//   3. **双窗真的双向同步**，且替身的回显被信封挡住（回显 = 死循环）。
//   4. **降级说得出为什么**。静默换界面是 P4 明令禁止的。
//   5. **排练计时按计时器走**，不按墙上时钟走（`now` 全程由本文件喂）。
//
// 建台照 `tests/workbench-toolbar-rendered.test.mjs:12-57`：jsdom 从 `fabric/node`
// 的传递依赖里拿，`IS_REACT_ACT_ENVIRONMENT` + `createMounted()`。
// 编译走 `tests/helpers/module-bench.mjs`，**不维护「要替换哪些模块」的清单**，
// 只显式列真需要替身的（这里一个都不需要：被测图里没有网络也没有 Supabase）。
// ============================================================================

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = {
  id: canvasEntry,
  filename: canvasEntry,
  loaded: true,
  exports: {},
};
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://slide.oceanleo.com/workspace/deck",
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
  KeyboardEvent: window.KeyboardEvent,
  PointerEvent: window.PointerEvent || window.MouseEvent,
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);

async function createMounted(Component, props) {
  const { createRoot } = await import("react-dom/client");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    container,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

async function click(target) {
  await act(async () => {
    target.dispatchEvent(
      new window.MouseEvent("click", { bubbles: true, cancelable: true }),
    );
    await Promise.resolve();
  });
}

async function press(key) {
  await act(async () => {
    document.dispatchEvent(
      new window.KeyboardEvent("keydown", {
        key,
        bubbles: true,
        cancelable: true,
      }),
    );
    await Promise.resolve();
  });
}

function buttonByText(container, text) {
  const hit = [...container.querySelectorAll("button")].find(
    (node) => node.textContent.trim() === text,
  );
  assert.ok(hit, `找不到按钮「${text}」`);
  return hit;
}

// ── 被测模块 ─────────────────────────────────────────────────────────────────

const presenterUrl = await compileModule(
  "src/shell/doc-editors/use-deck-presenter.ts",
);
const {
  applyPresenterCommand,
  createPresenterState,
  deckPresenterKeyCommand,
  deckRehearsalNoteLine,
  deckRehearsalReport,
  formatPresenterClock,
  presenterElapsedMs,
} = await import(presenterUrl);

const viewUrl = await compileModule(
  "src/shell/doc-editors/DeckPresenterView.tsx",
);
const {
  DECK_PRESENTER_FALLBACK_MESSAGE,
  DECK_PRESENTER_KEYFRAMES,
  DeckPresenterView,
  deckElementAnimationStyle,
  deckSlideTransitionStyle,
  openDeckPresenterWindow,
} = await import(viewUrl);

// ── 夹具 ─────────────────────────────────────────────────────────────────────

function makeSlide(overrides = {}) {
  return {
    id: "s1",
    title: "第一页",
    body: "",
    bullets: [],
    notes: "",
    layout: "title-body",
    background: "",
    elements: [],
    ...overrides,
  };
}

function makeDeck(slides) {
  return {
    version: 2,
    title: "测试演示",
    aspect: "16:9",
    theme: "ocean",
    masters: [],
    slides,
  };
}

const THREE_SLIDES = () =>
  makeDeck([
    makeSlide({
      id: "s1",
      title: "开场",
      notes: "先自我介绍，再抛出问题。",
      transition: { type: "fade", durationMs: 400 },
    }),
    makeSlide({
      id: "s2",
      title: "论据",
      notes: "这里放三组数据，别念屏幕。",
      // 与上一页**同一种**切换：动效要真的重播，靠的不能是「字符串变了」。
      transition: { type: "fade", durationMs: 400 },
    }),
    makeSlide({
      id: "s3",
      title: "收尾",
      notes: "",
      transition: { type: "zoom", durationMs: 700 },
    }),
  ]);

function sourceOf(deck, startIndex = 0) {
  return { deck, startIndex };
}

/**
 * `BroadcastChannel` 的替身。
 *
 * **刻意广播给所有人，包括发送方自己。** 真 `BroadcastChannel` 不回显，
 * 但替身用一张订阅表广播时回显是默认行为——而双向同步一旦回显就是死循环。
 * 防回环该由 `createTabLink()` 的信封 sender id 挡住，不该依赖替身有没有想到，
 * 所以这里故意把最坏的形状喂给它。
 */
function createTabBus() {
  const byName = new Map();
  let posts = 0;
  const factory = (name) => {
    if (!byName.has(name)) byName.set(name, new Set());
    const peers = byName.get(name);
    const entry = { listeners: new Set() };
    peers.add(entry);
    return {
      postMessage(data) {
        posts += 1;
        for (const peer of [...peers]) {
          for (const listener of [...peer.listeners]) listener({ data });
        }
      },
      close() {
        peers.delete(entry);
      },
      addEventListener(type, listener) {
        if (type === "message") entry.listeners.add(listener);
      },
      removeEventListener(type, listener) {
        entry.listeners.delete(listener);
      },
    };
  };
  return { factory, posts: () => posts };
}

/** 计时判据全部喂这只钟，一次 `sleep` 都不用。 */
function createClock() {
  let value = 0;
  return {
    now: () => value,
    advance(ms) {
      value += ms;
    },
  };
}

// ── 1 · 漂移锁：动效必须与编辑器逐字相同 ─────────────────────────────────────

/** `@keyframes oleo-deck-*{…}` 逐条抽出来，按大括号配对切，空白归一化。 */
function extractKeyframes(source) {
  const blocks = new Map();
  const marker = /@keyframes\s+(oleo-deck-[a-z0-9-]+)\s*\{/g;
  let match = marker.exec(source);
  while (match) {
    let depth = 1;
    let cursor = marker.lastIndex;
    while (cursor < source.length && depth > 0) {
      if (source[cursor] === "{") depth += 1;
      else if (source[cursor] === "}") depth -= 1;
      cursor += 1;
    }
    blocks.set(match[1], source.slice(marker.lastIndex, cursor - 1).replace(/\s+/g, ""));
    marker.lastIndex = cursor;
    match = marker.exec(source);
  }
  return blocks;
}

/** 动效 shorthand 的模板字面量 → 抹掉插值后的形状。 */
function animationShapes(source) {
  return [
    ...new Set(
      [...source.matchAll(/`(oleo-deck-(?:slide|element)-[^`]*)`/g)].map(
        ([, body]) => body.replace(/\$\{[^}]*\}/g, "{}"),
      ),
    ),
  ].sort();
}

const stageSource = await readFile(
  resolve(REPO, "src/shell/doc-editors/DeckStage.tsx"),
  "utf8",
);
const viewSource = await readFile(
  resolve(REPO, "src/shell/doc-editors/DeckPresenterView.tsx"),
  "utf8",
);

test("W16 漂移锁：9 条 keyframes 与 DeckStage 逐条相同", () => {
  const stage = extractKeyframes(stageSource);
  const mine = extractKeyframes(DECK_PRESENTER_KEYFRAMES);

  assert.equal(stage.size, 9, "DeckStage 的 keyframes 条数变了，放映那份要同步改");
  assert.deepEqual(
    [...mine.keys()].sort(),
    [...stage.keys()].sort(),
    "放映与编辑器的 keyframes 名字对不上",
  );
  for (const [name, body] of stage) {
    assert.equal(
      mine.get(name),
      body,
      `${name} 在 DeckStage 与 DeckPresenterView 里不一致——` +
        `两边必须同一次改，否则用户在编辑器里调的动效放映时是另一个样子`,
    );
  }
});

test("W16 漂移锁：两条动效 shorthand 与 DeckStage 形状相同（含 ease-out）", () => {
  assert.deepEqual(animationShapes(viewSource), animationShapes(stageSource));
  // 形状之外再钉一次确切文本：`ease-out` 是刻意与编辑器保持一致的裸曲线，
  // 换 motion token 时两边必须同一次改（见 signals/W16-request.md 给 W01 的那条）。
  assert.deepEqual(animationShapes(stageSource), [
    "oleo-deck-element-{} {}ms ease-out {}ms both",
    "oleo-deck-slide-{} {}ms ease-out both",
  ]);
});

test("W16 动效 shorthand 由用户数据拼出", () => {
  assert.equal(
    deckSlideTransitionStyle(
      makeSlide({ transition: { type: "push-left", durationMs: 250 } }),
    ),
    "oleo-deck-slide-push-left 250ms ease-out both",
  );
  assert.equal(deckSlideTransitionStyle(makeSlide()), undefined);
  assert.equal(
    deckElementAnimationStyle({
      animation: { type: "fly-up", durationMs: 600, delayMs: 120 },
    }),
    "oleo-deck-element-fly-up 600ms ease-out 120ms both",
  );
  assert.equal(deckElementAnimationStyle({}), undefined);
});

// ── 2 · 放映：动效真的播放 ───────────────────────────────────────────────────

test("W16 放映播切换动效，且同一种切换在翻页后重新播", async () => {
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "stage-only",
    channelName: "anim",
    linkFactory: null,
  });

  const first = mounted.container.querySelector("[data-deck-presenter-transition]");
  assert.ok(first, "放映视图里没有带切换动效的包裹层");
  assert.equal(first.getAttribute("data-deck-presenter-transition"), "fade");
  assert.equal(
    first.style.animation,
    "oleo-deck-slide-fade 400ms ease-out both",
    "放映没有把编辑器那条动效原样播出来",
  );

  await click(buttonByText(mounted.container, "下一页"));

  const second = mounted.container.querySelector("[data-deck-presenter-transition]");
  assert.equal(second.style.animation, "oleo-deck-slide-fade 400ms ease-out both");
  // 第 1、2 页是同一种切换，动效字符串一模一样。CSS 只在值变化时重启动画，
  // 所以「真的播了」唯一的物理保证是这个节点被换掉了。
  assert.notEqual(second, first, "翻页没有换节点，同一种切换动效一帧都不会播");

  await click(buttonByText(mounted.container, "下一页"));
  const third = mounted.container.querySelector("[data-deck-presenter-transition]");
  assert.equal(third.getAttribute("data-deck-presenter-transition"), "zoom");
  assert.equal(third.style.animation, "oleo-deck-slide-zoom 700ms ease-out both");

  await mounted.unmount();
});

test("W16 放映播元素入场动效", async () => {
  const deck = makeDeck([
    makeSlide({
      id: "e1",
      title: "带元素的一页",
      elements: [
        {
          id: "el-1",
          type: "text",
          x: 10,
          y: 12,
          width: 40,
          height: 20,
          rotation: 0,
          order: 1,
          text: "会飞进来的一行",
          animation: { type: "fly-up", durationMs: 600, delayMs: 120 },
        },
        {
          id: "el-2",
          type: "shape",
          shape: "circle",
          x: 60,
          y: 40,
          width: 20,
          height: 20,
          rotation: 0,
          order: 2,
          fill: "#1677ff",
        },
      ],
    }),
  ]);
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "stage-only",
    channelName: "anim-el",
    linkFactory: null,
  });

  const animated = mounted.container.querySelector(
    '[data-deck-presenter-element-animation="fly-up"]',
  );
  assert.ok(animated, "带入场动效的元素没有渲染出来");
  assert.equal(
    animated.style.animation,
    "oleo-deck-element-fly-up 600ms ease-out 120ms both",
  );

  const plain = mounted.container.querySelector(
    '[data-deck-presenter-element-animation="none"]',
  );
  assert.ok(plain, "没有动效的元素也该照常渲染");
  assert.equal(plain.style.animation, "");

  // 几何照 DeckStage：百分比定位、order 进 zIndex。
  const box = mounted.container.querySelector('[data-deck-presenter-element="el-1"]');
  assert.equal(box.style.left, "10%");
  assert.equal(box.style.top, "12%");
  assert.equal(box.style.width, "40%");
  assert.equal(box.style.zIndex, "1");

  await mounted.unmount();
});

// ── 3 · 键盘全套 ─────────────────────────────────────────────────────────────

test("W16 键位表：每一个键映射到确切指令", () => {
  const cmd = (key, mods = {}) => deckPresenterKeyCommand({ key, ...mods });
  assert.deepEqual(cmd("ArrowRight"), { kind: "next" });
  assert.deepEqual(cmd(" "), { kind: "next" });
  assert.deepEqual(cmd("Spacebar"), { kind: "next" });
  assert.deepEqual(cmd("PageDown"), { kind: "next" });
  assert.deepEqual(cmd("ArrowLeft"), { kind: "previous" });
  assert.deepEqual(cmd("PageUp"), { kind: "previous" });
  assert.deepEqual(cmd("Home"), { kind: "first" });
  assert.deepEqual(cmd("End"), { kind: "last" });
  assert.deepEqual(cmd("Escape"), { kind: "escape" });
  assert.deepEqual(cmd("b"), { kind: "blackout", mode: "black" });
  assert.deepEqual(cmd("B"), { kind: "blackout", mode: "black" });
  assert.deepEqual(cmd("w"), { kind: "blackout", mode: "white" });
  assert.deepEqual(cmd("W"), { kind: "blackout", mode: "white" });
  assert.deepEqual(cmd("Enter"), { kind: "commit-jump" });
  assert.deepEqual(cmd("Backspace"), { kind: "erase-jump" });
  assert.deepEqual(cmd("7"), { kind: "digit", value: "7" });
  assert.equal(cmd("q"), null);
  // 带修饰键的一律不接：Ctrl+W 是关标签页，抢过来放映就关不掉了。
  assert.equal(cmd("w", { ctrlKey: true }), null);
  assert.equal(cmd("ArrowRight", { metaKey: true }), null);
  assert.equal(cmd("b", { altKey: true }), null);
});

test("W16 Esc 分两支：先收跳页缓冲，再退出放映", () => {
  const ctx = { slideIds: ["a", "b", "c"], now: 0 };
  const typed = applyPresenterCommand(
    createPresenterState(0),
    { kind: "digit", value: "1" },
    ctx,
  );
  assert.equal(typed.jumpBuffer, "1");

  const cancelled = applyPresenterCommand(typed, { kind: "escape" }, ctx);
  assert.equal(cancelled.jumpBuffer, "");
  assert.equal(
    cancelled.exited,
    false,
    "输了一半的页码按 Esc 把整场放映关掉了",
  );

  const exited = applyPresenterCommand(cancelled, { kind: "escape" }, ctx);
  assert.equal(exited.exited, true);
});

test("W16 放映键盘全套：翻页 / 首尾 / 黑白屏 / 数字跳页 / 退出", async () => {
  const exits = [];
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "stage-only",
    channelName: "keys",
    linkFactory: null,
    onExit: () => exits.push("exit"),
  });
  const page = () =>
    mounted.container
      .querySelector("[data-deck-presenter-page]")
      .getAttribute("data-deck-presenter-page");
  const blackout = () =>
    mounted.container.querySelector("[data-deck-presenter-blackout]");

  assert.equal(page(), "1/3");
  await press("ArrowRight");
  assert.equal(page(), "2/3");
  await press(" ");
  assert.equal(page(), "3/3");
  await press("ArrowRight");
  assert.equal(page(), "3/3", "最后一页再往前应该停住");
  await press("ArrowLeft");
  assert.equal(page(), "2/3");
  await press("Home");
  assert.equal(page(), "1/3");
  await press("End");
  assert.equal(page(), "3/3");
  await press("PageUp");
  assert.equal(page(), "2/3");
  await press("PageDown");
  assert.equal(page(), "3/3");

  await press("b");
  assert.equal(blackout().getAttribute("data-deck-presenter-blackout"), "black");
  await press("b");
  assert.equal(blackout(), null, "再按一次 B 应该退出黑屏");
  await press("w");
  assert.equal(blackout().getAttribute("data-deck-presenter-blackout"), "white");
  // 「可打断」：新意图一到黑/白屏就让位，不必先按一次 W 退出来。
  await press("ArrowLeft");
  assert.equal(blackout(), null, "翻页没有把白屏收掉");
  assert.equal(page(), "2/3");

  await press("1");
  const hint = mounted.container.querySelector("[data-deck-presenter-jump]");
  assert.ok(hint, "输入数字后没有跳页提示");
  assert.equal(hint.getAttribute("role"), "status");
  assert.equal(hint.getAttribute("data-deck-presenter-jump"), "1");
  await press("Enter");
  assert.equal(page(), "1/3");
  assert.equal(
    mounted.container.querySelector("[data-deck-presenter-jump]"),
    null,
  );

  await press("3");
  await press("Backspace");
  assert.equal(
    mounted.container.querySelector("[data-deck-presenter-jump]"),
    null,
    "退格没有把跳页缓冲清掉",
  );

  await press("2");
  await press("Escape");
  assert.deepEqual(exits, [], "跳页输一半按 Esc 不该退出放映");
  await press("Escape");
  assert.deepEqual(exits, ["exit"]);

  await mounted.unmount();
});

// ── 4 · 双窗同步 ─────────────────────────────────────────────────────────────

test("W16 双窗同步：任一窗翻页另一窗跟随", async () => {
  const bus = createTabBus();
  const deck = THREE_SLIDES();
  const stage = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "stage-only",
    channelName: "duo",
    linkFactory: bus.factory,
  });
  const presenter = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "dual-window",
    channelName: "duo",
    linkFactory: bus.factory,
    autoStartTimer: false,
  });

  const pageOf = (mounted) =>
    mounted.container
      .querySelector("[data-deck-presenter-page]")
      .getAttribute("data-deck-presenter-page");

  assert.equal(pageOf(stage), "1/3");
  assert.equal(pageOf(presenter), "1/3");

  // 讲者那块屏往前翻 → 投影跟随。
  await click(buttonByText(presenter.container, "下一页"));
  assert.equal(pageOf(presenter), "2/3");
  assert.equal(pageOf(stage), "2/3", "演讲者窗翻页，投影没有跟上");

  // 投影那块屏往前翻 → 讲者跟随。
  await click(buttonByText(stage.container, "下一页"));
  assert.equal(pageOf(stage), "3/3");
  assert.equal(pageOf(presenter), "3/3", "投影翻页，演讲者窗没有跟上");

  // 回退也同步。
  await click(buttonByText(stage.container, "上一页"));
  assert.equal(pageOf(presenter), "2/3");

  await presenter.unmount();
  await stage.unmount();
});

test("W16 新开的窗喊一声 hello，对面补发当前状态", async () => {
  const bus = createTabBus();
  const deck = THREE_SLIDES();
  const stage = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "stage-only",
    channelName: "hello",
    linkFactory: bus.factory,
  });
  await click(buttonByText(stage.container, "下一页"));
  await click(buttonByText(stage.container, "下一页"));

  // 演讲者窗**晚**开：它自己从第 1 页起，靠 hello 把已经放到第 3 页这件事问出来。
  const presenter = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "dual-window",
    channelName: "hello",
    linkFactory: bus.factory,
    autoStartTimer: false,
  });
  assert.equal(
    presenter.container
      .querySelector("[data-deck-presenter-page]")
      .getAttribute("data-deck-presenter-page"),
    "3/3",
    "后开的演讲者窗没有补到当前页",
  );

  await presenter.unmount();
  await stage.unmount();
});

test("W16 替身的回显被信封挡住（回显 = 死循环）", async () => {
  const bus = createTabBus();
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "stage-only",
    channelName: "echo",
    linkFactory: bus.factory,
  });

  // 输入数字是一条会往外发的本地指令。替身广播给所有人（含自己），
  // 若自己那条被当成远端同步收下，`applyRemoteSync` 会把跳页缓冲清空——
  // 于是提示当场消失。提示还在，就说明信封的 sender id 把回显挡住了。
  await press("1");
  await press("2");
  assert.ok(bus.posts() > 0, "本地指令根本没有往通道上发");
  const hint = mounted.container.querySelector("[data-deck-presenter-jump]");
  assert.ok(hint, "自己发的消息被自己收下了，跳页缓冲被回显清掉");
  assert.equal(hint.getAttribute("data-deck-presenter-jump"), "12");

  await press("Enter");
  assert.equal(
    mounted.container
      .querySelector("[data-deck-presenter-page]")
      .getAttribute("data-deck-presenter-page"),
    "3/3",
    "两位数跳页应该落在第 12 页，只有 3 页时夹到末页",
  );

  await mounted.unmount();
});

test("W16 主窗关闭：演讲者窗给提示而不是白屏", async () => {
  const bus = createTabBus();
  const deck = THREE_SLIDES();
  const stage = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "stage-only",
    channelName: "bye",
    linkFactory: bus.factory,
  });
  const presenter = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "dual-window",
    channelName: "bye",
    linkFactory: bus.factory,
    autoStartTimer: false,
  });
  assert.equal(
    presenter.container.querySelector("[data-deck-presenter-fallback]"),
    null,
    "两窗都在时不该有降级告知",
  );

  await stage.unmount();

  const notice = presenter.container.querySelector("[data-deck-presenter-fallback]");
  assert.ok(notice, "主窗关闭后演讲者窗没有任何提示");
  assert.equal(notice.getAttribute("data-deck-presenter-fallback"), "peer-closed");
  assert.equal(notice.getAttribute("role"), "status");
  assert.match(notice.textContent, /另一个窗口已关闭/);
  // 白屏的反面：幻灯还在，放映没断。
  assert.ok(presenter.container.querySelector("[data-deck-presenter-slide]"));

  await presenter.unmount();
});

// ── 5 · 备注 ─────────────────────────────────────────────────────────────────

test("W16 备注取自 slide 数据，字号可调", async () => {
  const deck = THREE_SLIDES();
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "dual-window",
    channelName: "notes",
    linkFactory: null,
    autoStartTimer: false,
  });
  const notes = () => mounted.container.querySelector("[data-deck-presenter-notes]");

  assert.equal(notes().textContent, "先自我介绍，再抛出问题。");

  await click(buttonByText(mounted.container, "下一页"));
  assert.equal(notes().textContent, "这里放三组数据，别念屏幕。");

  await click(buttonByText(mounted.container, "下一页"));
  assert.equal(notes().textContent, "这一页没有备注。");

  // 字号可调（讲台离屏幕两米，这条不是装饰）。
  assert.equal(notes().getAttribute("data-notes-font-px"), "18");
  await click(
    [...mounted.container.querySelectorAll("button")].find(
      (node) => node.getAttribute("aria-label") === "放大备注字号",
    ),
  );
  assert.equal(notes().getAttribute("data-notes-font-px"), "20");
  assert.equal(notes().style.fontSize, "20px");

  await mounted.unmount();
});

test("W16 演讲者视图有下一页预览，最后一页说清没有了", async () => {
  const deck = THREE_SLIDES();
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "dual-window",
    channelName: "next",
    linkFactory: null,
    autoStartTimer: false,
  });
  const next = () => mounted.container.querySelector("[data-deck-presenter-next]");

  assert.equal(next().getAttribute("data-deck-presenter-next"), "s2");
  assert.match(next().textContent, /论据/);

  await click(buttonByText(mounted.container, "下一页"));
  assert.equal(next().getAttribute("data-deck-presenter-next"), "s3");

  await click(buttonByText(mounted.container, "下一页"));
  assert.equal(next().getAttribute("data-deck-presenter-next"), "");
  assert.match(next().textContent, /已经是最后一页/);

  await mounted.unmount();
});

// ── 6 · 计时与排练 ───────────────────────────────────────────────────────────

test("W16 停留时长跟着计时器走，暂停期间不计入任何一页", () => {
  const ctx = (now) => ({ slideIds: ["a", "b"], now });
  let state = createPresenterState(0, { running: true, now: 0 });
  assert.equal(presenterElapsedMs(state.timer, 5_000), 5_000);

  state = applyPresenterCommand(state, { kind: "timer-toggle" }, ctx(5_000));
  assert.equal(state.timer.running, false);
  // 暂停中墙上时钟继续走，读数不动。
  assert.equal(presenterElapsedMs(state.timer, 60_000), 5_000);

  state = applyPresenterCommand(state, { kind: "timer-toggle" }, ctx(60_000));
  assert.equal(presenterElapsedMs(state.timer, 62_000), 7_000);

  state = applyPresenterCommand(state, { kind: "next" }, ctx(62_000));
  assert.equal(
    state.dwell.a.totalMs,
    7_000,
    "第一页记的应该是计时器走过的 7 秒，不是墙上的 62 秒",
  );
});

test("W16 排练报表给出每页用时，当前页按在途时长算", () => {
  const slides = [
    { id: "a", title: "开场" },
    { id: "b", title: "" },
  ];
  const ctx = (now) => ({ slideIds: ["a", "b"], now });
  let state = createPresenterState(0, { running: true, now: 0 });
  state = applyPresenterCommand(state, { kind: "next" }, ctx(9_000));

  const rows = deckRehearsalReport(state, slides, 12_000);
  assert.equal(rows[0].totalMs, 9_000);
  assert.equal(rows[0].visits, 1);
  assert.equal(
    rows[1].totalMs,
    3_000,
    "还站着的那一页不算 0 秒——「讲完最后一页看一眼」正是这张表最常见的用法",
  );
  assert.equal(rows[0].sharePercent, 75);
  assert.equal(rows[1].title, "第 2 页", "没标题的页要给一个能认出来的名字");
  assert.equal(formatPresenterClock(9_000), "00:09");
  assert.equal(formatPresenterClock(4_043_000), "1:07:23");
  assert.match(deckRehearsalNoteLine(rows[0]), /本页用时 00:09/);
});

test("W16 排练表在界面上出得来，并能交给集成方写回备注", async () => {
  const clock = createClock();
  const deck = THREE_SLIDES();
  const before = JSON.stringify(deck);
  const applied = [];
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "dual-window",
    channelName: "rehearse",
    linkFactory: null,
    now: clock.now,
    autoStartTimer: true,
    onApplyRehearsalNotes: (rows) => applied.push(rows),
  });

  clock.advance(5_000);
  await click(buttonByText(mounted.container, "下一页"));
  clock.advance(7_000);
  await click(buttonByText(mounted.container, "下一页"));
  await click(buttonByText(mounted.container, "查看每页用时"));

  const table = mounted.container.querySelector("[data-deck-presenter-rehearsal]");
  assert.ok(table, "排练表没有渲染");
  const ms = [...table.querySelectorAll("[data-rehearsal-row]")].map((row) => [
    row.getAttribute("data-rehearsal-row"),
    Number(row.getAttribute("data-rehearsal-ms")),
  ]);
  assert.deepEqual(ms, [
    ["s1", 5_000],
    ["s2", 7_000],
    ["s3", 0],
  ]);

  await click(buttonByText(mounted.container, "写回备注"));
  assert.equal(applied.length, 1);
  assert.deepEqual(
    applied[0].map((row) => row.totalMs),
    [5_000, 7_000, 0],
  );
  assert.equal(
    JSON.stringify(deck),
    before,
    "放映视图自己动了 deck——写回必须由集成方做，它拿不到写操作",
  );

  await mounted.unmount();
});

test("W16 计时器可以开始 / 暂停 / 重置", async () => {
  const clock = createClock();
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "dual-window",
    channelName: "timer",
    linkFactory: null,
    now: clock.now,
    autoStartTimer: true,
  });
  const elapsed = () =>
    Number(
      mounted.container
        .querySelector("[data-deck-presenter-elapsed]")
        .getAttribute("data-deck-presenter-elapsed"),
    );

  clock.advance(8_000);
  await click(buttonByText(mounted.container, "暂停计时"));
  assert.equal(elapsed(), 8_000);
  clock.advance(30_000);
  await click(buttonByText(mounted.container, "开始计时"));
  assert.equal(elapsed(), 8_000, "暂停期间的 30 秒不该算进去");
  clock.advance(2_000);
  await click(buttonByText(mounted.container, "重置计时"));
  assert.equal(elapsed(), 0);

  await mounted.unmount();
});

// ── 7 · 降级路径 ─────────────────────────────────────────────────────────────

test("W16 弹窗被拦截时 openDeckPresenterWindow 报 blocked", async () => {
  const outcome = await openDeckPresenterWindow({
    source: sourceOf(THREE_SLIDES()),
    channelName: "blocked",
    // `window.open` 返回 null 就是被拦截——没有 `noopener`，null 不会有第二种来源。
    opener: () => null,
    sourceDocument: document,
  });
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, "blocked");
});

test("W16 降级到单窗分屏：可达、说得出为什么、备注与下一页都在", async () => {
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "split-fallback",
    channelName: "fallback",
    fallbackReason: "blocked",
    linkFactory: null,
  });

  const notice = mounted.container.querySelector("[data-deck-presenter-fallback]");
  assert.ok(notice, "静默降级：换了一种界面却什么都没说");
  assert.equal(notice.getAttribute("role"), "status");
  assert.equal(notice.getAttribute("data-deck-presenter-fallback"), "blocked");
  assert.equal(notice.textContent, DECK_PRESENTER_FALLBACK_MESSAGE.blocked);
  assert.match(notice.textContent, /拦截/, "没说清是被拦了还是不支持");

  // P4：主区放当前页，侧边放备注与下一页。
  assert.ok(mounted.container.querySelector("[data-deck-presenter-slide]"));
  assert.equal(
    mounted.container.querySelector("[data-deck-presenter-notes]").textContent,
    "先自我介绍，再抛出问题。",
  );
  assert.equal(
    mounted.container
      .querySelector("[data-deck-presenter-next]")
      .getAttribute("data-deck-presenter-next"),
    "s2",
  );
  // 降级不是「另一种功能」：键盘照旧全套。
  await press("ArrowRight");
  assert.equal(
    mounted.container
      .querySelector("[data-deck-presenter-page]")
      .getAttribute("data-deck-presenter-page"),
    "2/3",
  );

  await mounted.unmount();
});

test("W16 四种降级来源各说各的，不共用一句「已降级」", () => {
  const reasons = Object.keys(DECK_PRESENTER_FALLBACK_MESSAGE).sort();
  assert.deepEqual(reasons, ["blocked", "no-channel", "peer-closed", "unsupported"]);
  const texts = Object.values(DECK_PRESENTER_FALLBACK_MESSAGE);
  assert.equal(
    new Set(texts).size,
    texts.length,
    "两种降级来源共用了同一句话，讲者据此判断不了下一步",
  );
  for (const text of texts) assert.ok(text.length > 10);
});

test("W16 没有 BroadcastChannel 时演讲者视图当场说明", async () => {
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "dual-window",
    channelName: "nochannel",
    // 明确不要通道 = 这个浏览器没有 BroadcastChannel。
    linkFactory: null,
    autoStartTimer: false,
  });
  const notice = mounted.container.querySelector("[data-deck-presenter-fallback]");
  assert.ok(notice, "通道没通却一声不吭");
  assert.equal(notice.getAttribute("data-deck-presenter-fallback"), "no-channel");
  assert.match(notice.textContent, /不支持窗口间同步/);
  await mounted.unmount();
});

test("W16 单窗放映没有第二块屏，不该报成降级", async () => {
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "stage-only",
    channelName: "solo",
    linkFactory: null,
  });
  assert.equal(
    mounted.container.querySelector("[data-deck-presenter-fallback]"),
    null,
    "单窗放映本来就没有第二块屏，报降级会让讲者以为出了事",
  );
  await mounted.unmount();
});

// ── 8 · 全屏 ─────────────────────────────────────────────────────────────────

test("W16 全屏：不支持时说人话，不把英文技术原文摆给讲者", async () => {
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "stage-only",
    channelName: "fs-missing",
    linkFactory: null,
  });
  assert.equal(
    typeof mounted.container.querySelector("[data-deck-presenter-surface]")
      .requestFullscreen,
    "undefined",
    "jsdom 居然实现了全屏 API，这条判据要改写法",
  );

  await click(buttonByText(mounted.container, "全屏"));
  const notice = mounted.container.querySelector("[data-deck-presenter-notice]");
  assert.ok(notice, "全屏用不了却一声不吭");
  assert.match(notice.textContent, /不支持全屏/);

  await mounted.unmount();
});

test("W16 全屏被拒：走 humanErrorMessage，英文原文不进界面", async () => {
  const proto = window.HTMLElement.prototype;
  const had = Object.getOwnPropertyDescriptor(proto, "requestFullscreen");
  proto.requestFullscreen = () =>
    Promise.reject(new Error("Permissions check failed"));
  try {
    const mounted = await createMounted(DeckPresenterView, {
      source: sourceOf(THREE_SLIDES()),
      surface: "stage-only",
      channelName: "fs-denied",
      linkFactory: null,
    });
    await click(buttonByText(mounted.container, "全屏"));
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    const notice = mounted.container.querySelector("[data-deck-presenter-notice]");
    assert.ok(notice, "全屏被拒却一声不吭");
    assert.doesNotMatch(
      notice.textContent,
      /Permissions check failed/,
      "浏览器的英文技术原文被原样摆给了讲者",
    );
    assert.match(notice.textContent, /F11/, "被拒之后没有给出下一步");
    await mounted.unmount();
  } finally {
    if (had) Object.defineProperty(proto, "requestFullscreen", had);
    else delete proto.requestFullscreen;
  }
});

// ── 9 · 笔迹 ─────────────────────────────────────────────────────────────────

test("W16 笔迹只在本地、翻页即清、永不写回 deck", async () => {
  const bus = createTabBus();
  const deck = THREE_SLIDES();
  const before = JSON.stringify(deck);
  const stage = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "stage-only",
    channelName: "ink",
    linkFactory: bus.factory,
  });
  const presenter = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "dual-window",
    channelName: "ink",
    linkFactory: bus.factory,
    autoStartTimer: false,
  });

  // 讲者在自己那块屏上画一笔 → 投影那块屏要看得见，否则画了等于没画。
  await click(buttonByText(presenter.container, "画笔"));
  const layer = presenter.container.querySelector('[data-deck-presenter-ink="pen"]');
  assert.ok(layer, "打开画笔后没有落笔层");
  layer.getBoundingClientRect = () => ({
    left: 0,
    top: 0,
    width: 200,
    height: 100,
  });
  // 三个事件**挤在同一批更新里**是刻意的：真实设备上快速画一下就是这个形状。
  // 抬笔的处理函数若从闭包里读在途笔画，那时读到的还是空串，整笔会被静静丢掉。
  await act(async () => {
    for (const [type, x, y] of [
      ["pointerdown", 20, 10],
      ["pointermove", 100, 50],
      ["pointerup", 100, 50],
    ]) {
      layer.dispatchEvent(
        new window.MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          clientX: x,
          clientY: y,
        }),
      );
    }
    await Promise.resolve();
  });

  assert.equal(
    stage.container.querySelectorAll("[data-deck-presenter-ink] path").length,
    1,
    "讲者画的一笔没有同步到投影那块屏",
  );

  // 翻页即清，两块屏都清。
  await click(buttonByText(presenter.container, "下一页"));
  assert.equal(
    presenter.container.querySelectorAll("[data-deck-presenter-ink] path").length,
    0,
    "翻页后讲者屏上还留着上一页的笔迹",
  );
  assert.equal(
    stage.container.querySelectorAll("[data-deck-presenter-ink] path").length,
    0,
    "翻页后投影屏上还留着上一页的笔迹",
  );
  assert.equal(JSON.stringify(deck), before, "笔迹被写回了 deck");

  await presenter.unmount();
  await stage.unmount();
});

// ── 10 · 只读 ────────────────────────────────────────────────────────────────

test("W16 放映视图是只读的：没有可编辑控件", async () => {
  const deck = makeDeck([
    makeSlide({
      id: "ro",
      title: "只读",
      body: "正文",
      bullets: ["一", "二"],
      notes: "备注",
    }),
  ]);
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(deck),
    surface: "stage-only",
    channelName: "readonly",
    linkFactory: null,
  });
  const slide = mounted.container.querySelector("[data-deck-presenter-slide]");
  assert.equal(slide.querySelector("textarea"), null, "放映里出现了 textarea");
  assert.equal(slide.querySelector("input"), null);
  assert.equal(
    slide.querySelector("[contenteditable]"),
    null,
    "放映里出现了可编辑区域",
  );
  assert.equal(
    slide.querySelector("[data-deck-edit-text]"),
    null,
    "放映里混进了编辑态的 chrome",
  );
  assert.match(slide.textContent, /只读/);
  assert.match(slide.textContent, /正文/);
  await mounted.unmount();
});

test("W16 translate 缺省退回中文源串，不在子窗里硬调 useUI()", async () => {
  const seen = [];
  const mounted = await createMounted(DeckPresenterView, {
    source: sourceOf(THREE_SLIDES()),
    surface: "dual-window",
    channelName: "i18n",
    linkFactory: null,
    autoStartTimer: false,
    translate: (zh, vars) => {
      seen.push(zh);
      return vars ? `${zh}::${Object.keys(vars).join(",")}` : `[${zh}]`;
    },
  });
  assert.ok(seen.includes("演讲者备注"), "备注面板没走 translate");
  assert.ok(
    [...mounted.container.querySelectorAll("button")].some(
      (node) => node.textContent === "[下一页]",
    ),
    "传进来的 translate 没有真的被用上",
  );
  await mounted.unmount();
});
