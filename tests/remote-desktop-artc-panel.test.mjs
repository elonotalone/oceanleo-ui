import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { mountStream, window, act, settle } from "./helpers/remote-desktop-stream-view.mjs";
import { openRemoteMedia as actualOpenRemoteMedia } from "../src/pages/remote-desktop-media.ts";
const openRemoteMedia = (...args) => { args[5] ??= () => ({ track: { kind: "video", id: "synthetic" }, stop() {} }); return actualOpenRemoteMedia(...args); };

const mounted = [];
afterEach(async () => { while (mounted.length) await mounted.pop().unmount(); delete globalThis.__remoteMediaTestStart; });
const media = { provider: "artc", transport: "artc-v1", app_id: "app", channel_id: "channel", user_id: "viewer", publisher_id: "desktop", token: "secret", timestamp: 10000, expires_at: new Date(Date.now() + 120000).toISOString(), role: "viewer", track: "screen", camera: false, microphone: false, data_channel_input: true };
async function mount(options = {}) {
  let callbacks, stopped = 0, negotiations = 0, statsCalls = 0;
  globalThis.__remoteMediaTestStart = async (_descriptor, _video, handlers, signal) => {
    callbacks = handlers;
    signal.addEventListener("abort", () => { stopped++; });
    return { async close() {}, async stats() { statsCalls++; return []; } };
  };
  const view = await mountStream({ ...options, overrides: {
    async negotiateMedia() { negotiations++; return { ok: true, data: { media, media_status: { state: "publishing", geometry: { display_id: "a", width: 1920, height: 1080 } } } }; },
    ...options.overrides,
  } });
  mounted.push(view);
  return Object.assign(view, { mediaCallbacks: () => callbacks, stopped: () => stopped, negotiations: () => negotiations, statsCalls: () => statsCalls });
}

test("real panel waits for decoded video before enabling input, and a legacy JPEG cannot masquerade as ARTC", async () => {
  const view = await mount();
  assert.equal(view.screen().getAttribute("data-remote-media"), "artc");
  assert.ok(view.screen().querySelector("video"));
  assert.equal(view.image(), null);
  assert.equal(view.input().disabled, true);
  await view.pointer("pointerdown");
  assert.equal(view.log.inputs.some((input) => input.kind === "pointer_down"), false);
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  view.screen().querySelector("video").getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360 });
  assert.equal(view.input().disabled, false);
  await view.pointer("pointerdown"); await view.pointer("pointerup");
  assert.deepEqual(view.log.inputs.filter((input) => input.kind.startsWith("pointer")), [{ kind: "pointer_down", x: .5, y: .5, button: "left" }, { kind: "pointer_up", x: .5, y: .5, button: "left" }]);
  await act(async () => view.mediaCallbacks().state("reconnecting"));
  assert.equal(view.input().disabled, true);
  assert.deepEqual(view.log.inputs.at(-1), { kind: "release_all" });
});

test("ARTC unsupported stops without a JPEG fallback", async () => {
  for (const code of ["media_unavailable", "media_unsupported"]) {
    const view = await mount({ overrides: { async negotiateMedia() { return { ok: false, error: code }; } } });
    await view.frame(); assert.equal(view.image(), null); assert.equal(view.screen().querySelector("video"), null);
    assert.equal(view.input().disabled, true); assert.equal(view.log.httpFrames, 0);
    assert.match(view.screen().textContent, code === "media_unsupported" ? /ARTC/ : /视频服务暂不可用/);
    await view.unmount();
  }
});

test("consent precedes media negotiation and revocation removes pixels and receiver", async () => {
  const view = await mount({ pending: true });
  assert.equal(view.negotiations(), 0);
  await act(async () => view.handlers().state("active"));
  await settle();
  assert.equal(view.negotiations(), 1);
  await act(async () => view.handlers().media(media, { state: "publishing" }));
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  await act(async () => view.handlers().media(null, null));
  assert.equal(view.screen().querySelector("video"), null);
  assert.equal(view.input().disabled, true);
  assert.equal(view.stopped(), 1);
});

test("display switch waits for a decoded frame, independently of late publisher metadata", async () => {
  const view = await mount();
  const displays = [{ display_id: "a", label: "A", width: 1920, height: 1080 }, { display_id: "b", label: "B", width: 1920, height: 1080 }];
  await act(async () => view.handlers().media(media, { state: "publishing", geometry: displays[0], displays }));
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  await view.openToolbar();
  const select = view.screen().querySelector('select[aria-label="显示器"]');
  await act(async () => { select.value = "b"; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  await settle();
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  assert.equal(view.input().disabled, false, "fresh selected decoder output is sufficient");
  await act(async () => view.handlers().media(media, { state: "publishing", geometry: displays[1], displays }));
  assert.equal(view.input().disabled, false, "late publisher metadata cannot hide the picture");
  await act(async () => view.mediaCallbacks().frame(1920, 1080));
  assert.equal(view.input().disabled, false);
});

test("reconnect creates a new authorized session and never replays old input", async () => {
  let sessions = 0;
  const view = await mount({ overrides: {
    async createSession() { return { ok: true, data: { session_id: `session-${++sessions}`, state: "connecting", transport: "websocket-v2", expires_at: "" } }; },
  } });
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  await view.key("keydown", "Enter");
  await act(async () => view.handlers().error("input_ack_unknown"));
  assert.equal(view.input().disabled, true);
  await view.openToolbar();
  const reconnect = [...view.screen().querySelectorAll("button")].find((button) => button.textContent === "重新连接");
  await act(async () => reconnect.click());
  await settle();
  assert.equal(sessions, 2);
  assert.equal(view.input().disabled, true);
  assert.deepEqual(view.log.closes, ["session-1"]);
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  assert.equal(view.input().disabled, false);
  assert.equal(view.log.inputs.filter((input) => input.kind === "key_down").length, 1);
});

test("media failures retain HTTP status and explicit terminal reasons without permission advice or fallback", async () => {
  for (const [error, status, expected, phase] of [
    ["Method Not Allowed", 405, /服务版本不支持远程视频/, "error"],
    ["unknown", 401, /登录已失效/, "error"],
    ["unknown", 403, /当前账号无法访问/, "error"],
    ["signed_out", 409, /电脑尚未登录/, "signed_out"],
    ["controller_revoked", 403, /访问权限已撤销/, "revoked"],
  ]) {
    const view = await mount({ overrides: { async negotiateMedia() { return { ok: false, error, status }; } } });
    assert.equal(view.screen().getAttribute("data-remote-phase"), phase);
    assert.match(view.screen().textContent, expected);
    assert.doesNotMatch(view.screen().textContent, /屏幕录制权限|兼容画面/);
    assert.equal(view.input().disabled, true);
    assert.equal(view.screen().querySelector("video"), null);
    assert.deepEqual(view.log.closes, ["session-stream"]);
    await view.unmount();
  }
});

test("session conflict stops after one request and only reconnect click requests again", async () => {
  let requests = 0;
  const view = await mount({ pending: true, overrides: { async createSession() { requests++; return { ok: false, error: "session_active", status: 409 }; } } });
  await settle(1600);
  assert.equal(requests, 1);
  assert.match(view.screen().textContent, /已有一个正在进行的远程会话/);
  assert.equal(view.negotiations(), 0);
  await view.openToolbar();
  await act(async () => view.screen().querySelector("[data-remote-connect]").click());
  await settle();
  assert.equal(requests, 2);
  assert.deepEqual(view.log.closes, [], "never closes another viewer's session");
});

test("publisher failure stops rendered video/input and retains its exact reason after descriptor withdrawal", async () => {
  for (const [code, expected] of [
    ["screen_permission_required", /尚未允许屏幕录制/],
    ["screen_content_unavailable", /无法获取.*屏幕内容/],
    ["screen_content_timeout", /读取.*屏幕内容超时/],
    ["screen_display_mismatch", /显示器发生变化或无法使用/],
    ["screen_geometry_invalid", /显示器发生变化或无法使用/],
    ["screen_capture_output_failed", /无法输出屏幕画面/],
    ["screen_capture_start_failed", /画面未能启动/],
    ["screen_capture_start_timeout", /启动电脑画面超时/],
    ["screen_capture_cleanup_pending", /结束上一次画面采集/],
    ["screen_capture_quarantined", /画面采集暂不可用/],
    ["screen_capture_os_unsupported", /系统暂不支持屏幕采集/],
    ["screen_permission_or_capture_unavailable", /画面暂时无法获取/],
    ["NSError synthetic-private-detail token=fixture-only", /这一步没有完成/],
  ]) {
    const view = await mount();
    await act(async () => view.handlers().media(media, { state: "publishing", geometry: { display_id: "a", width: 1920, height: 1080 } }));
    await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
    assert.equal(view.input().disabled, false);
    // A revoked descriptor in the same report must not replace the specific failure.
    await act(async () => view.handlers().media(null, { state: "failed", error: code }));
    assert.equal(view.input().disabled, true, code);
    assert.equal(view.screen().querySelector("video"), null, code);
    assert.equal(view.screen().getAttribute("data-remote-phase"), "error", code);
    assert.match(view.screen().textContent, expected, code);
    assert.doesNotMatch(view.screen().textContent, /NSError|private-detail|token=|screen_|失去联系|不在线/, code);
    if (code !== "screen_permission_required") assert.doesNotMatch(view.screen().textContent, /权限|允许.*录制屏幕/, code);
    assert.deepEqual(view.log.closes, ["session-stream"]);
    await view.unmount();
  }
});

test("a failed negotiation snapshot never starts the receiver or hides capture timeout behind frame timeout", async () => {
  const view = await mount({ overrides: {
    async negotiateMedia() { return { ok: true, data: { media, media_status: { state: "failed", error: "screen_capture_start_timeout" } } }; },
  } });
  assert.equal(view.mediaCallbacks(), undefined);
  assert.equal(view.input().disabled, true);
  assert.match(view.screen().textContent, /启动电脑画面超时/);
  assert.deepEqual(view.log.closes, ["session-stream"]);
});

test("capture failure waits for explicit retry and fresh video without replaying held input", async () => {
  let sessions = 0;
  const view = await mount({ overrides: {
    async createSession() { return { ok: true, data: { session_id: `capture-${++sessions}`, state: "connecting", transport: "websocket-v2", expires_at: "" } }; },
  } });
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  await view.key("keydown", "Enter");
  await act(async () => view.handlers().media(media, { state: "failed", error: "screen_content_timeout" }));
  await settle(1600);
  assert.equal(sessions, 1, "capture failures never automatically reconnect");
  assert.equal(view.input().disabled, true);
  await view.openToolbar();
  await act(async () => view.screen().querySelector("[data-remote-connect]").click());
  await settle();
  assert.equal(sessions, 2);
  assert.equal(view.input().disabled, true);
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  assert.equal(view.input().disabled, false);
  assert.equal(view.log.inputs.filter(input => input.kind === "key_down").length, 1);
  assert.deepEqual(view.log.closes, ["capture-1"]);
});

test("real RTC renewal retains HTTP200 publisher failures, HTTP401/403 and neutral SDK errors", async () => {
  for (const [renewal, sdkFailure, expected, phase] of [
    [{ ok: true, data: { media, media_status: { state: "failed", error: "screen_content_timeout" } }, status: 200 }, false, /读取电脑屏幕内容超时/, "error"],
    [{ ok: true, data: { media, media_status: { state: "failed", error: "screen_permission_required" } }, status: 200 }, false, /尚未允许屏幕录制/, "error"],
    [{ ok: true, data: { media, media_status: { state: "failed", error: "NSError synthetic-private token=fixture-only" } }, status: 200 }, false, /画面暂时无法获取/, "error"],
    [{ ok: false, error: "unauthorized", status: 401 }, false, /登录已失效/, "error"],
    [{ ok: false, error: "controller_revoked", status: 403 }, false, /访问权限已撤销/, "revoked"],
    [{ ok: true, data: { media, media_status: { state: "publishing" } }, status: 200 }, true, /视频授权无法续期/, "error"],
  ]) {
    const events = new Map();
    let destroyed = 0, negotiations = 0;
    const engine = {
      setParameter() {}, sendDataChannelMessage() {}, startScreenShare() {}, stopScreenShare() {}, startScreenShare() {}, stopScreenShare() {},
      on: (name, listener) => events.set(name, listener), off: name => events.delete(name),
      setChannelProfile() {}, setClientRole() {}, setDefaultSubscribeAllRemoteAudioStreams() {}, setDefaultSubscribeAllRemoteVideoStreams() {},
      publishLocalAudioStream() {}, publishLocalVideoStream() {}, publishLocalScreenShareStream() {},
      joinChannel() {}, leaveChannel() {}, destroy() { destroyed++; },
      getOnlineRemoteUsers: () => [],
      refreshAuthInfo() { if (sdkFailure) throw Object.assign(new Error("SDK synthetic-private token=fixture-only"), { status: 403 }); },
    };
    globalThis.__remoteMediaTestStart = (...args) => openRemoteMedia(...args, async () => ({ createEngine: () => engine, dataChannelMessage: data => ({ data, type: 2 }) }));
    const view = await mountStream({ overrides: {
      async negotiateMedia() {
        return ++negotiations === 1 ? { ok: true, data: { media, media_status: { state: "publishing" } }, status: 200 } : renewal;
      },
    } });
    mounted.push(view);
    assert.equal(typeof events.get("authInfoWillExpire"), "function");
    await act(async () => { events.get("authInfoWillExpire")(); });
    await settle();
    assert.equal(negotiations, 2);
    assert.match(view.screen().textContent, expected);
    assert.doesNotMatch(view.screen().textContent, /NSError|SDK synthetic|private|fixture-only|screen_/);
    assert.equal(view.screen().getAttribute("data-remote-phase"), phase);
    assert.equal(view.input().disabled, true);
    assert.deepEqual(view.log.closes, ["session-stream"]);
    assert.equal(destroyed, 1);
    await view.unmount();
  }
});

test("first frame chain: video negotiation starts with the stream socket and is not repeated", async () => {
  const calls = [];
  const view = await mount({ overrides: {
    async negotiateMedia() { calls.push(Boolean(document.querySelector("[data-oceanleo-remote-desktop] video"))); return { ok: true, data: { media, media_status: { state: "publishing" } } }; },
  } });
  await settle();
  assert.deepEqual(calls, [false], "one negotiation, issued from session create before the video mounted");
  assert.ok(view.screen().querySelector("video"));
  assert.ok(view.mediaCallbacks(), "the video joined with the early credentials");
});

test("the owner's idle-computer handshake negotiates video early, once, before the computer answers", async () => {
  const calls = [];
  const view = await mount({ pending: true, overrides: {
    async createSession() { return { ok: true, data: { session_id: "session-stream", state: "pending_consent", expires_at: "", transport: "websocket-v2", owner_handshake: true } }; },
    async negotiateMedia() { calls.push(Boolean(document.querySelector("[data-oceanleo-remote-desktop] video"))); return { ok: true, data: { media, media_status: { state: "publishing" } } }; },
  } });
  await settle();
  assert.deepEqual(calls, [false], "negotiated from session create while consent was still pending");
  await act(async () => view.handlers().state("active"));
  await settle();
  assert.deepEqual(calls, [false], "the video reused the early credentials instead of negotiating again");
  assert.ok(view.mediaCallbacks(), "the video joined with the early credentials");
});

test("a consent-pending session does not negotiate video early", async () => {
  const view = await mount({ pending: true });
  await settle();
  assert.equal(view.negotiations(), 0);
});

test("publisher metrics in every status never restart the receiver or renegotiate (11-09 join loop)", async () => {
  let starts = 0, negotiations = 0;
  const start = globalThis.__remoteMediaTestStart;
  globalThis.__remoteMediaTestStart = (...args) => { starts++; return start(...args); };
  const view = await mount({ overrides: {
    // Real gateways attach a fresh publisher metrics object to every media status.
    async negotiateMedia() { negotiations++; return { ok: true, data: { media, media_status: { state: "publishing", metrics: { sdk_sent_fps: 20, pushes: Math.random() } } } }; },
  } });
  await settle();
  for (let index = 0; index < 5; index++) {
    await act(async () => view.handlers().media(media, { state: "publishing", metrics: { sdk_sent_fps: 20 + index, pushes: index } }));
    await settle();
  }
  assert.equal(negotiations, 1, "one /media negotiation for the whole join");
  assert.equal(view.stopped(), 0, "the joining receiver was never aborted");
  assert.equal(starts, 0, "no second receiver was started");
});


test("real panel collects SDK diagnostics in both quality windows and the end summary from the shared media sample", async (t) => {
  const reports = [], windows = [], viewerReports = [];
  t.mock.timers.enable({ apis: ["Date", "setInterval"], now: Date.now() });
  const view = await mount({
    streamOverrides: { sendViewerReport(value) { viewerReports.push(value); return true; } },
    overrides: {
      async reportQuality(value) { reports.push(value); return { ok: true }; },
      async reportQualityWindow(value) { windows.push(value); return { ok: true }; },
    },
  });
  try {
    await act(async () => {
      view.mediaCallbacks().diagnostic({ sdk_error: 16844114 });
      view.mediaCallbacks().diagnostic({ renew_reason: "auth_info_will_expire" });
      view.mediaCallbacks().stats({ fps: 30, framesDecoded: 100, packetsReceived: 1000 });
      view.mediaCallbacks().stats({ fps: 24, framesDecoded: 124, packetsReceived: 1100 });
      t.mock.timers.tick(10_000);
    });
    const expected = { sdk_error_codes: [16844114], renew_reasons: ["auth_info_will_expire"] };
    assert.equal(windows.length, 1);
    assert.deepEqual(windows[0].media_diagnostics, expected);
    assert.equal(viewerReports.length, 2);
    assert.equal(viewerReports.at(-1).fps_decoded, 24);
    assert.equal(view.statsCalls(), 0, "quality/window consumers never start a second RTC read");
    await view.unmount();
    assert.deepEqual(reports[0].media_diagnostics, expected);
    assert.equal(reports[0].video.samples, 2);
    const before = windows.length;
    t.mock.timers.tick(30_000);
    assert.equal(windows.length, before, "unmount clears the window timer");
    view.mediaCallbacks().stats({ fps: 1 });
    assert.equal(viewerReports.length, 2, "late media samples cannot survive cleanup");
  } finally { await view.unmount(); t.mock.timers.reset(); }
});

test("ordinary viewer opens the standard stream/media path directly without a status preflight", async () => {
  let statusRequests = 0, sessions = 0;
  const view = await mount({ overrides: {
    async getStatus() { statusRequests++; throw new Error("unexpected status preflight"); },
    async createSession() { sessions++; return { ok: true, data: { session_id: "standard", state: "connecting", transport: "websocket-v2" } }; },
  } });
  assert.equal(statusRequests, 0);
  assert.equal(sessions, 1);
  assert.equal(view.negotiations(), 1);
  assert.equal(view.log.httpFrames, 0);
  assert.equal(view.screen().getAttribute("data-remote-media"), "artc");
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  assert.equal(view.input().disabled, false);
});

test('DC failure is visible, stops the old session and backs off into a fresh session without replay', async () => {
  let sessions = 0;
  const view = await mount({ overrides: {
    async createSession() { return { ok: true, data: { session_id: `dc-session-${++sessions}`, state: 'connecting', transport: 'websocket-v2' } }; },
  } });
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state('playing'); });
  await view.key('keydown', 'Shift');
  await act(async () => view.handlers().error('media_data_channel_unavailable'));
  assert.equal(view.input().disabled, true);
  assert.match(view.screen().textContent, /输入连接已中断/);
  assert.deepEqual(view.log.closes, ['dc-session-1']);
  assert.equal(sessions, 1, 'new session waits for backoff');
  await settle(550);
  assert.equal(sessions, 2);
  const sentBeforeFreshFrame = view.log.inputs.length;
  await view.key('keydown', 'Enter');
  assert.equal(view.log.inputs.length, sentBeforeFreshFrame, 'fresh ARTC frame gates input');
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state('playing'); });
  assert.equal(view.log.inputs.filter(x => x.kind === 'key_down' && x.key === 'Shift').length, 1, 'unknown action is never replayed');
  assert.equal(view.log.httpFrames, 0);
});

test('closing during DC backoff cancels automatic recovery', async () => {
  let sessions=0;
  const view=await mount({overrides:{async createSession(){return {ok:true,data:{session_id:`dc-close-${++sessions}`,state:'connecting',transport:'websocket-v2'}};}}});
  await act(async()=>view.handlers().error('media_data_channel_unavailable'));
  await view.unmount(); await settle(550);
  assert.equal(sessions,1);
});
