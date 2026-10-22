"use client";

/**
 * PDF 专业模式舞台（EmbedPDF 2.15.0 官方即用查看器）—— 叶子模块。
 *
 * 普通模式不在这里：普通模式是我们自己的舞台（`PdfStage`），渲染 / 文字层 / 涂黑
 * 校验都走同一个 EmbedPDF(PDFium) 引擎（`pdf-engine-host.ts`）。这里只在用户点
 * 「专业」时装上游查看器，且只做四件事：
 * ① 按 `pdf-next-runtime.ts` 算出的地址装载内核（**不许回落到第三方 CDN**）；
 * ② 用 `pdf-pro-config.ts` 关掉查看器自带的 打开 / 下载 / 导出 / 打印 / 加密，
 *    换上宿主主题色；文件级动作只走 OceanLeo 顶栏；
 * ③ 把查看器里的编辑经 `export` 插件的 `saveAsCopy()` 取回字节，交给路由的既有保存
 *    链路（顶栏保存 / 自动保存 / 下载都用同一份字节）；
 * ④ 装不起来时把原因显示出来，而不是留一块空白。
 *
 * ## 上游 API 的实读
 * - `PdfEngine` 的方法返回 **`Task`**，要 `await` 得先 `.toPromise()`。
 * - 查看器只在挂载时读一次 config（`react-pdf-viewer` 的 effect 依赖是 `[]`）。
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  PDFIUM_INIT_TIMEOUT_MS,
  pdfiumInitWatch,
} from "./pdf-next-runtime";
import { pdfEngineBuffer, resolvePdfiumLoadPlan } from "./pdf-engine-host";
import { buildPdfProViewerConfig } from "./pdf-pro-config";
import { useModeSwitchReady } from "../advanced-routes/mode-switch-gate";
import {
  peekW19EnterHandoff,
  w19PdfBytesFromHandoff,
} from "../advanced-routes/w19-handoff-store";

/** What the route needs from the live Pro viewer. */
export interface PdfProController {
  /** Current document bytes of the Pro viewer (its own edits included). */
  pullBytes: () => Promise<Uint8Array>;
}

export interface PdfNextStageProps {
  /** 当前文档字节。两个模式共用这一份 —— 同一文档实例（规范 §7 判据 1）。 */
  bytes: Uint8Array | null;
  /** 与路由 stash 的 handoff 对齐；bytes 为空时用这份。 */
  itemKey?: string;
  /** 文件名；只用于查看器标题。 */
  name: string;
  /** 宿主强调色（主题）；查看器配色跟它走。 */
  accent?: string;
  /** 装不起来 / 打不开时报给宿主状态栏的那句话。 */
  onFailure: (reason: string) => void;
  /** 查看器就绪后交出取字节的把手；卸载时交回 null。 */
  onController?: (controller: PdfProController | null) => void;
  /** 查看器里发生了编辑（撤销栈变动）。路由据此去取字节并走既有保存链路。 */
  onEdited?: () => void;
}

/** 内核的加载参数。**先算清楚再装**：一次配置错误表现为一句话，而不是一个向 CDN 发请求的引擎。 */
export function usePdfiumLoadPlan() {
  return useMemo(() => resolvePdfiumLoadPlan(), []);
}

/** The slice of the viewer's plugin registry this stage touches. */
interface ProRegistry {
  getPlugin: (id: string) => {
    provides?: () => unknown;
  } | null;
}

interface ProExportCapability {
  forDocument: (id: string) => {
    saveAsCopy: () => { toPromise: () => Promise<ArrayBuffer> };
  };
}
interface ProDocumentManager {
  getActiveDocumentId: () => string | null;
}
interface ProHistory {
  onHistoryChange: (listener: () => void) => (() => void) | void;
}

function hostIsDark(): boolean {
  if (typeof document === "undefined") return false;
  const root = document.documentElement;
  return root.classList.contains("dark") || root.dataset.theme === "dark";
}

function ProViewer({
  bytes,
  name,
  accent,
  wasmUrl,
  fontFallback,
  onFailure,
  onController,
  onEdited,
}: {
  bytes: Uint8Array;
  name: string;
  accent: string;
  wasmUrl: string;
  fontFallback: ReturnType<typeof resolvePdfiumLoadPlan>["fontFallback"];
  onFailure: (reason: string) => void;
  onController?: (controller: PdfProController | null) => void;
  onEdited?: () => void;
}) {
  const [Viewer, setViewer] = useState<React.ComponentType<
    Record<string, unknown>
  > | null>(null);
  const [timeoutError, setTimeoutError] = useState("");
  const pluginsReadyRef = useRef(false);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const callbacksRef = useRef({ onController, onEdited });
  callbacksRef.current = { onController, onEdited };
  // 过渡门的 ready 信号（plugin-ui U4）：查看器插件就绪（下面 onReady）即首帧可见。
  const markModeSwitchReady = useModeSwitchReady();
  // 查看器只在挂载时读一次 config：字节只取第一次的快照。
  const config = useMemo(
    () =>
      buildPdfProViewerConfig({
        wasmUrl,
        fontFallback,
        bytes: pdfEngineBuffer(bytes),
        name,
        palette: { accent, dark: hostIsDark() },
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  useEffect(() => {
    let alive = true;
    import("@embedpdf/react-pdf-viewer")
      .then((module) => {
        if (!alive) return;
        // `setState(fn)` 会被当成 updater。查看器是函数组件，必须再包一层。
        setViewer(
          () =>
            module.PDFViewer as unknown as React.ComponentType<
              Record<string, unknown>
            >,
        );
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        onFailure(
          caught instanceof Error
            ? `专业模式的查看器没装起来：${caught.message}`
            : "专业模式的查看器没装起来。",
        );
      });
    return () => {
      alive = false;
    };
  }, [onFailure]);

  useEffect(
    () => () => {
      unsubscribeRef.current?.();
      unsubscribeRef.current = null;
      callbacksRef.current.onController?.(null);
    },
    [],
  );

  useEffect(() => {
    pluginsReadyRef.current = false;
    const startedAtMs = Date.now();
    const timer = window.setTimeout(() => {
      const watch = pdfiumInitWatch({
        startedAtMs,
        nowMs: Date.now(),
        ready: pluginsReadyRef.current,
        timeoutMs: PDFIUM_INIT_TIMEOUT_MS,
        detail:
          "专业查看器插件没有在时限内就绪。PDFium worker 必须能 fetch 到绝对地址的 wasm。",
      });
      if (watch.status !== "timeout" || !watch.message) return;
      setTimeoutError(watch.message);
      onFailure(watch.message);
    }, PDFIUM_INIT_TIMEOUT_MS);
    return () => {
      window.clearTimeout(timer);
    };
  }, [onFailure]);

  if (timeoutError) {
    return (
      <p role="alert" className="p-4 text-xs">
        {timeoutError}
      </p>
    );
  }
  if (!Viewer) return <p className="p-4 text-xs">正在载入专业模式…</p>;
  return (
    <div className="h-full w-full" data-pdf-pro-stage="">
      <Viewer
        style={{ width: "100%", height: "100%" }}
        config={config}
        onReady={(registry: ProRegistry) => {
          pluginsReadyRef.current = true;
          const capability = <T,>(id: string): T | null =>
            (registry.getPlugin(id)?.provides?.() as T | undefined) ?? null;
          const exporter = capability<ProExportCapability>("export");
          const documents = capability<ProDocumentManager>("document-manager");
          if (!exporter || !documents) {
            onFailure(
              "专业模式的查看器缺少导出能力，编辑无法保存回来，已停止。",
            );
            return;
          }
          callbacksRef.current.onController?.({
            pullBytes: async () => {
              const id = documents.getActiveDocumentId();
              if (!id) throw new Error("专业模式里没有打开的文档。");
              const buffer = await exporter
                .forDocument(id)
                .saveAsCopy()
                .toPromise();
              return new Uint8Array(buffer);
            },
          });
          const history = capability<ProHistory>("history");
          const off = history?.onHistoryChange(() =>
            callbacksRef.current.onEdited?.(),
          );
          if (typeof off === "function") unsubscribeRef.current = off;
          markModeSwitchReady();
        }}
      />
    </div>
  );
}

export function PdfNextStage({
  bytes,
  itemKey,
  name,
  accent = "#4f46e5",
  onFailure,
  onController,
  onEdited,
}: PdfNextStageProps) {
  const handed = itemKey
    ? w19PdfBytesFromHandoff(peekW19EnterHandoff(itemKey))
    : null;
  const liveBytes = bytes && bytes.byteLength > 0 ? bytes : handed;
  const plan = usePdfiumLoadPlan();

  // 地址不合规就一句话说清并停下：**不许**回落到第三方 CDN。
  useEffect(() => {
    if (!plan.wasm.ok) onFailure(plan.wasm.reason);
  }, [onFailure, plan.wasm]);

  if (!plan.wasm.ok) {
    return (
      <p role="alert" className="p-4 text-xs">
        {plan.wasm.reason}
      </p>
    );
  }
  if (!liveBytes) return <p className="p-4 text-xs">正在载入 PDF…</p>;
  return (
    <ProViewer
      bytes={liveBytes}
      name={name}
      accent={accent}
      wasmUrl={plan.wasm.wasmUrl}
      fontFallback={plan.fontFallback}
      onFailure={onFailure}
      onController={onController}
      onEdited={onEdited}
    />
  );
}

export default PdfNextStage;
