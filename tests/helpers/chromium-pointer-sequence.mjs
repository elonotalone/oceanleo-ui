/**
 * Chromium 顺序的指针回放。jsdom 20 没有 PointerEvent / setPointerCapture，
 * 也丢弃 style.touchAction；时间戳用传入的假时钟，捕获改投由本助手自己做。
 */

const captures = new Map();

function ensurePointerCaptureShim() {
  if (typeof Element === "undefined") return;
  if (Element.prototype.setPointerCapture?.__easW11Shim) return;
  const proto = Element.prototype;
  proto.setPointerCapture = function setPointerCapture(pointerId) {
    captures.set(Number(pointerId), this);
  };
  proto.releasePointerCapture = function releasePointerCapture(pointerId) {
    if (captures.get(Number(pointerId)) === this) captures.delete(Number(pointerId));
  };
  proto.hasPointerCapture = function hasPointerCapture(pointerId) {
    return captures.get(Number(pointerId)) === this;
  };
  proto.setPointerCapture.__easW11Shim = true;
}

export function resetPointerCaptureShim() {
  captures.clear();
}

/**
 * 假时钟。`now` 一往前走，就兑现已经到期的 `schedule` 回调。
 * 控制器里的武装窗 / 抬起 / 吞点击用的是 `window.setTimeout`，
 * 测试必须走这套，不能靠墙上的 250/1500ms，整包负载下那些定时器会抢跑。
 */
export function createPointerClock(start = 1000) {
  let now = start;
  const timers = new Map();
  let nextId = 1;
  const flush = () => {
    let ran = true;
    while (ran) {
      ran = false;
      for (const [id, entry] of [...timers]) {
        if (entry.due <= now) {
          timers.delete(id);
          ran = true;
          entry.fn();
        }
      }
    }
  };
  return {
    get now() {
      return now;
    },
    set now(value) {
      now = Number(value);
      flush();
    },
    schedule(fn, delayMs) {
      const id = nextId++;
      timers.set(id, {
        due: now + Math.max(0, Number(delayMs) || 0),
        fn,
      });
      return id;
    },
    cancel(id) {
      timers.delete(id);
    },
  };
}

/** 把 `window.setTimeout`（delay≥16）接到假时钟上。0 延时仍走真定时器，留给 React / act。 */
export function installClockTimers(clock) {
  const targets = [];
  if (typeof window !== "undefined") targets.push(window);
  if (typeof globalThis !== "undefined" && globalThis !== window) {
    targets.push(globalThis);
  }
  const ours = new Set();
  const restores = targets.map((target) => {
    const realSet = target.setTimeout.bind(target);
    const realClear = target.clearTimeout.bind(target);
    target.setTimeout = (fn, delay, ...args) => {
      const ms = typeof delay === "number" ? delay : Number(delay) || 0;
      if (typeof fn !== "function" || ms < 16) {
        return realSet(fn, delay, ...args);
      }
      const id = clock.schedule(() => {
        ours.delete(id);
        fn(...args);
      }, ms);
      ours.add(id);
      return id;
    };
    target.clearTimeout = (id) => {
      if (ours.has(id)) {
        ours.delete(id);
        clock.cancel(id);
        return;
      }
      realClear(id);
    };
    return () => {
      target.setTimeout = realSet;
      target.clearTimeout = realClear;
    };
  });
  return () => {
    for (const restore of restores) restore();
    ours.clear();
  };
}

function define(event, values) {
  for (const [name, value] of Object.entries(values)) {
    Object.defineProperty(event, name, { configurable: true, value });
  }
  return event;
}

function dispatch(target, type, values, Ctor = Event) {
  const event = new Ctor(type, { bubbles: true, cancelable: true, ...values });
  define(event, values);
  target.dispatchEvent(event);
  return event;
}

function captureTarget(pointerId, fallback) {
  return captures.get(Number(pointerId)) || fallback;
}

/**
 * @param {Element} target
 * @param {{
 *   clock: { now: number },
 *   pointerType?: string,
 *   pointerId?: number,
 *   clientX: number,
 *   clientY: number,
 *   button?: number,
 *   clickCount?: number,
 * }} opts
 */
export function pointerDown(target, opts) {
  ensurePointerCaptureShim();
  const pointerType = opts.pointerType || "mouse";
  const pointerId = opts.pointerId ?? (pointerType === "touch" ? Date.now() % 100000 : 1);
  const button = opts.button ?? 0;
  const clickCount = opts.clickCount ?? 1;
  const timeStamp = opts.clock.now;
  const values = {
    pointerId,
    pointerType,
    button,
    buttons: 1,
    clientX: opts.clientX,
    clientY: opts.clientY,
    timeStamp,
    detail: 0,
    isPrimary: true,
  };
  const down = dispatch(target, "pointerdown", values);
  const prevented = down.defaultPrevented;
  if (pointerType === "mouse" && !prevented) {
    dispatch(target, "mousedown", {
      ...values,
      detail: clickCount,
      buttons: 1,
    }, MouseEvent);
  }
  return { pointerId, pointerType, prevented, timeStamp };
}

export function pointerMove(target, opts) {
  ensurePointerCaptureShim();
  const pointerType = opts.pointerType || "mouse";
  const pointerId = opts.pointerId ?? 1;
  const buttons = opts.buttons ?? 1;
  const values = {
    pointerId,
    pointerType,
    button: opts.button ?? 0,
    buttons,
    clientX: opts.clientX,
    clientY: opts.clientY,
    timeStamp: opts.clock.now,
    detail: 0,
    isPrimary: true,
  };
  const dest = captureTarget(pointerId, target);
  dispatch(dest, "pointermove", values);
  if (pointerType === "mouse") {
    dispatch(dest, "mousemove", values, MouseEvent);
  }
  window.dispatchEvent(define(new Event("pointermove", { bubbles: true, cancelable: true }), values));
}

export function pointerUp(target, opts) {
  ensurePointerCaptureShim();
  const pointerType = opts.pointerType || "mouse";
  const pointerId = opts.pointerId ?? 1;
  const clickCount = opts.clickCount ?? 1;
  const values = {
    pointerId,
    pointerType,
    button: opts.button ?? 0,
    buttons: 0,
    clientX: opts.clientX,
    clientY: opts.clientY,
    timeStamp: opts.clock.now,
    detail: 0,
    isPrimary: true,
  };
  const dest = captureTarget(pointerId, target);
  const downPrevented = opts.downPrevented === true;
  dispatch(dest, "pointerup", values);
  window.dispatchEvent(define(new Event("pointerup", { bubbles: true, cancelable: true }), values));
  if (pointerType === "mouse" && !downPrevented) {
    dispatch(dest, "mouseup", { ...values, detail: clickCount }, MouseEvent);
  }
  const clickTarget = dest;
  const clickValues = {
    ...values,
    detail: clickCount,
  };
  const clickCtor = typeof PointerEvent === "function" ? PointerEvent : MouseEvent;
  dispatch(clickTarget, "click", clickValues, clickCtor);
  if (pointerType === "mouse" && clickCount === 2 && !downPrevented) {
    dispatch(clickTarget, "dblclick", { ...clickValues, detail: 2 }, MouseEvent);
  }
  if (dest.hasPointerCapture?.(pointerId)) {
    dest.releasePointerCapture?.(pointerId);
  }
}

export function pointerCancel(target, opts) {
  ensurePointerCaptureShim();
  const pointerId = opts.pointerId ?? 1;
  const values = {
    pointerId,
    pointerType: opts.pointerType || "touch",
    button: 0,
    buttons: 0,
    clientX: opts.clientX,
    clientY: opts.clientY,
    timeStamp: opts.clock.now,
    detail: 0,
  };
  const dest = captureTarget(pointerId, target);
  dispatch(dest, "pointercancel", values);
  window.dispatchEvent(define(new Event("pointercancel", { bubbles: true, cancelable: true }), values));
  if (dest.hasPointerCapture?.(pointerId)) {
    dest.releasePointerCapture?.(pointerId);
    dispatch(dest, "lostpointercapture", values);
  }
}

/** 按下并松开的一次普通点击（第一下）。 */
export function tap(target, opts) {
  const down = pointerDown(target, opts);
  opts.clock.now += opts.holdMs ?? 10;
  pointerUp(target, { ...opts, pointerId: down.pointerId, downPrevented: down.prevented });
  return down;
}
