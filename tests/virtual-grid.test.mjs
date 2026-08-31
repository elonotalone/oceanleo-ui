// ============================================================================
// W06 · 虚拟化原语本身的判据
// ----------------------------------------------------------------------------
// 分两层，故意的：
//
// 1. **纯函数层**（本文件大半）。窗口算到哪几行、滚动锚定要补多少像素、方向键落在
//    哪个下标——全都是不碰 DOM 的纯计算，所以能在没有布局引擎的 jsdom 里被逐位断言。
//    原语当初就是照这条铁律设计的（`use-virtual-list.ts` 开头那段），这里是收现。
// 2. **真渲染层**（末尾三例）。任务书要的是「1,000 项与固定视口下**挂载的 DOM 节点数**
//    远小于 1,000」，那是个 DOM 事实，纯函数证不了。jsdom 量不到任何东西，所以下面
//    给它装一套假布局：谁是滚动容器、视口多高、每张卡多高，由测试说。
//
// 反面验证（`verdicts/W06-delivery.md` 记了读数）：把 `rowWindow` 改成恒返回全量窗口、
// 把 `applyRowMeasurements` 改成恒返回 0、把 `nextGridIndex` 夹进已挂载区，三处各自
// 让下面点名的用例当场红。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";

import {
  RowMetrics,
  applyRowMeasurements,
  autoFillColumnCount,
  columnCountFromTemplate,
  nextGridIndex,
  rowWindow,
  scrollOffsetForRow,
  spacerHeights,
  useVirtualGrid,
} from "../src/lib/virtual/index.ts";

// ---------------------------------------------------------------------------
// jsdom（样板照 `tests/artifact-surface-rendered.test.mjs` 开头那段）
// ---------------------------------------------------------------------------

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
const { JSDOM } = await import(
  pathToFileURL(fabricRequire.resolve("jsdom")).href
);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", {
  pretendToBeVisual: true,
  url: "https://image.oceanleo.com/workspace",
});
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window,
  document,
  navigator: window.navigator,
  HTMLElement: window.HTMLElement,
  Element: window.Element,
  Node: window.Node,
  Event: window.Event,
  CustomEvent: window.CustomEvent,
  MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent,
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

const { createRoot } = await import("react-dom/client");

// ---------------------------------------------------------------------------
// 假布局
// ---------------------------------------------------------------------------

/**
 * 给 jsdom 装一套可编程的布局。
 *
 * 不装的话 `clientHeight` / `offsetHeight` / `getBoundingClientRect()` 全是 0，
 * `scrollTop` 更是硬编码 0 且写不进去（jsdom 的 setter 是空实现），于是原语一律走
 * 「量不到 ⇒ 全量渲染」那条降级分支。那条分支本身要测（见 `rowWindow` 那一组），
 * 但**只测它等于什么都没测**：回收、滚动锚定、键盘走进未挂载区，三件事都只在量得到
 * 的时候才发生。
 *
 * 全部靠属性驱动，不靠「渲染完再回来登记元素」——原语在挂载那一刻的 layout effect
 * 里就要量，那时测试还拿不到节点。
 *   · `data-role="scroller"` → 视口高度 `VIEWPORT_HEIGHT`，`scrollTop` 可读可写
 *   · `data-role="grid"`     → 宽度 `GRID_WIDTH`，顶端贴着滚动内容原点
 *   · `data-fake-height`     → 这个元素的 `offsetHeight`
 */
const VIEWPORT_HEIGHT = 600;
const GRID_WIDTH = 900;

const scrollTops = new WeakMap();

Object.defineProperty(window.HTMLElement.prototype, "scrollTop", {
  configurable: true,
  get() {
    return scrollTops.get(this) || 0;
  },
  set(value) {
    scrollTops.set(this, Math.max(0, Number(value) || 0));
  },
});

Object.defineProperty(window.HTMLElement.prototype, "clientHeight", {
  configurable: true,
  get() {
    return this.getAttribute("data-role") === "scroller" ? VIEWPORT_HEIGHT : 0;
  },
});

Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return this.getAttribute("data-role") === "grid" ? GRID_WIDTH : 0;
  },
});

Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    return Number(this.getAttribute("data-fake-height")) || 0;
  },
});

window.HTMLElement.prototype.getBoundingClientRect = function fakeRect() {
  const role = this.getAttribute("data-role");
  if (role === "scroller") {
    return boxOf(0, VIEWPORT_HEIGHT);
  }
  // 网格顶端就是滚动内容的原点，所以它的视口位置等于 `−scrollTop`。
  const scroller = this.closest('[data-role="scroller"]');
  return boxOf(scroller ? -scroller.scrollTop : 0, 0);
};

function boxOf(top, height) {
  return {
    top,
    bottom: top + height,
    left: 0,
    right: 0,
    width: 0,
    height,
    x: 0,
    y: top,
    toJSON: () => ({}),
  };
}

// ---------------------------------------------------------------------------
// 纯函数：列数
// ---------------------------------------------------------------------------

/** 货架那行 CSS 换成像素：`min(12rem, …)` = 192px，`gap-2.5` = 10px。 */
const SHELF_RULE = { minTrackPx: 192, gapPx: 10, narrowDivisor: 2 };

test("autoFillColumnCount 复刻 CSS 的列数（外观不变的判据之一）", () => {
  // 手算：`M = min(192, (W - 10) / 2)`，`n = floor((W + 10) / (M + 10))`。
  // 这四个宽度覆盖了两条分支：宽容器上 `minmax` 下界生效（1000 / 400），
  // 窄容器上 `(100% - gap) / 2` 那一半封顶生效（300 / 200），后者保证**永远至少两列**。
  assert.equal(autoFillColumnCount(1000, SHELF_RULE), 5);
  assert.equal(autoFillColumnCount(400, SHELF_RULE), 2);
  assert.equal(autoFillColumnCount(300, SHELF_RULE), 2);
  assert.equal(autoFillColumnCount(200, SHELF_RULE), 2);
});

test("量不到宽度、或不是 auto-fill 网格时回落到 fallbackColumnCount", () => {
  // `ArtifactLibrary` 的 `grid-cols-2 sm:grid-cols-3` 就是这一支：列数由视口断点
  // 决定，光看容器宽度算不出来，所以它不给 `minTrackPx`。
  assert.equal(autoFillColumnCount(900, { gapPx: 16, fallbackColumnCount: 2 }), 2);
  assert.equal(autoFillColumnCount(0, SHELF_RULE), 1);
  assert.equal(autoFillColumnCount(900, { gapPx: 16 }), 1);
});

test("columnCountFromTemplate 只认已解析的轨道列表", () => {
  // `auto-fill` 保留空轨道，所以只挂几张卡时也问得出真列数——列数以它为准。
  assert.equal(columnCountFromTemplate("192px 192px 192px"), 3);
  assert.equal(columnCountFromTemplate("  180.5px 180.5px  "), 2);
  // 没解析的 `repeat(...)`（jsdom 的 getComputedStyle 就返回原文）不算数，回落到公式。
  assert.equal(
    columnCountFromTemplate("repeat(auto-fill, minmax(192px, 1fr))"),
    0,
  );
  assert.equal(columnCountFromTemplate("none"), 0);
  assert.equal(columnCountFromTemplate(""), 0);
});

test("spacerHeights 各减一个 gap，否则滚动条比真实内容长 2*gap", () => {
  assert.deepEqual(spacerHeights(0, 0, 10), { top: 0, bottom: 0 });
  assert.deepEqual(spacerHeights(100, 200, 10), { top: 90, bottom: 190 });
  // 占位块比一个 gap 还矮：不能给负高度。
  assert.deepEqual(spacerHeights(5, 3, 10), { top: 0, bottom: 0 });
  // 只有一侧要占位时另一侧不受影响。
  assert.deepEqual(spacerHeights(0, 200, 10), { top: 0, bottom: 190 });
});

// ---------------------------------------------------------------------------
// 纯函数：窗口与回收
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 190;

function shelfMetrics(rowCount) {
  return new RowMetrics(rowCount, ROW_HEIGHT);
}

test("1,000 项、固定视口：窗口远小于全量（回收的判据）", () => {
  const metrics = shelfMetrics(250); // 1,000 项 / 4 列
  const win = rowWindow({
    metrics,
    scrollTop: 0,
    viewportHeight: VIEWPORT_HEIGHT,
    listOffsetTop: 0,
    overscanPx: VIEWPORT_HEIGHT,
  });
  assert.equal(win.windowed, true);
  // 600px 视口 + 上下各一屏 overscan，行高 190 ⇒ 顶多十来行。写死上界：
  // 关掉回收（`rowWindow` 恒返回全量窗口）时这里会是 250，当场红。
  assert.ok(
    win.endRow - win.startRow <= 12,
    `挂载行数 ${win.endRow - win.startRow} 超过上界 12`,
  );
  assert.equal(win.paddingTop, 0);
  assert.equal(win.totalSize, 250 * ROW_HEIGHT);
  // 没挂的那些行的高度必须由下方占位块顶着，否则滚动条会缩短。
  assert.equal(
    win.paddingTop + (win.endRow - win.startRow) * ROW_HEIGHT + win.paddingBottom,
    win.totalSize,
  );
});

test("滚到任何深度，窗口都不增长；走过的行数远多于任一刻挂着的", () => {
  const metrics = shelfMetrics(250);
  const request = (scrollTop) => ({
    metrics,
    scrollTop,
    viewportHeight: VIEWPORT_HEIGHT,
    listOffsetTop: 0,
    overscanPx: VIEWPORT_HEIGHT,
  });
  let widest = 0;
  const visited = new Set();
  for (let scrollTop = 0; scrollTop <= 240 * ROW_HEIGHT; scrollTop += ROW_HEIGHT) {
    const win = rowWindow(request(scrollTop));
    widest = Math.max(widest, win.endRow - win.startRow);
    for (let row = win.startRow; row < win.endRow; row += 1) visited.add(row);
  }
  // 这两条合起来才是「有回收」：走遍了几乎整份列表，却从没有一刻挂着超过十来行。
  assert.ok(widest <= 12, `最宽的一刻挂了 ${widest} 行`);
  assert.ok(visited.size >= 240, `只走过 ${visited.size} 行，判据是空的`);
});

test("量不到视口就全量渲染——既有断言靠这条降级一条都不动", () => {
  const metrics = shelfMetrics(250);
  const win = rowWindow({
    metrics,
    scrollTop: 0,
    viewportHeight: 0, // jsdom、服务端渲染、首帧水合
    listOffsetTop: 0,
    overscanPx: 0,
  });
  assert.equal(win.windowed, false);
  assert.equal(win.startRow, 0);
  assert.equal(win.endRow, 250);
  assert.equal(win.paddingTop, 0);
  assert.equal(win.paddingBottom, 0);
});

test("滚动区上方还坐着 chips 与小标题时，listOffsetTop 要被扣掉", () => {
  // `WorkspaceLibrary` 的滚动容器里，网格上面还有 `LibraryChips` 和分节小标题
  // （`W06-journal.md` J2）。滚了 chips 那么多不该让第一行就被回收。
  const metrics = shelfMetrics(250);
  const chipsHeight = 120;
  const win = rowWindow({
    metrics,
    scrollTop: chipsHeight,
    viewportHeight: VIEWPORT_HEIGHT,
    listOffsetTop: chipsHeight,
    overscanPx: 0,
  });
  assert.equal(win.startRow, 0, "网格顶端刚滚到视口顶，第一行必须还在");
});

// ---------------------------------------------------------------------------
// 纯函数：滚动锚定
// ---------------------------------------------------------------------------

test("上方行高被修正时，返回的差额正好是那些行高的改变量之和", () => {
  const metrics = shelfMetrics(250);
  const anchorRow = 20;
  const before = metrics.offsetOf(anchorRow);
  assert.equal(before, 20 * ROW_HEIGHT);

  // 三行回填：+70、−40、±0。差额必须是 +30，一像素不多不少。
  const delta = applyRowMeasurements(
    metrics,
    [
      [0, ROW_HEIGHT + 70],
      [1, ROW_HEIGHT - 40],
      [2, ROW_HEIGHT],
    ],
    anchorRow,
  );
  assert.equal(delta, 30);
  // 差额原样加回 `scrollTop` 之后，锚点行在屏幕上一动不动。
  assert.equal(metrics.offsetOf(anchorRow), before + delta);
});

test("视口下方的行高被修正时差额为 0——不该为了别处的回填去动滚动位置", () => {
  const metrics = shelfMetrics(250);
  const anchorRow = 20;
  const before = metrics.offsetOf(anchorRow);
  const delta = applyRowMeasurements(metrics, [[200, ROW_HEIGHT + 500]], anchorRow);
  assert.equal(delta, 0);
  assert.equal(metrics.offsetOf(anchorRow), before);
  // 但它确实进了账本：总高要跟着长，滚动条才对得上。
  assert.equal(metrics.totalSize(), 250 * ROW_HEIGHT + 500);
});

test("什么都没变时不返回差额（不许每帧白补一次滚动位置）", () => {
  const metrics = shelfMetrics(250);
  applyRowMeasurements(metrics, [[0, 240]], 10);
  assert.equal(applyRowMeasurements(metrics, [[0, 240]], 10), 0);
});

test("RowMetrics：条目数变了只作废尾巴，已量到的前面那些行不重来", () => {
  const metrics = shelfMetrics(250);
  metrics.measure(3, 400);
  assert.equal(metrics.isMeasured(3), true);
  metrics.setCount(400); // load-more 追加了一页
  assert.equal(metrics.isMeasured(3), true, "追加不该作废已量到的行");
  assert.equal(metrics.sizeOf(3), 400);
  assert.equal(metrics.totalSize(), 399 * ROW_HEIGHT + 400);
});

test("RowMetrics.rowAtOffset 在混着真高与估高的账本上仍然对", () => {
  const metrics = shelfMetrics(10);
  metrics.measure(0, 100); // 0..100
  metrics.measure(1, 300); // 100..400
  assert.equal(metrics.rowAtOffset(0), 0);
  assert.equal(metrics.rowAtOffset(99), 0);
  assert.equal(metrics.rowAtOffset(100), 1);
  assert.equal(metrics.rowAtOffset(399), 1);
  assert.equal(metrics.rowAtOffset(400), 2); // 这里起按估高记账
  assert.equal(metrics.rowAtOffset(400 + ROW_HEIGHT), 3);
});

// ---------------------------------------------------------------------------
// 纯函数：键盘走进未挂载区
// ---------------------------------------------------------------------------

test("方向键能走到未挂载区，pinnedRow 把它纳入窗口，scrollOffsetForRow 把它滚进视口", () => {
  const columnCount = 4;
  const itemCount = 1000;
  const metrics = shelfMetrics(Math.ceil(itemCount / columnCount));
  const request = (scrollTop, pinnedRow = null) => ({
    metrics,
    scrollTop,
    viewportHeight: VIEWPORT_HEIGHT,
    listOffsetTop: 0,
    overscanPx: VIEWPORT_HEIGHT,
    pinnedRow,
  });

  const win = rowWindow(request(0));
  // 最后一个已挂载的条目，再按一次 ↓ 就出界了。
  const lastMounted = win.endRow * columnCount - 1;
  const target = nextGridIndex("ArrowDown", lastMounted, itemCount, columnCount);
  assert.equal(target, lastMounted + columnCount);

  const targetRow = Math.floor(target / columnCount);
  assert.ok(
    targetRow >= win.endRow,
    "目标没有落在未挂载区，这条判据是空的（把 nextGridIndex 夹进已挂载区就会走到这里）",
  );

  // ① 钉住之后它在窗口里——焦点因此不会掉进未挂载区。
  const pinned = rowWindow(request(0, targetRow));
  assert.ok(targetRow >= pinned.startRow && targetRow < pinned.endRow);

  // ② 滚过去之后它真的在视口里。
  const nextScrollTop = scrollOffsetForRow(metrics, targetRow, {
    scrollTop: 0,
    viewportHeight: VIEWPORT_HEIGHT,
    listOffsetTop: 0,
  });
  assert.ok(nextScrollTop > 0, "目标在视口外，必须动");
  const rowTop = metrics.offsetOf(targetRow);
  assert.ok(rowTop >= nextScrollTop);
  assert.ok(rowTop + metrics.sizeOf(targetRow) <= nextScrollTop + VIEWPORT_HEIGHT);
});

test("nextGridIndex：目标不存在就返回 null，不拦事件", () => {
  // 最后一行不满时按 ↓ 不动。横着窜比不动更让人迷路。
  assert.equal(nextGridIndex("ArrowDown", 9, 12, 4), null);
  assert.equal(nextGridIndex("ArrowUp", 2, 12, 4), null);
  assert.equal(nextGridIndex("ArrowLeft", 0, 12, 4), null);
  assert.equal(nextGridIndex("ArrowRight", 11, 12, 4), null);
  assert.equal(nextGridIndex("Home", 0, 12, 4), null, "已经在首位就不该动");
  assert.equal(nextGridIndex("End", 11, 12, 4), null);
  assert.equal(nextGridIndex("PageDown", 4, 12, 4), null, "不归我们管的键不许拦");
  // 真会走的那些。
  assert.equal(nextGridIndex("ArrowDown", 5, 12, 4), 9);
  assert.equal(nextGridIndex("ArrowUp", 5, 12, 4), 1);
  assert.equal(nextGridIndex("Home", 7, 12, 4), 0);
  assert.equal(nextGridIndex("End", 0, 12, 4), 11);
});

test("scrollOffsetForRow 的 auto 不动已经看得见的行", () => {
  const metrics = shelfMetrics(250);
  const options = {
    scrollTop: 10 * ROW_HEIGHT,
    viewportHeight: VIEWPORT_HEIGHT,
    listOffsetTop: 0,
  };
  // 第 11 行在视口里（10..13 行可见），不该因为一次键盘移动就重新居中。
  assert.equal(scrollOffsetForRow(metrics, 11, options), options.scrollTop);
  // 上方与下方各一行，往最近的方向移动。
  assert.equal(scrollOffsetForRow(metrics, 5, options), 5 * ROW_HEIGHT);
  assert.equal(
    scrollOffsetForRow(metrics, 20, options),
    21 * ROW_HEIGHT - VIEWPORT_HEIGHT,
  );
  // `start` 无条件贴顶——「打开素材后返回列表回到原位」用的是这一支。
  assert.equal(scrollOffsetForRow(metrics, 11, { ...options, align: "start" }), 11 * ROW_HEIGHT);
});

// ---------------------------------------------------------------------------
// 真渲染：1,000 项挂载了多少个 DOM 节点
// ---------------------------------------------------------------------------

const CARD_HEIGHT = 180; // + 10px gap = 190，与 ROW_HEIGHT 一致

/**
 * 只为量节点数存在的最小消费方：一个滚动容器 + 一张网格 + 每格一个可聚焦的方块。
 * 刻意不用真的 `WorkspaceCard`（那是 W07 的面），三个真消费点在
 * `library-virtualization.test.mjs` 里各有一条。
 */
function GridHarness({ itemCount, gridBox }) {
  const scrollRef = React.useRef(null);
  const gridRef = React.useRef(null);
  const grid = useVirtualGrid({
    itemCount,
    containerRef: gridRef,
    scrollRef,
    rule: SHELF_RULE,
    estimatedRowHeight: CARD_HEIGHT + SHELF_RULE.gapPx,
  });
  gridBox.current = grid;

  const cells = [];
  if (grid.spacerTop > 0) {
    cells.push(
      React.createElement("div", {
        key: "spacer-top",
        "data-virtual-spacer": "top",
        style: { gridColumn: "1 / -1", height: grid.spacerTop },
      }),
    );
  }
  for (let index = grid.startIndex; index < grid.endIndex; index += 1) {
    cells.push(
      React.createElement(
        "div",
        {
          key: `card-${index}`,
          "data-card-index": String(index),
          "data-fake-height": String(CARD_HEIGHT),
          tabIndex: 0,
        },
        `#${index}`,
      ),
    );
  }
  if (grid.spacerBottom > 0) {
    cells.push(
      React.createElement("div", {
        key: "spacer-bottom",
        "data-virtual-spacer": "bottom",
        style: { gridColumn: "1 / -1", height: grid.spacerBottom },
      }),
    );
  }

  return React.createElement(
    "div",
    { ref: scrollRef, "data-role": "scroller" },
    React.createElement(
      "div",
      { ref: gridRef, "data-role": "grid", ...grid.containerProps },
      cells,
    ),
  );
}

function mountHarness(itemCount) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const gridBox = { current: null };
  act(() => {
    root.render(React.createElement(GridHarness, { itemCount, gridBox }));
  });
  const scroller = host.querySelector('[data-role="scroller"]');
  return {
    host,
    gridBox,
    cardCount: () => host.querySelectorAll("[data-card-index]").length,
    mountedIndices: () =>
      [...host.querySelectorAll("[data-card-index]")].map((cell) =>
        Number(cell.getAttribute("data-card-index")),
      ),
    scrollTo(value) {
      act(() => {
        scroller.scrollTop = value;
        scroller.dispatchEvent(new window.Event("scroll"));
      });
    },
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

test("1,000 项只挂十来行的 DOM 节点，而不是 1,000 个", () => {
  const harness = mountHarness(1000);
  try {
    const grid = harness.gridBox.current;
    assert.equal(grid.windowed, true, "假布局没生效，下面的判据全是空的");
    assert.equal(grid.columnCount, 4, "900px / 192px 轨道 ⇒ 4 列");
    // 上界写死。关掉回收（`rowWindow` 恒返回全量窗口）时这里会是 1,000，当场红。
    assert.ok(
      harness.cardCount() <= 60,
      `挂了 ${harness.cardCount()} 个卡片节点，上界是 60`,
    );
    // 没挂的那些必须由占位块顶着，滚动条长度才和全量渲染时一样。
    assert.equal(
      harness.host.querySelectorAll('[data-virtual-spacer="bottom"]').length,
      1,
    );
  } finally {
    harness.cleanup();
  }
});

test("滚过整份列表：任一刻都不超上界，累计走过的远多于任一刻挂着的", () => {
  const harness = mountHarness(1000);
  try {
    let widest = 0;
    const visited = new Set();
    for (let scrollTop = 0; scrollTop <= 44000; scrollTop += 2000) {
      harness.scrollTo(scrollTop);
      widest = Math.max(widest, harness.cardCount());
      for (const index of harness.mountedIndices()) visited.add(index);
    }
    assert.ok(widest <= 60, `最宽的一刻挂了 ${widest} 个节点`);
    assert.ok(
      visited.size >= 500,
      `只走过 ${visited.size} 个条目，判据是空的`,
    );
    // 回到顶部之后节点数不许比出发时多——回收是双向的。
    harness.scrollTo(0);
    assert.ok(harness.cardCount() <= 60);
  } finally {
    harness.cleanup();
  }
});

test("方向键从已挂载区走到未挂载区：那张卡当场挂上并拿到焦点", () => {
  const harness = mountHarness(1000);
  try {
    const mounted = harness.mountedIndices();
    const lastMounted = Math.max(...mounted);
    const columnCount = harness.gridBox.current.columnCount;

    // 先把焦点放在**已挂载区的最后一格**，再按一次 ↓。
    const cell = harness.host.querySelector(
      `[data-card-index="${lastMounted}"]`,
    );
    act(() => {
      cell.focus();
      cell.dispatchEvent(
        new window.FocusEvent("focusin", { bubbles: true }),
      );
    });

    const target = lastMounted + columnCount;
    assert.equal(
      harness.host.querySelector(`[data-card-index="${target}"]`),
      null,
      "目标本来就挂着，这条判据是空的",
    );

    act(() => {
      cell.dispatchEvent(
        new window.KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
      );
    });

    assert.equal(
      harness.host.querySelectorAll(`[data-card-index="${target}"]`).length,
      1,
      "方向键走到未挂载区之后，那张卡没有被挂上——键盘用户在这里会丢掉位置",
    );
    assert.equal(
      document.activeElement.getAttribute("data-card-index"),
      String(target),
    );
    // 挂上不等于看得见：还要被滚进视口。
    const scroller = harness.host.querySelector('[data-role="scroller"]');
    assert.ok(scroller.scrollTop > 0, "目标没有被滚进视口");
  } finally {
    harness.cleanup();
  }
});
