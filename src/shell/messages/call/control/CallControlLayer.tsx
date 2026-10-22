"use client";

// 共享屏幕格上的交互转发层（W07 放进共享画面格：props { participantId, videoEl }）。
// 只在「我正在控制这位参会者」（会话 active 且 controller 是我）时渲染，否则 return null，不挡普通观看。
//
// 行为与仓里已有的云浏览器「接管」层（cloud-browser-interaction.ts）同形，只是目标是通话对端的电脑：
//  - 指针移动/按下/抬起/拖动/滚轮，坐标按视频实际显示区域换算（object-fit 黑边不发）；
//  - 键盘 code/key/修饰键，仅白名单键转发并 preventDefault；中文等输入法走隐藏 textarea 的 compositionend；
//  - 粘贴发 tx（≤2000 字）；全部帧经 protocol.ts 的发送器限速、保序、单帧 ≤2 KB；
//  - 画控制方光标；连按 3 次 Esc 或点「停止控制」结束；失焦/切标签页/卸载时抬起全部按下的键与鼠标键。
import { useEffect, useRef } from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  CompositionEvent as ReactCompositionEvent,
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import { useUI } from "../../../../i18n/ui/useUI";
import { participantName, useCallSnapshot, useControlSnapshot, useControllerLink, useSelfUserId } from "./hooks";
import { CursorGlyph, StopIcon } from "./icons";
import {
  CENTER_POSITION,
  controlButton,
  controlMods,
  createEscapeStopDetector,
  isControlKeyCode,
  mapClientPointToSurface,
  parseObjectFit,
  parseObjectPosition,
  surfacePointToClient,
  wheelPixels,
  type BoxRect,
  type ControlButton,
  type IntrinsicSize,
  type ObjectFit,
  type ObjectPosition,
} from "./protocol";
import { controlNotices, stopAsController } from "./runtime";
import { CONTROL_ACCENT, dangerButtonStyle, overlayPillStyle } from "./styles";

export interface CallControlLayerProps {
  participantId: string;
  videoEl: HTMLVideoElement | null;
}

export function CallControlLayer({ participantId, videoEl }: CallControlLayerProps) {
  const tt = useUI();
  const call = useCallSnapshot();
  const store = useControlSnapshot();
  const meId = useSelfUserId(call);
  const target = call.participants.find((p) => p.participantId === participantId) ?? null;
  const session =
    target && meId && call.callId
      ? store.sessions.find(
          (s) =>
            s.call_id === call.callId &&
            s.state === "active" &&
            s.controller_id === meId &&
            s.target_id === target.userId,
        ) ?? null
      : null;
  if (!session || !target) return null;
  return (
    <ActiveControlSurface
      key={session.session_id}
      sessionId={session.session_id}
      targetName={participantName(call, target.userId, tt("参会者"))}
      videoEl={videoEl}
    />
  );
}

interface Geometry {
  box: BoxRect;
  intrinsic: IntrinsicSize;
  fit: ObjectFit;
  position: ObjectPosition;
}

function ActiveControlSurface({
  sessionId,
  targetName,
  videoEl,
}: {
  sessionId: string;
  targetName: string;
  videoEl: HTMLVideoElement | null;
}) {
  const tt = useUI();
  const { entry, link } = useControllerLink(sessionId);
  const ready = (link?.state ?? "connecting") === "ready";
  const waiting = (link?.state ?? "connecting") !== "ready";

  const rootRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const cursorRef = useRef<HTMLDivElement | null>(null);

  // effect 外读到的最新值走 ref，避免把 effect 依赖搞成每帧重挂。
  const senderRef = useRef(entry?.sender ?? null);
  const readyRef = useRef(ready);
  const videoRef = useRef(videoEl);
  senderRef.current = entry?.sender ?? null;
  readyRef.current = ready;
  videoRef.current = videoEl;

  const fitRef = useRef<{ fit: ObjectFit; position: ObjectPosition } | null>(null);
  const activePointerRef = useRef<{ id: number; button: ControlButton } | null>(null);
  const lastPointRef = useRef<{ x: number; y: number }>({ x: 0.5, y: 0.5 });
  const composingRef = useRef(false);
  const escRef = useRef(createEscapeStopDetector(() => Date.now()));

  function readGeometry(refreshFit = false): Geometry | null {
    const video = videoRef.current;
    if (!video) return null;
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;
    if (refreshFit || !fitRef.current) {
      let fit: ObjectFit = "contain";
      let position: ObjectPosition = CENTER_POSITION;
      try {
        const style = window.getComputedStyle(video);
        fit = parseObjectFit(style.objectFit);
        position = parseObjectPosition(style.objectPosition);
      } catch {
        /* 取不到计算样式就按 <video> 默认 contain + 居中 */
      }
      fitRef.current = { fit, position };
    }
    const rect = video.getBoundingClientRect();
    return {
      box: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
      intrinsic: { width, height },
      fit: fitRef.current.fit,
      position: fitRef.current.position,
    };
  }

  function mapPoint(clientX: number, clientY: number, g: Geometry, clamp: boolean) {
    return mapClientPointToSurface(clientX, clientY, g.box, g.intrinsic, { fit: g.fit, position: g.position, clamp });
  }

  function showCursor(point: { x: number; y: number }, g: Geometry): void {
    const root = rootRef.current;
    const node = cursorRef.current;
    if (!root || !node) return;
    const client = surfacePointToClient(point.x, point.y, g.box, g.intrinsic, { fit: g.fit, position: g.position });
    if (!client) return;
    const r = root.getBoundingClientRect();
    node.style.transform = `translate(${Math.round(client.clientX - r.left)}px, ${Math.round(client.clientY - r.top)}px)`;
    node.style.opacity = "1";
  }

  function hideCursor(): void {
    if (cursorRef.current) cursorRef.current.style.opacity = "0";
  }

  function focusInput(): void {
    try {
      inputRef.current?.focus({ preventScroll: true });
    } catch {
      /* ignore */
    }
  }

  function clearInput(): void {
    if (inputRef.current) inputRef.current.value = "";
  }

  function fromChrome(node: EventTarget | null): boolean {
    const el = node as Element | null;
    return Boolean(el && typeof el.closest === "function" && el.closest("[data-call-control-chrome]"));
  }

  // ---- 指针 ----
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (fromChrome(event.target)) return; // 「停止控制」按钮区不转发
    if (event.pointerType !== "touch") focusInput();
    if (!event.isPrimary) return;
    const sender = senderRef.current;
    const button = controlButton(event.button);
    if (!sender || !readyRef.current || !button) return;
    const g = readGeometry(true);
    if (!g) return;
    const point = mapPoint(event.clientX, event.clientY, g, false);
    if (!point) return; // 点在黑边上：不发
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* best effort */
    }
    activePointerRef.current = { id: event.pointerId, button };
    lastPointRef.current = point;
    sender.down(button, point.x, point.y);
    showCursor(point, g);
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.isPrimary) return;
    const sender = senderRef.current;
    if (!sender || !readyRef.current) return;
    const g = readGeometry();
    if (!g) return;
    const pressed = activePointerRef.current?.id === event.pointerId;
    const point = mapPoint(event.clientX, event.clientY, g, pressed);
    if (!point) {
      hideCursor();
      return;
    }
    if (pressed) event.preventDefault();
    lastPointRef.current = point;
    sender.move(point.x, point.y);
    showCursor(point, g);
  };

  const finishPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    const active = activePointerRef.current;
    if (!active || active.id !== event.pointerId) return;
    activePointerRef.current = null;
    const g = readGeometry();
    const point = (g ? mapPoint(event.clientX, event.clientY, g, true) : null) ?? lastPointRef.current;
    lastPointRef.current = point;
    senderRef.current?.up(active.button, point.x, point.y);
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      /* 已经释放 */
    }
  };

  const onWheel = (event: ReactWheelLike) => {
    const sender = senderRef.current;
    if (!sender || !readyRef.current) return;
    const g = readGeometry();
    if (!g) return;
    const point = mapPoint(event.clientX, event.clientY, g, false);
    if (!point) return;
    const pageHeight = g.box.height || 800;
    sender.wheel(wheelPixels(event.deltaX, event.deltaMode, pageHeight), wheelPixels(event.deltaY, event.deltaMode, pageHeight));
  };

  // ---- 键盘 ----
  const onKeyDown = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const native = event.nativeEvent;
    if (native.isComposing || composingRef.current || event.key === "Process" || native.keyCode === 229) {
      // 输入法组字中的 Esc 只用来取消组字：标记已处理，免得放大视图把它当成「缩小」（W07 跳过 defaultPrevented）。
      if (event.key === "Escape") event.preventDefault();
      return;
    }
    if (escRef.current.press(event.code, event.repeat)) {
      event.preventDefault();
      event.stopPropagation();
      void stopAsController(sessionId);
      return;
    }
    if (!isControlKeyCode(event.code)) return; // 白名单外：留给浏览器，不转发
    event.preventDefault();
    event.stopPropagation();
    const sender = senderRef.current;
    if (!sender || !readyRef.current) return;
    sender.keyDown(event.code, event.key, controlMods(event));
  };

  const onKeyUp = (event: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    const sender = senderRef.current;
    if (!sender) return;
    if (sender.keyUp(event.code, event.key, controlMods(event))) {
      event.preventDefault();
      event.stopPropagation();
    }
  };

  // ---- 输入法与粘贴（隐藏 textarea 收集，不走 keydown）----
  const onCompositionStart = () => {
    composingRef.current = true;
  };

  const onCompositionEnd = (event: ReactCompositionEvent<HTMLTextAreaElement>) => {
    composingRef.current = false;
    const text = event.data;
    clearInput();
    const sender = senderRef.current;
    if (sender && readyRef.current && text) sender.text(text);
  };

  const onBeforeInput = (event: ReactFormLikeInput) => {
    // 回车/退格经 textarea 会被当成文本插入；转成一次按键更可靠。
    const inputType = event.nativeEvent?.inputType ?? "";
    if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
      event.preventDefault();
      clearInput();
      senderRef.current?.tap("Enter", "Enter");
    } else if (inputType === "deleteContentBackward") {
      event.preventDefault();
      clearInput();
      senderRef.current?.tap("Backspace", "Backspace");
    } else if (inputType === "deleteContentForward") {
      event.preventDefault();
      clearInput();
      senderRef.current?.tap("Delete", "Delete");
    }
  };

  const onInput = (event: ReactFormLikeInput) => {
    if (composingRef.current) return;
    const value = (event.currentTarget as HTMLTextAreaElement).value;
    clearInput();
    const sender = senderRef.current;
    if (sender && readyRef.current && value) sender.text(value);
  };

  const onPaste = (event: ReactClipboardEvent<HTMLTextAreaElement>) => {
    const text = event.clipboardData?.getData("text") ?? "";
    if (!text) return;
    event.preventDefault();
    clearInput();
    const sender = senderRef.current;
    if (!sender || !readyRef.current) return;
    const result = sender.text(text);
    if (result.truncated) controlNotices.push("paste_truncated", { sessionId });
  };

  // ---- 窗口级兜底：失焦 / 切走标签页 / 卸载 → 抬起全部，别在对方电脑上卡住键 ----
  useEffect(() => {
    if (typeof window === "undefined") return;
    const releaseAll = () => {
      activePointerRef.current = null;
      escRef.current.reset();
      senderRef.current?.releaseAll();
    };
    const onHidden = () => {
      if (document.hidden) releaseAll();
    };
    window.addEventListener("blur", releaseAll);
    document.addEventListener("visibilitychange", onHidden);
    return () => {
      window.removeEventListener("blur", releaseAll);
      document.removeEventListener("visibilitychange", onHidden);
      releaseAll();
    };
  }, []);

  // ready 后把键盘入口聚焦过来，让打字直接生效。
  useEffect(() => {
    if (ready) focusInput();
  }, [ready]);

  return (
    <div
      ref={rootRef}
      data-call-control-layer
      data-call-control-session={sessionId}
      data-call-control-ready={ready ? "1" : "0"}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={finishPointer}
      onPointerCancel={finishPointer}
      onWheel={onWheel}
      onContextMenu={(event) => event.preventDefault()}
      style={{
        position: "absolute",
        inset: 0,
        cursor: ready ? "none" : "progress",
        touchAction: "none",
        zIndex: 5,
      }}
    >
      {/* 键盘与输入法入口：铺满但透明，承接 keydown/composition/paste。 */}
      <textarea
        ref={inputRef}
        data-call-control-input
        aria-label={tt("远程控制键盘与输入法入口")}
        autoCapitalize="off"
        autoCorrect="off"
        autoComplete="off"
        spellCheck={false}
        onKeyDown={onKeyDown}
        onKeyUp={onKeyUp}
        onCompositionStart={onCompositionStart}
        onCompositionEnd={onCompositionEnd}
        onBeforeInput={onBeforeInput}
        onInput={onInput}
        onPaste={onPaste}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          resize: "none",
          border: 0,
          padding: 0,
          margin: 0,
          background: "transparent",
          color: "transparent",
          caretColor: "transparent",
          outlineStyle: "none",
          opacity: 0,
        }}
      />
      <div
        ref={cursorRef}
        aria-hidden
        style={{ position: "absolute", top: 0, left: 0, opacity: 0, pointerEvents: "none", transition: "opacity 120ms" }}
      >
        <CursorGlyph color={CONTROL_ACCENT} />
      </div>
      <div
        data-call-control-chrome
        style={{ position: "absolute", top: 10, left: "50%", transform: "translateX(-50%)", pointerEvents: "none", maxWidth: "100%" }}
      >
        <div style={{ ...overlayPillStyle, pointerEvents: "auto" }} role="status">
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            {waiting
              ? tt("正在连接对方电脑…")
              : tt("正在控制{target}的电脑 · 连按 3 次 Esc 结束", { target: targetName })}
          </span>
          <button
            type="button"
            style={{ ...dangerButtonStyle, minHeight: 26 }}
            data-call-control-action="stop"
            onClick={() => void stopAsController(sessionId)}
          >
            <StopIcon width={12} height={12} />
            {tt("停止控制")}
          </button>
        </div>
      </div>
    </div>
  );
}

// React 的 WheelEvent / InputEvent 包装在 strip-types 下引入体积大，这里只取用到的字段。
interface ReactWheelLike {
  clientX: number;
  clientY: number;
  deltaX: number;
  deltaY: number;
  deltaMode: number;
}
interface ReactFormLikeInput {
  nativeEvent?: { inputType?: string };
  currentTarget: EventTarget & { value?: string };
  preventDefault(): void;
}
