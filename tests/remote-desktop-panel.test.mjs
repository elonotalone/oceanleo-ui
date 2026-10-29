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
  const buttons = [...view.screen().querySelectorAll("button")].map((button) => button.textContent || button.getAttribute("aria-label"));
  assert.deepEqual(buttons, ["原始大小", "全屏", "退出桌面"]);
  await view.fire(view.image(), new window.Event("load"));
  assert.deepEqual(view.log.acknowledgements, [1], "capture credit follows actual image load");
  await view.unmount();
  assert.equal(document.body.style.overflow, "");
  assert.deepEqual(view.log.closes, ["session-stream"]);
});

test("D6/D7: local OS cursor over the picture, no zoom select, one fit/original icon toggle", async () => {
  const view = await mount();
  const stage = view.screen().querySelector("[data-remote-stage]");
  assert.equal(stage.style.cursor, "default", "the controller's own cursor is never hidden");
  assert.equal(view.screen().querySelector("select[aria-label='画面缩放']"), null);
  assert.equal(view.screen().querySelectorAll("[data-remote-cursor]").length, 0, "no remote cursor is drawn");
  const toggle = view.screen().querySelector("[data-remote-fit-toggle]");
  assert.equal(toggle.getAttribute("title"), "原始大小");
  assert.equal(view.image().style.width, "100%", "fit to window by default");
  await view.fire(toggle, new window.MouseEvent("click", { bubbles: true }));
  assert.equal(toggle.getAttribute("title"), "适应窗口");
  assert.equal(toggle.getAttribute("aria-pressed"), "true");
  assert.match(view.image().style.width, /px$/, "original size uses the frame's own pixels");
  assert.equal(stage.style.overflow, "auto");
  await view.fire(toggle, new window.MouseEvent("click", { bubbles: true }));
  assert.equal(view.image().style.width, "100%");
});

test("goal 6: view-only access and per-minute billing from the gateway are shown read-only; input is not sent", async () => {
  const view = await mount();
  await act(async () => view.handlers().session({ access: { input_allowed: false, audio: false }, billing: { per_minute: 0.096, currency: "CNY", charged_minutes: 3 } }));
  assert.equal(view.screen().querySelector("[data-remote-view-only]").textContent, "对方仅允许查看");
  assert.equal(view.screen().querySelector("[data-remote-billing]").textContent, "按分钟从账户余额扣费 · ¥0.096/分钟 · 已计 3 分钟");
  const before = view.log.inputs.filter((input) => input.kind !== "release_all").length;
  await view.pointer("pointerdown", 260, 140);
  await view.key("keydown", "a");
  assert.equal(view.log.inputs.filter((input) => input.kind !== "release_all").length, before, "view only: no input leaves the viewer");
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

test("a full keyboard backlog keeps the frame, shows queue-busy copy, and clears only that notice on recovery", async () => {
  const view = await mount();
  const image = view.image();
  await act(async () => view.handlers().congestion(true));
  assert.equal(view.image(), image);
  assert.equal(view.screen().getAttribute("data-remote-phase"), "active");
  assert.equal(view.screen().querySelector("[data-remote-input-status]").textContent, "输入队列暂时繁忙，请稍后重试。");
  assert.doesNotMatch(view.screen().textContent, /输入正在等待确认/);
  await view.pointer("pointerdown");
  await view.pointer("pointerup");
  await act(async () => view.handlers().congestion(false));
  assert.equal(view.screen().querySelector("[data-remote-input-status]"), null);
  assert.deepEqual(view.log.inputs.map((input) => input.kind), ["pointer_down", "pointer_up"]);
  const paste = new window.Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(paste, "clipboardData", { value: { getData: () => "x".repeat(40000) } });
  await view.fire(view.input(), paste);
  const notice = view.screen().querySelector("[data-remote-input-status]").textContent;
  assert.match(notice, /文字太长/);
  await act(async () => view.handlers().congestion(false));
  assert.equal(view.screen().querySelector("[data-remote-input-status]").textContent, notice, "recovery must preserve unrelated newer notices");
});

for (const reason of ["network_error", "stream_failed"]) test(`${reason} reconnects once with a fresh session and drops old input`, async () => {
  let sessions = 0;
  const view = await mount({ overrides: {
    async createSession() { return { ok: true, data: { session_id: `session-${++sessions}`, state: "connecting", transport: "websocket-v2", expires_at: "" } }; },
  } });
  await view.key("keydown", "Enter");
  await view.pointer("pointerdown");
  await view.pointer("pointermove", 700, 300);
  const oldHandlers = view.handlers();
  await act(async () => oldHandlers.state("closed", reason));
  await settle();
  assert.equal(sessions, 2);
  assert.deepEqual(view.log.closes, ["session-1"]);
  assert.equal(view.image(), null, "old pixels do not authorize control on the new session");
  assert.equal(view.input().disabled, true);
  await view.fire(view.stage(), new window.KeyboardEvent("keydown", { bubbles: true, key: "Enter" }));
  await act(async () => { oldHandlers.frame({ image: "old", width: 1920, height: 1080, sequence: 9 }); oldHandlers.error(reason); });
  assert.equal(view.image(), null, "late frames and failures belong to the old session");
  await view.frame(2);
  await view.key("keyup", "Enter");
  assert.equal(view.log.inputs.filter((action) => action.kind === "key_down").length, 1);
  assert.equal(view.log.inputs.some((action) => action.kind === "move"), false, "unsent motion was discarded");
  assert.equal(view.log.inputs.some((action) => action.kind === "key_up"), false, "old held keys were discarded");
  await act(async () => view.handlers().error(reason));
  await settle();
  assert.equal(sessions, 2, "the automatic retry allowance does not reset on a successful connection");
  assert.match(view.screen().textContent, /网络连接中断/);
  assert.doesNotMatch(view.screen().textContent, /失去联系/);
  assert.equal(view.input().disabled, true);
  await act(async () => view.screen().querySelector("[data-remote-connect]").click());
  await settle();
  assert.equal(sessions, 3);
  await act(async () => view.handlers().error(reason));
  await settle();
  assert.equal(sessions, 4, "a manual reconnect grants a fresh single automatic retry");
});

test("automatic reconnect waits for the old session to close and reports the network interruption", async () => {
  let sessions = 0, finishClose;
  const view = await mount({ overrides: {
    async createSession() { return { ok: true, data: { session_id: `session-${++sessions}`, state: "connecting", transport: "websocket-v2", expires_at: "" } }; },
    closeSession() { return new Promise((resolve) => { finishClose = resolve; }); },
  } });
  await act(async () => view.handlers().error("network_error"));
  assert.equal(sessions, 1);
  assert.match(view.screen().textContent, /网络连接中断，正在重新连接/);
  await act(async () => finishClose({ ok: true }));
  await settle();
  assert.equal(sessions, 2);
});

test("an unreachable cleanup request cannot prevent the single automatic reconnect", async () => {
  let sessions = 0;
  const view = await mount({ overrides: {
    async createSession() { return { ok: true, data: { session_id: `session-${++sessions}`, state: "connecting", transport: "websocket-v2", expires_at: "" } }; },
    closeSession() { return new Promise(() => {}); },
  } });
  await act(async () => view.handlers().error("network_error"));
  await settle(1600);
  assert.equal(sessions, 2);
});

test("only an explicit device_lost reports lost computer contact and never reconnects automatically", async () => {
  let sessions = 0;
  const view = await mount({ overrides: {
    async createSession() { sessions++; return { ok: true, data: { session_id: "session", state: "connecting", transport: "websocket-v2", expires_at: "" } }; },
  } });
  await act(async () => view.handlers().state("closed", "device_lost"));
  await settle();
  assert.equal(sessions, 1);
  assert.match(view.screen().textContent, /这台电脑失去联系/);
  assert.equal(view.input().disabled, true);
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
  assert.equal(view.screen().querySelector("[data-remote-input-status]"), null, "HTTP compatibility does not invent a video-upgrade cause");
});

test("a late HTTP input response cannot drain or terminate a manually reconnected session", async () => {
  let sessions = 0, finishInput;
  const inputs = [];
  const view = await mount({ pending: true, overrides: {
    async createSession() { return { ok: true, data: { session_id: `http-${++sessions}`, state: "connecting", transport: "http-v1", expires_at: "" } }; },
    async getFrame() { return { ok: true, data: { state: "active", frame: { image: "data:image/jpeg;base64,/9j/AAAA", width: 1920, height: 1080, sequence: 1 } } }; },
    sendInput(_device, session, _seq, action) {
      inputs.push({ session, action });
      if (session === "http-1") return new Promise((resolve) => { finishInput = resolve; });
      return Promise.resolve({ ok: true });
    },
  } });
  view.image().getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360 });
  await view.key("keydown", "Enter");
  await view.key("keydown", "x");
  // Simulate a terminal frame response, then reconnect while the old input remains unresolved.
  view.client.getFrame = async () => ({ ok: true, data: { state: "closed", error: "expired" } });
  await settle();
  view.client.getFrame = async () => ({ ok: true, data: { state: "active", frame: { image: "data:image/jpeg;base64,/9j/AAAA", width: 1920, height: 1080, sequence: 1 } } });
  await act(async () => view.screen().querySelector("[data-remote-connect]").click());
  await settle();
  await view.key("keydown", "y");
  await act(async () => finishInput({ ok: false, error: "network_error" }));
  assert.equal(view.screen().getAttribute("data-remote-phase"), "active");
  assert.deepEqual(inputs.map(({ session, action }) => [session, action.key ?? action.text]), [["http-1", "Enter"], ["http-2", "y"]]);
});

for (const code of ["input_permission_required", "input_unavailable", "input_release_failed", "input_failed"]) test(`${code} closes input without network retry or replay and shows only its fixed cause`, async () => {
  let sessions = 0;
  const view = await mount({ overrides: { async createSession() {
    sessions++;
    return { ok: true, data: { session_id: `input-${sessions}`, state: "connecting", expires_at: "", transport: "websocket-v2" } };
  } } });
  await view.key("keydown", "Enter");
  await act(async () => view.handlers().state("closed", code));
  const inputCount = view.log.inputs.length;
  assert.equal(view.input().disabled, true);
  await view.key("keydown", "Enter");
  await view.pointer("pointerdown");
  await settle(40);
  assert.equal(sessions, 1, "input failure never automatically retries");
  assert.equal(view.log.inputs.length, inputCount, "no input is replayed or accepted after termination");
  assert.equal(view.log.closes.length, 1);
  assert.match(view.screen().textContent, /控制已停止/);
  assert.doesNotMatch(view.screen().textContent, /已关闭远程桌面|网络连接|失去联系|input_/);
  if (code === "input_permission_required") assert.match(view.screen().textContent, /辅助功能/);
  else assert.doesNotMatch(view.screen().textContent, /辅助功能|权限/);
});

test("unknown input error never displays private OS text or invents a permission requirement", async () => {
  const view = await mount();
  await act(async () => view.handlers().state("closed", "input_failure private OS detail token=synthetic"));
  assert.equal(view.input().disabled, true);
  assert.doesNotMatch(view.screen().textContent, /private|token|synthetic|辅助功能|权限/);
});

for (const [modifier, flag] of [["Shift", "shiftKey"], ["Control", "ctrlKey"], ["Alt", "altKey"], ["Meta", "metaKey"]]) test(`both ${modifier} keys keep the native modifier pressed until the final release`, async () => {
  const view = await mount();
  await view.key("keydown", modifier, { code: `${modifier}Left`, [flag]: true });
  await view.key("keydown", modifier, { code: `${modifier}Right`, [flag]: true });
  await view.key("keyup", modifier, { code: `${modifier}Left`, [flag]: true });
  assert.deepEqual(view.log.inputs, [{ kind: "key_down", key: modifier }]);
  await view.key("keyup", modifier, { code: `${modifier}Right` });
  assert.deepEqual(view.log.inputs.slice(0, 2), [{ kind: "key_down", key: modifier }, { kind: "key_up", key: modifier }]);
});

test("local media and unknown named keys never reach the native injector", async () => {
  const view = await mount();
  for (const key of ["AudioVolumeUp", "ContextMenu", "NumLock", "F13", "AltGraph", "Unidentified"]) {
    await view.key("keydown", key); await view.key("keyup", key);
  }
  assert.deepEqual(view.log.inputs, []);
  await view.key("keydown", "c", { code: "KeyC", metaKey: true });
  await view.key("keyup", "c", { code: "KeyC", metaKey: true });
  assert.deepEqual(view.log.inputs, [{ kind: "key_down", key: "Meta" }, { kind: "key_down", key: "c" }, { kind: "key_up", key: "c" }]);
});

test("Chinese composition commits once and plain soft input remains independent", async () => {
  const view = await mount();
  await view.key("keydown", "Control", { code: "ControlLeft", ctrlKey: true });
  await view.fire(view.input(), new window.CompositionEvent("compositionstart", { bubbles: true }));
  await view.key("keydown", "Process", { isComposing: true });
  view.input().value = "ni";
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "ni", isComposing: true }));
  await view.fire(view.input(), new window.CompositionEvent("compositionend", { bubbles: true, data: "你好" }));
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, inputType: "insertText", data: "你好" }));
  view.input().value = "好";
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, inputType: "insertText", data: "好" }));
  assert.deepEqual(view.log.inputs, [{ kind: "key_down", key: "Control" }, { kind: "release_all" }, { kind: "type", text: "你好" }, { kind: "type", text: "好" }]);
});

for (const [modifier, flag] of [["Control", "ctrlKey"], ["Meta", "metaKey"]]) test(`${modifier} shortcut has separate ordered down and up actions`, async () => {
  const view = await mount();
  await view.key("keydown", "c", { code: "KeyC", [flag]: true });
  await view.key("keyup", "c", { code: "KeyC", [flag]: true });
  await view.key("keyup", modifier, { code: `${modifier}Left` });
  assert.deepEqual(view.log.inputs.slice(0, 4), [{ kind: "key_down", key: modifier }, { kind: "key_down", key: "c" }, { kind: "key_up", key: "c" }, { kind: "key_up", key: modifier }]);
});

test("cancelled Chinese composition releases held input and sends no text", async () => {
  const view = await mount();
  await view.key("keydown", "Alt", { code: "AltLeft", altKey: true });
  await view.fire(view.input(), new window.CompositionEvent("compositionstart", { bubbles: true }));
  view.input().value = "ni";
  await view.fire(view.input(), new window.CompositionEvent("compositionend", { bubbles: true, data: "" }));
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, inputType: "insertCompositionText", data: "" }));
  assert.deepEqual(view.log.inputs, [{ kind: "key_down", key: "Alt" }, { kind: "release_all" }]);
});

const deferred = () => { let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject}; };
test('panel waits real release barrier then one CAS and blocks delayed manual input throughout',async()=>{const released=deferred(),cas=deferred();let calls=0;const agent={text:'AI paused',handBack:true,busy:false,handoffKey:'task:session',onHandBack:async()=>{calls++;await cas.promise;return true;}};const view=await mount({agent,streamOverrides:{releaseForHandoff(){view.log.inputs.push({kind:'release_all'});return released.promise;}}});const button=()=>view.screen().querySelector('[data-remote-agent-hand-back]');await view.fire(button(),new window.MouseEvent('click',{bubbles:true}));await view.fire(button(),new window.MouseEvent('click',{bubbles:true}));await view.key('keydown','Enter');await view.pointer('pointerdown');assert.equal(calls,0);assert.deepEqual(view.log.inputs,[{kind:'release_all'}]);await act(async()=>released.resolve());assert.equal(calls,1);assert.equal(view.log.handoffs,0);await view.key('keydown','Enter');assert.deepEqual(view.log.inputs,[{kind:'release_all'}]);await act(async()=>cas.resolve());assert.equal(view.log.handoffs,1);await view.fire(button(),new window.MouseEvent('click',{bubbles:true}));assert.equal(calls,1,'no duplicate CAS before new manual input');await view.key('keydown','Enter');assert.equal(button().disabled,false);});
test('panel unknown release never invokes resume and explains the existing failure',async()=>{let calls=0;const view=await mount({agent:{text:'AI paused',handBack:true,busy:false,onHandBack:()=>{calls++;return Promise.resolve(true);}},streamOverrides:{releaseForHandoff:()=>Promise.reject(new Error('input_ack_unknown'))}});await view.fire(view.screen().querySelector('[data-remote-agent-hand-back]'),new window.MouseEvent('click',{bubbles:true}));assert.equal(calls,0);assert.match(view.screen().textContent,/没有收到电脑控制的确认/);await view.key('keydown','Enter');assert.deepEqual(view.log.inputs,[]);});
for(const mode of ['unmount','replacement'])test(`old panel release after ${mode} cannot resume any task`,async()=>{const d=deferred();let calls=0;const agent={text:'AI paused',handBack:true,busy:false,handoffKey:'old',onHandBack:async()=>{calls++;return true;}};const view=await mount({agent,streamOverrides:{releaseForHandoff:()=>d.promise}});await view.fire(view.screen().querySelector('[data-remote-agent-hand-back]'),new window.MouseEvent('click',{bubbles:true}));if(mode==='unmount')await view.unmount();else await view.setAgent({...agent,handoffKey:'new'});await act(async()=>d.resolve());assert.equal(calls,0);});

test('composition started before handback is not replayed after CAS confirms',async()=>{const view=await mount({agent:{text:'AI paused',handBack:true,busy:false,handoffKey:'task',onHandBack:async()=>true}});await view.fire(view.input(),new window.CompositionEvent('compositionstart',{bubbles:true}));await view.fire(view.screen().querySelector('[data-remote-agent-hand-back]'),new window.MouseEvent('click',{bubbles:true}));await view.fire(view.input(),new window.CompositionEvent('compositionend',{bubbles:true,data:'stale'}));assert.equal(view.log.inputs.filter(x=>x.kind==='type').length,0);});
