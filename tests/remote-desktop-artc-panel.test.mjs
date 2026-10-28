import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { mountStream, window, act, settle } from "./helpers/remote-desktop-stream-view.mjs";

const mounted = [];
afterEach(async () => { while (mounted.length) await mounted.pop().unmount(); delete globalThis.__remoteMediaTestStart; });
const media = { provider: "artc", transport: "artc-v1", app_id: "app", channel_id: "channel", user_id: "viewer", publisher_id: "desktop", token: "secret", timestamp: 10000, expires_at: new Date(Date.now() + 120000).toISOString(), role: "viewer", track: "screen", camera: false, microphone: false };
async function mount(options = {}) {
  let callbacks, stopped = 0, negotiations = 0;
  globalThis.__remoteMediaTestStart = async (_descriptor, _video, handlers, signal) => {
    callbacks = handlers;
    signal.addEventListener("abort", () => { stopped++; });
    return { async close() {} };
  };
  const view = await mountStream({ ...options, overrides: {
    async negotiateMedia() { negotiations++; return { ok: true, data: { media, media_status: { state: "publishing", geometry: { display_id: "a", width: 1920, height: 1080 } } } }; },
    ...options.overrides,
  } });
  mounted.push(view);
  return Object.assign(view, { mediaCallbacks: () => callbacks, stopped: () => stopped, negotiations: () => negotiations });
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

test("ARTC unavailable stops and explains failure; explicit unsupported capability names the computer and retains pictures", async () => {
  const failed = await mount({ overrides: { async negotiateMedia() { return { ok: false, error: "media_unavailable" }; } } });
  assert.equal(failed.screen().getAttribute("data-remote-phase"), "error");
  assert.equal(failed.image(), null);
  assert.match(failed.screen().textContent, /视频服务暂不可用/);
  await failed.unmount();
  const legacy = await mount({ overrides: { async negotiateMedia() { return { ok: false, error: "media_unsupported" }; } } });
  await legacy.frame();
  assert.ok(legacy.image());
  assert.match(legacy.screen().querySelector("[data-remote-input-status]").textContent, /「Studio」上的 OceanLeo 当前没有视频能力/);
  assert.doesNotMatch(legacy.screen().textContent, /兼容画面|请更新|输入正在等待确认/);
  await act(async () => legacy.handlers().state("active"));
  assert.equal(legacy.screen().getAttribute("data-remote-media"), "legacy");
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

test("display switch gates input until publisher confirms the selected display AND another frame arrives", async () => {
  const view = await mount();
  const displays = [{ display_id: "a", label: "A", width: 1920, height: 1080 }, { display_id: "b", label: "B", width: 1920, height: 1080 }];
  await act(async () => view.handlers().media(media, { state: "publishing", geometry: displays[0], displays }));
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  const select = view.screen().querySelector('select[aria-label="显示器"]');
  await act(async () => { select.value = "b"; select.dispatchEvent(new window.Event("change", { bubbles: true })); });
  await settle();
  await act(async () => { view.mediaCallbacks().frame(1920, 1080); view.mediaCallbacks().state("playing"); });
  assert.equal(view.input().disabled, true);
  await act(async () => view.handlers().media(media, { state: "publishing", geometry: displays[1], displays }));
  assert.equal(view.input().disabled, true, "publisher telemetry alone is not a rendered frame");
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
  await act(async () => view.screen().querySelector("[data-remote-connect]").click());
  await settle();
  assert.equal(requests, 2);
  assert.deepEqual(view.log.closes, [], "never closes another viewer's session");
});
