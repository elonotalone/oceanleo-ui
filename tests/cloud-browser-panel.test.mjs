import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import ts from "typescript";

import { LOCALES } from "../src/i18n/config.ts";
import {
  CLOUD_BROWSER_KEYS,
  CLOUD_BROWSER_EN,
  CLOUD_BROWSER_ZH,
} from "../src/i18n/ui/messages/cloud-browser-copy-base.ts";
import { CLOUD_BROWSER_EASTERN } from "../src/i18n/ui/messages/cloud-browser-copy-eastern.ts";
import { CLOUD_BROWSER_WESTERN } from "../src/i18n/ui/messages/cloud-browser-copy-western.ts";
import {
  browserNavigationTarget,
  createCloudBrowserTextCommitGate,
  parseCloudBrowserFrameMeta,
  pointInContainedFrame,
  redactedDisplayUrl,
} from "../src/shell/cloud-browser-live.ts";
import {
  cloudBrowserAuthMessage,
  cloudBrowserV2Message,
} from "../src/shell/cloud-browser-wire.ts";

const CLOUD_BROWSER_MESSAGES = {
  zh: CLOUD_BROWSER_ZH,
  en: CLOUD_BROWSER_EN,
  ...Object.fromEntries(
    Object.entries({
      ...CLOUD_BROWSER_WESTERN,
      ...CLOUD_BROWSER_EASTERN,
    }).map(([locale, overrides]) => [
      locale,
      { ...CLOUD_BROWSER_EN, ...overrides },
    ]),
  ),
};

const panelSource = readFileSync(
  new URL("../src/shell/CloudBrowserPanel.tsx", import.meta.url),
  "utf8",
);
const controlsSource = readFileSync(
  new URL("../src/shell/cloud-browser-controls.tsx", import.meta.url),
  "utf8",
);
const chromeSource = readFileSync(
  new URL("../src/shell/cloud-browser-chrome.tsx", import.meta.url),
  "utf8",
);
const historyViewSource = readFileSync(
  new URL("../src/shell/cloud-browser-history-view.tsx", import.meta.url),
  "utf8",
);
const liveSource = readFileSync(
  new URL("../src/shell/cloud-browser-live.ts", import.meta.url),
  "utf8",
);
const transportSource = readFileSync(
  new URL("../src/shell/cloud-browser-transport.ts", import.meta.url),
  "utf8",
);
const transportActionsSource = readFileSync(
  new URL("../src/shell/cloud-browser-transport-actions.ts", import.meta.url),
  "utf8",
);
const transportConfigSource = readFileSync(
  new URL("../src/shell/cloud-browser-transport-config.ts", import.meta.url),
  "utf8",
);
const protocolSource = readFileSync(
  new URL("../src/shell/cloud-browser-protocol.ts", import.meta.url),
  "utf8",
);
const wireSource = readFileSync(
  new URL("../src/shell/cloud-browser-wire.ts", import.meta.url),
  "utf8",
);
const interactionSource = readFileSync(
  new URL("../src/shell/cloud-browser-interaction.ts", import.meta.url),
  "utf8",
);
const sessionSource = readFileSync(
  new URL("../src/shell/cloud-browser-session-data.ts", import.meta.url),
  "utf8",
);
const controlsAndViewsSource = [
  controlsSource,
  chromeSource,
  historyViewSource,
].join("\n");
const source = [
  panelSource,
  controlsAndViewsSource,
  liveSource,
  transportSource,
  transportActionsSource,
  transportConfigSource,
  protocolSource,
  wireSource,
  interactionSource,
  sessionSource,
].join("\n");
const sourceTrees = [
  ["CloudBrowserPanel.tsx", panelSource, ts.ScriptKind.TSX],
  ["cloud-browser-transport.ts", transportSource, ts.ScriptKind.TS],
  [
    "cloud-browser-transport-actions.ts",
    transportActionsSource,
    ts.ScriptKind.TS,
  ],
  ["cloud-browser-interaction.ts", interactionSource, ts.ScriptKind.TS],
  ["cloud-browser-wire.ts", wireSource, ts.ScriptKind.TS],
].map(([name, contents, kind]) =>
  ts.createSourceFile(name, contents, ts.ScriptTarget.Latest, true, kind),
);

function functionSource(name) {
  let found;
  let foundTree;
  function visit(node, tree) {
    if (ts.isFunctionDeclaration(node) && node.name?.text === name) {
      found = node;
      foundTree = tree;
      return;
    }
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      node.name.text === name
    ) {
      found = node;
      foundTree = tree;
      return;
    }
    if (!found) ts.forEachChild(node, (child) => visit(child, tree));
  }
  for (const tree of sourceTrees) {
    visit(tree, tree);
    if (found) break;
  }
  assert.ok(found, `missing function ${name}`);
  return found.getText(foundTree);
}

test("object-contain coordinates reject letterbox and preserve corners", () => {
  const bounds = { left: 10, top: 20, width: 1000, height: 1000 };
  const frame = { width: 1280, height: 800 };
  assert.equal(pointInContainedFrame(510, 100, bounds, frame), null);
  assert.deepEqual(
    pointInContainedFrame(10, 207.5, bounds, frame),
    { nx: 0, ny: 0 },
  );
  assert.deepEqual(
    pointInContainedFrame(1010, 832.5, bounds, frame),
    { nx: 1, ny: 1 },
  );
  assert.deepEqual(
    pointInContainedFrame(510, 520, bounds, frame),
    { nx: 0.5, ny: 0.5 },
  );
});

test("address helper keeps URLs and sends plain language to Google", () => {
  assert.equal(
    browserNavigationTarget("https://oceanleo.com/tasks#secret"),
    "https://oceanleo.com/tasks#secret",
  );
  assert.equal(
    browserNavigationTarget("OceanLeo cloud browser"),
    "https://www.google.com/search?q=OceanLeo%20cloud%20browser",
  );
  assert.equal(browserNavigationTarget("   "), null);
  assert.equal(
    redactedDisplayUrl(
      "https://name:pass@example.com/path?safe=1&token=secret#otp",
    ),
    "https://example.com/path?safe=1",
  );
  assert.equal(
    parseCloudBrowserFrameMeta({ byte_length: 321 }).byteLength,
    321,
  );
});

test("hidden text gate commits CJK, emoji, paste, and input echoes once", () => {
  const gate = createCloudBrowserTextCommitGate();

  gate.compositionStart();
  assert.equal(
    gate.beforeInput("insertCompositionText", "中"),
    null,
  );
  assert.equal(gate.input("insertCompositionText", "中文", "中文"), null);
  const chinese = gate.compositionEnd("中文");
  assert.equal(chinese?.text, "中文");
  assert.equal(chinese?.source, "composition");
  assert.equal(gate.input("insertText", "中文", "中文"), null);

  gate.compositionStart();
  assert.equal(gate.compositionEnd("かな")?.text, "かな");
  assert.equal(gate.input("insertText", "かな", "かな"), null);
  gate.compositionStart();
  assert.equal(gate.compositionEnd("한글🙂")?.text, "한글🙂");
  assert.equal(gate.input("insertText", "한글🙂", "한글🙂"), null);

  assert.equal(gate.beforeInput("insertText", "A")?.text, "A");
  assert.equal(gate.input("insertText", "A", "A"), null);
  assert.equal(
    gate.beforeInput("insertText", "A")?.text,
    "A",
    "two intentional identical keystrokes must not be deduplicated",
  );
  assert.equal(gate.input("insertText", "A", "A"), null);
  assert.equal(gate.paste("粘贴 paste")?.text, "粘贴 paste");
  assert.equal(gate.beforeInput("insertFromPaste", "粘贴 paste"), null);
  assert.equal(gate.input("insertFromPaste", "粘贴 paste", "粘贴 paste"), null);
});

test("socket open authenticates but only painted first frame becomes live", () => {
  const onOpenStart = transportSource.indexOf("socket.onopen =");
  const onMessageStart = transportSource.indexOf(
    "socket.onmessage =",
    onOpenStart,
  );
  assert.ok(onOpenStart >= 0 && onMessageStart > onOpenStart);
  const onOpen = transportSource.slice(onOpenStart, onMessageStart);
  assert.match(transportSource, /cloudBrowserAuthMessage/);
  assert.match(onOpen, /JSON\.stringify\(auth\.message\)/);
  assert.doesNotMatch(onOpen, /transition\("streaming"\)|setLive\(/);

  const auth = cloudBrowserAuthMessage(
    {
      ticket: "one-use",
      expires_in: 45,
      protocol_version: 2,
      session_id: "session",
      runtime_id: "runtime",
      incarnation: 7,
    },
    "session",
  );
  assert.deepEqual(auth.binding, {
    sessionId: "session",
    runtimeId: "runtime",
    incarnation: 7,
  });
  assert.deepEqual(
    {
      v: auth.message.v,
      t: auth.message.t,
      session_id: auth.message.session_id,
      runtime_id: auth.message.runtime_id,
      incarnation: auth.message.incarnation,
      binary_frames: auth.message.binary_frames,
      protocol_versions: auth.message.protocol_versions,
    },
    {
      v: 2,
      t: "auth",
      session_id: "session",
      runtime_id: "runtime",
      incarnation: 7,
      binary_frames: true,
      protocol_versions: [2, 1],
    },
  );
  const legacy = cloudBrowserAuthMessage(
    { ticket: "legacy", expires_in: 45 },
    "session",
  );
  assert.equal(legacy.binding, null);
  assert.equal(legacy.message.v, undefined);

  const presented = functionSource("handleFramePresented");
  assert.match(presented, /handshakeRef\.current/);
  assert.match(presented, /v2Envelope\("frame\.presented"/);
  assert.match(presented, /sequence/);
  assert.match(presented, /transition\("streaming"\)/);
  assert.equal(
    (transportSource.match(/transition\("streaming"\)/g) || []).length,
    1,
  );
  assert.match(protocolSource, /type === "hello"/);
  assert.match(protocolSource, /sessionId !== context\.socketSessionRef\.current/);
  assert.match(protocolSource, /runtimeId !== context\.runtimeIdRef\.current/);
  const legacyFrameMetaBranch = protocolSource.slice(
    protocolSource.indexOf('type === "frame.meta"'),
    protocolSource.indexOf('type === "frame" && message.data'),
  );
  assert.match(
    legacyFrameMetaBranch,
    /type === "frame-meta"[\s\S]*protocolRef\.current === 2[\s\S]*return/,
  );
  for (const legacyType of ["lock", "meta"]) {
    const start = protocolSource.indexOf(`type === "${legacyType}"`);
    const end = protocolSource.indexOf("\n  if (type ===", start + 1);
    assert.match(
      protocolSource.slice(start, end),
      /protocolRef\.current === 2\) return/,
      `v2 must ignore duplicate legacy ${legacyType} messages`,
    );
  }
  assert.match(source, /transition\("awaiting_first_frame"\)/);
  assert.match(source, /armFirstFrameTimeout\(\)/);
  assert.match(transportSource, /5_000/);
  assert.match(
    transportSource,
    /5 秒内未收到可绘制首帧，仍显示最后截图/,
  );
});

test("tabs are protocol pages and plus never creates a browser session", () => {
  const createTab = functionSource("createTab");
  assert.match(createTab, /"tab\.create"/);
  assert.match(createTab, /DEFAULT_BROWSER_URL/);
  assert.doesNotMatch(createTab, /startBrowser|createCloudBrowser/);
  assert.match(protocolSource, /type === "tabs\.snapshot"/);
  assert.match(protocolSource, /type === "tab\.opened"/);
  assert.match(protocolSource, /type === "tab\.activated"/);
  assert.match(protocolSource, /type === "tab\.closed"/);
  assert.match(chromeSource, /data-cloud-browser-history/);
  assert.match(chromeSource, /data-cloud-browser-tabs/);
  assert.doesNotMatch(
    chromeSource,
    /sessions\.map[\s\S]{0,600}role="tab"/,
  );
});

test("single-writer lease wraps every v2 mutation and renews explicitly", () => {
  const mutation = functionSource("sendMutation");
  assert.match(mutation, /if \(!leaseOwnedRef\.current\) return false/);
  assert.match(mutation, /lease_id:\s*leaseRef\.current\.leaseId/);
  assert.match(mutation, /lease_epoch:\s*leaseRef\.current\.epoch/);
  assert.match(mutation, /client_event_id/);
  const toggle = functionSource("toggleControl");
  assert.match(toggle, /"control\.acquire"/);
  assert.match(toggle, /"control\.release"/);
  assert.match(transportSource, /"control\.renew"/);
  assert.match(protocolSource, /"LEASE_NOT_HELD"/);
  const capture = functionSource("captureHistory");
  assert.match(capture, /sendRaw\(v2Envelope\("history\.capture"/);
  assert.doesNotMatch(capture, /sendMutation\(/);
  assert.match(capture, /holderKind === "human"/);
  const fixtureMutation = cloudBrowserV2Message(
    {
      sessionId: "session",
      runtimeId: "runtime",
      incarnation: 7,
      connectionId: "connection",
    },
    "pointer",
    {
      tab_id: "tab",
      lease_id: "lease",
      lease_epoch: 3,
      client_event_id: "event",
      event: "down",
      nx: 0.5,
      ny: 0.5,
    },
  );
  assert.equal(fixtureMutation.connection_id, "connection");
  assert.equal(fixtureMutation.lease_epoch, 3);
  assert.match(
    panelSource,
    /canCaptureHistory=\{[\s\S]{0,220}lease\.holderKind !== "human"/,
  );
  const saveAndShutdown = functionSource("saveAndShutdown");
  assert.match(saveAndShutdown, /lease\.holderKind === "human"/);
  assert.ok(
    saveAndShutdown.indexOf("transport.stopLive(true)") <
      saveAndShutdown.indexOf("hibernateCloudBrowser"),
    "save-and-shutdown must stop live input before durable hibernation",
  );
  assert.doesNotMatch(source, /inputQueue|pendingInputs|replayInput/);
  assert.match(source, /Never queue or replay clicks\/keys/);
});

test("URL entry is a temporary popover and direct input has no visible footer", () => {
  assert.match(chromeSource, /data-cloud-browser-open-omnibox/);
  assert.match(chromeSource, /data-cloud-browser-omnibox/);
  assert.match(interactionSource, /event\.key\.toLowerCase\(\) !== "l"/);
  assert.match(interactionSource, /event\.preventDefault\(\)/);
  assert.match(interactionSource, /"nav\.open"/);
  assert.match(panelSource, /data-cloud-browser-hidden-input/);
  assert.match(panelSource, /h-px w-px/);
  assert.match(panelSource, /inputMode="text"/);
  assert.match(interactionSource, /insertLineBreak/);
  assert.match(interactionSource, /deleteContentBackward/);
  assert.match(
    panelSource,
    /onBeforeInput=\{interaction\.handleBeforeInput\}/,
  );
  assert.match(
    panelSource,
    /onCompositionUpdate=\{interaction\.handleCompositionUpdate\}/,
  );
  assert.match(
    panelSource,
    /onCompositionEnd=\{interaction\.handleCompositionEnd\}/,
  );
  assert.match(panelSource, /onPaste=\{interaction\.handlePaste\}/);
  assert.doesNotMatch(source, /CloudBrowserLiveControls|\btyping\b/);
  assert.doesNotMatch(source, /输入文字，回车发送|接管后可输入网址/);
  assert.equal(
    (chromeSource.match(/<input\b/g) || []).length,
    1,
    "the only visible text input must be the conditional omnibox",
  );
});

test("fullscreen and viewport use browser APIs and measured content bounds", () => {
  const fullscreen = functionSource("toggleFullscreen");
  assert.match(fullscreen, /root\.requestFullscreen\(\)/);
  assert.match(fullscreen, /document\.exitFullscreen\(\)/);
  assert.doesNotMatch(fullscreen, /await\s/);
  assert.match(interactionSource, /document\.fullscreenElement === root/);
  assert.match(interactionSource, /new ResizeObserver\(schedule\)/);
  assert.match(interactionSource, /getBoundingClientRect\(\)/);
  assert.match(interactionSource, /sendMutation\("viewport\.set"/);
  assert.match(interactionSource, /Math\.max\(1024,\s*Math\.min\(1920/);
  assert.match(interactionSource, /Math\.max\(640,\s*Math\.min\(1080/);
});

test("first-frame, reconnect, failure, and last-screenshot states are explicit", () => {
  assert.match(chromeSource, /data-cloud-browser-live-state/);
  assert.match(
    panelSource,
    /data-cloud-browser-overlay=\{transport\.transportState\}/,
  );
  assert.match(panelSource, /data-cloud-browser-last-screenshot/);
  assert.match(panelSource, /当前显示最后一帧，不代表实时状态/);
  assert.match(panelSource, /当前显示最后截图，不代表实时状态/);
  assert.match(transportConfigSource, /MAX_LIVE_RECONNECTS = 3/);
  assert.match(transportSource, /"reconnecting"/);
  assert.match(panelSource, /"failed"/);
});

test("every locale has every cloud-browser key without source fallback", () => {
  const usedKeys = [
    ...panelSource.matchAll(/tt\("([^"]+)"/g),
    ...chromeSource.matchAll(/tt\("([^"]+)"/g),
    ...historyViewSource.matchAll(/tt\("([^"]+)"/g),
    ...transportSource.matchAll(/tt\("([^"]+)"/g),
    ...protocolSource.matchAll(/tt\("([^"]+)"/g),
    ...interactionSource.matchAll(/tt\("([^"]+)"/g),
    ...sessionSource.matchAll(/tt\("([^"]+)"/g),
  ].map((match) => match[1]);
  assert.deepEqual(
    [...new Set(usedKeys)].filter(
      (key) => !CLOUD_BROWSER_KEYS.includes(key),
    ),
    [],
    "cloud-browser UI copy must be registered in its complete locale table",
  );
  assert.ok(CLOUD_BROWSER_KEYS.length > 60);
  for (const locale of LOCALES) {
    const dictionary = CLOUD_BROWSER_MESSAGES[locale];
    for (const key of CLOUD_BROWSER_KEYS) {
      assert.equal(
        typeof dictionary[key],
        "string",
        `${locale} missing ${key}`,
      );
      assert.ok(dictionary[key].length > 0, `${locale} empty ${key}`);
      if (locale !== "zh" && locale !== "zh-TW") {
        assert.notEqual(
          dictionary[key],
          key,
          `${locale} leaked Chinese fallback for ${key}`,
        );
      }
    }
  }
  assert.equal(CLOUD_BROWSER_MESSAGES.en["开机"], "Power on");
  assert.equal(CLOUD_BROWSER_MESSAGES.zh["开机"], "开机");
});
