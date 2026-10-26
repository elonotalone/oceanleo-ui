import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { mountStream, window, act } from "./helpers/remote-desktop-stream-view.mjs";
const mounted = [];
async function mount(options) { const view = await mountStream(options); mounted.push(view); return view; }
afterEach(async () => { while (mounted.length) await mounted.pop().unmount(); });

test("touch sends immediate press/release and compatibility mouse events do not duplicate it", async () => {
  const view = await mount({ coarse: true });
  await view.pointer("pointerdown", 420, 230, { pointerType: "touch" });
  await view.pointer("pointerup", 420, 230, { pointerType: "touch" });
  await view.fire(view.image(), new window.MouseEvent("click", { bubbles: true }));
  assert.deepEqual(view.log.inputs.map((action) => action.kind), ["pointer_down", "pointer_up"]);
});

test("mobile keyboard is available only on coarse pointers and summons the native input", async () => {
  const view = await mount({ coarse: true });
  assert.equal(view.input().inputMode, "none");
  await act(async () => view.screen().querySelector("[data-remote-keyboard-toggle]").click());
  assert.equal(view.input().inputMode, "text");
});

test("pointer cancellation and a second finger release the held target button", async () => {
  const view = await mount();
  await view.pointer("pointerdown");
  await view.pointer("pointercancel");
  assert.deepEqual(view.log.inputs.at(-1), { kind: "release_all" });
  await view.pointer("pointerdown", 420, 230, { pointerId: 1 });
  await view.pointer("pointerdown", 420, 230, { pointerId: 2 });
  assert.deepEqual(view.log.inputs.at(-1), { kind: "release_all" });
});

test("IME composition commits once, including Safari's late composition input", async () => {
  const view = await mount();
  const input = view.input();
  await view.fire(input, new window.CompositionEvent("compositionstart", { bubbles: true }));
  await view.key("keydown", "Process", { keyCode: 229 });
  input.value = "ni";
  await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "ni", inputType: "insertCompositionText", isComposing: true }));
  assert.equal(input.value, "ni");
  await view.fire(input, new window.CompositionEvent("compositionend", { bubbles: true, data: "你" }));
  input.value = "你";
  await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "你", inputType: "insertCompositionText" }));
  assert.deepEqual(view.log.inputs.filter((action) => action.kind === "type"), [{ kind: "type", text: "你" }]);
});

test("soft input without keydown inserts and clears its text", async () => {
  const view = await mount();
  view.input().value = "你好";
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, data: "你好", inputType: "insertText" }));
  assert.deepEqual(view.log.inputs, [{ kind: "type", text: "你好" }]);
  assert.equal(view.input().value, "");
});

test("noncancelable beforeinput and input deletion form one transaction", async () => {
  const view = await mount();
  await act(async () => {
    view.input().dispatchEvent(new window.InputEvent("beforeinput", { bubbles: true, inputType: "deleteContentBackward" }));
    view.input().dispatchEvent(new window.InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  });
  assert.deepEqual(view.log.inputs, [{ kind: "keypress", key: "Backspace" }]);
});

test("normal paste releases modifiers and sends clipboard text once in bounded chunks", async () => {
  const view = await mount();
  await view.key("keydown", "Control", { ctrlKey: true });
  const event = new window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", { value: { getData: () => "x".repeat(4500) } });
  await view.fire(view.input(), event);
  assert.equal(event.defaultPrevented, true);
  const text = view.log.inputs.filter((action) => action.kind === "type");
  assert.equal(text.map((action) => action.text).join("").length, 4500);
  assert.ok(text.every((action) => [...action.text].length <= 2000));
  assert.equal(view.log.inputs[1].kind, "release_all");
});
