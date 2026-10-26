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
    async negotiateMedia() { negotiations++; return { ok: true, data: { media, media_status: { state: "starting" } } }; },
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

test("ARTC unavailable stops and explains failure; only explicit unsupported capability uses labelled legacy", async () => {
  const failed = await mount({ overrides: { async negotiateMedia() { return { ok: false, error: "media_unavailable" }; } } });
  assert.equal(failed.screen().getAttribute("data-remote-phase"), "error");
  assert.equal(failed.image(), null);
  assert.match(failed.screen().textContent, /视频服务暂不可用/);
  await failed.unmount();
  const legacy = await mount({ overrides: { async negotiateMedia() { return { ok: false, error: "media_unsupported" }; } } });
  await legacy.frame();
  assert.ok(legacy.image());
  assert.match(legacy.screen().textContent, /兼容画面/);
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
