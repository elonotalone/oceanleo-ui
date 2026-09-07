// ModeSwitchGate（plugin-ui-overhaul U4）：「编辑 ⇄ 专业编辑」切换的过渡门。
//
// 用户之前看到的：点「专业编辑」页签，页签立刻高亮，舞台停在普通模式，几秒后画面突变。
// 这份闸钉住新语义：
//   (a) 切 pro 后同一 tick 内旧面仍在 DOM、出现 `data-mode-switch-pending`、新面已挂但不可见；
//   (b) 新面发 ready 后旧面消失、覆盖层消失、新面可见；
//   (c) ready 信号不来，兜底到点直接切；
//   (d) 切回 normal 同理；
//   (e) 覆盖层是舞台内的 absolute：portal 进当前面的舞台节点，不遮第一行、第二行。
//   另：`beforeEnterPro` 悬着时专业面不挂、覆盖层已在；门外调 `useModeSwitchReady` 是 noop。
//
// 跑法：
//   node --test --import ./tests/helpers/assert-dom-guard.mjs \
//     --experimental-strip-types --experimental-loader ./tests/ts-extension-loader.mjs \
//     tests/mode-switch-gate.test.mjs

import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act, useState } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

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
  url: "https://word.oceanleo.com/",
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
})) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value,
  });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// L0 模式 store 的可控替身：PluginModeSwitchGate 例用它翻 pro。同一 data: URL
// 只实例化一次，所以下面 `import(pluginModeStub)` 拿到的就是门里那一份。
const reactUrl = pathToFileURL(require.resolve("react")).href;
const pluginModeStub = dataModule(`
  import { useSyncExternalStore } from ${JSON.stringify(reactUrl)};
  let mode = "normal";
  const listeners = new Set();
  export function __setPluginMode(next) { mode = next; for (const l of listeners) l(); }
  export function usePluginMode(pluginId) {
    const current = useSyncExternalStore(
      (l) => { listeners.add(l); return () => listeners.delete(l); },
      () => mode,
      () => "normal",
    );
    return { mode: current, pro: current === "pro", pluginId, setMode: __setPluginMode, toggle() {} };
  }
`);
const gateUrl = await compileModule(
  "src/shell/advanced-routes/mode-switch-gate.tsx",
  {
    "../../i18n/ui/useUI": dataModule(
      `export function useUI() { return (key) => key; }`,
    ),
    "../plugin-chrome/plugin-mode": pluginModeStub,
  },
);
const { __setPluginMode } = await import(pluginModeStub);
const {
  ModeSwitchGate,
  PluginModeSwitchGate,
  useModeSwitchReady,
  MODE_SWITCH_FALLBACK_MS,
} = await import(gateUrl);
const { createRoot } = await import("react-dom/client");

const h = React.createElement;

/** 一个「面」：可选画出第一行/第二行 + 舞台（模拟 PluginChromeFrame），按 `ready` 发信号。 */
function Face({ name, ready, withChrome = false }) {
  useModeSwitchReady(ready);
  const body = h(
    "p",
    { "data-face-body": name },
    `${name} face`,
  );
  if (!withChrome) return h("div", { "data-face": name }, body);
  return h(
    "div",
    { "data-face": name, "data-plugin-chrome": "x" },
    h("div", { "data-plugin-chrome-rows": "" }, "row1 / row2"),
    h("main", { "data-plugin-chrome-stage": "" }, body),
  );
}

function Host({ initialPro = false, fallbackMs, beforeEnterPro, withChrome, expose }) {
  const [pro, setPro] = useState(initialPro);
  const [proReady, setProReady] = useState(false);
  const [normalReady, setNormalReady] = useState(false);
  expose({ setPro, setProReady, setNormalReady });
  return h(ModeSwitchGate, {
    pro,
    fallbackMs,
    beforeEnterPro,
    renderNormal: () => h(Face, { name: "normal", ready: normalReady, withChrome }),
    renderPro: () => h(Face, { name: "pro", ready: proReady, withChrome }),
  });
}

async function mount(props = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let controls = null;
  await act(async () => {
    root.render(h(Host, { ...props, expose: (c) => (controls = c) }));
  });
  const q = (selector) => container.querySelector(selector);
  return {
    container,
    q,
    controls: () => controls,
    async unmount() {
      await act(async () => root.unmount());
      container.remove();
    },
  };
}

function isHiddenPending(node) {
  const slot = node.closest("[data-mode-switch-face]");
  return (
    slot?.getAttribute("data-mode-switch-face-state") === "pending" &&
    /visibility:\s*hidden/i.test(slot.getAttribute("style") || "")
  );
}

test("默认兜底是 8 秒", () => {
  assert.equal(MODE_SWITCH_FALLBACK_MS, 8000);
});

test("(a) 切 pro：同一 tick 内旧面仍在、覆盖层出现、新面已挂但不可见（不是 display:none）", async () => {
  const m = await mount();
  try {
    assert.ok(m.q("[data-face=normal]"), "开场是普通面");
    assert.equal(m.q("[data-face=pro]"), null, "开场不该挂专业面");
    assert.equal(m.q("[data-mode-switch-pending]"), null);

    await act(async () => m.controls().setPro(true));

    assert.ok(m.q("[data-face=normal]"), "切 pro 后旧面被卸了——这正是用户看到的留白");
    const overlay = m.q("[data-mode-switch-pending]");
    assert.ok(overlay, "切 pro 后没有 data-mode-switch-pending 覆盖层");
    assert.equal(overlay.getAttribute("data-mode-switch-pending"), "pro");
    assert.equal(overlay.textContent.includes("正在切换到专业编辑…"), true, "覆盖层文案不对");
    const proFace = m.q("[data-face=pro]");
    assert.ok(proFace, "新面没有在覆盖层之下预挂——iframe / canvas 无处初始化");
    assert.equal(isHiddenPending(proFace), true, "待命面必须 visibility:hidden");
    const slot = proFace.closest("[data-mode-switch-face]");
    assert.doesNotMatch(slot.getAttribute("style") || "", /display\s*:\s*none/i, "不许 display:none（尺寸会塌成 0）");
    assert.equal(slot.getAttribute("aria-hidden"), null, "不加 aria-hidden（visibility 已够；pdf 闸的 hidden 探测会误报）");
    assert.doesNotMatch(slot.getAttribute("class") || "", /(?:^|\s)hidden(?:\s|$)/);
  } finally {
    await m.unmount();
  }
});

test("(b) 新面 ready：旧面消失、覆盖层消失、新面可见", async () => {
  const m = await mount();
  try {
    await act(async () => m.controls().setPro(true));
    assert.ok(m.q("[data-mode-switch-pending]"));

    await act(async () => m.controls().setProReady(true));

    assert.equal(m.q("[data-face=normal]"), null, "ready 之后旧面还挂着");
    assert.equal(m.q("[data-mode-switch-pending]"), null, "ready 之后覆盖层还在");
    const proFace = m.q("[data-face=pro]");
    assert.ok(proFace);
    const slot = proFace.closest("[data-mode-switch-face]");
    assert.equal(slot.getAttribute("data-mode-switch-face-state"), "shown");
    assert.doesNotMatch(slot.getAttribute("style") || "", /visibility/i, "新面成为当前面后仍带 visibility:hidden");
    assert.equal(m.q("[data-mode-switch-gate]").getAttribute("data-mode-switch-shown"), "pro");
  } finally {
    await m.unmount();
  }
});

test("(b′) 新面挂上时就已 ready：同一次提交里直接切，不闪覆盖层", async () => {
  const m = await mount();
  try {
    await act(async () => m.controls().setProReady(true));
    await act(async () => m.controls().setPro(true));
    assert.equal(m.q("[data-face=normal]"), null);
    assert.equal(m.q("[data-mode-switch-pending]"), null);
    assert.ok(m.q("[data-face=pro]"));
  } finally {
    await m.unmount();
  }
});

test("(c) ready 不来：兜底到点直接切，覆盖层不许永久停留", async () => {
  const m = await mount({ fallbackMs: 300 });
  try {
    const startedAt = Date.now();
    await act(async () => m.controls().setPro(true));
    assert.ok(m.q("[data-mode-switch-pending]"));
    assert.ok(m.q("[data-face=normal]"));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    if (Date.now() - startedAt < 250) {
      assert.ok(m.q("[data-mode-switch-pending]"), "兜底还没到点就切了");
    }
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    assert.equal(m.q("[data-mode-switch-pending]"), null, "兜底到点覆盖层还在");
    assert.equal(m.q("[data-face=normal]"), null, "兜底到点旧面还在");
    const slot = m.q("[data-face=pro]").closest("[data-mode-switch-face]");
    assert.equal(slot.getAttribute("data-mode-switch-face-state"), "shown");
  } finally {
    await m.unmount();
  }
});

test("(d) 切回 normal：同样先留旧面 + 覆盖层，ready 后再换", async () => {
  const m = await mount({ initialPro: true });
  try {
    assert.ok(m.q("[data-face=pro]"));
    assert.equal(m.q("[data-face=normal]"), null);

    await act(async () => m.controls().setPro(false));
    assert.ok(m.q("[data-face=pro]"), "切回 normal 时专业面被先卸了");
    const overlay = m.q("[data-mode-switch-pending]");
    assert.ok(overlay);
    assert.equal(overlay.getAttribute("data-mode-switch-pending"), "normal");
    assert.equal(overlay.textContent.includes("正在切换到编辑…"), true);
    assert.equal(isHiddenPending(m.q("[data-face=normal]")), true);

    await act(async () => m.controls().setNormalReady(true));
    assert.equal(m.q("[data-face=pro]"), null);
    assert.equal(m.q("[data-mode-switch-pending]"), null);
    assert.equal(
      m.q("[data-face=normal]").closest("[data-mode-switch-face]").getAttribute("data-mode-switch-face-state"),
      "shown",
    );
  } finally {
    await m.unmount();
  }
});

test("(d′) 切换途中反悔（pro → normal 再点回来）：待命面卸掉、覆盖层撤掉、当前面原样", async () => {
  const m = await mount();
  try {
    await act(async () => m.controls().setPro(true));
    assert.ok(m.q("[data-mode-switch-pending]"));
    await act(async () => m.controls().setPro(false));
    assert.equal(m.q("[data-mode-switch-pending]"), null);
    assert.equal(m.q("[data-face=pro]"), null);
    assert.equal(
      m.q("[data-face=normal]").closest("[data-mode-switch-face]").getAttribute("data-mode-switch-face-state"),
      "shown",
    );
  } finally {
    await m.unmount();
  }
});

test("(e) 覆盖层 portal 进当前面的舞台节点，不在 [data-plugin-chrome-rows] 之外遮行", async () => {
  const m = await mount({ withChrome: true });
  try {
    await act(async () => m.controls().setPro(true));
    const overlay = m.q("[data-mode-switch-pending]");
    assert.ok(overlay);
    const stage = overlay.parentElement;
    assert.ok(stage.hasAttribute("data-plugin-chrome-stage"), "覆盖层的父节点不是舞台");
    // 落在**当前面**（normal）的舞台里，而不是待命面的。
    assert.equal(stage.closest("[data-face]").getAttribute("data-face"), "normal");
    const rows = m.q("[data-face=normal] [data-plugin-chrome-rows]");
    assert.equal(overlay.contains(rows), false, "覆盖层把第一行/第二行包进去了");
    assert.equal(rows.contains(overlay), false, "覆盖层长在行区里");
    assert.match(overlay.getAttribute("class") || "", /(?:^|\s)absolute(?:\s|$)/);
    assert.match(overlay.getAttribute("class") || "", /(?:^|\s)inset-0(?:\s|$)/);
    // 门自己的盒子上不许再有一层覆盖（那会盖住行）。
    const gate = m.q("[data-mode-switch-gate]");
    for (const child of gate.children) {
      assert.equal(child.hasAttribute("data-mode-switch-pending"), false, "覆盖层直接挂在门上，会遮到行");
    }
  } finally {
    await m.unmount();
  }
});

test("(e′) 门自己就在舞台里（PdfRoute 的 stage: 位置）：找不到子舞台就地 absolute inset-0", async () => {
  const m = await mount({ withChrome: false });
  try {
    await act(async () => m.controls().setPro(true));
    const overlay = m.q("[data-mode-switch-pending]");
    assert.ok(overlay);
    assert.equal(overlay.parentElement, m.q("[data-mode-switch-gate]"));
    assert.match(m.q("[data-mode-switch-gate]").getAttribute("class") || "", /(?:^|\s)relative(?:\s|$)/);
  } finally {
    await m.unmount();
  }
});

test("beforeEnterPro 悬着：覆盖层已在、专业面不挂；resolve 后才挂", async () => {
  let release;
  const gateHold = new Promise((resolve) => {
    release = resolve;
  });
  const m = await mount({ beforeEnterPro: () => gateHold });
  try {
    await act(async () => m.controls().setPro(true));
    assert.ok(m.q("[data-mode-switch-pending]"), "等 flush 期间也要有覆盖层");
    assert.equal(m.q("[data-face=pro]"), null, "flush 没完专业面就挂了——它会读到没 flush 的文档");
    assert.ok(m.q("[data-face=normal]"));
    await act(async () => {
      release();
      await gateHold;
    });
    assert.ok(m.q("[data-face=pro]"), "flush 完了专业面没挂");
    assert.equal(isHiddenPending(m.q("[data-face=pro]")), true);
    await act(async () => m.controls().setProReady(true));
    assert.equal(m.q("[data-face=normal]"), null);
    assert.equal(m.q("[data-mode-switch-pending]"), null);
  } finally {
    await m.unmount();
  }
});

test("beforeEnterPro reject 不卡门：照样挂专业面", async () => {
  const m = await mount({ beforeEnterPro: () => Promise.reject(new Error("flush failed")) });
  try {
    await act(async () => m.controls().setPro(true));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
    assert.ok(m.q("[data-face=pro]"));
  } finally {
    await m.unmount();
  }
});

test("PluginModeSwitchGate：由 usePluginMode(id).pro 驱动，语义与 ModeSwitchGate 一致", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const q = (selector) => container.querySelector(selector);
  let setProReady = null;
  function PluginHost() {
    const [proReady, setReady] = useState(false);
    setProReady = setReady;
    return h(PluginModeSwitchGate, {
      pluginId: "audio",
      renderNormal: () => h(Face, { name: "normal", ready: true }),
      renderPro: () => h(Face, { name: "pro", ready: proReady }),
    });
  }
  try {
    await act(async () => {
      __setPluginMode("normal");
      root.render(h(PluginHost));
    });
    assert.ok(q("[data-face=normal]"));
    assert.equal(q("[data-face=pro]"), null);

    await act(async () => __setPluginMode("pro"));
    assert.ok(q("[data-face=normal]"), "store 翻 pro 后旧面被先卸了");
    assert.ok(q("[data-mode-switch-pending]"));
    assert.equal(isHiddenPending(q("[data-face=pro]")), true);

    await act(async () => setProReady(true));
    assert.equal(q("[data-face=normal]"), null);
    assert.equal(q("[data-mode-switch-pending]"), null);
    assert.equal(q("[data-mode-switch-gate]").getAttribute("data-mode-switch-shown"), "pro");
  } finally {
    await act(async () => root.unmount());
    container.remove();
    __setPluginMode("normal");
  }
});

test("门外调 useModeSwitchReady 是 noop（flag=next 直出 stage 时无副作用）", async () => {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(h(Face, { name: "solo", ready: true }));
    });
    assert.ok(container.querySelector("[data-face=solo]"));
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});
