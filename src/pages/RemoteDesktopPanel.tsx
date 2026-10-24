"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type KeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  remoteDesktopClient,
  type RemoteDesktopAction,
  type RemoteDesktopClient,
  type RemoteDesktopFrameData,
} from "../api/remote-desktop";
import { useUI } from "../i18n/ui/useUI";
import {
  chunkText,
  clampPaste,
  insideRect,
  isDrag,
  keyEventToAction,
  mouseButton,
  remoteDesktopErrorCopy,
  toNormalized,
  type NormalizedPoint,
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
/** 开会话撞上 409 时的重试（只为吸收上一个面板刚关、服务端还没来得及释放的间隙）。 */
const START_CONFLICT_RETRIES = 2;
const START_CONFLICT_DELAY_MS = 700;

/** 这些状态再重试没有意义：会话没了、登录没了、被拒了。 */
function isFatalFrameFailure(error?: string, status?: number): boolean {
  if (error === "unauthorized" || error === "revoked" || error === "device_offline") return true;
  return status === 401 || status === 403 || status === 404 || status === 410;
}

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
  const lastMoveRef = useRef(0);

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
          // 429 / 网络错 / 5xx：这一条丢弃，不重放；让用户知道有输入没送到。
          flashNotice(remoteDesktopErrorCopy(result.error, result.status));
        }
      }
    } finally {
      pumpingRef.current = false;
    }
  }, [closeRemote, deviceId, finish, flashNotice]);

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
        last.deltaX = (last.deltaX ?? 0) + (action.deltaX ?? 0);
        last.deltaY = (last.deltaY ?? 0) + (action.deltaY ?? 0);
      } else if (
        last &&
        last.kind === "type" &&
        action.kind === "type" &&
        [...(last.text ?? "")].length + [...(action.text ?? "")].length <= 200
      ) {
        last.text = (last.text ?? "") + (action.text ?? "");
      } else if (queue.length >= INPUT_QUEUE_MAX) {
        flashNotice(tt("操作太快，部分输入被丢弃了。"));
        return;
      } else {
        queue.push(action);
      }
      void pump();
    },
    [pump, tt, flashNotice],
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
        if (created.status === 409 && attempt < START_CONFLICT_RETRIES) {
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
            finish("error", tt("与这台电脑失去联系，已断开。请重新进入。"));
            return;
          }
          setLinkNotice(tt("连接不稳，正在重试…"));
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
            data.error ? remoteDesktopErrorCopy(data.error) : tt("远程会话已结束。"),
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
      const img = imgRef.current;
      if (!img) return;
      const rect = img.getBoundingClientRect();
      if (!insideRect(event.clientX, event.clientY, rect)) return;
      event.preventDefault();
      const point = toNormalized(event.clientX, event.clientY, rect);
      if (!point) return;
      const unit = event.deltaMode === 1 ? 40 : event.deltaMode === 2 ? 400 : 1;
      const cap = (value: number) => Math.max(-2000, Math.min(2000, value * unit));
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
  }, [enqueue]);

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === rootRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function pointFromEvent(event: ReactMouseEvent): NormalizedPoint | null {
    const img = imgRef.current;
    if (!img) return null;
    return toNormalized(event.clientX, event.clientY, img.getBoundingClientRect());
  }

  function handleMouseDown(event: ReactMouseEvent) {
    stageRef.current?.focus();
    const button = mouseButton(event.button);
    const point = pointFromEvent(event);
    if (!button || !point) return;
    event.preventDefault();
    downRef.current = { point, button };
  }

  function handleMouseUp(event: ReactMouseEvent) {
    const down = downRef.current;
    downRef.current = null;
    const point = pointFromEvent(event);
    if (!down || !point) return;
    event.preventDefault();
    if (isDrag(down.point, point)) {
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
    if (event.detail >= 2 && pendingClickRef.current) {
      clearTimeout(pendingClickRef.current);
      pendingClickRef.current = null;
      enqueue({ kind: "double_click", x: point.x, y: point.y, button: "left" });
      return;
    }
    if (pendingClickRef.current) clearTimeout(pendingClickRef.current);
    pendingClickRef.current = setTimeout(() => {
      pendingClickRef.current = null;
      enqueue({ kind: "click", x: point.x, y: point.y, button: "left" });
    }, doubleClickWindowMs);
  }

  function handleMouseMove(event: ReactMouseEvent) {
    if (downRef.current) return; // 拖动期间只在抬起时送一条 drag
    const now = Date.now();
    if (now - lastMoveRef.current < MOVE_THROTTLE_MS) return;
    const point = pointFromEvent(event);
    if (!point) return;
    lastMoveRef.current = now;
    enqueue({ kind: "move", x: point.x, y: point.y });
  }

  function handleKeyDown(event: KeyboardEvent) {
    // Ctrl/⌘+V 交给 paste 事件，不当成按键送出去，否则对方会收到「按键 + 文字」两份。
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "v") return;
    const action = keyEventToAction(event.nativeEvent);
    if (!action) return;
    event.preventDefault();
    enqueue(action);
  }

  function sendText(text: string) {
    const clamped = clampPaste(text);
    if (!clamped.text) return;
    if (clamped.truncated) flashNotice(tt("文字太长，只发送了前面一部分。"));
    for (const chunk of chunkText(clamped.text)) enqueue({ kind: "type", text: chunk });
  }

  function handlePaste(event: ClipboardEvent) {
    const text = event.clipboardData?.getData("text") ?? "";
    event.preventDefault();
    sendText(text);
  }

  async function pasteFromClipboard() {
    try {
      sendText(await navigator.clipboard.readText());
    } catch {
      flashNotice(tt("浏览器没有允许读取剪贴板。请点一下画面，再按 Ctrl+V 粘贴。"));
    }
  }

  function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) {
      void document.exitFullscreen?.().catch(() => {});
    } else {
      void root.requestFullscreen?.().catch(() => {
        flashNotice(tt("这个浏览器不允许进入全屏。"));
      });
    }
  }

  function disconnect() {
    closeRemote();
    if (document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
    onClose();
  }

  const live = phase === "starting" || phase === "active" || phase === "connecting";
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
        tabIndex={0}
        role="application"
        aria-label={tt("远程桌面画面，点击后可用键盘")}
        data-remote-stage
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        onMouseMove={handleMouseMove}
        onContextMenu={(event) => event.preventDefault()}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        className="relative flex min-h-48 items-center justify-center overflow-hidden rounded-xl bg-neutral-900 outline-none focus:ring-2 focus:ring-neutral-400"
      >
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
          {notice ?? linkNotice ?? tt(message ?? "")}
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
