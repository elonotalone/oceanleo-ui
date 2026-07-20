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
  KeyboardEvent as ReactKeyboardEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from "react";
import type {
  CloudBrowserTab,
  CloudBrowserTransportState,
} from "../lib/browser";
import type { UITranslate } from "../i18n/ui/useUI";
import {
  browserNavigationTarget,
  createCloudBrowserTextCommitGate,
  playwrightKey,
  pointInContainedFrame,
  redactedDisplayUrl,
} from "./cloud-browser-live";

type SendMutation = (
  type: string,
  payload?: Record<string, unknown>,
  legacy?: Record<string, unknown>,
) => boolean;

type InteractionOptions = {
  liveRequested: boolean;
  driving: boolean;
  protocol: 1 | 2 | null;
  transportState: CloudBrowserTransportState;
  tabs: CloudBrowserTab[];
  activeTabId: string;
  address: string;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  frameSizeRef: MutableRefObject<{ width: number; height: number }>;
  sendMutation: SendMutation;
  setAddress: (address: string) => void;
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

export function useCloudBrowserInteraction({
  liveRequested,
  driving,
  protocol,
  transportState,
  tabs,
  activeTabId,
  address,
  canvasRef,
  frameSizeRef,
  sendMutation,
  setAddress,
  setError,
  tt,
}: InteractionOptions) {
  const [omniboxOpen, setOmniboxOpen] = useState(false);
  const [omniboxValue, setOmniboxValue] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement | null>(null);
  const omniboxInputRef = useRef<HTMLInputElement | null>(null);
  const activePointerRef = useRef<{
    pointerId: number;
    button: string;
    point: { nx: number; ny: number };
  } | null>(null);
  const lastViewportRef = useRef("");
  const resizeTimerRef = useRef<number | null>(null);
  const textGateRef = useRef(createCloudBrowserTextCommitGate());
  const compositionTextRef = useRef("");

  function openOmnibox() {
    if (!driving || transportState !== "streaming") return;
    const currentTab = tabs.find((tab) => tab.id === activeTabId);
    setOmniboxValue(currentTab?.displayUrl || address || "");
    setOmniboxOpen(true);
  }

  function closeOmnibox() {
    setOmniboxOpen(false);
    window.requestAnimationFrame(() => {
      hiddenInputRef.current?.focus({ preventScroll: true });
    });
  }

  function submitOmnibox() {
    const target = browserNavigationTarget(omniboxValue);
    if (!target) {
      setError(tt("请输入网址或搜索内容"));
      return;
    }
    sendMutation(
      "nav.open",
      { url: target, value: omniboxValue.trim() },
      { t: "goto", url: target },
    );
    setAddress(redactedDisplayUrl(target));
    setOmniboxOpen(false);
    hiddenInputRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => {
    setOmniboxOpen(false);
    if (liveRequested) return;
    textGateRef.current.reset();
    compositionTextRef.current = "";
    activePointerRef.current = null;
    if (hiddenInputRef.current) hiddenInputRef.current.value = "";
  }, [liveRequested]);

  useEffect(() => {
    if (!driving) activePointerRef.current = null;
  }, [driving]);

  useEffect(() => {
    if (!omniboxOpen) return;
    window.requestAnimationFrame(() => {
      omniboxInputRef.current?.focus({ preventScroll: true });
      omniboxInputRef.current?.select();
    });
  }, [omniboxOpen]);

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (
        !driving ||
        transportState !== "streaming" ||
        !(event.ctrlKey || event.metaKey) ||
        event.altKey ||
        event.key.toLowerCase() !== "l"
      ) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      openOmnibox();
    };
    document.addEventListener("keydown", shortcut);
    return () => document.removeEventListener("keydown", shortcut);
  }, [driving, transportState, address, activeTabId, tabs]);

  useEffect(() => {
    const update = () => {
      const root = rootRef.current;
      setFullscreen(Boolean(root && document.fullscreenElement === root));
    };
    const failed = () => {
      setError(tt("无法进入全屏，请检查嵌入页面的全屏权限"));
      update();
    };
    document.addEventListener("fullscreenchange", update);
    document.addEventListener("fullscreenerror", failed);
    return () => {
      document.removeEventListener("fullscreenchange", update);
      document.removeEventListener("fullscreenerror", failed);
    };
  }, [setError, tt]);

  useEffect(() => {
    if (!liveRequested || !driving || protocol !== 2) return;
    const node = viewportRef.current;
    if (!node) return;
    const report = () => {
      if (transportState !== "streaming") return;
      const bounds = node.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0) return;
      const width = Math.max(1024, Math.min(1920, Math.round(bounds.width)));
      const height = Math.max(640, Math.min(1080, Math.round(bounds.height)));
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
    liveRequested,
    driving,
    protocol,
    transportState,
    activeTabId,
    sendMutation,
  ]);

  function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement === root) {
      void document.exitFullscreen().catch(() => {
        setError(tt("退出全屏失败"));
      });
      return;
    }
    // requestFullscreen must remain in the original click activation stack.
    void root.requestFullscreen().catch(() => {
      setError(tt("无法进入全屏，请检查嵌入页面的全屏权限"));
    });
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
    activePointerRef.current = {
      pointerId: event.pointerId,
      button,
      point,
    };
    sendMutation(
      "pointer",
      { event: "down", ...point, button },
      { t: "pointer", event: "down", ...point, button },
    );
    hiddenInputRef.current?.focus({ preventScroll: true });
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
    if (activePointerRef.current?.pointerId === event.pointerId) {
      activePointerRef.current.point = point;
    }
    sendMutation(
      "pointer",
      { event: "move", ...point },
      { t: "pointer", event: "move", ...point },
    );
  }

  function handlePointerUp(event: ReactPointerEvent<HTMLCanvasElement>) {
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
    sendMutation(
      "pointer",
      { event: "up", ...point, button },
      { t: "pointer", event: "up", ...point, button },
    );
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
    const payload = {
      ...point,
      dx: cap(event.deltaX),
      dy: cap(event.deltaY),
    };
    sendMutation("wheel", payload, { t: "scroll", ...payload });
  }

  function handleHiddenKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (!driving) return;
    if (
      (event.ctrlKey || event.metaKey) &&
      !event.altKey &&
      event.key.toLowerCase() === "l"
    ) {
      event.preventDefault();
      event.stopPropagation();
      openOmnibox();
      return;
    }
    if (
      event.nativeEvent.isComposing ||
      event.key === "Process" ||
      event.key === "Dead"
    ) {
      return;
    }
    const modified = event.ctrlKey || event.metaKey || event.altKey;
    if (!modified && !COMMAND_KEYS.has(event.key)) return;
    event.preventDefault();
    const key = playwrightKey(event);
    sendMutation(
      "key",
      { event: "press", key },
      { t: "key", event: "press", key },
    );
  }

  function sendText(text: string, compositionId: string) {
    if (!text) return;
    sendMutation(
      "text.commit",
      { text, composition_id: compositionId },
      { t: "key", event: "char", text },
    );
  }

  function commitText(
    commit: ReturnType<
      ReturnType<typeof createCloudBrowserTextCommitGate>["input"]
    >,
  ) {
    if (commit) sendText(commit.text, commit.compositionId);
  }

  function clearHiddenInput() {
    if (hiddenInputRef.current) hiddenInputRef.current.value = "";
  }

  function handleBeforeInput(
    event: ReactFormEvent<HTMLTextAreaElement>,
  ) {
    if (!driving) return;
    const native = event.nativeEvent as InputEvent;
    const inputType = native.inputType || "";
    if (inputType === "insertLineBreak" || inputType === "insertParagraph") {
      event.preventDefault();
      sendMutation(
        "key",
        { event: "press", key: "Enter" },
        { t: "key", event: "press", key: "Enter" },
      );
      clearHiddenInput();
      return;
    }
    if (
      inputType === "deleteContentBackward" ||
      inputType === "deleteContentForward"
    ) {
      event.preventDefault();
      const key =
        inputType === "deleteContentBackward" ? "Backspace" : "Delete";
      sendMutation(
        "key",
        { event: "press", key },
        { t: "key", event: "press", key },
      );
      clearHiddenInput();
      return;
    }
    const commit = textGateRef.current.beforeInput(inputType, native.data);
    if (commit) {
      event.preventDefault();
      commitText(commit);
      clearHiddenInput();
    }
  }

  function handleInput(event: ReactFormEvent<HTMLTextAreaElement>) {
    if (!driving || textGateRef.current.isComposing()) return;
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
    compositionTextRef.current = "";
    textGateRef.current.compositionStart();
  }

  function handleCompositionUpdate(
    event: ReactCompositionEvent<HTMLTextAreaElement>,
  ) {
    compositionTextRef.current = event.data;
  }

  function handleCompositionEnd(
    event: ReactCompositionEvent<HTMLTextAreaElement>,
  ) {
    if (!driving) return;
    commitText(
      textGateRef.current.compositionEnd(
        event.data || compositionTextRef.current,
      ),
    );
    compositionTextRef.current = "";
    clearHiddenInput();
  }

  function handlePaste(
    event: ReactClipboardEvent<HTMLTextAreaElement>,
  ) {
    if (!driving) return;
    const text = event.clipboardData.getData("text");
    if (!text) return;
    event.preventDefault();
    commitText(textGateRef.current.paste(text));
    clearHiddenInput();
  }

  return {
    rootRef,
    viewportRef,
    hiddenInputRef,
    omniboxInputRef,
    omniboxOpen,
    omniboxValue,
    setOmniboxValue,
    fullscreen,
    openOmnibox,
    closeOmnibox,
    submitOmnibox,
    toggleFullscreen,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleWheel,
    handleHiddenKeyDown,
    handleBeforeInput,
    handleInput,
    handleCompositionStart,
    handleCompositionUpdate,
    handleCompositionEnd,
    handlePaste,
  };
}
