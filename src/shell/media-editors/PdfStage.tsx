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
          caught instanceof Error ? `PDF 查看器没装起来：${caught.message}` : "PDF 查看器没装起来。",
        );
      });
    return () => {
      alive = false;
    };
  }, []);

  // 初始化超时要说原因，不许一直转圈。
  useEffect(() => {
    if (!config) return undefined;
    const startedAtMs = Date.now();
    const timer = window.setTimeout(() => {
      const watch = pdfiumInitWatch({
        startedAtMs,
        nowMs: Date.now(),
        ready: Boolean(bridgeRef.current),
        timeoutMs: PDFIUM_INIT_TIMEOUT_MS,
        detail: "PDF 内核没有在时限内就绪。PDFium worker 必须能取到本站的 wasm。",
      });
      if (watch.status === "timeout" && watch.message) {
        setTimeoutError(watch.message);
        callbacks.current.onFailure(watch.message);
      }
    }, PDFIUM_INIT_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [config]);

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
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
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

  if (!plan.wasm.ok || timeoutError) {
    return (
      <p role="alert" className="p-4 text-xs text-[var(--awb-danger)]">
        {timeoutError || (plan.wasm.ok ? "" : plan.wasm.reason)}
      </p>
    );
  }
  return (
    <div
      className="relative h-full w-full bg-[var(--awb-stage-bg)]"
      data-pdf-stage=""
      data-pdf-viewer-instance={instanceId}
      data-pdf-chrome={mode}
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
            style={{ width: "100%", height: "100%" }}
            config={config}
            onInit={(container: ContainerLike) => {
              containerRef.current = container;
            }}
            onReady={(registry: PdfViewerRegistryLike) => {
              const bridge = createPdfViewerBridge(registry, name);
              if (!bridge.ready) {
                callbacks.current.onFailure("PDF 查看器缺少编辑能力，已停止。");
                return;
              }
              bridgeRef.current = bridge;
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
      {!revealed ? (
        <p
          role="status"
          className="absolute inset-0 grid place-items-center text-xs text-[var(--awb-muted)]"
        >
          {tt("正在载入 PDF…")}
        </p>
      ) : null}
    </div>
  );
}
