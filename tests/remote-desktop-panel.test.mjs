import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { mountStream, document, window, act, settle } from "./helpers/remote-desktop-stream-view.mjs";

const mounted = [];
async function mount(options) { const view = await mountStream(options); mounted.push(view); return view; }
afterEach(async () => { while (mounted.length) await mounted.pop().unmount(); });

test("desktop fills a dedicated portal, preserves aspect ratio and uses continuous transport", async () => {
  const view = await mount();
  assert.equal(view.host.children.length, 0);
  assert.equal(view.screen().style.position, "fixed");
  assert.equal(view.screen().style.inset, "0");
  assert.equal(view.image().style.objectFit, "contain");
  assert.equal(view.log.httpFrames, 0);
  assert.equal(document.body.style.overflow, "hidden");
  const buttons = [...view.screen().querySelectorAll("button")].map((button) => button.textContent);
  assert.deepEqual(buttons, ["全屏", "退出桌面"]);
  await view.fire(view.image(), new window.Event("load"));
  assert.deepEqual(view.log.acknowledgements, [1], "capture credit follows actual image load");
  await view.unmount();
  assert.equal(document.body.style.overflow, "");
  assert.deepEqual(view.log.closes, ["session-stream"]);
});

test("pending target consent cannot display even an injected frame or emit input", async () => {
  const view = await mount({ pending: true });
  await view.frame();
  assert.equal(view.image(), null);
  assert.equal(view.input().disabled, true);
  await view.key("keydown", "Enter");
  await view.pointer("pointerdown");
  assert.deepEqual(view.log.inputs, []);
  await act(async () => view.handlers().state("active"));
  await view.frame();
  assert.ok(view.image());
});

test("drag is down, continuous move, up in order while new frames continue", async () => {
  const view = await mount();
  await view.pointer("pointerdown", 260, 140);
  assert.deepEqual(view.log.inputs, [{ kind: "pointer_down", x: .25, y: .25, button: "left" }]);
  await view.pointer("pointermove", 420, 230);
  await settle(20);
  await view.frame(2);
  await view.pointer("pointerup", 740, 410);
  assert.deepEqual(view.log.inputs, [
    { kind: "pointer_down", x: .25, y: .25, button: "left" },
    { kind: "move", x: .5, y: .5 },
    { kind: "pointer_up", x: 1, y: 1, button: "left" },
  ]);
});

test("modifiers, key repeats and releases stay ordered, including a changed key-up case", async () => {
  const view = await mount();
  await view.key("keydown", "Shift", { code: "ShiftLeft", shiftKey: true });
  await view.key("keydown", "A", { code: "KeyA", shiftKey: true });
  await view.key("keydown", "A", { code: "KeyA", shiftKey: true, repeat: true });
  await view.key("keyup", "Shift", { code: "ShiftLeft" });
  await view.key("keyup", "a", { code: "KeyA" });
  assert.deepEqual(view.log.inputs, [
    { kind: "key_down", key: "Shift" }, { kind: "key_down", key: "A" }, { kind: "key_down", key: "A" },
    { kind: "key_up", key: "Shift" }, { kind: "key_up", key: "A" },
  ]);
});

test("a modifier already held before focus arrives before the first pointer press", async () => {
  const view = await mount();
  await view.pointer("pointerdown", 420, 230, { ctrlKey: true });
  assert.deepEqual(view.log.inputs.slice(0, 2), [{ kind: "key_down", key: "Control" }, { kind: "pointer_down", x: .5, y: .5, button: "left" }]);
  await view.key("keyup", "Control", { code: "ControlLeft" });
  assert.deepEqual(view.log.inputs.at(-1), { kind: "key_up", key: "Control" });
});

test("chorded pointer buttons preserve both presses until each is released", async () => {
  const view = await mount();
  await view.pointer("pointerdown");
  await view.pointer("pointermove", 420, 230, { buttons: 3 });
  await view.pointer("pointermove", 420, 230, { buttons: 2 });
  await view.pointer("pointerup", 420, 230, { button: 2 });
  assert.deepEqual(view.log.inputs.filter((action) => action.kind.startsWith("pointer_")), [
    { kind: "pointer_down", x: .5, y: .5, button: "left" },
    { kind: "pointer_down", x: .5, y: .5, button: "right" },
    { kind: "pointer_up", x: .5, y: .5, button: "left" },
    { kind: "pointer_up", x: .5, y: .5, button: "right" },
  ]);
});

test("blur discards unsent motion and releases owned input immediately", async () => {
  const view = await mount();
  await view.pointer("pointerdown");
  await view.pointer("pointermove", 700, 300);
  await view.key("keydown", "Control", { code: "ControlLeft", ctrlKey: true });
  await view.fire(window, new window.Event("blur"));
  const length = view.log.inputs.length;
  await settle(25);
  assert.equal(view.log.inputs.length, length);
  assert.deepEqual(view.log.inputs.at(-1), { kind: "release_all" });
});

test("letterbox and outside presses do not control the target", async () => {
  const view = await mount();
  view.image().getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 640 });
  await view.pointer("pointerdown", 420, 60);
  await view.pointer("pointerup", 420, 230);
  assert.deepEqual(view.log.inputs, []);
});

test("unknown ACK / broken stream ends the session without replay or HTTP downgrade", async () => {
  const view = await mount();
  await view.key("keydown", "Enter");
  await act(async () => view.handlers().error("input_ack_unknown"));
  assert.equal(view.image(), null);
  assert.equal(view.screen().getAttribute("data-remote-phase"), "error");
  await view.key("keydown", "Enter");
  assert.equal(view.log.inputs.filter((action) => action.kind === "key_down").length, 1);
  assert.equal(view.log.httpFrames, 0);
});

for (const [code, phase] of [["denied", "denied"], ["request_expired", "timed_out"], ["revoked", "revoked"], ["signed_out", "signed_out"]]) {
  test(`${code} clears pixels and has a distinct final state`, async () => {
    const view = await mount();
    await act(async () => view.handlers().state("closed", code));
    assert.equal(view.image(), null);
    assert.equal(view.screen().getAttribute("data-remote-phase"), phase);
    assert.equal(view.input().disabled, true);
  });
}

test("close tears down and calls routing owner once", async () => {
  const view = await mount();
  const button = [...view.screen().querySelectorAll("button")].find((item) => item.textContent === "退出桌面");
  await act(async () => button.click());
  const count = view.log.inputs.length;
  await view.pointer("pointerdown");
  assert.equal(view.log.inputs.length, count);
  assert.equal(view.log.onClose, 1);
  await view.unmount();
  assert.equal(view.log.closes.length, 1);
});

for (const transport of [undefined, "http-v1"]) test(`an older target (${transport || "absent transport"}) retains HTTP frame and input compatibility`, async () => {
  const view = await mount({ pending: true, overrides: {
    async openStream() { assert.fail("an old target must never attempt WSS"); },
    async createSession() { return { ok: true, data: { session_id: "legacy-session", state: "connecting", expires_at: "", transport } }; },
    async getFrame() { return { ok: true, data: { state: "active", frame: { image: "data:image/jpeg;base64,/9j/AAAA", width: 1920, height: 1080, sequence: 1 } } }; },
  } });
  view.image().getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360 });
  await view.pointer("pointerdown");
  await view.pointer("pointerup");
  await view.key("keydown", "Enter");
  assert.deepEqual(view.log.inputs, [{ kind: "click", x: .5, y: .5, button: "left" }, { kind: "keypress", key: "Enter" }]);
});
