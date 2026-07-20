"use client";

import {
  useEffect,
  useRef,
  useState,
} from "react";
import type {
  ClipboardEvent as ReactClipboardEvent,
  CompositionEvent as ReactCompositionEvent,
  FormEvent as ReactFormEvent,
  FocusEvent as ReactFocusEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";
import type {
  CloudBrowserCapabilitiesV3,
  CloudBrowserTransportState,
} from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";
import {
  createCloudBrowserTextCommitGate,
  playwrightKey,
  pointInContainedFrame,
} from "./cloud-browser-live";

type SendMutation = (
  type: string,
  payload?: Record<string, unknown>,
) => boolean;

type InteractionOptions = {
  liveRequested: boolean;
  driving: boolean;
  protocol: 3 | null;
  capabilities: CloudBrowserCapabilitiesV3;
  transportState: CloudBrowserTransportState;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameSizeRef: MutableRefObject<{ width: number; height: number }>;
  sendMutation: SendMutation;
  setError: (message: string) => void;
  tt: UITranslate;
};

const COMMAND_KEYS = new Set([
  "Escape",
  "Enter",
  "Tab",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F11",
  "F12",
]);

type HiddenSibling = {
  element: HTMLElement;
  ariaHidden: string | null;
  inert: boolean;
};

/**
 * Fullscreen fallback still removes the surrounding OceanLeo chrome from the
 * accessibility tree. Every changed node is restored exactly on exit.
 */
export function isolateCloudBrowserImmersiveRoot(
  root: HTMLElement,
): () => void {
  const hidden: HiddenSibling[] = [];
  let current: HTMLElement | null = root;
  while (current && current !== document.body) {
    const parent: HTMLElement | null = current.parentElement;
    if (!parent) break;
    for (const sibling of Array.from(parent.children)) {
      if (
        sibling === current ||
        !(sibling instanceof HTMLElement) ||
        ["SCRIPT", "STYLE", "LINK"].includes(sibling.tagName)
      ) {
        continue;
      }
      hidden.push({
        element: sibling,
        ariaHidden: sibling.getAttribute("aria-hidden"),
        inert: sibling.inert,
      });
      sibling.setAttribute("aria-hidden", "true");
      sibling.inert = true;
    }
    current = parent;
  }
  return () => {
    for (const item of hidden) {
      if (item.ariaHidden === null) {
        item.element.removeAttribute("aria-hidden");
      } else {
        item.element.setAttribute("aria-hidden", item.ariaHidden);
      }
      item.element.inert = item.inert;
    }
  };
}

export function useCloudBrowserInteraction({
  liveRequested,
  driving,
  protocol,
  capabilities,
  transportState,
  canvasRef,
  frameSizeRef,
  sendMutation,
  setError,
  tt,
}: InteractionOptions) {
  const [immersive, setImmersive] = useState(false);
  const [fullscreenMode, setFullscreenMode] =
    useState<"native" | "fallback" | null>(null);
  const [immersiveControlsVisible, setImmersiveControlsVisible] =
    useState(true);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement | null>(null);
  const activePointerRef = useRef<{
    pointerId: number;
    wirePointerId: number;
    button: string;
    point: { nx: number; ny: number };
  } | null>(null);
  const lastViewportRef = useRef("");
  const resizeTimerRef = useRef<number | null>(null);
  const immersiveTimerRef = useRef<number | null>(null);
  const textGateRef = useRef(createCloudBrowserTextCommitGate());
  const compositionTextRef = useRef("");
  const compositionIdRef = useRef("");

  function clearHiddenInput() {
    if (hiddenInputRef.current) hiddenInputRef.current.value = "";
  }

  function resetInputState() {
    textGateRef.current.reset();
    compositionTextRef.current = "";
    compositionIdRef.current = "";
    activePointerRef.current = null;
    clearHiddenInput();
  }

  useEffect(() => {
    if (
      liveRequested &&
      driving &&
      transportState === "streaming"
    ) {
      return;
    }
    resetInputState();
  }, [driving, liveRequested, transportState]);

  useEffect(() => {
    const update = () => {
      const root = rootRef.current;
      if (root && document.fullscreenElement === root) {
        setImmersive(true);
        setFullscreenMode("native");
      } else if (fullscreenMode === "native") {
        setImmersive(false);
        setFullscreenMode(null);
      }
    };
    const failed = () => {
      setImmersive(true);
      setFullscreenMode("fallback");
      setError(tt("浏览器拒绝原生全屏，已使用沉浸式覆盖模式"));
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("fullscreenerror", failed);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("fullscreenerror", failed);
    };
  }, [fullscreenMode, setError, tt]);

  useEffect(() => {
    if (!immersive) return;
    const root = rootRef.current;
    if (!root) return;
    const previousOverflow = document.body.style.overflow;
    const previousDataset =
      document.documentElement.dataset.cloudBrowserImmersive;
    document.body.style.overflow = "hidden";
    document.documentElement.dataset.cloudBrowserImmersive =
      fullscreenMode || "fallback";
    const restoreSiblings =
      isolateCloudBrowserImmersiveRoot(root);
    document.dispatchEvent(
      new CustomEvent("oceanleo:cloud-browser-immersive", {
        detail: { active: true, mode: fullscreenMode || "fallback" },
      }),
    );
    return () => {
      restoreSiblings();
      document.body.style.overflow = previousOverflow;
      if (previousDataset === undefined) {
        delete document.documentElement.dataset.cloudBrowserImmersive;
      } else {
        document.documentElement.dataset.cloudBrowserImmersive =
          previousDataset;
      }
      document.dispatchEvent(
        new CustomEvent("oceanleo:cloud-browser-immersive", {
          detail: { active: false, mode: null },
        }),
      );
    };
  }, [fullscreenMode, immersive]);

  useEffect(
    () => () => {
      if (immersiveTimerRef.current !== null) {
        window.clearTimeout(immersiveTimerRef.current);
      }
    },
    [],
  );

  function revealImmersiveControls() {
    if (!immersive) return;
    setImmersiveControlsVisible(true);
    if (immersiveTimerRef.current !== null) {
      window.clearTimeout(immersiveTimerRef.current);
    }
    immersiveTimerRef.current = window.setTimeout(() => {
      immersiveTimerRef.current = null;
      setImmersiveControlsVisible(false);
    }, 1_800);
  }

  useEffect(() => {
    if (!immersive) {
      setImmersiveControlsVisible(true);
      return;
    }
    revealImmersiveControls();
  }, [immersive]);

  useEffect(() => {
    if (
      !liveRequested ||
      !driving ||
      protocol !== 3 ||
      !capabilities.viewport_resize
    ) {
      return;
    }
    const node = viewportRef.current;
    if (!node) return;
    const report = () => {
      if (transportState !== "streaming") return;
      const bounds = node.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const width = Math.max(
        640,
        Math.min(4_096, Math.round(bounds.width)),
      );
      const height = Math.max(
        480,
        Math.min(4_096, Math.round(bounds.height)),
      );
      const dpr = Math.max(
        1,
        Math.min(2, Number(window.devicePixelRatio) || 1),
      );
      const signature = `${width}:${height}:${dpr}`;
      if (signature === lastViewportRef.current) return;
      lastViewportRef.current = signature;
      sendMutation("viewport.set", { width, height, dpr });
    };
    const schedule = () => {
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
      }
      resizeTimerRef.current = window.setTimeout(report, 120);
    };
    const observer =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(schedule);
    observer?.observe(node);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", schedule);
      if (resizeTimerRef.current !== null) {
        window.clearTimeout(resizeTimerRef.current);
        resizeTimerRef.current = null;
      }
    };
  }, [
    capabilities.viewport_resize,
    driving,
    immersive,
    liveRequested,
    protocol,
    sendMutation,
    transportState,
  ]);

  function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (immersive) {
      if (document.fullscreenElement === root) {
        void document.exitFullscreen().catch(() => {
          setError(tt("退出全屏失败"));
        });
      } else {
        setImmersive(false);
        setFullscreenMode(null);
      }
      return;
    }
    setImmersive(true);
    setFullscreenMode("fallback");
    // Keep requestFullscreen in the original user-activation call stack.
    if (typeof root.requestFullscreen !== "function") {
      setError(tt("当前环境不支持原生全屏，已使用沉浸式覆盖模式"));
      return;
    }
    void root.requestFullscreen().then(
      () => {
        setFullscreenMode("native");
      },
      () => {
        setFullscreenMode("fallback");
        setError(tt("浏览器拒绝原生全屏，已使用沉浸式覆盖模式"));
      },
    );
  }

  function canvasPoint(
    clientX: number,
    clientY: number,
    canvas: HTMLCanvasElement,
  ) {
    return pointInContainedFrame(
      clientX,
      clientY,
      canvas.getBoundingClientRect(),
      frameSizeRef.current,
    );
  }

  function pointerButton(button: number) {
    return button === 1 ? "middle" : button === 2 ? "right" : "left";
  }

  function wirePointerId(pointerId: number) {
    return ((Math.abs(Math.trunc(pointerId)) || 1) % 32) + 1;
  }

  function focusRemoteWindow() {
    if (!driving || transportState !== "streaming") return;
    sendMutation("focus", { focused: true });
    hiddenInputRef.current?.focus({ preventScroll: true });
  }

  function handlePointerDown(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (!driving || transportState !== "streaming") return;
    const point = canvasPoint(
      event.clientX,
      event.clientY,
      event.currentTarget,
    );
    if (!point) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is best effort.
    }
    const button = pointerButton(event.button);
    const mappedPointerId = wirePointerId(event.pointerId);
    activePointerRef.current = {
      pointerId: event.pointerId,
      wirePointerId: mappedPointerId,
      button,
      point,
    };
    sendMutation("pointer", {
      event: "down",
      ...point,
      button,
      pointer_id: mappedPointerId,
    });
    focusRemoteWindow();
  }

  function handlePointerMove(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (!driving || transportState !== "streaming") return;
    const point = canvasPoint(
      event.clientX,
      event.clientY,
      event.currentTarget,
    );
    if (!point) return;
    event.preventDefault();
    const active = activePointerRef.current;
    if (active?.pointerId === event.pointerId) active.point = point;
    sendMutation("pointer", {
      event: "move",
      ...point,
      button: active?.button || "",
      pointer_id:
        active?.wirePointerId || wirePointerId(event.pointerId),
    });
  }

  function handlePointerUp(
    event: ReactPointerEvent<HTMLCanvasElement>,
  ) {
    if (!driving || transportState !== "streaming") return;
    const active = activePointerRef.current;
    const point =
      canvasPoint(event.clientX, event.clientY, event.currentTarget) ||
      (active?.pointerId === event.pointerId ? active.point : null);
    if (!point) return;
    event.preventDefault();
    const button =
      active?.pointerId === event.pointerId
        ? active.button
        : pointerButton(event.button);
    sendMutation("pointer", {
      event: event.type === "pointercancel" ? "cancel" : "up",
      ...point,
      button,
      pointer_id:
        active?.wirePointerId || wirePointerId(event.pointerId),
    });
    activePointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // Pointer may already have been released.
    }
  }

  function handleWheel(event: ReactWheelEvent<HTMLCanvasElement>) {
    if (!driving || transportState !== "streaming") return;
    const point = canvasPoint(
      event.clientX,
      event.clientY,
      event.currentTarget,
    );
    if (!point) return;
    event.preventDefault();
    const unit =
      event.deltaMode === 1
        ? 16
        : event.deltaMode === 2
          ? frameSizeRef.current.height
          : 1;
    const cap = (value: number) =>
      Math.max(-2_000, Math.min(2_000, Math.round(value * unit)));
    sendMutation("wheel", {
      ...point,
      dx: cap(event.deltaX),
      dy: cap(event.deltaY),
    });
  }

  function handleCanvasFocus() {
    focusRemoteWindow();
  }

  function handleHiddenFocus() {
    if (driving && transportState === "streaming") {
      sendMutation("focus", { focused: true });
    }
  }

  function handleHiddenBlur(
    event: ReactFocusEvent<HTMLTextAreaElement>,
  ) {
    if (
      driving &&
      transportState === "streaming" &&
      !rootRef.current?.contains(event.relatedTarget as Node | null)
    ) {
      sendMutation("focus", { focused: false });
    }
  }

  function handleHiddenKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (!driving || transportState !== "streaming") return;
    if (
      event.nativeEvent.isComposing ||
      event.key === "Process" ||
      event.key === "Dead"
    ) {
      return;
    }
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    const clipboardPaste =
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "v";
    if (clipboardPaste) {
      // Let the trusted paste event provide bounded clipboard text once.
      return;
    }
    if (!modified && !COMMAND_KEYS.has(event.key)) return;
    event.preventDefault();
    sendMutation("key", {
      event: "press",
      key: playwrightKey(event),
    });
  }

  function sendText(text: string, compositionId: string) {
    if (!text) return false;
    return sendMutation("text.commit", {
      text,
      composition_id: compositionId,
    });
  }

  function commitText(
    commit: ReturnType<
      ReturnType<typeof createCloudBrowserTextCommitGate>["input"]
    >,
  ) {
    if (commit) sendText(commit.text, commit.compositionId);
  }

  function handleBeforeInput(
    event: ReactFormEvent<HTMLTextAreaElement>,
  ) {
    if (!driving || transportState !== "streaming") return;
    const native = event.nativeEvent as InputEvent;
    const inputType = native.inputType || "";
    if (
      inputType === "insertLineBreak" ||
      inputType === "insertParagraph"
    ) {
      event.preventDefault();
      sendMutation("key", { event: "press", key: "Enter" });
      clearHiddenInput();
      return;
    }
    if (
      inputType === "deleteContentBackward" ||
      inputType === "deleteContentForward"
    ) {
      event.preventDefault();
      sendMutation("key", {
        event: "press",
        key:
          inputType === "deleteContentBackward"
            ? "Backspace"
            : "Delete",
      });
      clearHiddenInput();
      return;
    }
    const commit = textGateRef.current.beforeInput(
      inputType,
      native.data,
    );
    if (commit) {
      event.preventDefault();
      commitText(commit);
      clearHiddenInput();
    }
  }

  function handleInput(event: ReactFormEvent<HTMLTextAreaElement>) {
    if (
      !driving ||
      transportState !== "streaming" ||
      textGateRef.current.isComposing()
    ) {
      return;
    }
    const native = event.nativeEvent as InputEvent;
    commitText(
      textGateRef.current.input(
        native.inputType || "",
        native.data,
        event.currentTarget.value,
      ),
    );
    clearHiddenInput();
  }

  function handleCompositionStart() {
    if (!driving || transportState !== "streaming") return;
    compositionTextRef.current = "";
    const compositionId = textGateRef.current.compositionStart();
    compositionIdRef.current = compositionId;
    if (capabilities.ime_composition) {
      sendMutation("composition.start", {
        composition_id: compositionId,
        text: "",
      });
    }
  }

  function handleCompositionUpdate(
    event: ReactCompositionEvent<HTMLTextAreaElement>,
  ) {
    if (!driving || transportState !== "streaming") return;
    compositionTextRef.current = event.data;
    const update = textGateRef.current.compositionUpdate(event.data);
    if (update && capabilities.ime_composition) {
      sendMutation("composition.update", {
        composition_id: update.compositionId,
        text: update.text,
      });
    }
  }

  function handleCompositionEnd(
    event: ReactCompositionEvent<HTMLTextAreaElement>,
  ) {
    if (!driving || transportState !== "streaming") {
      resetInputState();
      return;
    }
    const commit = textGateRef.current.compositionEnd(
      event.data || compositionTextRef.current,
    );
    if (commit) {
      if (capabilities.ime_composition) {
        sendMutation("composition.end", {
          composition_id: commit.compositionId,
          text: commit.text,
        });
      } else {
        sendText(commit.text, commit.compositionId);
      }
    }
    compositionTextRef.current = "";
    compositionIdRef.current = "";
    clearHiddenInput();
  }

  function handlePaste(
    event: ReactClipboardEvent<HTMLTextAreaElement>,
  ) {
    if (!driving || transportState !== "streaming") return;
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    const commit = textGateRef.current.paste(text);
    if (commit) {
      if (capabilities.clipboard) {
        sendMutation("clipboard.paste", {
          text: commit.text,
          composition_id: commit.compositionId,
        });
      } else {
        sendText(commit.text, commit.compositionId);
      }
    }
    clearHiddenInput();
  }

  return {
    rootRef,
    viewportRef,
    hiddenInputRef,
    immersive,
    fullscreenMode,
    immersiveControlsVisible,
    revealImmersiveControls,
    toggleFullscreen,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    handleCanvasFocus,
    handleHiddenFocus,
    handleHiddenBlur,
    handleHiddenKeyDown,
    handleBeforeInput,
    handleInput,
    handleCompositionStart,
    handleCompositionUpdate,
    handleCompositionEnd,
    handlePaste,
  };
}
