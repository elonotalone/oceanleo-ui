import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { mountStream, act } from "./helpers/remote-desktop-stream-view.mjs";

const mounted = [];
afterEach(async () => { while (mounted.length) await mounted.pop().unmount(); delete globalThis.__remoteMediaTestStart; });
const descriptor = { provider: "artc", transport: "artc-v1", app_id: "fixture-app", channel_id: "fixture-session", user_id: "viewer", publisher_id: "desktop", token: "fixture-token", expires_at: new Date(Date.now() + 120000).toISOString(), role: "viewer", track: "screen", camera: false, microphone: false };
const geometry = { display_id: "a", width: 1920, height: 1080 };
const publishing = (value = geometry) => ({ state: "publishing", geometry: value });
async function mount(options = {}) {
  let callbacks, starts = 0, stops = 0, acknowledgements = 0;
  globalThis.__remoteMediaTestStart = async (_descriptor, _video, handlers, signal) => {
    callbacks = handlers; starts++;
    signal.addEventListener("abort", () => { stops++; });
    return { async close() {} };
  };
  const view = await mountStream({ pending: options.pending ?? false, streamOverrides: { acknowledgeMediaFrame() { acknowledgements++; } }, overrides: {
    async negotiateMedia() { return { ok: true, data: { media: descriptor, media_status: publishing() } }; },
    ...options.overrides,
  } });
  mounted.push(view);
  return Object.assign(view, {
    media: () => callbacks, starts: () => starts, stops: () => stops, acknowledgements: () => acknowledgements,
    video: () => view.screen().querySelector("video"),
    async decoded(width = 1920, height = 1080) { await act(async () => { callbacks.frame(width, height); callbacks.state("playing"); }); },
  });
}

test("a media stall keeps the picture and geometry visible, shows a pill, and blocks all input until a decoded recovery", async () => {
  const view = await mount(); await view.decoded();
  const video = view.video();
  video.getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360 });
  assert.equal(video.style.opacity, "1");
  await view.pointer("pointerdown");
  await act(async () => view.media().state("reconnecting"));
  assert.equal(view.video(), video);
  assert.equal(view.video().style.opacity, "1", "last decoded pixels remain visible");
  assert.equal(view.input().disabled, true);
  assert.deepEqual(view.log.inputs.at(-1), { kind: "release_all" });
  assert.match(view.screen().textContent, /1920×1080/);
  const pill = view.screen().querySelector("[data-remote-media-notice]");
  assert.match(pill.textContent, /连接不稳，正在重试/);
  assert.equal(pill.style.inset, "");
  assert.equal(pill.style.height, "");
  assert.equal(pill.style.pointerEvents, "none");
  const before = view.log.inputs.length;
  await view.key("keydown", "x"); await view.pointer("pointerdown"); await view.pointer("pointerup");
  assert.equal(view.log.inputs.slice(before).some((action) => action.kind !== "release_all"), false);
  await act(async () => view.media().state("playing"));
  assert.equal(view.input().disabled, true, "a state notification cannot stand in for a decoded frame");
  await view.decoded();
  assert.equal(view.input().disabled, false);
  assert.equal(view.screen().querySelector("[data-remote-media-notice]"), null);
  assert.equal(view.starts(), 1); assert.equal(view.stops(), 0);
});

test("a gateway reconnect retains the same video, receiver and session, then resumes without negotiation", async () => {
  const view = await mount(); await view.decoded(); const video = view.video();
  await act(async () => view.handlers().state("reconnecting"));
  assert.equal(view.screen().getAttribute("data-remote-phase"), "reconnecting");
  assert.equal(view.video(), video);
  assert.equal(view.video().style.opacity, "1");
  assert.equal(view.stops(), 0);
  const pill = view.screen().querySelector("[data-remote-reconnecting-notice]");
  assert.ok(pill); assert.equal(pill.style.inset, ""); assert.equal(pill.style.pointerEvents, "none");
  const before = view.log.inputs.length;
  await view.key("keydown", "x");
  assert.equal(view.log.inputs.slice(before).some((action) => action.kind === "key_down"), false);
  await act(async () => view.handlers().state("active"));
  assert.equal(view.video(), video); assert.equal(view.input().disabled, false);
  assert.equal(view.starts(), 1); assert.equal(view.stops(), 0);
  assert.deepEqual(view.log.closes, []);
});

test("a pointer gesture begun during media loss cannot finish against the recovered picture", async () => {
  const view = await mount(); await view.decoded();
  view.video().getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360 });
  await act(async () => view.media().state("reconnecting"));
  const before = view.log.inputs.length;
  await view.pointer("pointerdown");
  await view.decoded();
  await view.pointer("pointerup");
  assert.equal(view.log.inputs.slice(before).some((action) => action.kind.startsWith("pointer")), false);
});

test("missing publisher geometry pauses input without discarding the last picture", async () => {
  const view = await mount(); await view.decoded(); const video = view.video();
  await act(async () => view.handlers().media(descriptor, null));
  assert.equal(view.video(), video); assert.equal(video.style.opacity, "1");
  assert.equal(view.input().disabled, true);
  assert.match(view.screen().querySelector("[data-remote-media-notice]").textContent, /等这台电脑显示画面/);
  await act(async () => view.handlers().media(descriptor, publishing()));
  assert.equal(video.style.opacity, "1", "same geometry after a telemetry gap preserves pixels");
  assert.equal(view.input().disabled, true);
  await view.decoded(); assert.equal(view.input().disabled, false);
});

test("socket reattachment keeps the video and releases held input before reacknowledging its frame", async () => {
  let current;
  const streams = [];
  const view = await mount({ pending: true, overrides: {
    async openStream(_device, _session, callbacks) {
      current = callbacks;
      const sent = [];
      const stream = { send(action) { sent.push(action); return true; }, acknowledgeMediaFrame() { sent.push({ kind: "media_ready" }); }, close() {}, lastSequence: () => 41, sent };
      streams.push(stream);
      callbacks.state("active");
      return { ok: true, data: stream };
    },
  } });
  await view.decoded(); const video = view.video();
  await act(async () => current.error("network_error"));
  assert.equal(streams.length, 2);
  assert.deepEqual(streams[1].sent, [{ kind: "release_all" }, { kind: "media_ready" }]);
  assert.equal(view.video(), video); assert.equal(video.style.opacity, "1");
  assert.equal(view.starts(), 1); assert.equal(view.stops(), 0);
  assert.deepEqual(view.log.closes, []);
});

test("a genuine geometry change invalidates the old picture and waits for a matching decoded frame", async () => {
  const view = await mount(); await view.decoded(); const video = view.video();
  await act(async () => view.handlers().media(descriptor, publishing({ display_id: "b", width: 1200, height: 1920 })));
  assert.equal(view.video(), video); assert.equal(video.style.opacity, "0");
  assert.equal(view.input().disabled, true);
  await view.decoded();
  assert.equal(view.input().disabled, true); assert.equal(video.style.opacity, "0");
  await view.decoded(1200, 1920);
  assert.equal(view.input().disabled, false); assert.equal(video.style.opacity, "1");
});

test("same-size display changes require a fresh decoded frame and media acknowledgement", async () => {
  const view = await mount(); await view.decoded();
  assert.equal(view.acknowledgements(), 1);
  await act(async () => view.handlers().media(descriptor, publishing({ ...geometry, display_id: "b" })));
  assert.equal(view.video().style.opacity, "0"); assert.equal(view.input().disabled, true);
  await act(async () => view.media().state("playing"));
  assert.equal(view.input().disabled, true);
  await view.decoded(); assert.equal(view.input().disabled, false);
  assert.equal(view.acknowledgements(), 2);
});

test("terminal media failure and session end remove retained pixels and tear down the receiver", async () => {
  for (const reason of ["media_frame_timeout", "session_closed"]) {
    const view = await mount(); await view.decoded();
    if (reason === "session_closed") await act(async () => view.handlers().state("closed", reason));
    else await act(async () => view.media().state("error", reason));
    assert.equal(view.video(), null); assert.equal(view.input().disabled, true);
    assert.equal(view.stops(), 1); assert.deepEqual(view.log.closes, ["session-stream"]);
    await view.unmount();
  }
});
