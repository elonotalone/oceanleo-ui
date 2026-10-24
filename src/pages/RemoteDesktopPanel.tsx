"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import {
  remoteDesktopClient,
  type RemoteDesktopAction,
  type RemoteDesktopClient,
  type RemoteDesktopFrameData,
} from "../api/remote-desktop";
import { useUI } from "../i18n/ui/useUI";
import {
  REMOTE_BACKPRESSURE_CODES,
  REMOTE_FATAL_CODES,
  chunkText,
  classifyInput,
  clampPaste,
  containedRect,
  insideRect,
  isDrag,
  isNearby,
  isPointerDrag,
  keyEventToAction,
  mouseButton,
  remoteDesktopErrorCopy,
  sanitizeRemoteText,
  softInputKeyAction,
  toNormalized,
  type NormalizedPoint,
  type SoftInputKind,
} from "./remote-desktop-input";

export interface RemoteDesktopPanelProps {
  deviceId: string;
  deviceName: string;
  client?: RemoteDesktopClient;
  onClose: () => void;
  /** 两次取帧之间的间隔；默认 250ms（≈4fps，与设备端上限同步）。 */
  frameIntervalMs?: number;
  /** 单击等待是否会变成双击的窗口。 */
  doubleClickWindowMs?: number;
  /** 网关说「队列满 / 太频繁」后暂停送输入多久；默认 1s。 */
  backpressureMs?: number;
}

type Phase = "starting" | "connecting" | "active" | "closed" | "error";

/** 输入队列上限，与服务端队列同量级；满了丢新的，不阻塞页面。 */
const INPUT_QUEUE_MAX = 64;
/** 鼠标移动最多这么久送一次。 */
const MOVE_THROTTLE_MS = 150;
/** 操作提示停留多久。 */
const NOTICE_MS = 6000;
/** 连续取帧失败这么多次就认为失联，不再无限重试。 */
const MAX_FRAME_FAILURES = 6;
/** 开会话撞上 `session_active` 时的重试（只为吸收上一个面板刚关、服务端还没来得及释放的间隙）。其他 409 不重试。 */
const START_CONFLICT_RETRIES = 2;
const START_CONFLICT_DELAY_MS = 700;

/** 这些状态再重试没有意义：会话没了、登录没了、被拒了。 */
function isFatalFrameFailure(error?: string, status?: number): boolean {
  if (error && REMOTE_FATAL_CODES.has(error)) return true;
  return status === 401 || status === 403 || status === 404 || status === 410;
}

/** 网关单次滚动量上限 ±10000。 */
const SCROLL_MAX = 10_000;
const clampScroll = (value: number) => Math.max(-SCROLL_MAX, Math.min(SCROLL_MAX, value));

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

export function RemoteDesktopPanel({
  deviceId,
  deviceName,
  client = remoteDesktopClient,
  onClose,
  frameIntervalMs = 250,
  doubleClickWindowMs = 220,
  backpressureMs = 1000,
}: RemoteDesktopPanelProps) {
  const tt = useUI();
  const [phase, setPhase] = useState<Phase>("starting");
  const [frame, setFrame] = useState<RemoteDesktopFrameData | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  // 两种提示分开：链路提示（连接不稳）由取帧循环维护，操作提示（输入没送到、
  // 不能全屏…）停留几秒后自行消失；否则每来一帧就把操作提示冲掉，用户看不见。
  const [linkNotice, setLinkNotice] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flashNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => setNotice(null), NOTICE_MS);
  }, []);
  const [imageBroken, setImageBroken] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const frameRef = useRef<RemoteDesktopFrameData | null>(null);
  frameRef.current = frame;
  // 输入法组字中：半成品不发，compositionend 时整段上屏一次。
  const composingRef = useRef(false);
  const sendTextRef = useRef<(text: string) => void>(() => {});

  const sessionRef = useRef<string | null>(null);
  const closedRef = useRef(false);
  const abortRef = useRef<AbortController | null>(null);
  const clientRef = useRef(client);
  clientRef.current = client;

  // 输入队列：一次只有一个请求在飞；ACK 未知（网络错）的输入不重放。
  const queueRef = useRef<RemoteDesktopAction[]>([]);
  const pumpingRef = useRef(false);
  const seqRef = useRef(0);

  const downRef = useRef<{ point: NormalizedPoint; button: "left" | "right" | "middle" } | null>(
    null,
  );
  const pendingClickRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPointRef = useRef<NormalizedPoint | null>(null);
  const lastMoveRef = useRef(0);
  // 指针手势：同一时刻只认一个指针；第二个指针（多指）一出现就作废整次手势，且不发任何动作。
  const gestureRef = useRef<{ pointerId: number; pointerType: string; hadFocus: boolean } | null>(
    null,
  );
  const activePointersRef = useRef<Set<number>>(new Set());
  const [keyboardOpen, setKeyboardOpen] = useState(false);

  const finish = useCallback((nextPhase: "closed" | "error", text: string) => {
    queueRef.current = [];
    setPhase(nextPhase);
    setMessage(text);
  }, []);

  const closeRemote = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    abortRef.current?.abort();
    queueRef.current = [];
    if (pendingClickRef.current) clearTimeout(pendingClickRef.current);
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    const sessionId = sessionRef.current;
    if (sessionId) {
      // 幂等关闭；失败也无需打扰用户，服务端有硬 TTL 与失联兜底。
      void Promise.resolve(clientRef.current.closeSession(deviceId, sessionId)).catch(() => {});
    }
  }, [deviceId]);

  const contentRect = useCallback(() => {
    const img = imgRef.current;
    const current = frameRef.current;
    if (!img || !current) return null;
    return containedRect(img.getBoundingClientRect(), current.width, current.height);
  }, []);

  const pump = useCallback(async () => {
    if (pumpingRef.current) return;
    pumpingRef.current = true;
    try {
      while (queueRef.current.length > 0) {
        const sessionId = sessionRef.current;
        const signal = abortRef.current?.signal;
        if (!sessionId || !signal || signal.aborted) {
          queueRef.current = [];
          break;
        }
        const action = queueRef.current.shift() as RemoteDesktopAction;
        seqRef.current += 1;
        const result = await clientRef.current.sendInput(
          deviceId,
          sessionId,
          seqRef.current,
          action,
          { signal },
        );
        if (signal.aborted) break;
        if (!result.ok) {
          if (result.error === "aborted") break;
          if (isFatalFrameFailure(result.error, result.status)) {
            closeRemote();
            finish("error", remoteDesktopErrorCopy(result.error, result.status));
            break;
          }
          // 网络错 / 5xx：这一条丢弃，不重放；让用户知道有输入没送到。
          flashNotice(remoteDesktopErrorCopy(result.error, result.status));
          if (
            (result.error && REMOTE_BACKPRESSURE_CODES.has(result.error)) ||
            result.status === 429
          ) {
            // 对方队列满/太频繁：把积压的作废并停一会儿，不再继续灌。
            queueRef.current = [];
            await sleep(backpressureMs, signal);
          }
        }
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [backpressureMs, closeRemote, deviceId, finish, flashNotice]);

  const enqueue = useCallback(
    (action: RemoteDesktopAction) => {
      if (closedRef.current || !sessionRef.current) return;
      const queue = queueRef.current;
      const last = queue[queue.length - 1];
      // 能合并的合并：相邻移动只留最后一个，相邻滚轮累加，相邻文字拼接。
      if (last && last.kind === "move" && action.kind === "move") {
        queue[queue.length - 1] = action;
      } else if (
        last &&
        last.kind === "scroll" &&
        action.kind === "scroll" &&
        last.x === action.x &&
        last.y === action.y
      ) {
        last.deltaX = clampScroll((last.deltaX ?? 0) + (action.deltaX ?? 0));
        last.deltaY = clampScroll((last.deltaY ?? 0) + (action.deltaY ?? 0));
      } else if (
        last &&
        last.kind === "type" &&
        action.kind === "type" &&
        [...(last.text ?? "")].length + [...(action.text ?? "")].length <= 200
      ) {
        last.text = (last.text ?? "") + (action.text ?? "");
      } else if (queue.length >= INPUT_QUEUE_MAX) {
        flashNotice("操作太快，部分输入被丢弃了。");
        return;
      } else {
        queue.push(action);
      }
      void pump();
    },
    [pump, flashNotice],
  );

  // 会话生命周期：开 → 单帧循环 → 关。组件卸载或点断开即取消在途请求。
  useEffect(() => {
    const controller = new AbortController();
    abortRef.current = controller;
    closedRef.current = false;
    sessionRef.current = null;
    seqRef.current = 0;
    const { signal } = controller;

    (async () => {
      let sessionId: string | null = null;
      for (let attempt = 0; attempt <= START_CONFLICT_RETRIES; attempt += 1) {
        const created = await clientRef.current.createSession(deviceId, { signal });
        if (created.ok && created.data) {
          sessionId = created.data.session_id;
          break;
        }
        if (signal.aborted || created.error === "aborted") return;
        if (created.error === "session_active" && attempt < START_CONFLICT_RETRIES) {
          await sleep(START_CONFLICT_DELAY_MS, signal);
          if (signal.aborted) return;
          continue;
        }
        finish("error", remoteDesktopErrorCopy(created.error, created.status));
        return;
      }
      if (!sessionId) return;
      if (signal.aborted) {
        // 创建请求在取消前已经落地：补一次关闭，别留空会话占着设备。
        void Promise.resolve(clientRef.current.closeSession(deviceId, sessionId)).catch(() => {});
        return;
      }
      sessionRef.current = sessionId;
      setPhase("connecting");

      let failures = 0;
      let lastSequence = -1;
      while (!signal.aborted) {
        const result = await clientRef.current.getFrame(deviceId, sessionId, { signal });
        if (signal.aborted) return;
        if (!result.ok || !result.data) {
          if (result.error === "aborted") return;
          if (isFatalFrameFailure(result.error, result.status)) {
            closeRemote();
            finish("error", remoteDesktopErrorCopy(result.error, result.status));
            return;
          }
          failures += 1;
          if (failures >= MAX_FRAME_FAILURES) {
            closeRemote();
            finish("error", remoteDesktopErrorCopy("device_lost"));
            return;
          }
          setLinkNotice("连接不稳，正在重试…");
          await sleep(Math.min(2000, 400 * failures), signal);
          continue;
        }
        failures = 0;
        const data = result.data;
        if (data.state === "closed") {
          closedRef.current = true;
          controller.abort();
          finish(
            "closed",
            data.error ? remoteDesktopErrorCopy(data.error) : "远程会话已结束。",
          );
          return;
        }
        setLinkNotice(null);
        if (data.frame && data.frame.sequence !== lastSequence) {
          lastSequence = data.frame.sequence;
          setFrame(data.frame);
          setImageBroken(false);
        }
        setPhase(data.state === "active" ? "active" : "connecting");
        if (data.error) setMessage(remoteDesktopErrorCopy(data.error));
        await sleep(frameIntervalMs, signal);
      }
    })();

    const onPageHide = () => closeRemote();
    window.addEventListener("pagehide", onPageHide);
    return () => {
      window.removeEventListener("pagehide", onPageHide);
      closeRemote();
    };
    // tt 的引用随语言变；会话不能因此重开，所以只认设备与取帧节奏。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceId, frameIntervalMs]);

  // 滚轮必须是非被动监听才能 preventDefault，React 的 onWheel 做不到。
  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const onWheel = (event: WheelEvent) => {
      const rect = contentRect();
      // 画面外（含留白）的滚轮留给网页自己滚；会话已断开时同理。
      if (!rect || closedRef.current || !insideRect(event.clientX, event.clientY, rect)) return;
      event.preventDefault();
      const point = toNormalized(event.clientX, event.clientY, rect);
      if (!point) return;
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 400 : 1;
      const cap = (value: number) => clampScroll(value * unit);
      if (!event.deltaX && !event.deltaY) return;
      enqueue({
        kind: "scroll",
        x: point.x,
        y: point.y,
        deltaX: cap(event.deltaX),
        deltaY: cap(event.deltaY),
      });
    };
    stage.addEventListener("wheel", onWheel, { passive: false });
    return () => stage.removeEventListener("wheel", onWheel);
  }, [contentRect, enqueue]);

  // 输入法：用原生 composition 事件（React 的合成层对组字有自己的回退逻辑，不可靠）。
  // 组字中的按键一概不发；compositionend 把整段上屏的文字发一次。
  // 手机软键盘 / 浏览器 insertText 常常没有可用的 keydown（key 为 Unidentified、keyCode 229），
  // 文字只出现在 input 事件里：非组字的 input 取出文字发一次并清空输入口；换行与删除在
  // beforeinput 里转成与硬件键盘一致的 keypress。桌面按键在 keydown 已 preventDefault，
  // 不会再产生 input/beforeinput，所以不会双发。
  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;
    const onStart = () => {
      composingRef.current = true;
    };
    const onEnd = (event: CompositionEvent) => {
      composingRef.current = false;
      input.value = "";
      if (closedRef.current) return;
      sendTextRef.current(event.data ?? "");
    };
    // 换行 / 删除的「事务」：beforeinput 已经发过、但取消不了（随后还会来一个 input）时记在这里，
    // 对应的那个 input 认领它、不再发第二份；没有 beforeinput 的浏览器，input 自己发。
    // beforeinput 与 input 同属一次任务，所以令牌在这次任务结束时作废（不是时间窗）：
    // 对空输入口退格这类「beforeinput 有、input 永远不来」的情况，令牌不会残留去吞下一次真正的删除。
    let handledByBeforeInput: SoftInputKind | null = null;
    const onBeforeInput = (event: Event) => {
      const native = event as InputEvent;
      const kind = classifyInput(native.inputType, composingRef.current || Boolean(native.isComposing));
      const action = softInputKeyAction(kind);
      if (!action) return;
      // 取消默认行为：输入口始终保持为空，也就不会有随后的 input 再来一份。
      if (native.cancelable) native.preventDefault();
      if (!native.defaultPrevented) {
        handledByBeforeInput = kind;
        setTimeout(() => {
          if (handledByBeforeInput === kind) handledByBeforeInput = null;
        }, 0);
      }
      if (closedRef.current) return;
      enqueue(action);
    };
    const onInput = (event: Event) => {
      const native = event as InputEvent;
      // 组字中不能碰输入口的内容，否则输入法的半成品会被打断。
      if (composingRef.current || native.isComposing) return;
      const kind = classifyInput(native.inputType, false);
      // 输入口平时是空的；一次真正的插入，input 触发时 value 里一定有刚插入的文字。
      const value = input.value;
      const data = typeof native.data === "string" ? native.data : "";
      input.value = "";
      const claimed = handledByBeforeInput;
      handledByBeforeInput = null;
      if (closedRef.current) return;
      if (kind === "enter" || kind === "backspace" || kind === "delete") {
        // 同一次编辑 beforeinput 已经发过就不再发；没有 beforeinput（或它没发）时这里补发，不丢。
        if (claimed === kind) return;
        const action = softInputKeyAction(kind);
        if (action) enqueue(action);
        return;
      }
      if (kind !== "text") return;
      // 带 data 的 input 但输入口里并没有这段文字：这段文字已经被前面的事务（如 compositionend
      // 的上屏）取走并清空了，这是迟到的回声，不是新输入。靠输入口的真实内容判断，不靠时间、
      // 也不靠「同样的字就去重」——用户连续敲同一个字时，每一次 input 的 value 里都有它。
      if (data !== "" && !value.includes(data)) return;
      sendTextRef.current(data !== "" ? data : value);
    };
    input.addEventListener("compositionstart", onStart);
    input.addEventListener("compositionend", onEnd);
    input.addEventListener("beforeinput", onBeforeInput);
    input.addEventListener("input", onInput);
    return () => {
      input.removeEventListener("compositionstart", onStart);
      input.removeEventListener("compositionend", onEnd);
      input.removeEventListener("beforeinput", onBeforeInput);
      input.removeEventListener("input", onInput);
    };
  }, [enqueue]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  /**
   * 手势只认「画面真正占的那块」：`object-contain` 的留白不是电脑屏幕。
   * `strict` 时在画面外返回 null（不点击）；拖动抬起时不 strict，夹到画面边缘。
   */
  function pointFromEvent(
    event: { clientX: number; clientY: number },
    strict: boolean,
  ): NormalizedPoint | null {
    const rect = contentRect();
    if (!rect) return null;
    if (strict && !insideRect(event.clientX, event.clientY, rect)) return null;
    return toNormalized(event.clientX, event.clientY, rect);
  }

  /** 一次完整手势的结果：拖动 / 非左键点击 / 单击（等双击窗口）/ 双击。 */
  function finishGesture(
    down: { point: NormalizedPoint; button: "left" | "right" | "middle" },
    point: NormalizedPoint,
    drag: boolean,
    second: boolean,
  ) {
    if (drag) {
      enqueue({
        kind: "drag",
        x: down.point.x,
        y: down.point.y,
        toX: point.x,
        toY: point.y,
        button: down.button,
      });
      return;
    }
    if (down.button !== "left") {
      enqueue({ kind: "click", x: point.x, y: point.y, button: down.button });
      return;
    }
    // 左键单击要等一个双击窗口：窗口内第二下到来就合成一个 double_click，
    // 否则对方会收到 click + double_click 共三下。
    if (second && pendingClickRef.current) {
      clearTimeout(pendingClickRef.current);
      pendingClickRef.current = null;
      enqueue({ kind: "double_click", x: point.x, y: point.y, button: "left" });
      return;
    }
    if (pendingClickRef.current) {
      // 前一下还在等双击窗口，但这一下不是它的第二下（离得远）：前一下照常作为单击送出，不能丢。
      clearTimeout(pendingClickRef.current);
      pendingClickRef.current = null;
      const earlier = pendingPointRef.current;
      if (earlier) enqueue({ kind: "click", x: earlier.x, y: earlier.y, button: "left" });
    }
    pendingPointRef.current = point;
    pendingClickRef.current = setTimeout(() => {
      pendingClickRef.current = null;
      enqueue({ kind: "click", x: point.x, y: point.y, button: "left" });
    }, doubleClickWindowMs);
  }

  function handleMouseDown(event: ReactMouseEvent) {
    if (closedRef.current) return;
    const button = mouseButton(event.button);
    const point = pointFromEvent(event, true);
    // 点在留白上也让键盘焦点回到输入口，但不产生点击。
    inputRef.current?.focus();
    if (!button || !point) return;
    event.preventDefault();
    downRef.current = { point, button };
  }

  function handleMouseUp(event: ReactMouseEvent) {
    const down = downRef.current;
    downRef.current = null;
    if (closedRef.current) return;
    const point = pointFromEvent(event, false);
    if (!down || !point) return;
    event.preventDefault();
    finishGesture(down, point, isDrag(down.point, point), event.detail >= 2);
  }

  function handleMouseMove(event: { clientX: number; clientY: number }) {
    if (closedRef.current || downRef.current) return; // 拖动期间只在抬起时送一条 drag
    const now = Date.now();
    if (now - lastMoveRef.current < MOVE_THROTTLE_MS) return;
    const point = pointFromEvent(event, true);
    if (!point) return;
    lastMoveRef.current = now;
    enqueue({ kind: "move", x: point.x, y: point.y });
  }

  // ---- Pointer Events（有 PointerEvent 的浏览器走这条；没有的才退回上面的鼠标事件）。
  // 两套处理函数**从不同时挂**：指针事件之后浏览器还会补发兼容鼠标事件，同时吃会一次点击变两次。
  // 兼容鼠标事件只挂一个 preventDefault（不让点按把输入口的焦点抢走、也不选中文字），不发任何动作。
  function endPointer(pointerId: number) {
    const active = activePointersRef.current;
    active.delete(pointerId);
    if (gestureRef.current?.pointerId === pointerId) {
      gestureRef.current = null;
      downRef.current = null;
    }
  }

  function handlePointerDown(event: ReactPointerEvent) {
    if (closedRef.current) return;
    const active = activePointersRef.current;
    // 鼠标永远只有一个：万一漏过一次 up，不能让它把之后所有手势都当成「多指」。
    if (event.pointerType === "mouse") active.clear();
    active.add(event.pointerId);
    // 先捕获再判断落点：手指在留白上按下、滑出画面再抬起，up/cancel 也必须送回这里收尾。
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // 没有捕获也能工作，只是手指滑出画面后抬起事件可能到不了这里（会走 cancel，不发动作）。
    }
    if (active.size > 1 || !event.isPrimary) {
      // 多指：作废已开始的手势，且这一次不会再产生任何动作。
      gestureRef.current = null;
      downRef.current = null;
      return;
    }
    const input = inputRef.current;
    const hadFocus = Boolean(input) && document.activeElement === input;
    // 触摸点按不自动弹软键盘（会盖住画面），键盘由「键盘」按钮唤起；鼠标/笔保持原来的点击即聚焦。
    if (event.pointerType !== "touch") input?.focus();
    const button = mouseButton(event.button);
    const point = pointFromEvent(event, true);
    if (!button || !point) return;
    event.preventDefault();
    downRef.current = { point, button };
    gestureRef.current = { pointerId: event.pointerId, pointerType: event.pointerType, hadFocus };
  }

  function handlePointerUp(event: ReactPointerEvent) {
    const gesture = gestureRef.current;
    const down = downRef.current;
    endPointer(event.pointerId);
    if (!gesture || gesture.pointerId !== event.pointerId) return;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // 已经释放
    }
    // 软键盘开着时点按画面不应该把它收起来。
    if (gesture.hadFocus && document.activeElement !== inputRef.current) {
      inputRef.current?.focus({ preventScroll: true });
    }
    if (closedRef.current || !down) return;
    const rect = contentRect();
    const point = pointFromEvent(event, false);
    if (!rect || !point) return;
    event.preventDefault();
    const drag = isPointerDrag(gesture.pointerType, down.point, point, rect);
    const second =
      pendingClickRef.current !== null &&
      pendingPointRef.current !== null &&
      isNearby(pendingPointRef.current, point);
    finishGesture(down, point, drag, second);
  }

  // pointercancel（浏览器接管了手势，如滚动）与 lostpointercapture（元素被移除等）：丢弃，不合成点击。
  function handlePointerCancel(event: ReactPointerEvent) {
    endPointer(event.pointerId);
  }

  function handleLostPointerCapture(event: ReactPointerEvent) {
    endPointer(event.pointerId);
  }

  function handlePointerMove(event: ReactPointerEvent) {
    if (event.pointerType === "touch") return; // 触摸没有悬停；拖动在抬起时送一条 drag
    handleMouseMove(event);
  }

  function keepInputFocus(event: ReactMouseEvent) {
    event.preventDefault();
  }

  function toggleKeyboard() {
    const input = inputRef.current;
    if (!input) return;
    // 必须在这次点击（用户手势）里同步 focus，移动浏览器才会弹出键盘。
    if (document.activeElement === input) input.blur();
    else input.focus();
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (closedRef.current) return;
    // Ctrl/⌘+V 交给 paste 事件，不当成按键送出去，否则对方会收到「按键 + 文字」两份。
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
    const native = event.nativeEvent;
    // 输入法组字中（含 Safari 上确认键的 keyCode 229）一律不发，交给 compositionend。
    const action = keyEventToAction({
      key: event.key,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      altKey: event.altKey,
      shiftKey: event.shiftKey,
      isComposing: composingRef.current || native.isComposing || native.keyCode === 229,
    });
    if (!action) return;
    event.preventDefault();
    enqueue(action);
  }


  function sendText(raw: string) {
    if (closedRef.current) return;
    const clamped = clampPaste(sanitizeRemoteText(raw));
    if (!clamped.text) return;
    if (clamped.truncated) flashNotice("文字太长，只发送了前面一部分。");
    for (const chunk of chunkText(clamped.text)) enqueue({ kind: "type", text: chunk });
  }

  sendTextRef.current = sendText;

  function handlePaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text") ?? "";
    event.preventDefault();
    sendText(text);
  }

  async function pasteFromClipboard() {
    try {
      sendText(await navigator.clipboard.readText());
    } catch {
      flashNotice("浏览器没有允许读取剪贴板。请点一下画面，再按 Ctrl+V 粘贴。");
    }
  }

  function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void root.requestFullscreen?.().catch(() => {
        flashNotice("这个浏览器不允许进入全屏。");
      });
    }
  }

  function disconnect() {
    closeRemote();
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    onClose();
  }

  const live = phase === "starting" || phase === "active" || phase === "connecting";
  const pointerMode = typeof window !== "undefined" && typeof window.PointerEvent !== "undefined";
  const stagePointerProps = pointerMode
    ? {
        onPointerDown: handlePointerDown,
        onPointerUp: handlePointerUp,
        onPointerMove: handlePointerMove,
        onPointerCancel: handlePointerCancel,
        onLostPointerCapture: handleLostPointerCapture,
        onMouseDown: keepInputFocus,
      }
    : {
        onMouseDown: handleMouseDown,
        onMouseUp: handleMouseUp,
        onMouseMove: handleMouseMove,
      };
  const badge =
    phase === "active"
      ? { text: tt("已连接"), cls: "bg-emerald-50 text-emerald-700" }
      : phase === "starting" || phase === "connecting"
        ? { text: tt("连接中…"), cls: "bg-amber-50 text-amber-700" }
        : { text: tt("已断开"), cls: "bg-neutral-100 text-neutral-500" };

  return (
    <div
      ref={rootRef}
      className="rounded-2xl border border-neutral-200 bg-white p-4"
      data-oceanleo-remote-desktop
      data-remote-phase={phase}
      data-remote-fullscreen={fullscreen ? "true" : "false"}
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate text-[14px] font-semibold text-neutral-900">
          {tt("「{name}」的桌面", { name: deviceName })}
        </h3>
        <span
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}
          data-remote-badge
        >
          {badge.text}
        </span>
        {frame && (
          <span className="text-[11px] text-neutral-400">
            {frame.width}×{frame.height}
          </span>
        )}
        <button
          type="button"
          disabled={!live}
          onClick={() => void pasteFromClipboard()}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50"
        >
          {tt("粘贴文字")}
        </button>
        <button
          type="button"
          disabled={!live}
          aria-pressed={keyboardOpen}
          data-remote-keyboard-toggle
          // 按下时不让按钮抢走输入口的焦点，否则点击发生时输入口已经失焦，永远只能「打开」不能「收起」。
          onMouseDown={(event) => event.preventDefault()}
          onClick={toggleKeyboard}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 aria-pressed:bg-neutral-100"
        >
          {tt("键盘")}
        </button>
        <button
          type="button"
          onClick={toggleFullscreen}
          className="rounded-lg border border-neutral-200 px-3 py-1.5 text-[12px] text-neutral-700 hover:bg-neutral-50"
        >
          {fullscreen ? tt("退出全屏") : tt("全屏")}
        </button>
        <button
          type="button"
          onClick={disconnect}
          className="rounded-lg border border-red-200 px-3 py-1.5 text-[12px] text-red-600 hover:bg-red-50"
        >
          {live ? tt("断开") : tt("关闭")}
        </button>
      </div>

      <div
        ref={stageRef}
        role="application"
        aria-label={tt("远程桌面画面，点击后可用键盘")}
        data-remote-stage
        {...stagePointerProps}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        style={{ touchAction: "none" }}
        className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-neutral-900 outline-none focus-within:ring-2 focus-within:ring-neutral-400"
      >
        {/* 键盘与输入法的落点：画面本身不是可编辑元素，IME 必须有一个真输入口才能组字。 */}
        <textarea
          ref={inputRef}
          data-remote-input
          aria-label={tt("远程桌面键盘输入")}
          disabled={!live}
          onFocus={() => setKeyboardOpen(true)}
          onBlur={() => setKeyboardOpen(false)}
          autoComplete="off"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          rows={1}
          onDrop={(event) => event.preventDefault()}
          // 字号 ≥16px：iOS Safari 聚焦更小字号的输入口会自动放大页面。
          className="pointer-events-none absolute bottom-2 left-2 h-5 w-5 resize-none text-[16px] opacity-0"
        />
        {frame && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            ref={imgRef}
            src={frame.image}
            alt={tt("{name}的桌面", { name: deviceName })}
            draggable={false}
            onError={() => setImageBroken(true)}
            onLoad={() => setImageBroken(false)}
            data-remote-frame
            className={`block max-h-[70vh] w-full select-none object-contain ${
              live ? "" : "opacity-40"
            }`}
            style={{ aspectRatio: `${frame.width} / ${frame.height}` }}
          />
        )}
        {!frame && live && (
          <p className="px-6 py-16 text-[13px] text-neutral-300" data-remote-waiting>
            {phase === "starting"
              ? tt("正在请求这台电脑…")
              : tt("已发出请求，等这台电脑显示画面…")}
          </p>
        )}
        {!frame && !live && (
          <p className="px-6 py-16 text-[13px] text-neutral-300">{tt("没有可显示的画面。")}</p>
        )}
        {imageBroken && live && (
          <p
            className="absolute inset-x-0 bottom-0 bg-red-600/90 px-3 py-1.5 text-[12px] text-white"
            data-remote-image-error
          >
            {tt("这一帧画面无法显示，正在等待下一帧。")}
          </p>
        )}
        {!live && frame && (
          <p
            className="absolute inset-0 flex items-center justify-center bg-black/40 px-6 text-center text-[13px] text-white"
            data-remote-ended
          >
            {tt("远程会话已结束")}
          </p>
        )}
      </div>

      {(notice || linkNotice || (live && message)) && (
        <p
          className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[12px] text-amber-800"
          data-remote-notice
        >
          {tt(notice ?? linkNotice ?? message ?? "")}
        </p>
      )}
      {!live && message && (
        <p
          className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700"
          data-remote-error
        >
          {tt(message)}
        </p>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-neutral-400">
        {tt(
          "画面只在内存里转发，不保存。在那台电脑的 OceanLeo 里随时可以停止远程控制。点击画面后，键盘输入会发给那台电脑。",
        )}
      </p>
    </div>
  );
}
