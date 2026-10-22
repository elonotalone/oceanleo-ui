// W07 判据：通话放大视图（合同 §1 A5、A7 的菜单本身、A20 的旧弹窗移除；任务书 P2/P3/P4/P6）。
// jsdom 真渲染 CallHost：全窗口浮层（role=dialog、焦点进来、Tab 转圈、Esc/「缩小」回小窗且焦点回「放大」）、
// 宫格每页 9 格（窄屏 4 格）可翻页且随页调 setViewport、有人共享屏幕时切共享版式（主位 + 侧栏 + W09 控制层）、
// 每格的名字/静音/信号/亮框、参与者菜单（仅对我静音、举报、W09 请求控制）、底部同一组五个按钮 + 转写/录制开关；
// 以及旧 MeetingPanel 已删除、src/shell/messages 里不再引用。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/call-ui-stage.test.mjs
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import React, { act } from "react";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { stripJsComments } from "./helpers/strip-js-comments.mjs";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const UI_DIR = "src/shell/messages/call/ui";
const require = createRequire(import.meta.url);

// ---- jsdom（fabric 的嵌套依赖；照 im-member-picker.test.mjs 的取法）----
const fabricRequire = createRequire(require.resolve("fabric/node"));
const canvasEntry = fabricRequire.resolve("canvas");
const previousCanvasModule = require.cache[canvasEntry];
require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
const { JSDOM } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
else delete require.cache[canvasEntry];

const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true, url: "https://oceanleo.com/" });
const { window } = dom;
const { document } = window;
for (const [name, value] of Object.entries({
  window, document, navigator: window.navigator, HTMLElement: window.HTMLElement, HTMLVideoElement: window.HTMLVideoElement,
  Element: window.Element, Node: window.Node, Event: window.Event, CustomEvent: window.CustomEvent, MouseEvent: window.MouseEvent,
  KeyboardEvent: window.KeyboardEvent, localStorage: window.localStorage, MutationObserver: window.MutationObserver,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
window.matchMedia = (query) => ({ matches: Boolean(globalThis.__CALL?.narrow), media: query, addEventListener() {}, removeEventListener() {} });
const { createRoot } = await import("react-dom/client");

const S = (globalThis.__CALL = { snapshot: null, listeners: new Set(), calls: [], devices: null, ownLevel: 4, captionsHidden: false, narrow: false });

const reactUrl = pathToFileURL(require.resolve("react")).href;
const head = `import React from ${JSON.stringify(reactUrl)}; const h = React.createElement; const S = globalThis.__CALL;`;

const engineStub = dataModule(`${head}
  export const callStore = {
    subscribe(listener) { S.listeners.add(listener); return () => S.listeners.delete(listener); },
    getSnapshot() { return S.snapshot; },
  };
  export function useCall() { return React.useSyncExternalStore(callStore.subscribe, callStore.getSnapshot, callStore.getSnapshot); }
  const rec = (name) => (...args) => { S.calls.push([name, ...args]); return Promise.resolve(); };
  export const callActions = {
    startOrJoin: rec("startOrJoin"), join: rec("join"), leave: rec("leave"), setMic: rec("setMic"), setCamera: rec("setCamera"),
    setScreenShare: rec("setScreenShare"), setAudioOnly: rec("setAudioOnly"), selectDevice: rec("selectDevice"),
    setLocalMute: rec("setLocalMute"), acceptIncoming: rec("acceptIncoming"), declineIncoming: rec("declineIncoming"),
    listDevices: () => { S.calls.push(["listDevices"]); return Promise.resolve(S.devices); },
    setViewport: (mode, ids) => { S.calls.push(["setViewport", mode, [...ids]]); },
    attachVideo: (el, pid, track) => { S.calls.push(["attachVideo", el ? el.tagName.toLowerCase() : null, pid, track]); },
    cancelAloneTimer: () => { S.calls.push(["cancelAloneTimer"]); },
    getStats: () => Promise.resolve({ rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null }),
    getScreenShareSurface: () => null,
  };
`);
const servicesStub = dataModule(`${head}
  export function CallServicesHost() { return h("div", { "data-stub": "CallServicesHost" }); }
  export function CallCaptionsLine({ mode }) { return h("div", { "data-stub": "CallCaptionsLine", "data-mode": mode }); }
  export function CallTranscriptionToggle({ mode }) { return h("button", { type: "button", "aria-label": "转写", "data-stub": "CallTranscriptionToggle", "data-mode": mode }); }
  export function CallRecordingToggle({ mode }) { return h("button", { type: "button", "aria-label": "录制", "data-stub": "CallRecordingToggle", "data-mode": mode }); }
  export function CallServiceBadges({ mode }) { return h("div", { "data-stub": "CallServiceBadges", "data-mode": mode }); }
  export function useCaptions() { return { lines: [], hidden: S.captionsHidden, setHidden: (value) => { S.calls.push(["setHidden", value]); } }; }
`);
const diagnosticsStub = dataModule(`${head}
  export function NetworkBars({ level }) { return h("span", { role: "img", "aria-label": "网络 " + level, "data-stub": "NetworkBars", "data-level": String(level) }); }
  export function CallIssueButton() { return h("button", { type: "button", "aria-label": "通话问题", "data-stub": "CallIssueButton" }); }
  export function CallDiagnosticsHost() { return h("div", { "data-stub": "CallDiagnosticsHost" }); }
  export function CallTestMenuItem({ onSelect }) { return h("button", { type: "button", role: "menuitem", "data-stub": "CallTestMenuItem", onClick: () => onSelect && onSelect() }, "通话检测"); }
  export function useNetworkHealth() { return { level: S.ownLevel, quality: "good", sustainedPoor: false, suggestAudioOnly: false }; }
`);
const controlStub = dataModule(`${head}
  export function CallControlBanner() { return h("div", { "data-stub": "CallControlBanner" }); }
  export function CallControlLayer({ participantId, videoEl }) { return h("div", { "data-stub": "CallControlLayer", "data-participant": participantId, "data-has-video": videoEl ? "yes" : "no" }); }
  export function ControlRequestMenuItem({ participantId }) { return h("button", { type: "button", role: "menuitem", "data-stub": "ControlRequestMenuItem", "data-participant": participantId }, "请求控制电脑"); }
`);
const reportStub = dataModule(`${head}
  export function ReportDialog({ target, conversationId, onClose }) {
    return h("div", { role: "dialog", "data-stub": "ReportDialog", "data-target": JSON.stringify(target), "data-conversation": conversationId || "" },
      h("button", { type: "button", "data-report-close": "", onClick: () => onClose() }, "关闭"));
  }
`);
const uiStub = dataModule(`
  const tt = (value, vars) => value.replace(/\\{(\\w+)\\}/g, (m, key) => (vars && key in vars ? String(vars[key]) : m));
  export function useUI() { return tt; }
`);

const STUBS = {
  "../engine": engineStub,
  "../services": servicesStub,
  "../diagnostics": diagnosticsStub,
  "../control": controlStub,
  "../../report/ReportDialog": reportStub,
  "../../../../i18n/ui/useUI": uiStub,
};

const uiIndex = await import(await compileModule(`${UI_DIR}/index.ts`, STUBS));
const { CallHost, CallParticipantMenu } = uiIndex;
const uiState = await import(await compileModule(`${UI_DIR}/call-ui-state.ts`, STUBS));
const layout = await import(await compileModule(`${UI_DIR}/layout.ts`, STUBS));

const NAMES = { me: "我自己", p1: "张三", p2: "李四", p3: "王五", p4: "赵六", p5: "钱七", p6: "孙八", p7: "周九", p8: "吴十", p9: "郑一", p10: "冯二", p11: "陈三" };
function person(id, over = {}) {
  return {
    participantId: id, userId: `u-${id}`, displayName: NAMES[id] ?? id, avatarUrl: null, isMe: id === "me",
    mic: true, camera: false, screen: false, speaking: false, level: 0, network: 4, connection: "connected", locallyMuted: false,
    ...over,
  };
}
function snapshot(count = 6, over = {}) {
  const ids = ["me", ...Array.from({ length: count - 1 }, (_, i) => `p${i + 1}`)];
  return {
    phase: "connected", conversationId: "c-1", conversationTitle: "产品群", callId: "call-1",
    startedAt: new Date(Date.now() - 65_000).toISOString(),
    participants: ids.map((id) => person(id)), order: ids, visibleIds: ids.slice(0, 4), overflowCount: Math.max(0, ids.length - 4), screenSharerId: null,
    me: { mic: true, camera: false, screen: false, audioOnly: false, micDeviceId: null, cameraDeviceId: null, speakerDeviceId: null, network: 2 },
    aloneDeadline: null, issues: [], incoming: null, server: null, error: null, limits: { maxParticipants: 50, maxVideo: 25 },
    ...over,
  };
}
function sharing(count, sharerId, over = {}) {
  const base = snapshot(count, over);
  return { ...base, screenSharerId: sharerId, participants: base.participants.map((p) => (p.participantId === sharerId ? { ...p, screen: true } : p)) };
}

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];
async function setSnapshot(next) {
  await act(async () => {
    S.snapshot = next;
    for (const listener of [...S.listeners]) listener();
  });
}
async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}
async function click(element) {
  assert.ok(element, "要点的元素不存在");
  await act(async () => {
    element.click();
  });
  await flush();
}
async function key(target, name, extra = {}) {
  await act(async () => {
    target.dispatchEvent(new window.KeyboardEvent("keydown", { key: name, bubbles: true, cancelable: true, ...extra }));
  });
}
const calls = (name) => S.calls.filter((entry) => entry[0] === name);
const tileIds = (variant) => $$(`[data-call-tile="${variant}"]`).map((tile) => tile.getAttribute("data-participant-id"));
const accessibleName = (element) => (element.getAttribute("aria-label") || element.textContent || "").trim();

let mounted = null;
async function mount(next, element = React.createElement(CallHost)) {
  S.calls = [];
  S.snapshot = next;
  S.devices = { microphones: [], cameras: [], speakers: [] };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(element);
  });
  await flush();
  mounted = { root, container };
  return mounted;
}
async function unmount() {
  if (!mounted) return;
  const { root, container } = mounted;
  mounted = null;
  await act(async () => {
    root.unmount();
  });
  container.remove();
  uiState.closeCallStage();
  for (const node of [...document.body.children]) node.remove();
  document.body.removeAttribute("style");
  S.listeners.clear();
  S.narrow = false;
}
/** 从小窗点「放大」打开放大视图（和真人一样的路径）。 */
async function openStage() {
  await click($('[data-call-dock] [data-call-control="expand"]'));
  const stage = $("[data-call-stage]");
  assert.ok(stage, "点放大后应出现放大视图");
  return stage;
}

after(() => {
  window.close();
});

// =====================================================================================
// 纯函数
// =====================================================================================

test("纯函数：放大视图的顺序、宫格形状、分页、页大小、共享状态", () => {
  const snap = snapshot(5);
  assert.deepEqual(layout.stageOrder({ ...snap, order: ["me", "p2", "ghost", "p1"] }).map((p) => p.participantId), ["me", "p2", "p1", "p3", "p4"],
    "order 在前（名单外的去掉），漏掉的人补在后面");
  const shapes = [[1, false], [2, false], [3, false], [4, false], [5, false], [6, false], [7, false], [9, false], [12, false], [1, true], [2, true], [3, true], [4, true], [9, true]]
    .map(([n, narrow]) => `${n}${narrow ? "n" : ""}:${Object.values(layout.gridShape(n, narrow)).join("x")}`);
  assert.deepEqual(shapes, ["1:1x1", "2:2x1", "3:2x2", "4:2x2", "5:3x2", "6:3x2", "7:3x3", "9:3x3", "12:3x3", "1n:1x1", "2n:1x2", "3n:2x2", "4n:2x2", "9n:2x2"]);
  assert.equal(layout.STAGE_PAGE, 9);
  assert.equal(layout.STAGE_PAGE_NARROW, 4);
  assert.equal(layout.stagePageSize("grid", false), 9);
  assert.equal(layout.stagePageSize("grid", true), 4);
  assert.equal(layout.stagePageSize("share", false), layout.STAGE_RAIL_PAGE);
  assert.equal(layout.pageCount(12, 9), 2);
  assert.equal(layout.pageCount(0, 9), 1);
  assert.equal(layout.clampPage(5, 12, 9), 1);
  assert.equal(layout.clampPage(-1, 12, 9), 0);
  assert.deepEqual(layout.pageSlice([1, 2, 3, 4, 5], 1, 2), [3, 4]);
  assert.deepEqual(layout.pageSlice([1, 2, 3, 4, 5], 9, 2), [5], "越界落到最后一页");
  const other = layout.shareState(sharing(3, "p1"));
  assert.equal(other.other?.participantId, "p1");
  assert.equal(other.self, false);
  const self = layout.shareState({ ...snapshot(3), screenSharerId: "me", me: { ...snapshot(3).me, screen: true } });
  assert.equal(self.other, null, "自己共享不当成「别人在共享」");
  assert.equal(self.self, true);
});

// =====================================================================================
// 渲染
// =====================================================================================

test("放大：全窗口浮层（不是新页面）、role=dialog + aria-modal、焦点进来、页面滚动锁住、小窗收起", async () => {
  await mount(snapshot(3));
  try {
    const stage = await openStage();
    assert.equal(stage.getAttribute("role"), "dialog");
    assert.equal(stage.getAttribute("aria-modal"), "true");
    const title = document.getElementById(stage.getAttribute("aria-labelledby"));
    assert.match(title.textContent, /通话 · 产品群/);
    assert.equal(stage.style.zIndex, String(layout.CALL_STAGE_Z));
    assert.match(stage.className, /\bfixed\b/);
    assert.match(stage.className, /\binset-0\b/);
    assert.equal(document.activeElement, stage, "焦点进浮层");
    assert.equal(document.body.style.position, "fixed", "页面滚动锁住");
    assert.equal($("[data-call-dock]"), null, "同一时刻只画一个通话窗口");
    assert.equal(window.location.pathname, "/", "不跳页");
    assert.equal($('[data-call-own-network] [data-stub="NetworkBars"]', stage).getAttribute("data-level"), "4");
  } finally {
    await unmount();
  }
});

test("宫格：每页 9 格按 order 摆，可翻页，翻页即 setViewport；窄屏每页 4 格", async () => {
  await mount(snapshot(12));
  try {
    const stage = await openStage();
    assert.equal(stage.getAttribute("data-layout"), "grid");
    assert.deepEqual(tileIds("stage"), ["me", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]);
    assert.equal($("[data-call-grid]").getAttribute("data-call-grid"), "3x3");
    assert.equal($("[data-call-pager]").getAttribute("data-call-pager"), "1/2");
    assert.match($("[data-call-pager]").textContent, /第 1 \/ 2 页/);
    assert.deepEqual(calls("setViewport").at(-1), ["setViewport", "stage", ["me", "p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"]]);
    const [prev, next] = $$("[data-call-pager] button");
    assert.equal(prev.disabled, true);
    assert.equal(prev.getAttribute("aria-label"), "上一页");
    await click(next);
    assert.deepEqual(tileIds("stage"), ["p9", "p10", "p11"]);
    assert.equal($("[data-call-grid]").getAttribute("data-call-grid"), "2x2");
    assert.deepEqual(calls("setViewport").at(-1), ["setViewport", "stage", ["p9", "p10", "p11"]]);
    assert.equal($$("[data-call-pager] button")[1].disabled, true);
  } finally {
    await unmount();
  }
  S.narrow = true;
  await mount(snapshot(12));
  try {
    const stage = await openStage();
    assert.equal(stage.getAttribute("data-narrow"), "true");
    assert.deepEqual(tileIds("stage"), ["me", "p1", "p2", "p3"]);
    assert.equal($("[data-call-grid]").getAttribute("data-call-grid"), "2x2");
    assert.equal($("[data-call-pager]").getAttribute("data-call-pager"), "1/3");
    assert.equal($("[data-call-collapse]").getAttribute("aria-label"), "回到小窗", "窄屏只剩图标，仍有可读名");
  } finally {
    await unmount();
  }
});

test("每格：名字、静音、信号、说话亮框；说话不改变 DOM 顺序；自己那格没有菜单", async () => {
  const base = snapshot(4);
  await mount({ ...base, participants: base.participants.map((p) => (p.participantId === "p1" ? { ...p, mic: false, network: 2 } : p)) });
  try {
    await openStage();
    const p1 = $('[data-call-tile="stage"][data-participant-id="p1"]');
    assert.match(p1.textContent, /张三/);
    assert.equal(p1.getAttribute("data-mic"), "off");
    assert.equal($('[data-stub="NetworkBars"]', p1).getAttribute("data-level"), "2", "每格的信号用 p.network");
    assert.match($('[data-participant-id="me"]').textContent, /我自己（我）/);
    assert.equal($('[data-participant-id="me"] [data-call-tile-menu]'), null, "对自己不出菜单");
    assert.ok($('[data-participant-id="p2"] [data-call-tile-menu="p2"]'));
    const before = tileIds("stage");
    await setSnapshot({ ...base, participants: base.participants.map((p) => (p.participantId === "p3" ? { ...p, speaking: true } : p)) });
    assert.deepEqual(tileIds("stage"), before, "说话不改变 DOM 顺序");
    assert.ok($('[data-participant-id="p3"] [data-speaking-ring]'));
    assert.equal($$("[data-speaking-ring]").length, 1);
  } finally {
    await unmount();
  }
});

test("共享屏幕：共享画面占主位（attachVideo screen + W09 的 CallControlLayer），人像在侧栏；仅语音时不收画面", async () => {
  await mount(sharing(7, "p2"));
  try {
    const stage = await openStage();
    assert.equal(stage.getAttribute("data-layout"), "share");
    const main = $('[data-call-share="p2"]');
    assert.ok($('video[data-call-video="screen"]', main));
    assert.match(main.getAttribute("aria-label"), /李四 的屏幕/);
    const layer = $('[data-stub="CallControlLayer"]', main);
    assert.equal(layer.getAttribute("data-participant"), "p2");
    assert.equal(layer.getAttribute("data-has-video"), "yes", "控制层拿到了共享画面的 <video>");
    assert.ok(calls("attachVideo").some((entry) => entry[1] === "video" && entry[2] === "p2" && entry[3] === "screen"));
    assert.deepEqual(tileIds("rail"), ["me", "p1", "p2", "p3"], "侧栏每页 4 格");
    assert.deepEqual(calls("setViewport").at(-1), ["setViewport", "stage", ["me", "p1", "p2", "p3"]]);
    assert.equal($("[data-call-pager]").getAttribute("data-call-pager"), "1/2");
    assert.equal($("[data-call-grid]"), null);

    await setSnapshot({ ...sharing(7, "p2"), me: { ...snapshot(7).me, audioOnly: true } });
    assert.equal($('video[data-call-video="screen"]'), null, "仅语音：不收共享画面");
    assert.equal($('[data-stub="CallControlLayer"]'), null);
    const receive = [...$$("button", $("[data-call-share]"))].find((button) => button.textContent === "接收画面");
    await click(receive);
    assert.deepEqual(calls("setAudioOnly"), [["setAudioOnly", false]]);
  } finally {
    await unmount();
  }
});

test("自己共享：放大视图仍是宫格，只给「你正在共享屏幕 · 停止共享」，不把自己的屏幕再画一遍", async () => {
  await mount({ ...snapshot(3), screenSharerId: "me", me: { ...snapshot(3).me, screen: true } });
  try {
    const stage = await openStage();
    assert.equal(stage.getAttribute("data-layout"), "grid");
    assert.ok($("[data-call-self-share]", stage));
    assert.equal($('video[data-call-video="screen"]'), null);
  } finally {
    await unmount();
  }
});

test("参与者菜单：仅对我静音（setLocalMute）、W09 请求控制、举报（走现有举报对话框，对象是这个人）", async () => {
  await mount(snapshot(4));
  try {
    await openStage();
    const more = $('[data-call-tile-menu="p2"]');
    assert.equal(more.getAttribute("aria-label"), "李四 的更多操作");
    assert.equal(more.getAttribute("aria-haspopup"), "menu");
    await click(more);
    assert.equal(more.getAttribute("aria-expanded"), "true");
    const menu = $('[role="menu"][data-call-menu="李四 的更多操作"]');
    assert.ok(menu);
    const mute = $('[role="menuitemcheckbox"]', menu);
    assert.equal(mute.textContent, "仅对我静音");
    assert.equal(mute.getAttribute("aria-checked"), "false");
    assert.equal($('[data-stub="ControlRequestMenuItem"]', menu).getAttribute("data-participant"), "p2");
    const items = $$('[role^="menuitem"]', menu).map((item) => item.textContent);
    assert.deepEqual(items, ["仅对我静音", "请求控制电脑", "举报"], "没有移出、全员静音这类主持人项");
    await click(mute);
    assert.deepEqual(calls("setLocalMute"), [["setLocalMute", "p2", true]]);
    assert.equal(more.getAttribute("aria-expanded"), "false");

    await click(more);
    const report = $$('[role="menuitem"]', $('[data-call-menu="李四 的更多操作"]')).find((item) => item.textContent === "举报");
    await click(report);
    const dialog = $('[data-stub="ReportDialog"]');
    assert.ok(dialog, "举报走现有 ReportDialog");
    assert.deepEqual(JSON.parse(dialog.getAttribute("data-target")), { kind: "user", id: "u-p2", label: "李四" });
    assert.equal(dialog.getAttribute("data-conversation"), "c-1");
    assert.equal($('[data-call-menu="李四 的更多操作"]').hidden, true, "举报框出来时菜单收起");
    await click($("[data-report-close]"));
    assert.equal($('[data-stub="ReportDialog"]'), null);
    assert.equal(more.getAttribute("aria-expanded"), "false");
  } finally {
    await unmount();
  }
  const base = snapshot(3);
  await mount({ ...base, participants: base.participants.map((p) => (p.participantId === "p1" ? { ...p, locallyMuted: true } : p)) });
  try {
    await openStage();
    assert.match($('[data-participant-id="p1"]').textContent, /已对我静音/);
    await click($('[data-call-tile-menu="p1"]'));
    const mute = $('[role="menuitemcheckbox"]', $('[data-call-menu="张三 的更多操作"]'));
    assert.equal(mute.getAttribute("aria-checked"), "true");
    await click(mute);
    assert.deepEqual(calls("setLocalMute"), [["setLocalMute", "p1", false]]);
  } finally {
    await unmount();
  }
});

test("CallParticipantMenu 单独用（§3.9 导出）：不给锚点也能弹；对自己不渲染", async () => {
  await mount(snapshot(3), React.createElement(CallParticipantMenu, { participantId: "p1", open: true, onClose() {} }));
  try {
    const menu = $('[role="menu"][data-call-menu="张三 的更多操作"]');
    assert.ok(menu);
    assert.equal(menu.hidden, false);
  } finally {
    await unmount();
  }
  await mount(snapshot(3), React.createElement(CallParticipantMenu, { participantId: "me", open: true, onClose() {} }));
  try {
    assert.equal($('[role="menu"]'), null);
  } finally {
    await unmount();
  }
});

test("底部：同一组五个按钮（放大位变成「回到小窗」）+ 转写/录制开关；字幕两行模式；所有按钮有可读名", async () => {
  await mount(snapshot(3));
  try {
    const stage = await openStage();
    const group = $('[data-call-controls="stage"]', stage);
    assert.deepEqual($$("[data-call-control]", group).map((b) => b.getAttribute("data-call-control")), ["mic", "camera", "screen", "expand", "leave"]);
    assert.equal($('[data-call-control="expand"]', group).getAttribute("aria-label"), "回到小窗");
    assert.match($('[data-call-control="leave"]', group).textContent, /离开通话/);
    const toggles = $("[data-call-service-toggles]", stage);
    assert.equal($('[data-stub="CallTranscriptionToggle"]', toggles).getAttribute("data-mode"), "stage");
    assert.equal($('[data-stub="CallRecordingToggle"]', toggles).getAttribute("data-mode"), "stage");
    assert.equal($('[data-stub="CallCaptionsLine"]', stage).getAttribute("data-mode"), "stage");
    assert.equal($('[data-stub="CallServiceBadges"]', stage).getAttribute("data-mode"), "stage");
    assert.ok($('[data-stub="CallControlBanner"]', stage));
    assert.ok($('[data-stub="CallIssueButton"]', stage));
    for (const button of $$("button", stage)) assert.ok(accessibleName(button), `按钮要有可读名：${button.outerHTML.slice(0, 80)}`);
  } finally {
    await unmount();
  }
});

test("Esc 与「回到小窗」回到小窗，焦点落回「放大」按钮；Tab 在浮层里转圈", async () => {
  await mount(snapshot(3));
  try {
    let stage = await openStage();
    const focusables = $$("button:not([disabled])", stage);
    const first = focusables[0];
    const last = focusables.at(-1);
    last.focus();
    await key(last, "Tab");
    assert.equal(document.activeElement, first, "最后一个按 Tab 回到第一个");
    await key(first, "Tab", { shiftKey: true });
    assert.equal(document.activeElement, last, "第一个按 Shift+Tab 到最后一个");

    await key(stage, "Escape");
    assert.equal($("[data-call-stage]"), null, "Esc 缩小");
    const expand = $('[data-call-dock] [data-call-control="expand"]');
    assert.equal(document.activeElement, expand, "焦点回到「放大」");
    assert.equal(document.body.style.position, "", "页面滚动解锁");

    stage = await openStage();
    await click($("[data-call-collapse]", stage));
    assert.equal($("[data-call-stage]"), null, "「回到小窗」按钮");
    assert.equal(document.activeElement, $('[data-call-dock] [data-call-control="expand"]'));
  } finally {
    await unmount();
  }
});

test("Esc 落在 portal 出去的菜单里时只关菜单，不收起放大视图", async () => {
  await mount(snapshot(3));
  try {
    await openStage();
    const more = $('[data-call-tile-menu="p1"]');
    await click(more);
    const item = $('[role="menuitemcheckbox"]', $('[data-call-menu="张三 的更多操作"]'));
    assert.equal(document.activeElement, item, "菜单打开焦点进第一项");
    await key(item, "Escape");
    assert.ok($("[data-call-stage]"), "放大视图还在");
    assert.equal(more.getAttribute("aria-expanded"), "false", "菜单关了");
  } finally {
    await unmount();
  }
});

test("通话结束时放大视图自己收起，小窗显示「通话已结束」；A-10 焦点事件在放大视图开着时把焦点给放大视图", async () => {
  await mount(snapshot(3));
  try {
    const stage = await openStage();
    $('[data-call-control="mic"]', stage).focus();
    await act(async () => {
      window.dispatchEvent(new window.CustomEvent("oceanleo:call-dock-focus"));
    });
    assert.equal(document.activeElement, stage);
    await setSnapshot(snapshot(3, { phase: "ended" }));
    assert.equal($("[data-call-stage]"), null);
    assert.equal($('[data-call-status="ended"]').textContent, "通话已结束");
    assert.equal(uiState.callUiStore.getSnapshot().stageOpen, false, "下一通从小窗开始");
  } finally {
    await unmount();
  }
});

// =====================================================================================
// 旧弹窗移除（A20）
// =====================================================================================

function sourceFilesUnder(dir) {
  const out = [];
  for (const name of readdirSync(join(REPO, dir))) {
    const path = join(dir, name);
    if (statSync(join(REPO, path)).isDirectory()) out.push(...sourceFilesUnder(path));
    else if (/\.(ts|tsx)$/.test(name)) out.push(path);
  }
  return out;
}

test("A20：旧「会话会议」弹窗 MeetingPanel.tsx 已删除，src/shell/messages 里不再引用它", () => {
  assert.equal(existsSync(join(REPO, "src/shell/messages/meeting/MeetingPanel.tsx")), false, "旧 MeetingPanel 不存在");
  const offenders = sourceFilesUnder("src/shell/messages").filter((file) =>
    /\bMeetingPanel\b/.test(stripJsComments(readFileSync(join(REPO, file), "utf8"))),
  );
  assert.deepEqual(offenders, []);
});
