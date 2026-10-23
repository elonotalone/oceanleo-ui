"use client";

/**
 * PDF 舞台：**唯一的** EmbedPDF 查看器实例（D4）。
 *
 * 基础编辑与专业编辑是同一个实例、同一份文档：`mode` 变了只调 bridge 显隐官方
 * 工具栏 / 侧栏 / 浮动菜单，不卸载、不重新载入、没有「正在切换」；页码、缩放、
 * 未保存的批注都留在原处。查看器只在挂载时读一次 config，之后的主题变化走
 * `container.setTheme()`。
 */
import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { PDFIUM_INIT_TIMEOUT_MS, pdfiumInitWatch } from "./pdf-next-runtime";
import { pdfEngineBuffer, resolvePdfiumLoadPlan } from "./pdf-engine-host";
import { buildPdfViewerConfig, pdfViewerTheme } from "./pdf-viewer-config";
import {
  createPdfViewerBridge,
  type PdfChromeMode,
  type PdfViewerBridge,
  type PdfViewerRegistryLike,
} from "./pdf-viewer-bridge";

export interface PdfStageHandle {
  bridge: PdfViewerBridge;
  /** 查看器的滚动容器（素材拖放落点换算用）。 */
  viewport: () => Element | null;
}

export interface PdfStageProps {
  /** 首次载入的字节；之后换文档走 bridge.replaceDocument，不再经这里。 */
  bytes: Uint8Array | null;
  name: string;
  mode: PdfChromeMode;
  accent?: string;
  dark: boolean;
  author?: string;
  onHandle: (handle: PdfStageHandle | null) => void;
  onFailure: (reason: string) => void;
  /** 基础档按 Ctrl/⌘+F：打开我们的查找栏（官方查找侧栏在基础档关着）。 */
  onFindShortcut?: () => void;
}

interface ContainerLike {
  setTheme?: (theme: unknown) => void;
  shadowRoot?: ShadowRoot | null;
}

let instanceSeq = 0;

export function PdfStage({
  bytes,
  name,
  mode,
  accent = "#4f46e5",
  dark,
  author,
  onHandle,
  onFailure,
  onFindShortcut,
}: PdfStageProps) {
  const tt = useUI();
  const plan = useMemo(() => resolvePdfiumLoadPlan(), []);
  const [Viewer, setViewer] = useState<ComponentType<Record<string, unknown>> | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [timeoutError, setTimeoutError] = useState("");
  /** 内核太慢时「重新载入」才换一个查看器（平时永远是同一个）。 */
  const [attempt, setAttempt] = useState(0);
  const instanceId = useMemo(() => `pdf-viewer-${++instanceSeq}`, []);
  const containerRef = useRef<ContainerLike | null>(null);
  const bridgeRef = useRef<PdfViewerBridge | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const callbacks = useRef({ onHandle, onFailure, onFindShortcut });
  callbacks.current = { onHandle, onFailure, onFindShortcut };
  const firstBytes = useRef(bytes);
  if (!firstBytes.current && bytes) firstBytes.current = bytes;
  const initial = firstBytes.current;

  // 查看器只读一次 config：第一次拿到字节时定下来。
  const config = useMemo(
    () =>
      initial && plan.wasm.ok
        ? buildPdfViewerConfig({
            wasmUrl: plan.wasm.wasmUrl,
            fontFallback: plan.fontFallback,
            bytes: pdfEngineBuffer(initial),
            name,
            palette: { accent, dark },
            author,
            textPlaceholder: tt("输入文字"),
          })
        : null,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initial, plan],
  );

  useEffect(() => {
    if (!plan.wasm.ok) callbacks.current.onFailure(plan.wasm.reason);
  }, [plan]);

  useEffect(() => {
    let alive = true;
    import("@embedpdf/react-pdf-viewer")
      .then((module) => {
        if (alive) {
          setViewer(() => module.PDFViewer as unknown as ComponentType<Record<string, unknown>>);
        }
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        callbacks.current.onFailure(
          caught instanceof Error && caught.message
            ? tt("PDF 查看器没装起来：{reason}", { reason: caught.message })
            : tt("PDF 查看器没装起来。"),
        );
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 初始化超时要说原因、给出路，不许一直转圈；但也不卸掉查看器——慢网络下它
  // 过一会儿还会就绪，就绪时提示自动收起。
  useEffect(() => {
    if (!config) return undefined;
    const startedAtMs = Date.now();
    const timer = window.setTimeout(() => {
      const watch = pdfiumInitWatch({
        startedAtMs,
        nowMs: Date.now(),
        ready: Boolean(bridgeRef.current),
        timeoutMs: PDFIUM_INIT_TIMEOUT_MS,
      });
      if (watch.status === "timeout") {
        setTimeoutError(
          tt("PDF 内核 {seconds} 秒内还没就绪。可以再等等，或重新载入。", {
            seconds: Math.round(PDFIUM_INIT_TIMEOUT_MS / 1000),
          }),
        );
      }
    }, PDFIUM_INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, attempt]);

  const reload = () => {
    bridgeRef.current?.dispose();
    bridgeRef.current = null;
    callbacks.current.onHandle(null);
    setRevealed(false);
    setTimeoutError("");
    setAttempt((value) => value + 1);
  };

  useEffect(
    () => () => {
      bridgeRef.current?.dispose();
      bridgeRef.current = null;
      callbacks.current.onHandle(null);
    },
    [],
  );

  // 基础档的 Esc：先取消选中，再收起当前工具（焦点常在页面外，挂在 window 上）。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const bridge = bridgeRef.current;
      if (event.key !== "Escape" || !bridge || modeRef.current !== "basic") return;
      const target = event.composedPath()[0] as HTMLElement | undefined;
      if (target && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      // 在文字框里按 Esc：先把打的字交出去（失焦），再收起选中。
      if (target?.isContentEditable) {
        bridge.flushTextEdit();
        return;
      }
      if (bridge.selected()) bridge.deselect();
      else if (bridge.activeTool()) bridge.setTool(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 切档：只开关官方工具，同一实例。
  useEffect(() => {
    bridgeRef.current?.setChrome(mode);
  }, [mode]);

  // 主题跟随站点。
  useEffect(() => {
    containerRef.current?.setTheme?.(pdfViewerTheme({ accent, dark }));
  }, [accent, dark]);

  const viewport = () =>
    containerRef.current?.shadowRoot?.querySelector(".bg-bg-app") ?? null;

  if (!plan.wasm.ok) {
    return (
      <p role="alert" className="p-4 text-xs text-[var(--awb-danger)]">
        {plan.wasm.reason}
      </p>
    );
  }
  return (
    <div
      className="relative h-full w-full bg-[var(--awb-stage-bg)]"
      data-pdf-stage=""
      data-pdf-viewer-instance={instanceId}
      data-pdf-chrome={mode}
      onPointerDownCapture={(event) => {
        // 正在框里打字时点到别处：先让框失焦（插件在失焦时提交文字），开着「加文字」
        // 工具时这一下只算「打完了」，不再在点的地方建一个新空框——否则旧框还没提交就被
        // 重置，打的字整个丢掉（浏览器实测）。
        const active = containerRef.current?.shadowRoot?.activeElement as HTMLElement | null | undefined;
        if (!active?.isContentEditable || event.nativeEvent.composedPath().includes(active)) return;
        active.blur();
        const bridge = bridgeRef.current;
        if (bridge && bridge.activeTool() === "freeText") {
          event.preventDefault();
          event.stopPropagation();
          bridge.setTool(null);
        }
      }}
      onKeyDownCapture={(event) => {
        if (
          modeRef.current === "basic" &&
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === "f"
        ) {
          event.preventDefault();
          event.stopPropagation();
          callbacks.current.onFindShortcut?.();
        }
      }}
    >
      {Viewer && config ? (
        <div
          className="h-full w-full"
          style={{ opacity: revealed ? 1 : 0, transition: "opacity var(--leo-dur-2, 160ms)" }}
        >
          <Viewer
            key={attempt}
            style={{ width: "100%", height: "100%" }}
            config={config}
            onInit={(container: ContainerLike) => {
              containerRef.current = container;
            }}
            onReady={(registry: PdfViewerRegistryLike) => {
              const bridge = createPdfViewerBridge(registry, name);
              if (!bridge.ready) {
                callbacks.current.onFailure(tt("PDF 查看器缺少编辑能力，已停止。"));
                return;
              }
              bridgeRef.current = bridge;
              bridge.setTextEditFlusher(() => {
                const active = containerRef.current?.shadowRoot?.activeElement as HTMLElement | null | undefined;
                if (active?.isContentEditable) active.blur();
              });
              setTimeoutError("");
              bridge.setChrome(modeRef.current);
              bridge.subscribe({
                onDocument: () => setRevealed(true),
              });
              if (bridge.documentId()) setRevealed(true);
              callbacks.current.onHandle({ bridge, viewport });
            }}
          />
        </div>
      ) : null}
      {!revealed && !timeoutError ? (
        <p
          role="status"
          className="absolute inset-0 grid place-items-center text-xs text-[var(--awb-muted)]"
        >
          {tt("正在载入 PDF…")}
        </p>
      ) : null}
      {!revealed && timeoutError ? (
        <div
          role="alert"
          data-pdf-init-slow=""
          className="absolute inset-0 grid place-items-center p-6 text-center"
        >
          <div className="grid max-w-sm justify-items-center gap-3 text-[13px] text-[var(--awb-text)]">
            <p>{timeoutError}</p>
            <button
              type="button"
              onClick={reload}
              className="min-h-11 rounded-lg border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] px-4 text-[13px] hover:bg-[var(--awb-hover)]"
            >
              {tt("重新载入")}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
