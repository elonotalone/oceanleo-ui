// W14 · 「复制诊断信息」：字段齐全（浏览器、系统、设备名、权限状态、统计数字、时间、版别），不含任何 token。
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  REPORT_FIELDS,
  buildDiagnosticsReport,
  parseBrowser,
  parseOs,
  redactSecrets,
} from "../src/shell/messages/call/diagnostics/report.ts";

const CHROME_MAC =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.6723.91 Safari/537.36";
const JWT = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
const ARTC_TOKEN = "eyJhcHBpZCI6ImFwcC14IiwiY2hhbm5lbGlkIjoiZGlhZy0wMTIzIiwidXNlcmlkIjoidTAxMjMiLCJub25jZSI6IiIsInRpbWVzdGFtcCI6MTkwMDAwMDAwMCwidG9rZW4iOiJhYmNkZWYwMTIzNDU2Nzg5In0=";

function input(over = {}) {
  return {
    time: "2026-10-23T02:30:00.000Z",
    edition: "cn",
    client: "web",
    userAgent: CHROME_MAC,
    devices: {
      microphones: [
        { label: "MacBook Pro Microphone", selected: true },
        { label: "USB Headset", selected: false },
      ],
      cameras: [{ label: "FaceTime HD Camera", selected: true }],
      speakers: [{ label: "", selected: false }],
    },
    permissions: { microphone: "granted", camera: "prompt" },
    speakerSelectable: true,
    micPeak: 0.42,
    call: {
      phase: "connected",
      network: 4,
      audioOnly: false,
      stats: { rttMs: 48, upLossPct: null, downLossPct: 1.25, upKbps: 36, downKbps: 420 },
      issues: ["mic_silent"],
    },
    test: {
      grade: "good",
      numbers: { rttMs: 52, upLossPct: null, downLossPct: null, upKbps: 31, downKbps: null, joinMs: 820 },
      error: null,
    },
    ...over,
  };
}

function rows(text) {
  const lines = text.split("\n");
  assert.equal(lines[0], "OceanLeo call diagnostics");
  return Object.fromEntries(
    lines.slice(1).map((line) => {
      const at = line.indexOf(": ");
      return [line.slice(0, at), line.slice(at + 2)];
    }),
  );
}

test("every field is present exactly once and in the documented order", () => {
  const text = buildDiagnosticsReport(input());
  const keys = text.split("\n").slice(1).map((line) => line.slice(0, line.indexOf(": ")));
  assert.deepEqual(keys, [...REPORT_FIELDS]);
  for (const required of ["time", "edition", "browser", "os", "devices.microphone", "devices.camera", "devices.speaker", "permission.microphone", "permission.camera", "call.stats", "test.result", "test.stats"]) {
    assert.ok(REPORT_FIELDS.includes(required), required);
  }
});

test("values: browser, OS, device names with selection, permissions, stats, time, edition", () => {
  const r = rows(buildDiagnosticsReport(input()));
  assert.equal(r.time, "2026-10-23T02:30:00.000Z");
  assert.equal(r.edition, "cn");
  assert.equal(r.client, "web");
  assert.equal(r.browser, "Chrome 130.0.6723.91");
  assert.equal(r.os, "macOS 10.15.7");
  assert.equal(r["devices.microphone"], "MacBook Pro Microphone [selected]; USB Headset");
  assert.equal(r["devices.camera"], "FaceTime HD Camera [selected]");
  assert.equal(r["devices.speaker"], "#1 (label hidden)");
  assert.equal(r["speaker.selectable"], "yes");
  assert.equal(r["permission.microphone"], "granted");
  assert.equal(r["permission.camera"], "prompt");
  assert.equal(r["mic.peak"], "42%");
  assert.equal(r["call.phase"], "connected");
  assert.equal(r["call.network"], "4 (good)");
  assert.equal(r["call.audio_only"], "no");
  assert.equal(r["call.stats"], "rtt=48 ms up_loss=— down_loss=1.3% up=36 kbps down=420 kbps");
  assert.equal(r["call.issues"], "mic_silent");
  assert.equal(r["test.result"], "good");
  assert.equal(r["test.stats"], "rtt=52 ms up_loss=— down_loss=— up=31 kbps down=—");
  assert.equal(r["test.join"], "820 ms");
  assert.equal(r["test.error"], "none");
});

test("outside a call and before any test the report still has every field", () => {
  const r = rows(
    buildDiagnosticsReport(
      input({ call: null, test: null, micPeak: null, speakerSelectable: null, edition: "global", time: new Date(Date.UTC(2026, 9, 23)) }),
    ),
  );
  assert.equal(Object.keys(r).length, REPORT_FIELDS.length);
  assert.equal(r.time, "2026-10-23T00:00:00.000Z");
  assert.equal(r.edition, "global");
  assert.equal(r["call.phase"], "idle");
  assert.equal(r["call.stats"], "—");
  assert.equal(r["test.result"], "not_run");
  assert.equal(r["mic.peak"], "not_tested");
  assert.equal(r["speaker.selectable"], "unknown");
});

test("no token ever: credentials are not an input, and token-shaped text is scrubbed anyway", () => {
  // Someone passes the whole test-token response along by mistake: the whitelist ignores it.
  const sloppy = {
    ...input(),
    rtc: { app_id: "app-x", channel_id: "diag-0123", user_id: "u0123", token: ARTC_TOKEN, timestamp: 1_900_000_000 },
    access_token: JWT,
  };
  const text = buildDiagnosticsReport(sloppy);
  assert.doesNotMatch(text, /eyJ/);
  assert.ok(!text.includes(ARTC_TOKEN));
  assert.ok(!text.includes(JWT));
  assert.doesNotMatch(text, /diag-0123|app-x|u0123/, "no channel / app / user identifiers either");

  // Token smuggled into a device label or an error message is redacted.
  const smuggled = buildDiagnosticsReport(
    input({
      devices: {
        microphones: [{ label: `Mic ${JWT}`, selected: true }],
        cameras: [{ label: "Cam token=abcdef123456", selected: false }],
        speakers: [{ label: `Out Bearer ${ARTC_TOKEN}`, selected: false }],
      },
      test: { grade: "failed", numbers: null, error: `join_failed access_token: ${JWT}` },
    }),
  );
  assert.ok(!smuggled.includes(JWT));
  assert.ok(!smuggled.includes(ARTC_TOKEN));
  assert.doesNotMatch(smuggled, /abcdef123456/);
  assert.match(smuggled, /\[redacted\]/);
  assert.match(smuggled, /devices\.microphone: Mic \[redacted\] \[selected\]/);
});

test("redactSecrets handles JWTs, bearer headers, key=value secrets and long opaque strings", () => {
  assert.equal(redactSecrets(`a ${JWT} b`), "a [redacted] b");
  assert.equal(redactSecrets("Authorization: Bearer abc.def"), "Authorization: Bearer [redacted]");
  assert.equal(redactSecrets('{"token":"s3cr3t"}'), '{"token":"[redacted]"}');
  assert.equal(redactSecrets("password=hunter2&x=1"), "password=[redacted]&x=1");
  assert.equal(redactSecrets(`k ${"A".repeat(48)}`), "k [redacted]");
  assert.equal(redactSecrets(CHROME_MAC), CHROME_MAC, "a normal user agent is untouched");
  assert.equal(redactSecrets("MacBook Pro Microphone (Built-in)"), "MacBook Pro Microphone (Built-in)");
});

test("browser / OS parsing covers the platforms we ship to", () => {
  const cases = [
    [CHROME_MAC, "Chrome 130.0.6723.91", "macOS 10.15.7"],
    [
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.2849.56",
      "Edge 130.0.2849.56",
      "Windows 10.0",
    ],
    ["Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0", "Firefox 131.0", "Linux"],
    [
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15",
      "Safari 18.0",
      "macOS 10.15.7",
    ],
    [
      "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1",
      "Safari 18.0",
      "iOS 18.0",
    ],
    [
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
      "Chrome 130.0.0.0",
      "Android 14",
    ],
    ["", "unknown", "unknown"],
  ];
  for (const [ua, browser, os] of cases) {
    const b = parseBrowser(ua);
    const o = parseOs(ua);
    assert.equal(b.version ? `${b.name} ${b.version}` : b.name, browser, ua);
    assert.equal(o.version ? `${o.name} ${o.version}` : o.name, os, ua);
  }
});

test("source: the report builder takes no credential input and the panel never hands it the rtc object", async () => {
  const report = await readFile(new URL("../src/shell/messages/call/diagnostics/report.ts", import.meta.url), "utf8");
  const inputType = report.slice(report.indexOf("export interface DiagnosticsReportInput"), report.indexOf("export interface ParsedAgent"));
  assert.doesNotMatch(inputType, /token|rtc|secret|credential/i);
  const panel = await readFile(new URL("../src/shell/messages/call/diagnostics/CallTestPanel.tsx", import.meta.url), "utf8");
  const call = panel.slice(panel.indexOf("buildDiagnosticsReport("));
  const args = call.slice(0, call.indexOf(");") + 2);
  assert.ok(args.length > "buildDiagnosticsReport(".length);
  assert.doesNotMatch(args, /\brtc\b|token/i);
  assert.doesNotMatch(panel, /console\.(log|info|debug)\([^)]*rtc/);
});
