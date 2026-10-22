// W14 · 通话中排障：每种 issue 一句话 + 一个办法按钮；按浏览器/系统给出怎么打开权限；
// 合并规则（网络持续差补一条、断网不提示网络差、去重、排序、「知道了」）；面板静态渲染；17 语词典覆盖。
import assert from "node:assert/strict";
import test from "node:test";
import { readFile, readdir } from "node:fs/promises";
import { register } from "node:module";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";
import { stripJsComments } from "./helpers/strip-js-comments.mjs";
import {
  BROWSER_HELP,
  NETWORK_HELP,
  allIssueCopy,
  browserFamily,
  collectIssues,
  describeIssue,
  issueId,
  osFamily,
  pruneDismissed,
} from "../src/shell/messages/call/diagnostics/issues.ts";
import { connectionTestErrorText, gradeLabel } from "../src/shell/messages/call/diagnostics/connection-test.ts";
import { netLevelLabel } from "../src/shell/messages/call/diagnostics/health.ts";
import { mediaErrorText } from "../src/shell/messages/call/diagnostics/media-probes.ts";

register("./ts-extension-loader.mjs", import.meta.url);
const { CALL_DIAGNOSTICS_MESSAGES: COPY } = await import("../src/i18n/ui/messages/call-diagnostics-copy.ts");
const { LOCALES } = await import("../src/i18n/config.ts");

const UA = {
  chromeMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
  edgeWin:
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0",
  safariMac:
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
  firefoxLinux: "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0",
  iphone:
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
  android:
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
};

function env(over = {}) {
  return { browser: "chrome", os: "windows", desktopClient: false, audioOnly: false, limits: { maxParticipants: 50, maxVideo: 25 }, ...over };
}

test("browser / OS detection", () => {
  assert.equal(browserFamily(UA.chromeMac), "chrome");
  assert.equal(browserFamily(UA.edgeWin), "edge");
  assert.equal(browserFamily(UA.safariMac), "safari");
  assert.equal(browserFamily(UA.firefoxLinux), "firefox");
  assert.equal(browserFamily(UA.iphone), "safari");
  assert.equal(browserFamily(""), "other");
  assert.equal(osFamily(UA.chromeMac), "mac");
  assert.equal(osFamily(UA.edgeWin), "windows");
  assert.equal(osFamily(UA.firefoxLinux), "linux");
  assert.equal(osFamily(UA.iphone), "ios");
  assert.equal(osFamily(UA.android), "android");
});

// 每种 issue：一句话 + 一个办法按钮（合同 §3.9 的 CallIssue.kind 全集）
const TABLE = [
  ["mic_permission", undefined, "浏览器没有允许使用麦克风，别人听不到你。", "permission_help", "怎么打开"],
  ["camera_permission", undefined, "浏览器没有允许使用摄像头，别人看不到你的画面。", "permission_help", "怎么打开"],
  ["screen_permission", undefined, "没有获得共享屏幕的权限。", "permission_help", "怎么打开"],
  ["no_mic", undefined, "没有找到麦克风。插上耳机或麦克风后再试。", "retry_devices", "重新检测麦克风"],
  ["mic_silent", undefined, "麦克风开着，但没有收到你的声音。", "switch_mic", "换一个麦克风"],
  ["device_lost", "mic", "麦克风已断开。", "switch_device", "换一个设备"],
  ["device_lost", "camera", "摄像头已断开。", "switch_device", "换一个设备"],
  ["device_lost", "speaker", "扬声器已断开。", "switch_device", "换一个设备"],
  ["device_lost", undefined, "有设备已断开。", "switch_device", "换一个设备"],
  ["network_poor", undefined, "你的网络较差，别人可能听不清你。", "audio_only", "切换为仅语音"],
  ["network_lost", undefined, "网络已断开，正在重连…", "reconnecting", "正在重连"],
  ["artc_unsupported", undefined, "这个浏览器不支持通话。", "browser_help", "怎么办"],
  ["call_full", undefined, "通话已满 {n} 人，暂时进不来。", "dismiss", "知道了"],
  ["video_full", undefined, "已有 {n} 人开着摄像头，暂时不能再开。", "dismiss", "知道了"],
];

test("every issue kind has one sentence and exactly one action button", () => {
  for (const [kind, detail, text, action, label] of TABLE) {
    const d = describeIssue({ kind, detail }, env());
    assert.equal(d.text, text, `${kind}:${detail}`);
    assert.equal(d.action.kind, action, `${kind}:${detail}`);
    assert.equal(d.action.label, label, `${kind}:${detail}`);
    assert.equal(d.id, detail ? `${kind}:${detail}` : kind);
  }
  assert.deepEqual(describeIssue({ kind: "call_full" }, env()).vars, { n: 50 });
  assert.deepEqual(describeIssue({ kind: "video_full" }, env()).vars, { n: 25 });
  assert.equal(describeIssue({ kind: "network_lost" }, env()).action.disabled, true, "reconnecting is a status, not a button to press");
  assert.equal(describeIssue({ kind: "mic_silent" }, env()).action.device, "mic");
  assert.equal(describeIssue({ kind: "device_lost", detail: "camera" }, env()).action.device, "camera");
  assert.equal(describeIssue({ kind: "device_lost" }, env()).action.device, "any");
  const poorAudioOnly = describeIssue({ kind: "network_poor" }, env({ audioOnly: true }));
  assert.equal(poorAudioOnly.text, "你的网络较差，声音可能会断断续续。");
  assert.equal(poorAudioOnly.action.kind, "check_network");
  assert.deepEqual(poorAudioOnly.help, [...NETWORK_HELP]);
  assert.deepEqual(describeIssue({ kind: "artc_unsupported" }, env()).help, [...BROWSER_HELP]);
});

test("permission help says how to open it in this browser / OS, then offers a retry", () => {
  const chromeMac = describeIssue({ kind: "mic_permission" }, env({ browser: "chrome", os: "mac" }));
  assert.equal(chromeMac.retry, "mic");
  assert.deepEqual(chromeMac.help, [
    "点地址栏左侧的网站设置图标，把「麦克风」改为「允许」，然后点「重试」。",
    "Mac 上还要在「系统设置」→「隐私与安全性」→「麦克风」里允许浏览器。",
  ]);
  const safari = describeIssue({ kind: "camera_permission" }, env({ browser: "safari", os: "mac" }));
  assert.equal(safari.retry, "camera");
  assert.match(safari.help[0], /Safari →「设置」→「网站」→「摄像头」/);
  const firefox = describeIssue({ kind: "mic_permission" }, env({ browser: "firefox", os: "linux" }));
  assert.deepEqual(firefox.help, ["点地址栏左侧的权限图标，去掉「已阻止麦克风」，然后点「重试」。"]);
  const edgeWin = describeIssue({ kind: "camera_permission" }, env({ browser: "edge", os: "windows" }));
  assert.equal(edgeWin.help.length, 2);
  assert.match(edgeWin.help[1], /Windows 上还要/);
  const desktopMac = describeIssue({ kind: "mic_permission" }, env({ desktopClient: true, os: "mac" }));
  assert.deepEqual(desktopMac.help, ["在「系统设置」→「隐私与安全性」→「麦克风」里允许 OceanLeo，然后点「重试」。"]);
  const iphone = describeIssue({ kind: "mic_permission" }, env({ browser: "safari", os: "ios" }));
  assert.equal(iphone.help.length, 1);
  assert.match(iphone.help[0], /iPhone 或 iPad/);
});

test("screen permission (only raised when the OS refuses): system step first, then pick-and-share", () => {
  const mac = describeIssue({ kind: "screen_permission" }, env({ os: "mac" }));
  assert.equal(mac.retry, "screen");
  assert.deepEqual(mac.help, [
    "Mac 上还要在「系统设置」→「隐私与安全性」→「屏幕录制」里允许浏览器，然后重新打开浏览器。",
    "点「重试」后，在弹出的窗口里选择要共享的屏幕或窗口，再点「共享」。",
  ]);
  const desktopMac = describeIssue({ kind: "screen_permission" }, env({ os: "mac", desktopClient: true }));
  assert.deepEqual(desktopMac.help, ["在「系统设置」→「隐私与安全性」→「屏幕录制」里允许 OceanLeo，然后重新打开 OceanLeo。"]);
  assert.deepEqual(describeIssue({ kind: "screen_permission" }, env({ os: "windows" })).help, [
    "点「重试」后，在弹出的窗口里选择要共享的屏幕或窗口，再点「共享」。",
  ]);
  assert.deepEqual(describeIssue({ kind: "screen_permission" }, env({ os: "android" })).help, ["手机浏览器不能共享屏幕，请在电脑上共享。"]);
});

test("merge rules: sustained poor network adds one entry, offline hides it, duplicates collapse, severity order, dismissals", () => {
  const e = env();
  assert.deepEqual(collectIssues([], { sustainedPoor: false }, e), []);
  assert.deepEqual(collectIssues([], { sustainedPoor: true }, e).map((d) => d.kind), ["network_poor"]);
  assert.deepEqual(
    collectIssues([{ kind: "network_poor" }], { sustainedPoor: true }, e).map((d) => d.id),
    ["network_poor"],
    "engine + monitor agree → one entry",
  );
  assert.deepEqual(
    collectIssues([{ kind: "network_lost" }, { kind: "network_poor" }], { sustainedPoor: true }, e).map((d) => d.kind),
    ["network_lost"],
    "offline: no 'poor network' nagging",
  );
  const ordered = collectIssues(
    [{ kind: "video_full" }, { kind: "mic_silent" }, { kind: "mic_permission" }, { kind: "mic_silent" }],
    { sustainedPoor: true },
    e,
  );
  assert.deepEqual(ordered.map((d) => d.kind), ["mic_permission", "mic_silent", "network_poor", "video_full"]);
  const dismissed = new Set(["video_full", "network_poor"]);
  assert.deepEqual(collectIssues([{ kind: "video_full" }], { sustainedPoor: true }, e, dismissed), []);
  // 「知道了」只在问题还在时有效
  assert.deepEqual([...pruneDismissed(dismissed, [{ kind: "video_full" }])], ["video_full"]);
  assert.deepEqual([...pruneDismissed(dismissed, [])], []);
  assert.equal(issueId({ kind: "device_lost", detail: "mic" }), "device_lost:mic");
});

// ---------- 静态渲染：英文词典驱动的 tt，验证文案与按钮真的进了 DOM ----------

function translatorStub(dict) {
  return dataModule(`
const DICT = ${JSON.stringify(dict)};
export function useUI() {
  return (zh, vars) => {
    const s = Object.prototype.hasOwnProperty.call(DICT, zh) ? DICT[zh] : zh;
    return vars ? s.replace(/\\{(\\w+)\\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };
}`);
}

const ENGINE_STUB = dataModule(`
const noop = async () => {};
export const callActions = {
  setAudioOnly: noop, setMic: noop, setCamera: noop, setScreenShare: noop, selectDevice: noop,
  listDevices: async () => ({ microphones: [], cameras: [], speakers: [] }),
  getStats: async () => ({ rttMs: null, upLossPct: null, downLossPct: null, upKbps: null, downKbps: null }),
};
export function useCall() { return globalThis.__w14CallSnapshot; }
export const callStore = { subscribe: () => () => {}, getSnapshot: () => globalThis.__w14CallSnapshot };
`);

function snapshot(issues, over = {}) {
  return {
    phase: "connected",
    participants: [],
    issues,
    limits: { maxParticipants: 50, maxVideo: 25 },
    me: { mic: true, camera: false, screen: false, audioOnly: false, micDeviceId: null, cameraDeviceId: null, speakerDeviceId: null, network: 4 },
    ...over,
  };
}

async function loadIssueModule(dict) {
  return import(
    await compileModule("src/shell/messages/call/diagnostics/CallIssueButton.tsx", {
      "../../../../i18n/ui/useUI": translatorStub(dict),
      "../engine": ENGINE_STUB,
    })
  );
}

const BASE_EN = (await import("../src/i18n/ui/messages/en.ts")).default;
const EN = { ...BASE_EN, ...COPY.en };

test("IssueList renders each issue's sentence and its one action button (English UI)", async () => {
  const { IssueList } = await loadIssueModule(EN);
  globalThis.__w14CallSnapshot = snapshot([]);
  for (const [kind, detail, text, action, label] of TABLE) {
    const item = describeIssue({ kind, detail }, env());
    const html = renderToStaticMarkup(createElement(IssueList, { items: [item], onDismiss() {}, onOpenTest() {} }));
    const english = EN[text].replace("{n}", kind === "call_full" ? "50" : "25");
    assert.ok(html.includes(escapeHtml(english)), `${kind}: ${english}`);
    const buttons = [...html.matchAll(/data-issue-action="([^"]+)"/g)].map((m) => m[1]);
    assert.deepEqual(buttons, [action], `${kind}: exactly one action button`);
    assert.ok(html.includes(`>${escapeHtml(EN[label])}</button>`), `${kind}: button label ${EN[label]}`);
    assert.doesNotMatch(html, /[一-鿿]/, `${kind}: no Chinese left in the English UI`);
    if (kind === "network_lost") assert.match(html, /data-issue-action="reconnecting"[^>]*disabled=""/);
  }
  const html = renderToStaticMarkup(createElement(IssueList, { items: [], onDismiss() {}, onOpenTest() {} }));
  assert.ok(html.includes("Open call check"));
  delete globalThis.__w14CallSnapshot;
});

test("CallIssueButton: hidden without issues or outside a call; warning icon with a readable name otherwise", async () => {
  const { CallIssueButton } = await loadIssueModule(EN);
  globalThis.__w14CallSnapshot = snapshot([]);
  assert.equal(renderToStaticMarkup(createElement(CallIssueButton)), "");
  globalThis.__w14CallSnapshot = snapshot([{ kind: "mic_silent" }], { phase: "idle" });
  assert.equal(renderToStaticMarkup(createElement(CallIssueButton)), "");
  globalThis.__w14CallSnapshot = snapshot([{ kind: "mic_silent" }]);
  const one = renderToStaticMarkup(createElement(CallIssueButton));
  assert.match(one, /aria-label="Call issue — open to see details"/);
  assert.match(one, /aria-haspopup="dialog"/);
  assert.match(one, /data-call-issue-button="mic_silent"/);
  globalThis.__w14CallSnapshot = snapshot([{ kind: "mic_silent" }, { kind: "no_mic" }]);
  const two = renderToStaticMarkup(createElement(CallIssueButton));
  assert.match(two, /aria-label="2 call issues — open to see details"/);
  assert.match(two, /data-call-issue-button="no_mic"/, "most severe first");
  delete globalThis.__w14CallSnapshot;
});

function escapeHtml(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

// ---------- 词典覆盖：17 种语言 ----------

const REUSED_FROM_BASE = ["重试", "关闭", "已复制", "知道了"];
const DIAG_DIR = new URL("../src/shell/messages/call/diagnostics/", import.meta.url);
// report.ts 的正则字面量里有引号，扫字符串会误切；它也没有中文界面文案（诊断信息用英文字段名）。
const SCAN_SKIP = new Set(["report.ts"]);

async function chineseLiterals() {
  const out = new Set();
  for (const name of await readdir(DIAG_DIR)) {
    if (!/\.tsx?$/.test(name) || SCAN_SKIP.has(name)) continue;
    const source = stripJsComments(await readFile(new URL(name, DIAG_DIR), "utf8"));
    for (const m of source.matchAll(/"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`/g)) {
      const s = m[1] ?? m[2] ?? m[3];
      if (/[一-鿿]/.test(s)) out.add(s);
    }
  }
  return out;
}

function dynamicCopy() {
  const out = new Set(allIssueCopy());
  for (const device of ["mic", "camera"]) {
    for (const code of ["permission", "not_found", "busy", "unsupported", "failed"]) out.add(mediaErrorText(device, code));
  }
  for (const code of [
    "rate_limited",
    "artc_not_configured",
    "not_signed_in",
    "network",
    "unsupported",
    "sdk_unavailable",
    "join_failed",
    "join_timeout",
    "in_call_unavailable",
    "failed",
  ]) {
    out.add(connectionTestErrorText(code));
  }
  for (const level of [0, 1, 2, 3, 4, 5]) out.add(netLevelLabel(level));
  for (const grade of ["good", "fair", "poor"]) out.add(gradeLabel(grade));
  return out;
}

test("every Chinese string the diagnostics UI can show is in the call-diagnostics table (or reused from the base dictionary)", async () => {
  const literal = await chineseLiterals();
  const dynamic = dynamicCopy();
  const keys = new Set(Object.keys(COPY.zh));
  const missing = [...new Set([...literal, ...dynamic])].filter((s) => !keys.has(s) && !REUSED_FROM_BASE.includes(s));
  assert.deepEqual(missing, []);
  for (const key of keys) assert.ok(literal.has(key) || dynamic.has(key), `unused key in table: ${key}`);
  for (const reused of REUSED_FROM_BASE) assert.ok(!keys.has(reused), `${reused} must not be redefined (base dictionary owns it)`);
  assert.equal(keys.size, 121);
});

test("17 locales complete: every key translated, placeholders kept, Chinese source is the zh value", () => {
  assert.equal(LOCALES.length, 17);
  for (const locale of LOCALES) {
    const table = COPY[locale];
    assert.ok(table, locale);
    for (const [key, value] of Object.entries(COPY.zh)) {
      assert.equal(value, key, "zh value = key");
      const translated = table[key];
      assert.ok(typeof translated === "string" && translated.trim(), `${locale}: ${key}`);
      assert.deepEqual(
        [...translated.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
        [...key.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort(),
        `${locale}: placeholders of ${key}`,
      );
      if (locale !== "zh" && locale !== "zh-TW" && locale !== "ja") {
        assert.doesNotMatch(translated, /[一-鿿]/, `${locale}: Chinese left in ${key}`);
      }
    }
  }
});

test("runtime dictionary: no other table overrides these keys with a different meaning; reused base keys exist in all 16 locales", async () => {
  const { loadUiMessages } = await import("../src/i18n/ui/messages/load.ts");
  for (const locale of LOCALES) {
    if (locale === "zh") continue;
    const dict = await loadUiMessages(locale);
    for (const [key, value] of Object.entries(COPY[locale])) {
      assert.equal(dict[key], value, `${locale}: runtime value of ${key} is overridden by another table`);
    }
    for (const key of REUSED_FROM_BASE) assert.ok(dict[key] && dict[key].trim(), `${locale}: base key ${key}`);
  }
});
