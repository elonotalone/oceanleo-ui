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

export function createPointerClock(start = 1000) {
  return { now: start };
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
