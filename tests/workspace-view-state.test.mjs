// 右侧栏给人看的是哪一层（卡片首页 / 某个槽位 / LeoBay / LeoChat）：真实的
// `result-canvas-slot-state.ts` + `result-canvas-view-state.ts` + `workspace-actions.ts`，
// 用一个最小的 Harness 把两个 hook 接起来跑。这里不渲染 ResultCanvas，只钉状态规则：
//   - 宿主把受控 active 给成 "home" → 先是卡片；别的宿主先是它选中的槽位；
//   - 点卡片、agent 的 action、focusNonce、宿主改 active 才换层；会话快照恢复不换层；
//   - `tab: "bay"` 的 action 进 LeoBay 那一块，不动槽位选中值；那一块不可用时被忽略。
import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import React, { act, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { compileModule } from "./helpers/module-bench.mjs";

const require = createRequire(import.meta.url);
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const { useWorkspaceSlotState } = await import(
  await compileModule("src/shell/result-canvas-slot-state.ts")
);
const { useWorkspaceViewState } = await import(
  await compileModule("src/shell/result-canvas-view-state.ts")
);
const { WORKSPACE_ACTION_EVENT, WORKSPACE_ACTION_TABS, normalizeWorkspaceAction } = await import(
  "../src/shell/workspace-actions.ts"
);

const SLOTS = ["template", "preview", "materials", "mine", "browser"];
const slotForId = (id) => (SLOTS.includes(id) ? id : "preview");

function makeHydration() {
  return {
    identity: "site:app:scope",
    rightTab: null,
    restoredSnapshot: false,
    snapshotRestoreEpoch: 0,
    setRightTab(tab) {
      this.rightTab = tab;
    },
    setDefaultRightTab() {},
  };
}

/** 挂一个 Harness，`run` 里用 `api` 操作并读状态；收尾时还原全局。 */
async function withHarness(initial, run) {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://example.test/tasks/1",
  });
  const previous = new Map();
  for (const [name, value] of Object.entries({
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    HTMLElement: dom.window.HTMLElement,
    Element: dom.window.Element,
    Node: dom.window.Node,
    CustomEvent: dom.window.CustomEvent,
  })) {
    previous.set(name, globalThis[name]);
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const container = dom.window.document.createElement("div");
  dom.window.document.body.append(container);
  const root = createRoot(container);
  const props = {
    active: "home",
    showTemplate: false,
    focusNonce: 0,
    externalAction: null,
    runtimeHydration: null,
    panels: { bay: true, leochat: true },
    ...initial,
  };
  const homeCalls = [];
  const changes = [];
  let commits = 0;
  let expose;
  function Harness() {
    const [, setTick] = useState(0);
    const slot = useWorkspaceSlotState({
      active: props.active,
      showTemplate: props.showTemplate,
      focusNonce: props.focusNonce,
      externalAction: props.externalAction,
      runtimeHydration: props.runtimeHydration,
      slotForId,
      callerIdForSlot: (id) => id,
      onChange: (id) => changes.push(id),
    });
    const view = useWorkspaceViewState({
      selected: slot.selected,
      layer: slot.layer,
      setLayer: slot.setLayer,
      panelAction: slot.panelAction,
      select: slot.select,
      panels: props.panels,
      onHome: () => homeCalls.push("home"),
    });
    // 数的是「提交」而不是函数被调了几次：值没变的 setState 可能让 React 再调一次函数然后放弃，那不算一帧。
    useEffect(() => {
      commits += 1;
    });
    expose = { slot, view, rerender: () => setTick((value) => value + 1) };
    return null;
  }
  const api = {
    get view() {
      return expose.view.view;
    },
    get selected() {
      return expose.slot.selected;
    },
    get bayRequest() {
      return expose.view.bayRequest;
    },
    get chatRequest() {
      return expose.view.chatRequest;
    },
    get commits() {
      return commits;
    },
    homeCalls,
    changes,
    async set(patch) {
      Object.assign(props, patch);
      await act(async () => expose.rerender());
    },
    async call(fn) {
      await act(async () => fn(expose));
    },
    async dispatch(nonce, action) {
      await act(async () => {
        dom.window.dispatchEvent(
          new dom.window.CustomEvent(WORKSPACE_ACTION_EVENT, { detail: { nonce, action } }),
        );
      });
    },
  };
  try {
    await act(async () => root.render(React.createElement(Harness)));
    await run(api);
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    for (const [name, value] of previous) {
      if (value === undefined) delete globalThis[name];
      else Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
    }
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

test("action 协议：tab 多认一个 bay，别的值照旧不认；leochat 没有 agent 入口", () => {
  assert.deepEqual([...WORKSPACE_ACTION_TABS], [...SLOTS, "bay"]);
  assert.deepEqual(normalizeWorkspaceAction({ version: 1, tab: "bay", query: " 海报 设计 ", category: "design" }), {
    version: 1,
    tab: "bay",
    query: "海报 设计",
    category: "design",
    itemId: undefined,
    url: undefined,
    browserSessionId: undefined,
  });
  assert.equal(normalizeWorkspaceAction({ version: 1, tab: "leochat" }), null);
  assert.equal(normalizeWorkspaceAction({ version: 1, tab: "home" }), null);
  assert.equal(normalizeWorkspaceAction({ version: 2, tab: "bay" }), null);
});

test("对话页（active=home）：先是卡片；点卡片进那一块；返回回到卡片并通知宿主", async () => {
  await withHarness({ active: "home" }, async (api) => {
    assert.equal(api.view, "home");
    await api.call(({ view }) => view.openSlot("materials"));
    assert.equal(api.view, "materials");
    assert.equal(api.selected, "materials");
    await api.call(({ view }) => view.goHome());
    assert.equal(api.view, "home");
    assert.deepEqual(api.homeCalls, ["home"]);
    // 回到卡片不改槽位选中值：再进同一块时那一块的状态还在。
    assert.equal(api.selected, "materials");
    await api.call(({ view }) => view.openPanel("bay"));
    assert.equal(api.view, "bay");
    await api.call(({ view }) => view.openPanel("leochat"));
    assert.equal(api.view, "leochat");
  });
});

test("操作台页（宿主自己管着标签）：先是它选中的那个槽位，与改版前相同", async () => {
  await withHarness({ active: "mine" }, async (api) => {
    assert.equal(api.view, "mine");
    await api.set({ active: "browser" });
    assert.equal(api.view, "browser");
  });
  await withHarness({ active: undefined, showTemplate: true }, async (api) => {
    assert.equal(api.view, "template");
  });
});

test("agent 的 action：总线与属性两条路都把人从卡片带到对应槽位", async () => {
  await withHarness({ active: "home" }, async (api) => {
    await api.dispatch("n1", { version: 1, tab: "materials", query: "海报" });
    assert.equal(api.view, "materials");
    await api.call(({ view }) => view.goHome());
    await api.set({ externalAction: { nonce: "n2", action: { version: 1, tab: "mine" } } });
    assert.equal(api.view, "mine");
  });
});

test("tab=bay 的 action：进 LeoBay 那一块并交出请求，不动槽位选中值；同一条不重复接", async () => {
  await withHarness({ active: "home" }, async (api) => {
    const before = api.selected;
    await api.set({
      externalAction: { nonce: "msg:9", action: { version: 1, tab: "bay", query: "PPT 动画", category: "ppt" } },
    });
    assert.equal(api.view, "bay");
    assert.deepEqual(api.bayRequest, { nonce: "msg:9", query: "PPT 动画", category: "ppt" });
    assert.equal(api.selected, before);
    await api.call(({ view }) => view.goHome());
    await api.set({});
    assert.equal(api.view, "home", "回到卡片后同一条 action 不能再把人拉回去");
    // 总线来的也一样；没带类目时请求里就没有 category。
    await api.dispatch("bus:1", { version: 1, tab: "bay", query: "合同" });
    assert.equal(api.view, "bay");
    assert.deepEqual(api.bayRequest, { nonce: "bus:1", query: "合同" });
  });
});

test("LeoBay 不可用（境内）：bay 的 action 被忽略，卡片进不去；LeoChat 同理", async () => {
  await withHarness({ active: "home", panels: { bay: false, leochat: false } }, async (api) => {
    await api.set({ externalAction: { nonce: "x", action: { version: 1, tab: "bay", query: "q" } } });
    assert.equal(api.view, "home");
    assert.equal(api.bayRequest, null);
    await api.call(({ view }) => view.openPanel("bay"));
    assert.equal(api.view, "home");
    await api.call(({ view }) => view.openChat("talent:abc"));
    assert.equal(api.view, "home");
    assert.equal(api.chatRequest, null);
  });
});

test("停在某一块上时它变得不可用：回到卡片", async () => {
  await withHarness({ active: "home" }, async (api) => {
    await api.call(({ view }) => view.openPanel("leochat"));
    assert.equal(api.view, "leochat");
    await api.set({ panels: { bay: true, leochat: false } });
    assert.equal(api.view, "home");
  });
});

test("「先聊聊」：从 LeoBay 那一块进 LeoChat 的这条会话；每次都是一条新请求", async () => {
  await withHarness({ active: "home" }, async (api) => {
    await api.call(({ view }) => view.openPanel("bay"));
    await api.call(({ view }) => view.openChat("talent:t1"));
    assert.equal(api.view, "leochat");
    assert.equal(api.chatRequest.conversationId, "talent:t1");
    const first = api.chatRequest.nonce;
    await api.call(({ view }) => view.goHome());
    await api.call(({ view }) => view.openChat("talent:t1"));
    assert.notEqual(api.chatRequest.nonce, first);
    assert.equal(api.view, "leochat");
  });
});

test("宿主把 active 改回 home：回到卡片；之后再切栏位照常生效", async () => {
  await withHarness({ active: "home" }, async (api) => {
    await api.set({ active: "preview" });
    assert.equal(api.view, "preview");
    await api.set({ active: "home" });
    assert.equal(api.view, "home");
    await api.set({ active: "mine" });
    assert.equal(api.view, "mine");
  });
});

test("focusNonce 变了：进「生成」", async () => {
  await withHarness({ active: "home" }, async (api) => {
    await api.set({ focusNonce: 1 });
    assert.equal(api.view, "preview");
  });
});

test("会话快照恢复只改槽位选中值：停在卡片上的人不被拉走；带着的受控值同理", async () => {
  const hydration = makeHydration();
  await withHarness({ active: "home", runtimeHydration: hydration }, async (api) => {
    hydration.rightTab = "mine";
    hydration.restoredSnapshot = true;
    hydration.snapshotRestoreEpoch = 1;
    await api.set({});
    assert.equal(api.selected, "mine");
    assert.equal(api.view, "home", "恢复不是一次明确的请求");
  });
  const second = makeHydration();
  await withHarness({ active: "home", runtimeHydration: second }, async (api) => {
    // 宿主的受控值跟着快照一起回来（同一轮渲染）：只改选中，不换层。
    second.rightTab = "browser";
    second.restoredSnapshot = true;
    second.snapshotRestoreEpoch = 1;
    await api.set({ active: "browser" });
    assert.equal(api.selected, "browser");
    assert.equal(api.view, "home");
    // 恢复那一轮过去之后，宿主自己切栏位才算请求。
    await api.set({ active: "materials" });
    assert.equal(api.view, "materials");
  });
});

test("操作台页上的恢复照旧可见：它本来就停在槽位上", async () => {
  const hydration = makeHydration();
  await withHarness({ active: undefined, showTemplate: true, runtimeHydration: hydration }, async (api) => {
    assert.equal(api.view, "template");
    hydration.rightTab = "mine";
    hydration.restoredSnapshot = true;
    hydration.snapshotRestoreEpoch = 1;
    await api.set({});
    assert.equal(api.view, "mine");
  });
});

test("已经停在槽位上的宿主：action 之后宿主把受控值回显过来，不多画一帧", async () => {
  // 多出来的那一帧会让 actionFor() 提前变回 null（action 已被消费），按 id 取素材的那次请求就被取消了。
  await withHarness({ active: "browser", showTemplate: true }, async (api) => {
    await api.dispatch("deep:1", { version: 1, tab: "materials", itemId: "a1" });
    assert.equal(api.view, "materials");
    const after = api.commits;
    // 宿主收到 onChange("materials") 后把 active 改成同一个栏位。
    await api.set({ active: "materials" });
    assert.equal(api.view, "materials");
    assert.equal(api.commits, after + 1, "只有宿主自己那一次重渲染被提交，hook 没有再触发一次");
  });
});
