// W07 判据：通话小窗（合同 §1 A4/A9、A14 的入口位置、A17 的用字、§3.9 的挂载关系；任务书 P1/P3/P6）。
// 源码级断言 + jsdom 真渲染 CallHost：按钮恰好五个、说话只亮框不改 DOM 顺序、+N、自己的信号、
// 设备菜单、独处倒计时、正在重连、共享提示、窄屏底部条、结束/出错可关、A-10 焦点事件、拖角记忆；
// 以及 call/ui 用到的每个 Tailwind 工具类都已在 src/theme/ui.css（产物同步闸判 HEAD，W07 不改 ui.css）。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/call-ui-dock.test.mjs
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
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
  KeyboardEvent: window.KeyboardEvent, localStorage: window.localStorage,
})) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
// 窄屏由 matchMedia 判；测试里按 S.narrow 回答。
window.matchMedia = (query) => ({ matches: Boolean(globalThis.__CALL?.narrow), media: query, addEventListener() {}, removeEventListener() {} });
const { createRoot } = await import("react-dom/client");

// ---- 共享状态：引擎快照、动作记录、设备表、自己的信号 ----
const S = (globalThis.__CALL = {
  snapshot: null,
  listeners: new Set(),
  calls: [],
  devices: null,
  ownLevel: 4,
  captionsHidden: false,
  narrow: false,
});

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
  export function CallTestMenuItem({ onSelect }) {
    return h("button", { type: "button", role: "menuitem", "data-stub": "CallTestMenuItem", onClick: () => { S.calls.push(["openCallTest"]); onSelect && onSelect(); } }, "通话检测");
  }
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

// 恒等 tt：断言直接读中文原文；{x} 插值与真 useUI 一致。
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

const { CallHost } = await import(await compileModule(`${UI_DIR}/CallHost.tsx`, STUBS));
const uiState = await import(await compileModule(`${UI_DIR}/call-ui-state.ts`, STUBS));
const layout = await import(await compileModule(`${UI_DIR}/layout.ts`, STUBS));

// ---- 快照工厂 ----
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
  const participants = ids.map((id) => person(id));
  return {
    phase: "connected", conversationId: "c-1", conversationTitle: "产品群", callId: "call-1",
    startedAt: new Date(Date.now() - 65_000).toISOString(),
    participants, order: ids, visibleIds: ids.slice(0, 4), overflowCount: Math.max(0, ids.length - 4), screenSharerId: null,
    me: { mic: true, camera: false, screen: false, audioOnly: false, micDeviceId: null, cameraDeviceId: null, speakerDeviceId: null, network: 2 },
    aloneDeadline: null, issues: [], incoming: null, server: null, error: null, limits: { maxParticipants: 50, maxVideo: 25 },
    ...over,
  };
}
const IDLE = snapshot(1, { phase: "idle", conversationId: null, conversationTitle: null, callId: null, startedAt: null, participants: [], order: [], visibleIds: [], overflowCount: 0 });

// ---- DOM 小工具 ----
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
function calls(name) {
  return S.calls.filter((entry) => entry[0] === name);
}
function accessibleName(element) {
  return (element.getAttribute("aria-label") || element.textContent || "").trim();
}

let mounted = null;
async function mount(next) {
  S.calls = [];
  S.snapshot = next;
  S.devices = {
    microphones: [{ deviceId: "default", label: "默认 - 内置麦克风" }, { deviceId: "mic-2", label: "USB 麦克风" }],
    cameras: [{ deviceId: "cam-1", label: "FaceTime 摄像头" }],
    speakers: [{ deviceId: "default", label: "默认扬声器" }, { deviceId: "spk-2", label: "耳机" }],
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(CallHost));
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
  S.listeners.clear();
  S.narrow = false;
  S.captionsHidden = false;
}

after(() => {
  window.close();
});

// =====================================================================================
// 纯函数
// =====================================================================================

test("纯函数：小窗格子按 visibleIds 原样摆、最多 4 格、+N 按实际摆出来的算；visibleIds 缺省时退回 order", () => {
  const snap = snapshot(7);
  const swapped = { ...snap, visibleIds: ["me", "p1", "p5", "p3", "p2"] };
  const dock = layout.dockTiles(swapped);
  assert.deepEqual(dock.tiles.map((tile) => tile.participantId), ["me", "p1", "p5", "p3"], "原样按引擎给的槽位，截到 4 格");
  assert.equal(dock.overflow, 3);
  const unknown = layout.dockTiles({ ...snap, visibleIds: ["ghost", "p2", "p2"] });
  assert.deepEqual(unknown.tiles.map((tile) => tile.participantId), ["p2"], "名单外的 id 与重复的 id 去掉");
  const fallback = layout.dockTiles({ ...snap, visibleIds: [] });
  assert.deepEqual(fallback.tiles.map((tile) => tile.participantId), ["me", "p1", "p2", "p3"]);
  assert.equal(layout.DOCK_TILES, 4);
});

test("纯函数：时长、独处倒计时、角落吸附、侧栏让位", () => {
  const now = Date.parse("2026-10-23T10:00:00Z");
  assert.equal(layout.formatCallDuration(new Date(now - 65_000).toISOString(), now), "1:05");
  assert.equal(layout.formatCallDuration(new Date(now - 3_725_000).toISOString(), now), "1:02:05");
  assert.equal(layout.formatCallDuration(null, now), "");
  assert.equal(layout.formatCallDuration("not-a-date", now), "");
  assert.equal(layout.aloneSecondsLeft(now + 30_000, now), 30);
  assert.equal(layout.aloneSecondsLeft(now + 29_001, now), 30, "向上取整");
  assert.equal(layout.aloneSecondsLeft(now - 1, now), 0);
  assert.equal(layout.aloneSecondsLeft(null, now), null);
  assert.equal(layout.aloneProgress(30), 50);
  assert.equal(layout.nearestCorner(10, 10, { width: 1000, height: 800 }), "top-left");
  assert.equal(layout.nearestCorner(900, 700, { width: 1000, height: 800 }), "bottom-right");
  assert.equal(layout.DEFAULT_DOCK_CORNER, "bottom-left", "操作员定：左下角");
  assert.deepEqual(layout.dockPlacement("bottom-left", { left: 256, right: 0 }), { bottom: 16, left: 272 });
  assert.deepEqual(layout.dockPlacement("top-right", { left: 256, right: 0 }), { top: 16, right: 16 });
  assert.deepEqual(layout.insetsFromSidebarRect({ left: 0, right: 256, width: 256 }, 1440), { left: 256, right: 0 });
  assert.deepEqual(layout.insetsFromSidebarRect({ left: 1384, right: 1440, width: 56 }, 1440), { left: 0, right: 56 }, "RTL 侧栏在右");
  assert.deepEqual(layout.insetsFromSidebarRect(null, 1440), { left: 0, right: 0 });
  assert.ok(layout.CALL_DOCK_Z > 1000 && layout.CALL_DOCK_Z < layout.CALL_STAGE_Z && layout.CALL_STAGE_Z < layout.CALL_MENU_Z && layout.CALL_MENU_Z < 1200,
    "层级：共用 Modal 1000 < 小窗 < 放大视图 < 菜单 < 举报框 1200");
});

// =====================================================================================
// 渲染
// =====================================================================================

test("idle：只挂 W14 的 CallDiagnosticsHost（仲裁 A-7），不画小窗、不挂字幕服务", async () => {
  await mount(IDLE);
  try {
    assert.ok($('[data-stub="CallDiagnosticsHost"]'), "idle 也要挂诊断宿主");
    assert.equal($("[data-call-dock]"), null);
    assert.equal($("[data-call-stage]"), null);
    assert.equal($('[data-stub="CallServicesHost"]'), null);
  } finally {
    await unmount();
  }
});

test("小窗：左下角、跨页面常驻的宿主；会话名、时长、自己的信号（useNetworkHealth）、4 格 + 「+2」、W06/W09/W14 的组件都挂上", async () => {
  await mount(snapshot(6));
  try {
    const dock = $("[data-call-dock]");
    assert.ok(dock, "通话中要有小窗");
    assert.equal(dock.getAttribute("data-corner"), "bottom-left");
    assert.equal(dock.style.left, "16px");
    assert.equal(dock.style.bottom, "16px");
    assert.equal(dock.style.width, "320px");
    assert.equal(dock.style.zIndex, String(layout.CALL_DOCK_Z));
    assert.match(dock.getAttribute("aria-label"), /产品群/);
    assert.match(dock.textContent, /产品群/);
    assert.match($("[data-call-duration]", dock).textContent, /通话时长\s*\d+:\d{2}$/);
    assert.equal($('[data-call-own-network] [data-stub="NetworkBars"]', dock).getAttribute("data-level"), "4",
      "自己的信号用 useNetworkHealth().level（A-7），不是 me.network");

    const tiles = $$('[data-call-tile="dock"]', dock);
    assert.deepEqual(tiles.map((tile) => tile.getAttribute("data-participant-id")), ["me", "p1", "p2", "p3"]);
    const overflow = $("[data-call-overflow]", dock);
    assert.equal(overflow.textContent, "+2");
    assert.equal(overflow.getAttribute("aria-label"), "还有 2 人，放大查看");

    for (const stub of ["CallServicesHost", "CallDiagnosticsHost"]) assert.ok($(`[data-stub="${stub}"]`), `${stub} 要挂`);
    for (const stub of ["CallServiceBadges", "CallCaptionsLine"]) assert.equal($(`[data-stub="${stub}"]`, dock).getAttribute("data-mode"), "dock");
    for (const stub of ["CallIssueButton", "CallControlBanner"]) assert.ok($(`[data-stub="${stub}"]`, dock), `${stub} 在小窗里`);
    assert.equal($('[data-stub="CallTranscriptionToggle"]'), null, "小窗里只有五个按钮，转写/录制开关只在放大视图");

    assert.deepEqual(calls("setViewport").at(-1), ["setViewport", "dock", ["me", "p1", "p2", "p3"]], "告诉引擎小窗看得见谁");
  } finally {
    await unmount();
  }
});

test("五个按钮：恰好五个（麦克风、摄像头、共享屏幕、放大、离开），麦克风与摄像头各带设备小箭头，全都有可读名", async () => {
  await mount(snapshot(3));
  try {
    const group = $('[data-call-controls="dock"]');
    assert.equal(group.getAttribute("role"), "group");
    const controls = $$("[data-call-control]", group);
    assert.deepEqual(controls.map((button) => button.getAttribute("data-call-control")), ["mic", "camera", "screen", "expand", "leave"]);
    assert.deepEqual($$("[data-call-caret]", group).map((button) => button.getAttribute("data-call-caret")), ["mic", "camera"]);
    for (const caret of $$("[data-call-caret]", group)) assert.equal(caret.getAttribute("aria-haspopup"), "menu");
    assert.equal($('[data-call-control="leave"]').getAttribute("aria-label"), "离开通话");
    assert.match($('[data-call-control="leave"]').className, /bg-red-600/, "离开是红的");
    assert.equal($('[data-call-control="expand"]').getAttribute("aria-label"), "放大");
    for (const button of $$("button", $("[data-call-dock]"))) assert.ok(accessibleName(button), `按钮要有可读名：${button.outerHTML.slice(0, 80)}`);
  } finally {
    await unmount();
  }
});

test("按钮动作：开关麦克风/摄像头/共享屏幕、离开；浏览器不支持共享屏幕时按钮不可点并说明", async () => {
  await mount(snapshot(3));
  try {
    const screen = $('[data-call-control="screen"]');
    assert.equal(screen.disabled, true, "jsdom 没有 getDisplayMedia");
    assert.equal(screen.getAttribute("aria-label"), "共享屏幕（此浏览器不支持）");
    await click($('[data-call-control="mic"]'));
    await click($('[data-call-control="camera"]'));
    await click($('[data-call-control="leave"]'));
    assert.deepEqual(calls("setMic"), [["setMic", false]]);
    assert.deepEqual(calls("setCamera"), [["setCamera", true]]);
    assert.deepEqual(calls("leave"), [["leave"]]);
  } finally {
    await unmount();
  }
  Object.defineProperty(window.navigator, "mediaDevices", { configurable: true, value: { getDisplayMedia() {} } });
  try {
    await mount(snapshot(3, { me: { ...snapshot(3).me, mic: false } }));
    const mic = $('[data-call-control="mic"]');
    assert.equal(mic.getAttribute("aria-label"), "打开麦克风");
    assert.equal(mic.getAttribute("data-on"), "false");
    const screen = $('[data-call-control="screen"]');
    assert.equal(screen.disabled, false);
    assert.equal(screen.getAttribute("aria-label"), "共享屏幕");
    await click(screen);
    assert.deepEqual(calls("setScreenShare"), [["setScreenShare", true]]);
  } finally {
    await unmount();
    delete window.navigator.mediaDevices;
  }
});

test("说话只亮框不重排：同一组 visibleIds 下有人说话，DOM 顺序不变，只有那一格出亮框；换位时照引擎的槽位摆", async () => {
  const base = snapshot(6);
  await mount(base);
  try {
    const order = () => $$('[data-call-tile="dock"]').map((tile) => tile.getAttribute("data-participant-id"));
    const before = order();
    const speaking = base.participants.map((p) => (p.participantId === "p2" ? { ...p, speaking: true, level: 0.8 } : p));
    await setSnapshot({ ...base, participants: speaking });
    assert.deepEqual(order(), before, "说话不改变 DOM 顺序");
    const lit = $$('[data-call-tile="dock"]').filter((tile) => tile.getAttribute("data-speaking") === "true");
    assert.deepEqual(lit.map((tile) => tile.getAttribute("data-participant-id")), ["p2"]);
    assert.ok($('[data-participant-id="p2"] [data-speaking-ring]'), "亮框");
    assert.equal($$("[data-speaking-ring]").length, 1);
    // 引擎按换位规则把 p5 换进 p3 的槽位：界面照摆，其它格不动。
    await setSnapshot({ ...base, participants: speaking, visibleIds: ["me", "p1", "p2", "p5"] });
    assert.deepEqual(order(), ["me", "p1", "p2", "p5"]);
  } finally {
    await unmount();
  }
});

test("格子：静音有标记、开了摄像头的格子绑 <video>（attachVideo），仅语音时别人的画面不画、自己的预览照常", async () => {
  const base = snapshot(4);
  const participants = base.participants.map((p) =>
    p.participantId === "p1" ? { ...p, mic: false } : p.participantId === "p2" ? { ...p, camera: true } : p.isMe ? { ...p, camera: true } : p,
  );
  await mount({ ...base, participants, me: { ...base.me, camera: true } });
  try {
    const muted = $('[data-participant-id="p1"]');
    assert.equal(muted.getAttribute("data-mic"), "off");
    assert.ok($("svg", muted), "静音图标");
    assert.match(muted.textContent, /张三，已静音/);
    assert.ok($('[data-participant-id="p2"] video[data-call-video="camera"]'));
    assert.ok($('[data-participant-id="me"] video[data-call-video="camera"]'));
    assert.deepEqual(
      calls("attachVideo").filter((entry) => entry[1] === "video").map((entry) => entry.slice(2)).sort(),
      [["me", "camera"], ["p2", "camera"]],
    );
    await setSnapshot({ ...base, participants, me: { ...base.me, camera: true, audioOnly: true } });
    assert.equal($('[data-participant-id="p2"] video'), null, "仅语音：不画别人的画面");
    assert.ok($('[data-participant-id="me"] video'), "自己的预览照常");
    assert.ok(calls("attachVideo").some((entry) => entry[1] === null && entry[2] === "p2"), "卸掉的格子解绑");
  } finally {
    await unmount();
  }
});

test("麦克风菜单：选麦克风/扬声器、显示字幕开关、通话检测（W14，onSelect 关菜单）；摄像头菜单：选摄像头、仅语音", async () => {
  await mount(snapshot(3));
  try {
    const caret = $('[data-call-caret="mic"]');
    await click(caret);
    assert.equal(caret.getAttribute("aria-expanded"), "true");
    assert.equal(calls("listDevices").length, 1, "菜单打开时才枚举设备");
    const menu = $('[role="menu"][data-call-menu="麦克风设置"]');
    assert.ok(menu, "菜单 portal 到 body");
    assert.equal(menu.style.zIndex, String(layout.CALL_MENU_Z));
    const radios = $$('[role="menuitemradio"]', menu);
    assert.deepEqual(radios.map((item) => item.textContent), ["默认 - 内置麦克风", "USB 麦克风", "默认扬声器", "耳机"]);
    assert.deepEqual(radios.map((item) => item.getAttribute("aria-checked")), ["true", "false", "true", "false"], "没选过时「默认」算选中");
    assert.deepEqual($$('[role="group"]', menu).map((group) => group.getAttribute("aria-label")), ["麦克风", "扬声器"]);
    const captions = $('[role="menuitemcheckbox"]', menu);
    assert.equal(captions.textContent, "显示字幕");
    assert.equal(captions.getAttribute("aria-checked"), "true");
    assert.ok($('[data-stub="CallTestMenuItem"]', menu), "通话检测在麦克风菜单里");

    await click(radios[1]);
    assert.deepEqual(calls("selectDevice"), [["selectDevice", "mic", "mic-2"]]);
    assert.equal(caret.getAttribute("aria-expanded"), "false", "选完关菜单");
    assert.equal(document.activeElement, caret, "焦点回到小箭头");

    await click(caret);
    await click($('[role="menuitemradio"]:last-of-type', $('[role="group"][aria-label="扬声器"]')));
    assert.deepEqual(calls("selectDevice").at(-1), ["selectDevice", "speaker", "spk-2"]);

    await click(caret);
    await click($('[role="menuitemcheckbox"]', $('[data-call-menu="麦克风设置"]')));
    assert.deepEqual(calls("setHidden"), [["setHidden", true]]);

    await click(caret);
    await click($('[data-stub="CallTestMenuItem"]'));
    assert.equal(calls("openCallTest").length, 1);
    assert.equal(caret.getAttribute("aria-expanded"), "false", "通话检测 onSelect 关菜单");

    const cameraCaret = $('[data-call-caret="camera"]');
    await click(cameraCaret);
    const cameraMenu = $('[role="menu"][data-call-menu="摄像头设置"]');
    assert.deepEqual($$('[role="menuitemradio"]', cameraMenu).map((item) => item.textContent), ["FaceTime 摄像头"]);
    const audioOnly = $('[role="menuitemcheckbox"]', cameraMenu);
    assert.equal(audioOnly.textContent, "仅语音（不接收画面）");
    assert.equal(audioOnly.getAttribute("aria-checked"), "false");
    await click(audioOnly);
    assert.deepEqual(calls("setAudioOnly"), [["setAudioOnly", true]]);
  } finally {
    await unmount();
  }
});

test("菜单键盘：打开后焦点在第一项，上下键在单选与开关项之间走，Esc 关菜单并把焦点还给小箭头", async () => {
  await mount(snapshot(3));
  try {
    const caret = $('[data-call-caret="mic"]');
    await click(caret);
    await click(caret); // 第二次打开时设备表已在，初始焦点直接落在第一项
    await click(caret);
    const menu = $('[data-call-menu="麦克风设置"]');
    const items = $$('[role^="menuitem"]', menu);
    assert.equal(document.activeElement, items[0]);
    const press = async (key) => {
      await act(async () => {
        document.activeElement.dispatchEvent(new window.KeyboardEvent("keydown", { key, bubbles: true }));
      });
    };
    await press("ArrowDown");
    assert.equal(document.activeElement, items[1]);
    await press("End");
    assert.equal(document.activeElement, items.at(-1));
    await press("ArrowDown");
    assert.equal(document.activeElement, items[0], "到底回到第一项");
    await press("Escape");
    assert.equal(caret.getAttribute("aria-expanded"), "false");
    assert.equal(document.activeElement, caret);
  } finally {
    await unmount();
  }
});

test("独处倒计时条：显示剩余秒数与进度，「继续通话」= cancelAloneTimer", async () => {
  await mount(snapshot(1, { aloneDeadline: Date.now() + 30_000 }));
  try {
    const bar = $("[data-call-alone]");
    assert.ok(bar);
    assert.match(bar.textContent, /只剩你一个人，(30|29) 秒后自动离开/);
    assert.match(bar.textContent, /通话即将自动结束/, "读屏只播一次整句");
    await click($("[data-call-alone-cancel]"));
    assert.deepEqual(calls("cancelAloneTimer"), [["cancelAloneTimer"]]);
  } finally {
    await unmount();
  }
});

test("正在连接 / 正在重连 有状态行（role=status），按钮照常可用", async () => {
  await mount(snapshot(3, { phase: "reconnecting" }));
  try {
    const status = $('[data-call-status="reconnecting"]');
    assert.equal(status.getAttribute("role"), "status");
    assert.equal(status.textContent, "正在重连…");
    assert.equal($$("[data-call-control]").length, 5);
    await setSnapshot(snapshot(3, { phase: "joining" }));
    assert.equal($('[data-call-status="joining"]').textContent, "正在连接…");
  } finally {
    await unmount();
  }
});

test("共享屏幕提示：别人共享 →「XX 在共享屏幕 · 查看」，点查看打开放大视图；自己共享 →「你正在共享屏幕 · 停止共享」", async () => {
  const base = snapshot(4);
  await mount({ ...base, screenSharerId: "p2", participants: base.participants.map((p) => (p.participantId === "p2" ? { ...p, screen: true } : p)) });
  try {
    const notice = $("[data-call-share-notice]");
    assert.match(notice.textContent, /李四 在共享屏幕 · 查看/);
    assert.equal($('video[data-call-video="screen"]'), null, "小窗不画共享画面");
    await click($("button", notice));
    assert.ok($("[data-call-stage]"), "查看 = 放大");
    assert.equal($("[data-call-dock]"), null, "小窗与放大视图不同时存在");
  } finally {
    await unmount();
  }
  await mount({ ...base, me: { ...base.me, screen: true }, screenSharerId: "me" });
  try {
    const self = $("[data-call-self-share]");
    assert.match(self.textContent, /你正在共享屏幕/);
    assert.equal($("[data-call-share-notice]"), null);
    await click($("button", self));
    assert.deepEqual(calls("setScreenShare"), [["setScreenShare", false]]);
  } finally {
    await unmount();
  }
});

test("窄屏（手机浏览器）：小窗变成贴底的一条，五个按钮不变", async () => {
  S.narrow = true;
  await mount(snapshot(6));
  try {
    const dock = $("[data-call-dock]");
    assert.equal(dock.getAttribute("data-narrow"), "true");
    assert.equal(dock.getAttribute("data-corner"), "bottom");
    assert.equal(dock.style.left, "0px");
    assert.equal(dock.style.right, "0px");
    assert.equal(dock.style.bottom, "0px");
    assert.equal(dock.style.width, "", "贴满宽");
    assert.equal($$("[data-call-control]", dock).length, 5);
  } finally {
    await unmount();
  }
});

test("让开固定侧栏：AppShell 侧栏展开 256px 时，小窗贴在侧栏右边", async () => {
  const aside = document.createElement("aside");
  aside.setAttribute("data-oceanleo-sidebar-mode", "expanded");
  aside.getBoundingClientRect = () => ({ left: 0, right: 256, width: 256, top: 0, bottom: 800, height: 800, x: 0, y: 0 });
  document.body.append(aside);
  await mount(snapshot(2));
  try {
    assert.equal($("[data-call-dock]").style.left, "272px");
  } finally {
    await unmount();
  }
});

test("已结束：说明 + 关闭键，关掉就收起；出错：按错误码给人话，换一个错误小窗重新出现", async () => {
  await mount(snapshot(2, { phase: "ended" }));
  try {
    assert.equal($('[data-call-status="ended"]').textContent, "通话已结束");
    assert.equal($$("[data-call-control]").length, 0, "结束后不再给五个按钮");
    await click($("[data-call-dismiss]"));
    assert.equal($("[data-call-dock]"), null);
    await setSnapshot(snapshot(2, { phase: "error", callId: null, error: { code: "call_full", message: "full" } }));
    assert.equal($('[data-call-status="error"]').textContent, "通话人数已满（最多 50 人）。");
    await click($("[data-call-dismiss]"));
    assert.equal($("[data-call-dock]"), null);
    await setSnapshot(snapshot(2, { phase: "error", callId: null, error: { code: "removed_from_conversation", message: "x" } }));
    assert.equal($('[data-call-status="error"]').textContent, "你已不在这个会话里，通话已断开。");
    await setSnapshot(snapshot(2, { phase: "error", callId: null, error: { code: "something_new", message: "服务端原话" } }));
    assert.equal($('[data-call-status="error"]').textContent, "服务端原话", "认不得的码用引擎原话兜底");
  } finally {
    await unmount();
  }
});

test("仲裁 A-10：window 事件 oceanleo:call-dock-focus → 焦点给小窗并亮一下", async () => {
  const { CALL_DOCK_FOCUS_EVENT } = await import(pathToFileURL(join(REPO, "src/shell/messages/call/chat/call-entry.ts")).href);
  assert.equal(CALL_DOCK_FOCUS_EVENT, "oceanleo:call-dock-focus");
  await mount(snapshot(3));
  try {
    await act(async () => {
      window.dispatchEvent(new window.CustomEvent(CALL_DOCK_FOCUS_EVENT));
    });
    const dock = $("[data-call-dock]");
    assert.equal(document.activeElement, dock);
    assert.match(dock.style.boxShadow, /#38bdf8/);
  } finally {
    await unmount();
  }
});

test("拖到别的角：松手吸到最近的角并记在本机", async () => {
  await mount(snapshot(2));
  try {
    const handle = $("[data-call-dock-handle]");
    const pointer = (type, x, y) => {
      const event = new window.MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 });
      Object.defineProperty(event, "pointerId", { value: 7 });
      Object.defineProperty(event, "pointerType", { value: "mouse" });
      return event;
    };
    await act(async () => {
      handle.dispatchEvent(pointer("pointerdown", 100, 700));
    });
    await act(async () => {
      handle.dispatchEvent(pointer("pointermove", 60, 120));
    });
    // jsdom 里小窗的矩形是 0,0 → 中心落在左上象限。
    await act(async () => {
      handle.dispatchEvent(pointer("pointerup", 60, 120));
    });
    const dock = $("[data-call-dock]");
    assert.equal(dock.getAttribute("data-corner"), "top-left");
    assert.equal(dock.style.top, "16px");
    assert.equal(window.localStorage.getItem(uiState.DOCK_CORNER_STORAGE_KEY), "top-left");
  } finally {
    uiState.setDockCorner("bottom-left");
    await unmount();
  }
});

// =====================================================================================
// 源码级
// =====================================================================================

const uiFiles = readdirSync(join(REPO, UI_DIR)).filter((name) => /\.(ts|tsx)$/.test(name)).map((name) => join(UI_DIR, name));

test("源码：不新增 dangerouslySetInnerHTML / innerHTML / eval / new Function / postMessage；不出现余额与计费字样", () => {
  for (const file of uiFiles) {
    const source = readFileSync(join(REPO, file), "utf8");
    for (const banned of ["dangerouslySetInnerHTML", "innerHTML", "eval(", "new Function", "postMessage"]) {
      assert.equal(source.includes(banned), false, `${file} 不许出现 ${banned}`);
    }
    for (const word of ["余额", "计费", "费用", "balance", "billing"]) {
      assert.equal(source.includes(word), false, `${file} 界面不出现余额与计费（A18）：${word}`);
    }
  }
});

test("源码：名字叫「通话」、图标是耳机；没有主持人入口（结束会议 / 移出 / 邀请）、没有检查麦克风", () => {
  // 只看代码与界面字面量：注释里写「没有主持人」是在说明规则，不是入口。
  const code = uiFiles.map((file) => stripJsComments(readFileSync(join(REPO, file), "utf8"))).join("\n");
  assert.match(code, /export function IconHeadphones/);
  assert.match(readFileSync(join(REPO, UI_DIR, "CallDock.tsx"), "utf8"), /<IconHeadphones/);
  assert.match(readFileSync(join(REPO, UI_DIR, "CallStage.tsx"), "utf8"), /<IconHeadphones/);
  for (const gone of ["结束会议", "主持人", "邀请", "检查麦克风", "会话会议", "移出"]) {
    assert.equal(code.includes(gone), false, `call/ui 的代码与文案不该出现「${gone}」`);
  }
});

test("产物同步：call/ui 用到的每个 Tailwind 工具类都已在 src/theme/ui.css（用 Tailwind 自己的扫描器与设计系统判定）", async () => {
  const repoRequire = createRequire(join(REPO, "package.json"));
  const oxide = createRequire(repoRequire.resolve("@tailwindcss/cli/package.json"))("@tailwindcss/oxide");
  const tailwind = repoRequire("tailwindcss");
  const scanner = new oxide.Scanner({});
  const candidates = scanner.scanFiles(uiFiles.map((file) => ({ content: readFileSync(join(REPO, file), "utf8"), extension: file.split(".").pop() })));
  assert.ok(candidates.length > 100, `扫描器应当认出几百个候选，实际 ${candidates.length}`);
  const design = await tailwind.__unstable__loadDesignSystem(readFileSync(repoRequire.resolve("tailwindcss/index.css"), "utf8"), { base: REPO });
  const css = design.candidatesToCss(candidates);
  const utilities = candidates.filter((_, index) => css[index]);
  assert.ok(utilities.length > 50, `有效工具类应有几十上百个，实际 ${utilities.length}`);
  const built = readFileSync(join(REPO, "src/theme/ui.css"), "utf8");
  const present = new Set([...built.matchAll(/\.((?:\\.|[A-Za-z0-9_-])+)/g)].map((match) => match[1].replace(/\\(.)/g, "$1")));
  const missing = utilities.filter((name) => !present.has(name)).sort();
  assert.deepEqual(missing, [], "这些类不在 ui.css 里：改用已有的类或行内 style（ui.css 不是 W07 的独占面）");
});
