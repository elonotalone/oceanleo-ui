// ============================================================================
// W06 · 三个消费点真的接上了虚拟化，且货架外观一个字没变
// ----------------------------------------------------------------------------
// `virtual-grid.test.mjs` 守的是原语本身；这一份守的是**接线**——原语再对，接错了
// 用户也拿不到。三个消费点各有一条「视口内的卡片一定已挂载」，另加一组
// 「`WorkspaceLibrary` 的网格外观与改造前逐字相同」。
//
// 为什么卡片打桩：`workspace-library-view.tsx`（`WorkspaceCard` 本体）是 W07 的面，
// 这一轮它正在被改。把真卡片编进来，W07 每动一次样式这份测试就假红一次，而卡片长
// 什么样本来就不是 W06 的判据（任务书「你负责渲染多少个」）。桩把「第几张卡挂上了」
// 变成可直接断言的 `data-shelf-card-id`，量到的东西反而更准。
//
// jsdom 没有布局引擎，原语因此会走「量不到 ⇒ 全量渲染」的降级分支（那条降级本身在
// `virtual-grid.test.mjs` 里有专门一例）。所以下面先装一套**按真实选择器识别**的假
// 布局：谁是滚动容器看 `overflow-y-auto`，谁是网格看货架的 data 属性 / 素材库的
// `grid-cols-2`。装不上就一条判据都不成立，每个用例开头都先断言 `windowed` 为真。
// ============================================================================

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

// ---------------------------------------------------------------------------
// jsdom（样板照 `tests/artifact-surface-rendered.test.mjs` 开头那段）
// ---------------------------------------------------------------------------

const require = createRequire(import.meta.url);
const reactUrl = pathToFileURL(require.resolve("react")).href;
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
// 假布局：按真实选择器识别，不给被测组件加任何标记
// ---------------------------------------------------------------------------

const VIEWPORT_HEIGHT = 600;
const GRID_WIDTH = 900;
const CARD_HEIGHT = 180;

/** 货架的滚动容器是 `min-h-0 flex-1 overflow-y-auto pt-3` 那个 div（journal J2）。 */
function isScroller(element) {
  return (element.getAttribute?.("class") || "").includes("overflow-y-auto");
}

/** 两张网格：货架的 auto-fill，素材库 legacy 的 `grid-cols-2 sm:grid-cols-3`。 */
function isGrid(element) {
  if (element.hasAttribute?.("data-workspace-card-grid")) return true;
  return (element.getAttribute?.("class") || "").includes("grid-cols-2");
}

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
    return isScroller(this) ? VIEWPORT_HEIGHT : 0;
  },
});

// `nearestScrollParent` 除了看 `overflow-y` 还要求 `scrollHeight > clientHeight`
// ——素材库 legacy 不自带滚动容器（journal J6），走的正是这条往上找的路径。
Object.defineProperty(window.HTMLElement.prototype, "scrollHeight", {
  configurable: true,
  get() {
    return isScroller(this) ? 100000 : 0;
  },
});

Object.defineProperty(window.HTMLElement.prototype, "clientWidth", {
  configurable: true,
  get() {
    return isGrid(this) ? GRID_WIDTH : 0;
  },
});

Object.defineProperty(window.HTMLElement.prototype, "offsetHeight", {
  configurable: true,
  get() {
    if (this.hasAttribute?.("data-virtual-spacer")) {
      return Number.parseFloat(this.style?.height || "0") || 0;
    }
    // 网格的直接子节点就是卡片：原语靠子节点位置反推「第几张卡」（state §2）。
    return this.parentElement && isGrid(this.parentElement) ? CARD_HEIGHT : 0;
  },
});

window.HTMLElement.prototype.getBoundingClientRect = function fakeRect() {
  if (isScroller(this)) return boxOf(0, VIEWPORT_HEIGHT);
  const scroller = closestScroller(this);
  // 网格顶端就是滚动内容的原点，所以它的视口位置等于 `−scrollTop`。
  return boxOf(scroller ? -scroller.scrollTop : 0, 0);
};

function closestScroller(node) {
  let current = node?.parentElement || null;
  while (current) {
    if (isScroller(current)) return current;
    current = current.parentElement;
  }
  return null;
}

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

// `overflow-y` 与 rem 都要问 `getComputedStyle`，而 jsdom 里 Tailwind class 不是真
// CSS。只补这两项，其余原样透传——补过头会把被测组件读到的样式一起改掉。
const realGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = function patchedGetComputedStyle(element, pseudo) {
  const real = realGetComputedStyle(element, pseudo);
  const patch = {};
  if (element === document.documentElement) patch.fontSize = "16px";
  if (isScroller(element)) patch.overflowY = "auto";
  if (!Object.keys(patch).length) return real;
  return new Proxy(real, {
    get(target, property) {
      if (property in patch) return patch[property];
      const value = target[property];
      return typeof value === "function" ? value.bind(target) : value;
    },
  });
};

// ---------------------------------------------------------------------------
// 桩
// ---------------------------------------------------------------------------

const UI = dataModule("export function useUI(){ return (zh) => zh; }");

/** 卡片替身：只报出自己是第几件，别的什么都不做（理由见文件头）。 */
const WORKSPACE_LIBRARY_VIEW = dataModule(`
  import { createElement } from ${JSON.stringify(reactUrl)};
  export function WorkspaceCard({ entry }) {
    return createElement("div", {
      "data-shelf-card-id": entry.id,
      tabIndex: 0,
    }, entry.title);
  }
  export function WorkspaceListRow({ entry }) {
    return createElement("div", { "data-shelf-row-id": entry.id }, entry.title);
  }
  export function WorkspaceLibraryEmpty() {
    return createElement("div", { "data-shelf-empty": "true" });
  }
  export function WorkspaceLibraryEntryViewer() {
    return createElement("div", { "data-shelf-viewer": "true" });
  }
`);

const ARTIFACT_CLIENT_SOURCE = `
  export const ARTIFACT_LIBRARY_CHANGE_EVENT = "oceanleo:artifact-library-change";
  export const ARTIFACT_EDITABLE_SHELF_PER_TYPE = 5;
  export function artifactDownloadEvidence(){
    return { visible: false, available: false, reason: "", purpose: "source", mode: "attachment" };
  }
  export function artifactDownloadTypeHint(){ return { ext: "", mediaType: "" }; }
  export function primeCurrentPrincipalId(){}
  export function resetCurrentPrincipalId(){}
  export async function getArtifactDownload(){ return { ok: true, data: {} }; }
  export async function getArtifactItem(){ return { ok: false, status: 404 }; }
  export async function getCurrentArtifactItem(){ return { ok: false, status: 404 }; }
  export async function listPrimaryArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function listEditableShelfArtifacts(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function searchArtifactLibrary(){ return { ok: true, data: { items: [], nextCursor: null } }; }
  export async function prepareArtifactForAction(action, item){ return { ok: true, data: item }; }
  export async function setArtifactFavorite(){ return { ok: true, data: {} }; }
  export async function refreshArtifactRendition(){ return { ok: false, status: 404 }; }
  export async function ensureDurableArtifactItem(){ return { ok: false, status: 404 }; }
  export async function getArtifactEditDecision(){ return { ok: false, status: 404 }; }
  export async function resolveArtifactEditOwnership(){ return { ok: false, status: 404 }; }
  export async function getCurrentPrincipalId(){ return { ok: true, data: "principal-1" }; }
  export async function ensureArtifact(){ return { ok: false, status: 404 }; }
  export async function forkArtifact(){ return { ok: false, status: 404 }; }
  export async function createArtifactRevision(){ return { ok: false, status: 404 }; }
  export async function bindArtifactToContext(){ return { ok: false, status: 404 }; }
  export async function retireArtifact(){ return { ok: false, status: 404 }; }
  // ownerPrincipalId 不是可选的：缺了它 MyLibrary 判 502 并拒绝显示（:504-515）。
  export async function listFavoriteArtifacts(){
    return { ok: true, data: { items: [], nextCursor: null, ownerPrincipalId: "principal-1" } };
  }
  export async function listMyArtifacts(){
    return { ok: true, data: { items: [], nextCursor: null, ownerPrincipalId: "principal-1" } };
  }
`;

/**
 * `listMyArtifacts` 交回来的是 `LibraryItem`，不是 Supabase 原始行。
 *
 * durable 三件套（`artifactId` / `revisionId` / `artifactType` + 一份 `artifact`
 * 投影，且投影里的两个 id 与外层逐字相等）**不是装饰**：`MyLibrary` 的 `items`
 * memo 走 `dedupeDurableItems`，`isDurableLibraryItem`（`library-data.ts:501-517`）
 * 判不过的条目会被**整条丢掉**，货架于是渲染 `WorkspaceLibraryEmpty`，
 * 判据全成空的。`toEntry` 另外还要读 `item.artifact.owner.visibility`。
 * 形状照 `deck-delivery-family.test.mjs` 的 `deckItem()`。
 * 卡片上的 id 是 `entry.id` = `item.key`（`workspace-library-model.ts:76`），
 * 所以 `key` 必须是 `mine-<下标>`，视口断言才对得上。
 */
const LIBRARY_ITEMS_SOURCE = `
  const MINE = Array.from({ length: COUNT }, (_, index) => {
    const artifactId = "artifact-" + index;
    const revisionId = artifactId + "-rev";
    const title = "我的素材 " + index;
    return {
      key: "mine-" + index,
      source: "artifact",
      id: artifactId,
      title,
      kind: "image",
      siteId: "",
      favorite: false,
      createdAt: new Date(2026, 0, 1 + (index % 300)).toISOString(),
      meta: {},
      artifactId,
      revisionId,
      artifactType: "image",
      artifact: {
        schema: "oceanleo.artifact.v1",
        artifactId,
        revisionId,
        artifactType: "image",
        roles: [],
        owner: {
          principalId: "principal-1",
          visibility: "private",
          originSiteKey: "image",
          originAppId: "library",
          originFunctionId: null,
        },
        access: {
          canRead: true,
          canPreview: true,
          canEdit: true,
          canFork: true,
          canInsert: true,
          canReplace: true,
          canFavorite: true,
          canBind: true,
          canExportSource: true,
        },
        editability: "native",
        editorCapability: "image-editor",
        sourceFormat: "png",
        title,
        favorite: false,
        renditions: {},
        scene: null,
        provenance: {
          id: "provenance-" + artifactId,
          sourceKind: "owned",
          licenseCode: "internal",
          licenseUrl: "",
          attribution: "",
        },
        bindings: [],
        integrity: { ok: true, code: "ok", reason: "" },
        createdAt: "2026-08-01T00:00:00Z",
      },
    };
  });
`;

/** `MyLibrary` 那一条：`listMyArtifacts` 一次给回 `count` 件，游标为空。 */
function artifactClientWithMine(count) {
  return dataModule(`
    ${ARTIFACT_CLIENT_SOURCE.replace(
      /export async function listMyArtifacts\(\)\{[\s\S]*?\n  \}/,
      "",
    )}
    ${LIBRARY_ITEMS_SOURCE.replace("COUNT", String(count))}
    export async function listMyArtifacts(){
      return { ok: true, data: { items: MINE, nextCursor: null, ownerPrincipalId: "principal-1" } };
    }
  `);
}

const SHELL_OVERRIDES = {
  "../i18n/ui/useUI": UI,
  "./workspace-library-view": WORKSPACE_LIBRARY_VIEW,
  "./AdvancedContentWorkbench": dataModule(
    "export function AdvancedContentWorkbench(){ return null; }",
  ),
  "./WorkspaceSession": dataModule(
    "export function useOptionalWorkspaceSession(){ return null; }",
  ),
  "./workbench-material-registry": dataModule(`
    export function materialScopeKey(siteId, appId){ return siteId + ":" + appId; }
    export function registerWorkbenchMaterialSource(){ return () => {}; }
  `),
};

const { WorkspaceLibrary } = await import(
  await compileModule("src/shell/WorkspaceLibrary.tsx", {
    ...SHELL_OVERRIDES,
    "./artifact-client": dataModule(ARTIFACT_CLIENT_SOURCE),
  })
);

// ---------------------------------------------------------------------------
// 挂载台
// ---------------------------------------------------------------------------

function entriesOf(count, prefix = "entry") {
  return Array.from({ length: count }, (_, index) => ({
    id: `${prefix}-${index}`,
    title: `素材 ${index}`,
    kind: "image",
    thumbUrl: undefined,
    libraryItem: undefined,
  }));
}

function mount(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(element));
  return {
    host,
    grid: () => host.querySelector("[data-workspace-card-grid]"),
    cardIds: () =>
      [...host.querySelectorAll("[data-shelf-card-id]")].map((node) =>
        node.getAttribute("data-shelf-card-id"),
      ),
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

async function mountAsync(element) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(element);
  });
  // 取数是 effect 里的 await 链（`Promise.allSettled` + 后续几段），一轮微任务
  // 冲不干净：多冲几轮，否则量到的是 loading 骨架而不是货架。
  for (let round = 0; round < 6; round += 1) {
    await act(async () => {});
  }
  return {
    host,
    cleanup() {
      act(() => root.unmount());
      host.remove();
    },
  };
}

/** 视口里理应看得见的那些行，逐行断言它们的卡片都在 DOM 里。 */
function assertViewportMounted(mountedIds, prefix, columnCount, scrollTop) {
  const rowHeight = CARD_HEIGHT;
  const firstRow = Math.floor(scrollTop / rowHeight);
  const lastRow = Math.floor((scrollTop + VIEWPORT_HEIGHT - 1) / rowHeight);
  const missing = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = 0; column < columnCount; column += 1) {
      const id = `${prefix}-${row * columnCount + column}`;
      if (!mountedIds.includes(id)) missing.push(id);
    }
  }
  assert.deepEqual(
    missing,
    [],
    `视口内这些卡片没有挂载，用户会看到空白：${missing.slice(0, 8).join("、")}`,
  );
}

// ---------------------------------------------------------------------------
// 消费点 1：WorkspaceLibrary
// ---------------------------------------------------------------------------

test("货架外观与改造前逐字相同：class、data 属性、行内 gridTemplateColumns", () => {
  const view = mount(
    React.createElement(WorkspaceLibrary, {
      entries: entriesOf(4),
      onOpenItem: () => {},
      plain: true,
    }),
  );
  try {
    const grid = view.grid();
    assert.ok(grid, "货架网格没渲染出来");
    // 这三行就是「外观不许变」本身：31 个租户站的排版全靠它。
    assert.equal(grid.getAttribute("class"), "grid gap-2.5");
    assert.equal(grid.getAttribute("data-workspace-card-grid"), "auto-fill");
    assert.equal(
      grid.style.gridTemplateColumns,
      "repeat(auto-fill, minmax(min(12rem, calc((100% - 0.625rem) / 2)), 1fr))",
    );
    // 条目少到一屏装得下时，DOM 与改造前逐字相同：四张卡，且**没有占位块**。
    assert.equal(view.cardIds().length, 4);
    assert.equal(view.host.querySelectorAll("[data-virtual-spacer]").length, 0);
  } finally {
    view.cleanup();
  }
});

test("货架 600 件：视口内的卡片一定已挂载，挂载总数远小于 600", () => {
  const view = mount(
    React.createElement(WorkspaceLibrary, {
      entries: entriesOf(600),
      onOpenItem: () => {},
      plain: true,
    }),
  );
  try {
    const grid = view.grid();
    // 假布局没生效的话下面全是空判据，先把这一条钉死。
    assert.equal(
      view.host.querySelectorAll('[data-virtual-spacer="bottom"]').length,
      1,
      "没有下方占位块 ⇒ 没有窗口化，这条判据是空的",
    );
    // 900px / `min(12rem,…)`=192px 轨道 + 10px gap ⇒ 4 列，与 CSS 算出来的一致。
    const columnCount = 4;
    const ids = view.cardIds();
    assert.ok(ids.length <= 60, `挂了 ${ids.length} 张卡，上界是 60`);
    assertViewportMounted(ids, "entry", columnCount, 0);

    // 滚到中段，视口内那些行必须换成新的一批，且总数仍在上界内。
    const scroller = grid.closest(".overflow-y-auto");
    act(() => {
      scroller.scrollTop = 60 * CARD_HEIGHT;
      scroller.dispatchEvent(new window.Event("scroll"));
    });
    const scrolledIds = view.cardIds();
    assert.ok(scrolledIds.length <= 60, `滚动后挂了 ${scrolledIds.length} 张卡`);
    assertViewportMounted(scrolledIds, "entry", columnCount, 60 * CARD_HEIGHT);
    // 真的换了一批（否则说明根本没滚动，上一条也是空的）。
    assert.equal(
      scrolledIds.includes("entry-0"),
      false,
      "滚了 60 行之后第 0 张还挂着 ⇒ 没有回收",
    );
  } finally {
    view.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 消费点 2：MyLibrary（自己不渲染网格，靠 WorkspaceLibrary 覆盖）
// ---------------------------------------------------------------------------

test("我的库 400 件：走的就是货架那张虚拟化网格，视口内卡片已挂载", async () => {
  const { MyLibrary } = await import(
    await compileModule("src/shell/MyLibrary.tsx", {
      ...SHELL_OVERRIDES,
      "./artifact-client": artifactClientWithMine(400),
    })
  );
  const view = await mountAsync(
    React.createElement(MyLibrary, { plain: true, onOpenItem: () => {} }),
  );
  try {
    const grid = view.host.querySelector("[data-workspace-card-grid]");
    assert.ok(
      grid,
      `我的库没有渲染出货架网格（取数桩没生效？）empty=${
        view.host.querySelectorAll("[data-shelf-empty]").length
      } cards=${view.host.querySelectorAll("[data-shelf-card-id]").length} tail=${view.host.innerHTML.slice(-1200)}`,
    );
    const ids = [...view.host.querySelectorAll("[data-shelf-card-id]")].map(
      (node) => node.getAttribute("data-shelf-card-id"),
    );
    assert.ok(ids.length > 0, "一张卡都没有，判据是空的");
    assert.equal(
      view.host.querySelectorAll('[data-virtual-spacer="bottom"]').length,
      1,
      "我的库那张网格没有窗口化",
    );
    assert.ok(ids.length <= 60, `挂了 ${ids.length} 张卡，上界是 60`);
    assertViewportMounted(ids, "mine", 4, 0);
  } finally {
    view.cleanup();
  }
});

// ---------------------------------------------------------------------------
// 消费点 3：ArtifactLibrary（legacy 分支：先分页，再虚拟化）
// ---------------------------------------------------------------------------

test("素材库 legacy：一次只拉一页 60 行（不再是 500），网格同样窗口化", async () => {
  const ranges = [];
  const { ArtifactLibrary } = await import(
    await compileModule("src/shell/ArtifactLibrary.tsx", {
      ...SHELL_OVERRIDES,
      "./artifact-client": dataModule(ARTIFACT_CLIENT_SOURCE),
      "../lib/auth/client": dataModule(`
        const ROWS = Array.from({ length: 400 }, (_, index) => ({
          id: "art-" + index,
          title: "素材 " + index,
          kind: "image",
          favorite: false,
          created_at: new Date(2026, 0, 1 + (index % 300)).toISOString(),
        }));
        globalThis.__W06_RANGES = [];
        function builder() {
          const self = {
            eq(){ return self; },
            in(){ return self; },
            ilike(){ return self; },
            order(){ return self; },
            range(from, to){
              globalThis.__W06_RANGES.push([from, to]);
              return Promise.resolve({ data: ROWS.slice(from, to + 1), error: null });
            },
          };
          return self;
        }
        export function browserClient(){
          return {
            from(){ return { select(){ return builder(); }, update(){ return builder(); } }; },
            auth: {
              getSession: async () => ({ data: { session: { user: { id: "u1" } } } }),
            },
          };
        }
        export async function accessToken(){ return "t"; }
        export function cachedAccessToken(){ return "t"; }
        export async function isSignedIn(){ return true; }
        export async function getUserId(){ return "u1"; }
        export async function getUserEmail(){ return "u@example.com"; }
        export const oceanleoConfigured = true;
      `),
    })
  );

  globalThis.__W06_RANGES = [];
  const view = await mountAsync(
    React.createElement(
      "div",
      { className: "overflow-y-auto" },
      React.createElement(ArtifactLibrary, { fill: true }),
    ),
  );
  try {
    ranges.push(...(globalThis.__W06_RANGES || []));
    // 分页判据：首屏问的是 `range(0, 60)`——多取一行探下一页，而不是 `.limit(500)`。
    assert.deepEqual(
      ranges[0],
      [0, 60],
      `首屏取数不是一页 60 行（实际 ${JSON.stringify(ranges[0])}）`,
    );

    const grid = view.host.querySelector(".grid-cols-2");
    assert.ok(grid, "素材库网格没渲染出来");
    const cards = grid.children.length;
    // 一页 60 件、2 列 ⇒ 30 行 × 180px = 5,400px，600px 视口装不下 ⇒ 必须窗口化。
    assert.equal(
      view.host.querySelectorAll('[data-virtual-spacer="bottom"]').length,
      1,
      "素材库那张网格没有窗口化（legacy 不自带滚动容器，靠 nearestScrollParent 往上找）",
    );
    assert.ok(cards < 60, `一页 60 件却挂了 ${cards} 个子节点，没有回收`);
  } finally {
    view.cleanup();
  }
});
