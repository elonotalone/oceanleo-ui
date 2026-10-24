// 远程桌面：触屏 / 笔 / 鼠标的指针手势，以及手机软键盘（input / beforeinput）。
// 这里是 jsdom + 真 React 组件 + 假网关客户端。jsdom 没有 PointerEvent，所以用一个继承
// MouseEvent 的垫片造「指针事件」；它**证明组件逻辑**，不是真手机、也不是真 iPhone 输入法。
// 真浏览器触屏上下文见 remote-desktop-touch-browser.test.mjs。
import assert from "node:assert/strict";
import test, { afterEach } from "node:test";

import { document, window } from "./helpers/remote-desktop-dom.mjs";

import React, { act } from "react";
import { createRoot } from "react-dom/client";

import { compileModule, dataModule } from "./helpers/module-bench.mjs";

class PointerEventShim extends window.MouseEvent {
  constructor(type, init = {}) {
    super(type, init);
    Object.defineProperties(this, {
      pointerId: { value: init.pointerId ?? 1 },
      pointerType: { value: init.pointerType ?? "mouse" },
      isPrimary: { value: init.isPrimary ?? true },
    });
  }
}
window.PointerEvent = PointerEventShim;

const uiTextStubUrl = dataModule(`
  export function useUI() {
    return (value, vars) => value.replace(/\\{(\\w+)\\}/g, (_, key) => String(vars?.[key] ?? "{" + key + "}"));
  }
`);
const apiStubUrl = dataModule(`export const remoteDesktopClient = globalThis.__rdDefaultClient;`);
const { RemoteDesktopPanel } = await import(
  await compileModule("src/pages/RemoteDesktopPanel.tsx", {
    "../i18n/ui/useUI": uiTextStubUrl,
    "../api/remote-desktop": apiStubUrl,
  })
);

const JPEG = "data:image/jpeg;base64,/9j/AAAA";
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function settle(ms = 40) {
  await act(async () => {
    await wait(ms);
  });
}

function makeClient() {
  const log = { inputs: [], closes: [] };
  let sequence = 0;
  return {
    log,
    async createSession() {
      return { ok: true, data: { session_id: "sess-1", state: "connecting", expires_at: "2026-10-25T22:00:00Z" } };
    },
    async getFrame() {
      await wait(5);
      sequence += 1;
      return { ok: true, data: { state: "active", frame: { image: JPEG, width: 1280, height: 720, sequence } } };
    },
    async sendInput(deviceId, sessionId, seq, action) {
      log.inputs.push(action);
      return { ok: true, data: { accepted: true, seq } };
    },
    async closeSession(deviceId, sessionId) {
      log.closes.push(sessionId);
      return { ok: true, data: { closed: true } };
    },
  };
}

// 每个挂载的 view 都登记在这里，afterEach 无条件卸载：断言失败时不会留下取帧轮询
// （否则后面的测试被拖慢、整个文件撞超时）。unmount 幂等，用例里手动卸载仍然可以。
const mounted = [];
afterEach(async () => {
  while (mounted.length > 0) await mounted.pop().unmount();
});

async function mount(client = makeClient()) {
  const host = document.createElement("div");
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(
      React.createElement(RemoteDesktopPanel, {
        deviceId: "d-1",
        deviceName: "工作室",
        client,
        onClose: () => {},
        frameIntervalMs: 10,
        doubleClickWindowMs: 40,
      }),
    );
  });
  await settle(60);
  const img = () => host.querySelector("[data-remote-frame]");
  // 画面元素的矩形：左 100 上 50 宽 640 高 360（帧 1280×720，没有留白）。
  img().getBoundingClientRect = () => ({ left: 100, top: 50, width: 640, height: 360, right: 740, bottom: 410 });
  const input = () => host.querySelector("[data-remote-input]");
  const view = {
    client,
    host,
    img,
    input,
    actions: () => client.log.inputs,
    keyboardButton: () => host.querySelector("[data-remote-keyboard-toggle]"),
    async pointer(type, x, y, init = {}) {
      await act(async () => {
        img().dispatchEvent(
          new window.PointerEvent(type, {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            pointerType: "touch",
            pointerId: 1,
            isPrimary: true,
            button: 0,
            ...init,
          }),
        );
      });
    },
    /** 触摸之后浏览器补发的兼容鼠标事件：组件不能因此多发一次。 */
    async compatMouse(x, y) {
      await act(async () => {
        for (const type of ["mousedown", "mouseup", "click"]) {
          img().dispatchEvent(new window.MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, detail: 1 }));
        }
      });
    },
    async tap(x, y, init = {}) {
      await view.pointer("pointerdown", x, y, init);
      await view.pointer("pointerup", x, y, init);
      await view.compatMouse(x, y);
    },
    async fire(target, event) {
      await act(async () => {
        target.dispatchEvent(event);
      });
    },
    /** 浏览器里 beforeinput 与 input 在同一次任务里连续触发：放进同一个同步块里派发。 */
    async fireSameTask(target, ...events) {
      await act(async () => {
        for (const event of events) {
          if (typeof event === "function") event();
          else target.dispatchEvent(event);
        }
      });
    },
    async unmount() {
      if (view.unmounted) return;
      view.unmounted = true;
      await act(async () => root.unmount());
      host.remove();
    },
  };
  mounted.push(view);
  return view;
}

const CENTER = [420, 230]; // 比例 (0.5, 0.5)

test("触摸点一下：只发一次 click，随后的兼容鼠标事件不会再发一次", async () => {
  const view = await mount();
  await view.tap(...CENTER);
  await settle(120);
  assert.deepEqual(view.actions(), [{ kind: "click", x: 0.5, y: 0.5, button: "left" }]);
  await view.unmount();
});

test("触摸点按有几个像素的抖动仍是点击；超过位移阈值才是拖动", async () => {
  const view = await mount();
  await view.pointer("pointerdown", 420, 230);
  await view.pointer("pointerup", 424, 233); // ≈5px
  await settle(120);
  assert.deepEqual(view.actions().map((a) => a.kind), ["click"]);

  await view.pointer("pointerdown", 200, 100);
  await view.pointer("pointermove", 300, 200);
  await view.pointer("pointerup", 420, 230);
  await settle(120);
  const drag = view.actions().at(-1);
  assert.equal(drag.kind, "drag");
  assert.equal(drag.button, "left");
  // 起点 (200,100) 在 640×360 画面里是 (0.15625, 0.13889)；终点 (420,230) 是 (0.5, 0.5)
  assert.ok(Math.abs(drag.x - 0.15625) < 1e-9 && Math.abs(drag.y - 50 / 360) < 1e-9, JSON.stringify(drag));
  assert.ok(drag.toX === 0.5 && drag.toY === 0.5, JSON.stringify(drag));
  assert.equal(view.actions().length, 2, "拖动期间的 pointermove 不单独发");
  await view.unmount();
});

test("连点两下合成一个 double_click（不是 click+double_click）", async () => {
  const view = await mount();
  await view.tap(...CENTER);
  await view.tap(422, 231);
  await settle(120);
  assert.deepEqual(view.actions().map((a) => a.kind), ["double_click"]);
  await view.unmount();
});

test("两下离得远不会被当成双击", async () => {
  const view = await mount();
  await view.tap(...CENTER);
  await view.tap(150, 100);
  await settle(150);
  assert.deepEqual(view.actions().map((a) => a.kind), ["click", "click"]);
  await view.unmount();
});

test("画面之外（留白 / 画面元素之外）按下不产生点击，也不会在别处抬起时补一个", async () => {
  const view = await mount();
  await view.tap(50, 20); // 元素外
  await view.pointer("pointerdown", 50, 20);
  await view.pointer("pointerup", 420, 230);
  await settle(120);
  assert.deepEqual(view.actions(), []);
  await view.unmount();
});

test("pointercancel 与 lostpointercapture 不合成点击，也不留下未授权的拖动", async () => {
  const view = await mount();
  await view.pointer("pointerdown", 200, 100);
  await view.pointer("pointercancel", 200, 100);
  await view.pointer("pointerup", 420, 230); // 取消之后迟到的 up
  await settle(120);
  assert.deepEqual(view.actions(), []);

  await view.pointer("pointerdown", 200, 100);
  await view.pointer("lostpointercapture", 200, 100);
  await view.pointer("pointerup", 420, 230);
  await settle(120);
  assert.deepEqual(view.actions(), []);

  await view.tap(...CENTER); // 取消之后下一次正常手势不受影响
  await settle(120);
  assert.deepEqual(view.actions().map((a) => a.kind), ["click"]);
  await view.unmount();
});

test("多指：第二个手指一落下整次手势作废，两指都抬起后下一次单指仍然正常", async () => {
  const view = await mount();
  await view.pointer("pointerdown", 200, 100, { pointerId: 1 });
  await view.pointer("pointerdown", 500, 300, { pointerId: 2, isPrimary: false });
  await view.pointer("pointerup", 500, 300, { pointerId: 2, isPrimary: false });
  await view.pointer("pointerup", 200, 100, { pointerId: 1 });
  await settle(120);
  assert.deepEqual(view.actions(), []);
  await view.tap(...CENTER);
  await settle(120);
  assert.deepEqual(view.actions().map((a) => a.kind), ["click"]);
  await view.unmount();
});

test("鼠标走同一条指针路径：右键、拖动、悬停移动；触摸没有悬停移动", async () => {
  const view = await mount();
  await view.pointer("pointerdown", 420, 230, { pointerType: "mouse", button: 2 });
  await view.pointer("pointerup", 420, 230, { pointerType: "mouse", button: 2 });
  assert.deepEqual(view.actions().at(-1), { kind: "click", x: 0.5, y: 0.5, button: "right" });

  await view.pointer("pointermove", 300, 200, { pointerType: "touch" });
  assert.equal(view.actions().filter((a) => a.kind === "move").length, 0);
  await view.pointer("pointermove", 300, 200, { pointerType: "mouse" });
  assert.deepEqual(view.actions().at(-1).kind, "move");

  await view.pointer("pointerdown", 200, 100, { pointerType: "mouse" });
  await view.pointer("pointerup", 202, 101, { pointerType: "mouse" }); // 鼠标位移很小仍按比例阈值判拖动
  await settle(120);
  assert.ok(["drag", "click"].includes(view.actions().at(-1).kind));
  await view.unmount();
});

test("会话关闭后，指针手势和键盘输入都不再外发", async () => {
  const view = await mount();
  await act(async () => {
    [...view.host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "断开").click();
  });
  const before = view.actions().length;
  await view.tap(...CENTER);
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, data: "x", inputType: "insertText" }));
  await view.fire(view.input(), new window.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType: "insertLineBreak" }));
  await settle(120);
  assert.equal(view.actions().length, before);
  await view.unmount();
});

// ---------------------------------------------------------------- 软键盘

const typed = (view) => view.actions().filter((a) => a.kind === "type").map((a) => a.text).join("");

test("软键盘 insertText 只有 input、没有可用 keydown：发出一次文字并清空输入口", async () => {
  const view = await mount();
  const input = view.input();
  await act(async () => {
    input.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Unidentified", keyCode: 229, bubbles: true, cancelable: true }));
  });
  assert.deepEqual(view.actions(), [], "Unidentified 不是一个键，不能发 keypress");
  input.value = "你";
  await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "你", inputType: "insertText" }));
  assert.deepEqual(view.actions(), [{ kind: "type", text: "你" }]);
  assert.equal(input.value, "");
  await view.unmount();
});

test("空输入 / 没有 data 也没有值：不发任何动作", async () => {
  const view = await mount();
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, data: "", inputType: "insertText" }));
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, data: null, inputType: "insertText" }));
  assert.deepEqual(view.actions(), []);
  await view.unmount();
});

test("换行与删除：beforeinput 转成与硬件键盘一致的 keypress，各一次，且被取消（不留文字）", async () => {
  const view = await mount();
  for (const inputType of ["insertLineBreak", "insertParagraph", "deleteContentBackward", "deleteContentForward"]) {
    const event = new window.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType });
    await view.fire(view.input(), event);
    assert.equal(event.defaultPrevented, true, inputType);
  }
  assert.deepEqual(view.actions(), [
    { kind: "keypress", key: "Enter" },
    { kind: "keypress", key: "Enter" },
    { kind: "keypress", key: "Backspace" },
    { kind: "keypress", key: "Delete" },
  ]);
  await view.unmount();
});

test("beforeinput 取消不了时，随后的 input 里的换行 / 删除不会再发一份", async () => {
  const view = await mount();
  const before = new window.InputEvent("beforeinput", { bubbles: true, cancelable: false, inputType: "insertLineBreak" });
  await view.fireSameTask(
    view.input(),
    before,
    () => {
      view.input().value = "\n";
    },
    new window.InputEvent("input", { bubbles: true, inputType: "insertLineBreak" }),
  );
  assert.deepEqual(view.actions(), [{ kind: "keypress", key: "Enter" }]);
  assert.equal(view.input().value, "");
  await view.unmount();
});

test("桌面键盘：keydown 已处理并 preventDefault，浏览器不再产生 input，所以只发一次", async () => {
  const view = await mount();
  const keydown = new window.KeyboardEvent("keydown", { key: "a", bubbles: true, cancelable: true });
  await view.fire(view.input(), keydown);
  assert.equal(keydown.defaultPrevented, true);
  assert.equal(typed(view), "a");
  const enter = new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true });
  await view.fire(view.input(), enter);
  assert.deepEqual(view.actions().at(-1), { kind: "keypress", key: "Enter" });
  assert.equal(view.actions().length, 2);
  await view.unmount();
});

test("输入法（Chrome 顺序）：组字中的 input 不发，compositionend 发一次", async () => {
  const view = await mount();
  const input = view.input();
  await view.fire(input, new window.CompositionEvent("compositionstart", { bubbles: true }));
  await view.fire(input, new window.KeyboardEvent("keydown", { key: "Process", keyCode: 229, bubbles: true, cancelable: true }));
  input.value = "ni";
  await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "ni", inputType: "insertCompositionText", isComposing: true }));
  assert.equal(input.value, "ni", "组字中不能清空输入口");
  assert.deepEqual(view.actions(), []);
  await view.fire(input, new window.CompositionEvent("compositionend", { bubbles: true, data: "你" }));
  assert.deepEqual(view.actions(), [{ kind: "type", text: "你" }]);
  await view.unmount();
});

test("输入法（Safari 顺序）：compositionend 先到，随后补的 insertCompositionText input 不再发第二份", async () => {
  const view = await mount();
  const input = view.input();
  await view.fire(input, new window.CompositionEvent("compositionstart", { bubbles: true }));
  await view.fire(input, new window.CompositionEvent("compositionend", { bubbles: true, data: "你" }));
  input.value = "你";
  await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "你", inputType: "insertCompositionText", isComposing: false }));
  assert.deepEqual(view.actions(), [{ kind: "type", text: "你" }]);
  assert.equal(input.value, "");
  await view.unmount();
});

test("粘贴只发一次（paste 已 preventDefault，不会再有 input）", async () => {
  const view = await mount();
  const paste = new window.Event("paste", { bubbles: true, cancelable: true });
  paste.clipboardData = { getData: () => "粘贴的内容" };
  await view.fire(view.input(), paste);
  assert.equal(paste.defaultPrevented, true);
  assert.deepEqual(view.actions(), [{ kind: "type", text: "粘贴的内容" }]);
  await view.unmount();
});

test("「键盘」按钮在点击手势里同步聚焦真输入口，再点收起；输入口不会因取帧被重新挂载", async () => {
  const view = await mount();
  const input = view.input();
  const button = view.keyboardButton();
  assert.ok(button, "必须有可见的键盘入口");
  assert.equal((button.textContent || "").trim(), "键盘");
  await act(async () => button.click());
  assert.equal(document.activeElement, input);
  assert.equal(view.keyboardButton().getAttribute("aria-pressed"), "true");
  await settle(80); // 多个取帧周期
  assert.equal(view.input(), input, "输入口不能被重挂");
  assert.equal(document.activeElement, input, "取帧不能让键盘掉焦");
  await act(async () => view.keyboardButton().click());
  assert.notEqual(document.activeElement, input);
  assert.equal(view.keyboardButton().getAttribute("aria-pressed"), "false");
  await view.unmount();
});

test("键盘已打开时点按画面不会把它收起；没打开时触摸点按也不会自己弹键盘", async () => {
  const view = await mount();
  const input = view.input();
  await view.tap(...CENTER);
  assert.notEqual(document.activeElement, input, "触摸点按不自动聚焦");
  await act(async () => view.keyboardButton().click());
  assert.equal(document.activeElement, input);
  await view.pointer("pointerdown", ...CENTER);
  input.blur(); // 模拟浏览器在点按时把焦点移走
  await view.pointer("pointerup", ...CENTER);
  assert.equal(document.activeElement, input);
  await view.unmount();
});

test("舞台声明 touch-action: none，避免浏览器接管触摸手势", async () => {
  const view = await mount();
  assert.equal(view.host.querySelector("[data-remote-stage]").style.touchAction, "none");
  await view.unmount();
});

// ------------------------------------------- 仅 input、迟到回声（合成序列，不是实机证明）

const KEYS = {
  insertLineBreak: { kind: "keypress", key: "Enter" },
  insertParagraph: { kind: "keypress", key: "Enter" },
  deleteContentBackward: { kind: "keypress", key: "Backspace" },
  deleteContentForward: { kind: "keypress", key: "Delete" },
};

test("只有 input、没有 beforeinput（也没有有效 keydown）：换行与删除各发一次，不丢", async () => {
  const view = await mount();
  const input = view.input();
  for (const [inputType, action] of Object.entries(KEYS)) {
    const before = view.actions().length;
    input.value = inputType.startsWith("insert") ? "\n" : "";
    await view.fire(input, new window.InputEvent("input", { bubbles: true, inputType }));
    assert.deepEqual(view.actions().slice(before), [action], inputType);
    assert.equal(input.value, "", "输入口被清空");
  }
  await view.unmount();
});

test("beforeinput 取消不了 + 随后的 input：换行与删除各只发一次", async () => {
  const view = await mount();
  const input = view.input();
  for (const [inputType, action] of Object.entries(KEYS)) {
    const before = view.actions().length;
    await view.fireSameTask(
      input,
      new window.InputEvent("beforeinput", { bubbles: true, cancelable: false, inputType }),
      () => {
        input.value = inputType.startsWith("insert") ? "\n" : "";
      },
      new window.InputEvent("input", { bubbles: true, inputType }),
    );
    assert.deepEqual(view.actions().slice(before), [action], inputType);
  }
  await view.unmount();
});

test("beforeinput 可取消：发一次且没有 input 再来一份（保留）", async () => {
  const view = await mount();
  for (const [inputType, action] of Object.entries(KEYS)) {
    const before = view.actions().length;
    const event = new window.InputEvent("beforeinput", { bubbles: true, cancelable: true, inputType });
    await view.fire(view.input(), event);
    assert.equal(event.defaultPrevented, true);
    assert.deepEqual(view.actions().slice(before), [action], inputType);
  }
  await view.unmount();
});

test("beforeinput 取消不了、而 input 永远不来（空输入口退格）：令牌不会残留去吞下一次真正的删除", async () => {
  const view = await mount();
  const input = view.input();
  await view.fire(input, new window.InputEvent("beforeinput", { bubbles: true, cancelable: false, inputType: "deleteContentBackward" }));
  await settle(30); // 这次任务已经结束
  await view.fire(input, new window.InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  assert.deepEqual(view.actions(), [KEYS.deleteContentBackward, KEYS.deleteContentBackward]);
  await view.unmount();
});

test("关闭后，只有 input 的删除 / 换行也不外发", async () => {
  const view = await mount();
  await act(async () => {
    [...view.host.querySelectorAll("button")].find((b) => (b.textContent || "").trim() === "断开").click();
  });
  const before = view.actions().length;
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, inputType: "insertLineBreak" }));
  await view.fire(view.input(), new window.InputEvent("input", { bubbles: true, inputType: "deleteContentBackward" }));
  assert.equal(view.actions().length, before);
  await view.unmount();
});

test("compositionend 已上屏并清空输入口后，迟到的 insertText 回声（输入口里没有这段文字）不再发第二份", async () => {
  const view = await mount();
  const input = view.input();
  await view.fire(input, new window.CompositionEvent("compositionstart", { bubbles: true }));
  await view.fire(input, new window.CompositionEvent("compositionend", { bubbles: true, data: "你" }));
  assert.deepEqual(view.actions(), [{ kind: "type", text: "你" }]);
  // 回声：input 触发时输入口是空的（文字已被上屏事务取走），与 data 对不上
  assert.equal(input.value, "");
  await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "你", inputType: "insertText" }));
  assert.equal(typed(view), "你");
  await view.unmount();
});

test("用户真的连续敲同一个字：每一次 input 的输入口里都有它，必须都发（不按「相同文字」去重）", async () => {
  const view = await mount();
  const input = view.input();
  for (let i = 0; i < 3; i += 1) {
    input.value = "好";
    await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "好", inputType: "insertText" }));
  }
  assert.equal(typed(view), "好好好");
  // 紧接着上屏同一个字的输入法也照发
  await view.fire(input, new window.CompositionEvent("compositionstart", { bubbles: true }));
  await view.fire(input, new window.CompositionEvent("compositionend", { bubbles: true, data: "好" }));
  input.value = "好";
  await view.fire(input, new window.InputEvent("input", { bubbles: true, data: "好", inputType: "insertText" }));
  assert.equal(typed(view), "好好好好好", "compositionend 一次 + 随后真实的一次 insertText");
  await view.unmount();
});
