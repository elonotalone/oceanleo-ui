// W14 · 网络检测与通话检测的界面判据：
//   ① NetworkBars：五格、0 = 灰色问号、可读名（读屏与悬停）；
//   ② 「通话检测」面板在真 DOM（jsdom）里：麦克风音量条用独立 getUserMedia 开**选中的**设备、换设备即重开并写回引擎；
//      扬声器试音走选中的输出设备（不支持 setSinkId 时如实说明）；摄像头预览；连接测试（test-token → 独立诊断引擎 →
//      好/一般/差 + 原始数字，结束必离开频道）；复制诊断信息不含任何 token；Esc 关闭；
//   ③ A-7：菜单项只负责打开，面板由常驻宿主渲染——菜单关掉（菜单项卸载）面板还在；没挂宿主时菜单项自己兜底；
//   ④ 源码约束：导出名照合同 §3.9 + A-7、层级 ≥1160、不碰 innerHTML/eval、postMessage。
//
// 跑法：node --import ./tests/helpers/assert-dom-guard.mjs --experimental-strip-types \
//        --experimental-loader ./tests/ts-extension-loader.mjs --test tests/call-diagnostics-ui.test.mjs
import assert from "node:assert/strict";
import { createRequire, register } from "node:module";
import { readFile, readdir } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import test from "node:test";

import React, { act } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

register("./ts-extension-loader.mjs", import.meta.url);
const { CALL_DIAGNOSTICS_MESSAGES: COPY } = await import("../src/i18n/ui/messages/call-diagnostics-copy.ts");
const BASE_EN = (await import("../src/i18n/ui/messages/en.ts")).default;
const EN = { ...BASE_EN, ...COPY.en };

const require = createRequire(import.meta.url);
const reactDomUrl = pathToFileURL(require.resolve("react-dom")).href;

const translatorUrl = dataModule(`
const DICT = ${JSON.stringify(EN)};
export function useUI() {
  return (zh, vars) => {
    const s = Object.prototype.hasOwnProperty.call(DICT, zh) ? DICT[zh] : zh;
    return vars ? s.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}`);

// ---------- ① NetworkBars ----------

const { NetworkBars } = await import(
  await compileModule("src/shell/messages/call/diagnostics/NetworkBars.tsx", { "../../../../i18n/ui/useUI": translatorUrl })
);

test("NetworkBars: five bars, filled = level, readable name; 0 shows a grey question mark", () => {
  const names = ["Network: unknown", "Network: very poor", "Network: poor", "Network: fair", "Network: good", "Network: excellent"];
  for (let level = 0; level <= 5; level += 1) {
    const html = renderToStaticMarkup(React.createElement(NetworkBars, { level }));
    assert.match(html, /role="img"/);
    assert.ok(html.includes(`aria-label="${names[level]}"`), `level ${level}`);
    assert.ok(html.includes(`title="${names[level]}"`), `level ${level} tooltip`);
    assert.equal((html.match(/data-bar-on=/g) || []).length, 5, "always five bars");
    assert.equal((html.match(/data-bar-on="true"/g) || []).length, level);
    assert.equal(html.includes(">?</span>"), level === 0, `question mark only for level 0 (level ${level})`);
  }
  assert.match(renderToStaticMarkup(React.createElement(NetworkBars, { level: 2 })), /bg-red-500/);
  assert.match(renderToStaticMarkup(React.createElement(NetworkBars, { level: 3 })), /bg-amber-400/);
  assert.match(renderToStaticMarkup(React.createElement(NetworkBars, { level: 5 })), /bg-emerald-500/);
  for (const bogus of [7, -1, Number.NaN, 2.5]) {
    assert.match(renderToStaticMarkup(React.createElement(NetworkBars, { level: bogus })), /data-net-level="0"/, String(bogus));
  }
  // 深色小底（W07 的格子右上角，文字白色）：空格用 currentColor 而不是写死的灰。
  assert.match(renderToStaticMarkup(React.createElement(NetworkBars, { level: 1 })), /bg-current opacity-25/);
});

// ---------- ② 面板（jsdom） ----------

const RTC_TOKEN = "eyJhcHBpZCI6ImFwcC14IiwidG9rZW4iOiJzZWNyZXQtYXJ0Yy10b2tlbiJ9";
const realProbesUrl = await compileModule("src/shell/messages/call/diagnostics/media-probes.ts");
const realConnectionUrl = await compileModule("src/shell/messages/call/diagnostics/connection-test.ts");

const probesStub = dataModule(`
export { mediaErrorCode, mediaErrorText, splitDevices, levelFromRms, rmsOf, chimeNotes, chimeDurationSec } from ${JSON.stringify(realProbesUrl)};
const h = () => globalThis.__W14_UI__;
export async function listMediaDevices() { return h().devices; }
export async function queryPermission(name) { return h().permissions[name] ?? "unknown"; }
export function supportsSinkSelection() { return h().sinkSelectable; }
export async function startMicMeter(deviceId, onLevel) {
  const entry = { deviceId, onLevel, stopped: false };
  h().meters.push(entry);
  if (h().micError) { const e = new Error("denied"); e.name = h().micError; throw e; }
  return { deviceId, label: "", stop() { entry.stopped = true; } };
}
export async function playTestSound(sinkId) {
  h().played.push(sinkId);
  return { done: Promise.resolve(), stop() {} };
}
export async function startCameraPreview(deviceId, video) {
  h().previews.push({ deviceId, isVideo: video && video.tagName === "VIDEO" });
  return { deviceId, label: "", stop() { h().previewStops += 1; } };
}
`);

const connectionStub = dataModule(`
import * as real from ${JSON.stringify(realConnectionUrl)};
export * from ${JSON.stringify(realConnectionUrl)};
// 真编排，只把「发布 5 秒」缩成 50 ms，单测不用干等。
export function runConnectionTest(deps) { return real.runConnectionTest({ ...deps, durationMs: 50, sampleEveryMs: 10 }); }
`);

const engineStub = dataModule(`
const h = () => globalThis.__W14_UI__;
export const callActions = {
  async selectDevice(kind, id) { h().selected.push([kind, id]); },
  async listDevices() { return h().devices; },
  async setAudioOnly() {}, async setMic() {}, async setCamera() {}, async setScreenShare() {},
  async getStats() { return { rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null }; },
};
export function useCall() { return h().snapshot; }
export const callStore = { subscribe: () => () => {}, getSnapshot: () => h().snapshot };
export async function createDiagnosticsEngine() {
  h().engines += 1;
  return {
    async join(rtc, opts) { h().joins.push({ channel: rtc.channel_id, token: rtc.token, micDeviceId: opts && opts.micDeviceId }); },
    async getStats() { return { rttMs: 42, upLossPct: null, downLossPct: null, upKbps: 31, downKbps: null }; },
    async leave() { h().leaves += 1; },
  };
}
`);

const callsApiStub = dataModule(`
export const callsApi = {
  async testToken() {
    globalThis.__W14_UI__.tokens += 1;
    return { rtc: { app_id: "app-x", channel_id: "diag-77", user_id: "u77", token: ${JSON.stringify(RTC_TOKEN)}, timestamp: 1900000000, expires_at: "2030-01-01T00:00:00Z" } };
  },
};
`);

const STUBS = {
  "../../../../i18n/ui/useUI": translatorUrl,
  "../engine": engineStub,
  "../../../../lib/im/calls-api": callsApiStub,
  "./media-probes": probesStub,
  "./connection-test": connectionStub,
  "react-dom": reactDomUrl,
};

const panelModule = await import(await compileModule("src/shell/messages/call/diagnostics/CallTestPanel.tsx", STUBS));
const menuModule = await import(await compileModule("src/shell/messages/call/diagnostics/CallTestMenuItem.tsx", STUBS));
const storeModule = await import(await compileModule("src/shell/messages/call/diagnostics/diagnostics-store.ts", STUBS));

const CHROME_MAC_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";

function harness(over = {}) {
  return {
    userAgent: CHROME_MAC_UA,
    devices: {
      microphones: [
        { deviceId: "default", label: "Default - Mic A" },
        { deviceId: "mic-2", label: "Mic A" },
        { deviceId: "mic-3", label: "USB Headset" },
      ],
      cameras: [{ deviceId: "cam-1", label: "FaceTime HD Camera" }],
      speakers: [
        { deviceId: "spk-1", label: "Built-in Speakers" },
        { deviceId: "spk-2", label: "USB Headset" },
      ],
    },
    permissions: { microphone: "granted", camera: "prompt" },
    sinkSelectable: true,
    micError: null,
    meters: [],
    played: [],
    previews: [],
    previewStops: 0,
    selected: [],
    joins: [],
    engines: 0,
    tokens: 0,
    leaves: 0,
    clipboard: [],
    clipboardFails: false,
    snapshot: {
      phase: "connected",
      participants: [],
      issues: [{ kind: "mic_silent" }],
      limits: { maxParticipants: 50, maxVideo: 25 },
      me: { mic: true, camera: false, screen: false, audioOnly: false, micDeviceId: "mic-2", cameraDeviceId: "cam-1", speakerDeviceId: "spk-2", network: 4 },
    },
    ...over,
  };
}

async function withDom(run, h = harness()) {
  const fabricRequire = createRequire(require.resolve("fabric/node"));
  const canvasEntry = fabricRequire.resolve("canvas");
  const previousCanvasModule = require.cache[canvasEntry];
  require.cache[canvasEntry] = { id: canvasEntry, filename: canvasEntry, loaded: true, exports: {} };
  const { JSDOM, VirtualConsole } = await import(pathToFileURL(fabricRequire.resolve("jsdom")).href);
  if (previousCanvasModule) require.cache[canvasEntry] = previousCanvasModule;
  else delete require.cache[canvasEntry];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on("jsdomError", () => {});
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
    url: "https://p-test.dev.oceanleo.com/leochat",
    virtualConsole,
  });
  const { window } = dom;
  Object.defineProperty(window.navigator, "userAgent", { configurable: true, value: h.userAgent });
  Object.defineProperty(window.navigator, "clipboard", {
    configurable: true,
    value: {
      async writeText(text) {
        if (h.clipboardFails) throw new Error("denied");
        h.clipboard.push(text);
      },
    },
  });
  const restore = [];
  for (const [name, value] of Object.entries({
    window,
    document: window.document,
    navigator: window.navigator,
    HTMLElement: window.HTMLElement,
    HTMLMediaElement: window.HTMLMediaElement,
    Element: window.Element,
    Node: window.Node,
    Event: window.Event,
    KeyboardEvent: window.KeyboardEvent,
    MouseEvent: window.MouseEvent,
  })) {
    const had = name in globalThis;
    const previous = globalThis[name];
    restore.push(() => {
      if (had) Object.defineProperty(globalThis, name, { configurable: true, writable: true, value: previous });
      else delete globalThis[name];
    });
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
  }
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.__W14_UI__ = h;
  const { createRoot } = await import("react-dom/client");
  const container = window.document.createElement("div");
  window.document.body.append(container);
  const root = createRoot(container);
  const render = (element) => act(async () => root.render(element));
  const find = (selector) => window.document.querySelector(selector);
  const findAll = (selector) => [...window.document.querySelectorAll(selector)];
  const text = () => window.document.body.textContent || "";
  const click = (selector) => {
    const node = find(selector);
    assert.ok(node, `no ${selector}`);
    return act(async () => node.dispatchEvent(new window.MouseEvent("click", { bubbles: true })));
  };
  const choose = (selector, value) => {
    const node = find(selector);
    assert.ok(node, `no ${selector}`);
    return act(async () => {
      node.value = value;
      node.dispatchEvent(new window.Event("change", { bubbles: true }));
    });
  };
  const settle = (ms = 0) => act(async () => new Promise((resolve) => setTimeout(resolve, ms)));
  try {
    await run({ window, h, render, find, findAll, text, click, choose, settle });
  } finally {
    await act(async () => root.unmount());
    container.remove();
    window.close();
    delete globalThis.__W14_UI__;
    for (const undo of restore.reverse()) undo();
    delete globalThis.IS_REACT_ACT_ENVIRONMENT;
  }
}

const { CallTestPanel } = panelModule;

test("panel: modal dialog with a title, four checks, Esc closes; closed = nothing rendered", async () => {
  await withDom(async ({ window, render, find, findAll, settle }) => {
    let closed = 0;
    await render(React.createElement(CallTestPanel, { open: false, onClose() {} }));
    assert.equal(find('[role="dialog"]'), null);
    await render(React.createElement(CallTestPanel, { open: true, onClose: () => (closed += 1) }));
    await settle();
    const dialog = find('[role="dialog"]');
    assert.ok(dialog);
    assert.equal(dialog.getAttribute("aria-modal"), "true");
    const title = window.document.getElementById(dialog.getAttribute("aria-labelledby"));
    assert.equal(title.textContent, "Call check");
    assert.deepEqual(
      findAll("[data-call-test-section]").map((node) => node.getAttribute("data-call-test-section")),
      ["mic", "speaker", "camera", "connection"],
    );
    const scrim = find("[data-call-diagnostics-dialog]");
    assert.ok(Number(scrim.style.zIndex) >= 1160, "above the dock, the stage view and call menus");
    await act(async () => window.document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    assert.equal(closed, 1);
  });
});

test("mic level meter opens the SELECTED mic on its own, follows device changes and writes the choice back", async () => {
  await withDom(async ({ h, render, find, choose, settle }) => {
    await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
    await settle();
    assert.equal(h.meters.length, 1);
    assert.equal(h.meters[0].deviceId, "mic-2", "the engine's selected mic");
    await act(async () => h.meters[0].onLevel(0.5));
    const meter = find('[role="meter"]');
    assert.equal(meter.getAttribute("aria-label"), "Microphone level");
    assert.equal(meter.getAttribute("aria-valuenow"), "50");
    assert.equal(meter.querySelectorAll(".bg-emerald-500").length, 10);
    const select = find('select[aria-label="Choose microphone"]');
    assert.deepEqual([...select.options].map((o) => o.textContent), ["System default", "Mic A", "USB Headset"], "Chrome's default/communications pseudo-devices are folded into System default");
    assert.equal(select.value, "mic-2");
    await choose('select[aria-label="Choose microphone"]', "mic-3");
    await settle();
    assert.deepEqual(h.selected, [["mic", "mic-3"]]);
    assert.equal(h.meters[0].stopped, true, "the previous capture is released");
    assert.equal(h.meters.at(-1).deviceId, "mic-3");
    // 「系统默认」：Chrome 有 default 伪设备 → 写回 default；音量条按默认设备开（不指定 deviceId）
    await choose('select[aria-label="Choose microphone"]', "");
    await settle();
    assert.deepEqual(h.selected.at(-1), ["mic", "default"]);
    assert.equal(h.meters.at(-1).deviceId, null);
    // 扬声器列表里没有 default 伪设备（Safari/Firefox 的样子）→ 选「系统默认」不写回引擎
    const before = h.selected.length;
    await choose('select[aria-label="Choose speaker"]', "");
    assert.equal(h.selected.length, before);
  });
});

test("mic permission denied: says so, explains how to allow it, retry re-opens the mic", async () => {
  await withDom(
    async ({ h, render, find, text, settle }) => {
      await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
      await settle();
      const alert = find('[data-call-test-section="mic"] [role="alert"]');
      assert.ok(alert);
      assert.match(alert.textContent, /Your browser is blocking the microphone\./);
      assert.match(alert.textContent, /Click the site settings icon on the left of the address bar, set “Microphone” to “Allow”/);
      assert.match(alert.textContent, /On a Mac, also allow your browser in “System Settings” → “Privacy & Security” → “Microphone”\./);
      h.micError = null;
      const before = h.meters.length;
      await act(async () => alert.querySelector("button").dispatchEvent(new globalThis.window.MouseEvent("click", { bubbles: true })));
      await settle();
      assert.equal(h.meters.length, before + 1);
      assert.doesNotMatch(text(), /Your browser is blocking the microphone\./);
    },
    harness({ micError: "NotAllowedError" }),
  );
});

test("speaker test plays on the selected output; without setSinkId it says the system default is used", async () => {
  await withDom(async ({ h, render, click, choose, settle }) => {
    await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
    await settle();
    await click("[data-speaker-test]");
    await settle();
    assert.deepEqual(h.played, ["spk-2"]);
    await choose('select[aria-label="Choose speaker"]', "spk-1");
    assert.deepEqual(h.selected.at(-1), ["speaker", "spk-1"]);
    await click("[data-speaker-test]");
    await settle();
    assert.deepEqual(h.played, ["spk-2", "spk-1"]);
  });
  await withDom(
    async ({ h, render, find, text, click, settle }) => {
      await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
      await settle();
      assert.equal(find('select[aria-label="Choose speaker"]'), null);
      assert.match(text(), /This browser can’t choose a speaker; it uses the system default output\./);
      await click("[data-speaker-test]");
      await settle();
      assert.deepEqual(h.played, [null]);
    },
    harness({ sinkSelectable: false }),
  );
});

test("camera preview is opt-in, uses the selected camera, and is released when turned off", async () => {
  await withDom(async ({ h, render, find, click, settle }) => {
    await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
    await settle();
    assert.equal(h.previews.length, 0, "no camera light until asked");
    await click("[data-camera-preview-toggle]");
    await settle();
    assert.deepEqual(h.previews, [{ deviceId: "cam-1", isVideo: true }]);
    assert.ok(find('video[aria-label="Camera preview"]'));
    await click("[data-camera-preview-toggle]");
    await settle();
    assert.equal(h.previewStops, 1);
  });
});

test("connection test: diag token → independent engine with the selected mic → grade + raw numbers → always leaves", async () => {
  await withDom(async ({ h, render, find, text, click, settle }) => {
    await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
    await settle();
    await click("[data-connection-test-start]");
    await settle(150);
    assert.equal(h.tokens, 1);
    assert.equal(h.engines, 1);
    assert.deepEqual(h.joins, [{ channel: "diag-77", token: RTC_TOKEN, micDeviceId: "mic-2" }]);
    assert.equal(h.leaves, 1);
    assert.equal(find("[data-connection-result]").getAttribute("data-connection-result"), "good");
    assert.match(text(), /Connection: good/);
    assert.match(text(), /Round-trip time42 ms/);
    assert.match(text(), /Upload bitrate31 kbps/);
    assert.match(text(), /Upload packet loss—/, "not measurable in a solo channel → dash, not 0%");
    assert.match(find("[data-connection-test-start]").textContent, /Test again/);
  });
});

test("copy diagnostic info: browser, OS, devices, permissions, numbers, time, edition — and never the token", async () => {
  await withDom(async ({ h, render, find, click, settle }) => {
    await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
    await settle();
    await click("[data-connection-test-start]");
    await settle(150);
    await click("[data-copy-diagnostics]");
    await settle();
    assert.equal(h.clipboard.length, 1);
    const report = h.clipboard[0];
    assert.match(report, /^OceanLeo call diagnostics\n/);
    for (const field of ["time", "edition", "browser", "os", "devices.microphone", "devices.camera", "devices.speaker", "permission.microphone", "permission.camera", "call.stats", "test.result", "test.stats"]) {
      assert.match(report, new RegExp(`^${field.replace(".", "\\.")}: `, "m"), field);
    }
    assert.match(report, /^devices\.microphone: Default - Mic A; Mic A \[selected\]; USB Headset$/m);
    assert.match(report, /^devices\.speaker: Built-in Speakers; USB Headset \[selected\]$/m);
    assert.match(report, /^permission\.microphone: granted$/m);
    assert.match(report, /^test\.result: good$/m);
    assert.match(report, /^edition: global$/m);
    assert.match(report, /^browser: Chrome 130\.0\.0\.0$/m);
    assert.match(report, /^os: macOS 10\.15\.7$/m);
    assert.match(report, /^call\.issues: mic_silent$/m);
    assert.ok(!report.includes(RTC_TOKEN), "no ARTC token");
    assert.doesNotMatch(report, /eyJ|diag-77|app-x|u77/, "no token, channel, app or user id");
    assert.match(find("[data-copy-diagnostics]").textContent, /Copied/);
  });
  await withDom(
    async ({ render, find, click, settle }) => {
      await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
      await settle();
      await click("[data-copy-diagnostics]");
      await settle();
      const area = find('textarea[aria-label="Diagnostic info"]');
      assert.ok(area, "clipboard refused → the text is shown for manual copy");
      assert.match(area.value, /^OceanLeo call diagnostics/);
    },
    harness({ clipboardFails: true }),
  );
});

test("closing the panel mid-test aborts it, leaves the diag channel and releases the mic", async () => {
  await withDom(async ({ h, render, click, settle }) => {
    await render(React.createElement(CallTestPanel, { open: true, onClose() {} }));
    await settle();
    await click("[data-connection-test-start]");
    await render(React.createElement(CallTestPanel, { open: false, onClose() {} }));
    await settle(150);
    assert.equal(h.leaves, h.engines, "every diag engine that was created has left");
    assert.ok(h.meters.every((m) => m.stopped), "mic capture released");
  });
});

// ---------- ③ A-7：入口与宿主 ----------

test("A-7: the menu item opens the panel; the host keeps it open after the menu item unmounts", async () => {
  const { CallTestMenuItem, CallDiagnosticsHost } = menuModule;
  await withDom(async ({ render, find, click, settle }) => {
    let selected = 0;
    const tree = (withItem) =>
      React.createElement(
        React.Fragment,
        null,
        React.createElement(CallDiagnosticsHost),
        withItem ? React.createElement(CallTestMenuItem, { onSelect: () => (selected += 1) }) : null,
      );
    await render(tree(true));
    await settle();
    const item = find('[role="menuitem"]');
    assert.match(item.textContent, /Call check/);
    assert.match(item.textContent, /Microphone, speaker, camera and network/);
    assert.equal(find('[role="dialog"]'), null);
    await click('[role="menuitem"]');
    await settle();
    assert.equal(selected, 1);
    assert.ok(find('[role="dialog"]'));
    await render(tree(false)); // the menu closed
    await settle();
    assert.ok(find('[role="dialog"]'), "panel outlives the menu");
    assert.equal(find('[role="dialog"]') && document.querySelectorAll('[role="dialog"]').length, 1);
    await click("[data-call-test-close]");
    await settle();
    assert.equal(find('[role="dialog"]'), null);
  });
});

test("A-7 fallback: with no host mounted the menu item renders the panel itself", async () => {
  const { CallTestMenuItem } = menuModule;
  await withDom(async ({ render, find, click, settle }) => {
    await render(React.createElement(CallTestMenuItem));
    await settle();
    await click('[role="menuitem"]');
    await settle();
    assert.ok(find('[role="dialog"]'));
    storeModule.closeCallTest();
    await settle();
  });
});

test("store: open/close and host registration are idempotent", () => {
  const { callTestStore, openCallTest, closeCallTest, registerCallTestHost } = storeModule;
  closeCallTest();
  let notified = 0;
  const off = callTestStore.subscribe(() => (notified += 1));
  openCallTest();
  openCallTest();
  assert.equal(callTestStore.getSnapshot().open, true);
  assert.equal(notified, 1, "no change → no notification");
  const unregister = registerCallTestHost();
  assert.equal(callTestStore.getSnapshot().hosts, 1);
  unregister();
  unregister();
  assert.equal(callTestStore.getSnapshot().hosts, 0);
  closeCallTest();
  off();
});

// ---------- A-22：不在通话中的入口（LeoChat 消息设置页） ----------

const sharedStoreUrl = await compileModule("src/shell/messages/call/diagnostics/diagnostics-store.ts");
const sharedMenu = await import(
  await compileModule("src/shell/messages/call/diagnostics/CallTestMenuItem.tsx", { ...STUBS, "./diagnostics-store": sharedStoreUrl })
);
const settingsModule = await import(
  await compileModule("src/shell/messages/SettingsView.tsx", {
    "../../i18n/ui/useUI": translatorUrl,
    "./notify/NotifySettingsPanel": dataModule("export function NotifySettingsPanel() { return null; }"),
    "./PrivacyNotice": dataModule("export function PrivacySummary() { return null; }"),
    "./call/diagnostics/diagnostics-store": sharedStoreUrl,
  })
);

test("A-22: message settings has a Call check entry that opens the same panel outside a call", async () => {
  const settings = await readFile(new URL("../src/shell/messages/SettingsView.tsx", import.meta.url), "utf8");
  assert.match(settings, /import \{ openCallTest \} from "\.\/call\/diagnostics\/diagnostics-store";/, "tiny store import, not the whole barrel");
  assert.match(settings, /onClick=\{openCallTest\}/);
  assert.match(settings, /data-open-call-test="settings"/);
  assert.doesNotMatch(settings, /dangerouslySetInnerHTML|innerHTML/);
  const { LOCALES } = await import("../src/i18n/config.ts");
  for (const key of ["通话检测", "检查麦克风、扬声器、摄像头和网络连接。", "打开通话检测"]) {
    assert.ok(settings.includes(`tt("${key}")`), key);
    for (const locale of LOCALES) assert.ok(COPY[locale]?.[key], `${locale}: ${key}`);
  }
  await withDom(
    async ({ render, find, text, click, settle }) => {
      await render(
        React.createElement(
          React.Fragment,
          null,
          React.createElement(sharedMenu.CallDiagnosticsHost),
          React.createElement(settingsModule.SettingsView, { onOpenBlocks() {} }),
        ),
      );
      await settle();
      assert.match(text(), /Call check/);
      assert.equal(find('[role="dialog"]'), null);
      await click('[data-open-call-test="settings"]');
      await settle();
      assert.ok(find('[role="dialog"]'), "panel opens from settings with no call");
      assert.equal(find("[data-connection-test-start]").disabled, false, "connection test available outside a call");
      await click("[data-call-test-close]");
      await settle();
      assert.equal(find('[role="dialog"]'), null);
    },
    harness({ snapshot: { ...harness().snapshot, phase: "idle", issues: [] } }),
  );
});

// ---------- ④ 源码约束 ----------

const DIAG_DIR = new URL("../src/shell/messages/call/diagnostics/", import.meta.url);

test("exports match contract §3.9 (+ A-7 host) with the agreed props", async () => {
  const index = await readFile(new URL("index.ts", DIAG_DIR), "utf8");
  for (const name of ["NetworkBars", "CallIssueButton", "CallTestPanel", "CallTestMenuItem", "useNetworkHealth", "CallDiagnosticsHost"]) {
    assert.match(index, new RegExp(`\\b${name}\\b`), name);
  }
  const bars = await readFile(new URL("NetworkBars.tsx", DIAG_DIR), "utf8");
  assert.match(bars, /export interface NetworkBarsProps \{\s*level: NetLevel;/);
  const panel = await readFile(new URL("CallTestPanel.tsx", DIAG_DIR), "utf8");
  assert.match(panel, /export interface CallTestPanelProps \{\s*open: boolean;\s*onClose\(\): void;\s*\}/);
  const menu = await readFile(new URL("CallTestMenuItem.tsx", DIAG_DIR), "utf8");
  assert.match(menu, /export function CallDiagnosticsHost\(\)/, "host takes no props");
  assert.match(menu, /onSelect\?\(\): void/);
  // 引擎接口照合同用：统计走 callActions.getStats，仅语音走 setAudioOnly(true)，连接测试走 test-token + 独立诊断引擎。
  assert.match(await readFile(new URL("use-network-health.ts", DIAG_DIR), "utf8"), /callActions\.getStats\(\)/);
  assert.match(await readFile(new URL("CallIssueButton.tsx", DIAG_DIR), "utf8"), /callActions\.setAudioOnly\(true\)/);
  assert.match(panel, /callsApi\.testToken\(\)/);
  assert.match(panel, /createDiagnosticsEngine\(\)/);
});

test("layers: issue popover, device menu and dialog sit above W07's dock/stage/menus (≥1160)", async () => {
  const layer = await readFile(new URL("layer.tsx", DIAG_DIR), "utf8");
  for (const name of ["DIAG_POPOVER_Z", "DIAG_MENU_Z", "DIAG_DIALOG_Z"]) {
    const value = Number(layer.match(new RegExp(`${name} = (\\d+)`))?.[1]);
    assert.ok(value >= 1160, `${name} = ${value}`);
  }
  const button = await readFile(new URL("CallIssueButton.tsx", DIAG_DIR), "utf8");
  assert.match(button, /zIndex: DIAG_POPOVER_Z/);
  assert.match(button, /zIndex: DIAG_MENU_Z/);
});

test("security rules: no innerHTML / dangerouslySetInnerHTML / eval / new Function / postMessage in diagnostics", async () => {
  for (const name of await readdir(DIAG_DIR)) {
    if (!/\.tsx?$/.test(name)) continue;
    const source = await readFile(new URL(name, DIAG_DIR), "utf8");
    assert.doesNotMatch(source, /dangerouslySetInnerHTML|\.innerHTML\s*=|\beval\(|new Function\(|postMessage\(/, name);
  }
});
