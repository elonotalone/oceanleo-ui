"use client";

/**
 * PDF 新核（EmbedPDF 2.15.0）的叶子模块 —— flag=`next` 时才被拉起。
 *
 * ## 为什么是「叶子」，以及为什么这一层这么薄
 *
 * `W01-deps.md` §4 的硬规则：重内核只能出现在 `advanced-routes/*` 经 `dynamic()`
 * 拉起的叶子里，不许进 `src/shell/index.ts` 桶文件。PDFium 是 4.6 MB WASM +
 * 一个 blob worker，进了桶文件就等于 31 个租户站每次进任何编辑器都拖上它。
 *
 * 所以本文件是唯一 import `@embedpdf/*` 的地方，并且刻意只做三件事：
 * ① 按 `pdf-next-runtime.ts` 算出的地址装载内核（**不许回落到第三方 CDN**）；
 * ② 普通模式画我们自己的舞台，专业模式换成上游的即用查看器；
 * ③ 装不起来时把原因显示出来，而不是留一块空白。
 *
 * 判定逻辑（地址从哪儿来、字体给不给、哪个按钮能不能点）全在同目录的纯函数模块
 * 里，那些是 `tests/pdf-next-core-swap.test.mjs` 能直接跑的东西。这里只剩「接起来」。
 *
 * ## 上游 API 的两处实读（不是猜的）
 *
 * - 引擎从 **hook** 来：`usePdfiumEngine({wasmUrl, fontFallback})` 返回
 *   `{engine, isLoading, error}`（`@embedpdf/engines/dist/shared-react/hooks/
 *   use-pdfium-engine.d.ts`）。没有 `createPdfiumEngine` 这种函数。
 * - `PdfEngine` 的方法返回的是 **`Task`**，不是 Promise；要 `await` 得先
 *   `.toPromise()`（`@embedpdf/models/dist/task.d.ts:119`）。直接 `await` 一个 Task
 *   会立刻得到 Task 自己，于是「文档打开了」这件事永远不发生，而且不报错。
 */

import { useEffect, useMemo, useState } from "react";
import { usePdfiumEngine } from "@embedpdf/engines/react";
import {
  PDFIUM_FONT_BASE_ENV_KEY,
  PDFIUM_WASM_ENV_KEY,
  PDF_VIEWER_NO_EXTERNAL_FONTS,
  resolvePdfiumFontFallback,
  resolvePdfiumWasmUrl,
} from "./pdf-next-runtime";
import type { EditorMode } from "../hosted-editor";

export interface PdfNextStageProps {
  /** 当前文档字节。两个模式共用这一份 —— 同一文档实例（规范 §7 判据 1）。 */
  bytes: Uint8Array | null;
  /** 文件名；只用于查看器标题与下载默认名。 */
  name: string;
  mode: EditorMode;
  /** 装不起来 / 打不开时报给宿主状态栏的那句话。 */
  onFailure: (reason: string) => void;
  /** 打开成功后的页数，交回路由用于 L1/L2 的页码控件。 */
  onDocumentReady?: (pageCount: number) => void;
}

/**
 * 打包器发出的 WASM 地址。
 *
 * `new URL(…, import.meta.url)` 是让 webpack/turbopack 把 `pdfium.wasm` 当**资源**
 * 发出来的写法，发出来的地址在自家域名下。取不到就返回 `null`——
 * 由 `resolvePdfiumWasmUrl` 决定「拒绝并说明」，这里不许编一个地址出来。
 */
function bundledWasmUrl(): string | null {
  try {
    return new URL("@embedpdf/pdfium/pdfium.wasm", import.meta.url).href;
  } catch {
    return null;
  }
}

/**
 * `Uint8Array` → 一份确定由 `ArrayBuffer` 背衬的字节。
 *
 * 直接把 `bytes.buffer` 递给上游过不了本仓的 `tsc`：`Uint8Array` 的 buffer 类型是
 * `ArrayBufferLike`，也可能是 `SharedArrayBuffer`，而上游的 `PdfFileContent` 恰好
 * 写死成 `ArrayBuffer`。`Uint8Array.from` 拷一份是仓里既有的做法
 * （`pdf-workbench-utils.ts:138`、`pdf-recovery.ts:8` 同一个形状）。
 *
 * 代价是一次拷贝。没有绕开它的办法：内核要一份自己拥有的字节，
 * 而我们这一份还要留给撤销栈与保存路径继续用。
 */
function pdfArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  return Uint8Array.from(bytes).buffer as ArrayBuffer;
}

function envValue(key: string): string | null {
  if (typeof process === "undefined") return null;
  const bag = process.env as Record<string, string | undefined> | undefined;
  return bag?.[key] ?? null;
}

/**
 * 内核的加载参数。**先算清楚再装**：把「地址合不合规」放在装载之前，
 * 是为了让一次配置错误表现为一句话，而不是一个已经开始向 jsDelivr 发请求的引擎。
 */
export function usePdfiumLoadPlan() {
  return useMemo(() => {
    const wasm = resolvePdfiumWasmUrl({
      envUrl: envValue(PDFIUM_WASM_ENV_KEY),
      bundledUrl: bundledWasmUrl(),
    });
    const fontFallback = resolvePdfiumFontFallback(
      envValue(PDFIUM_FONT_BASE_ENV_KEY),
    );
    return { wasm, fontFallback };
  }, []);
}

/**
 * 专业模式：上游「即用查看器」的完整工具栏（R4 点名的那一档）。
 *
 * 两处刻意的收窄，都不是洁癖：
 * - `fonts` 传 `PDF_VIEWER_NO_EXTERNAL_FONTS`（`ui: null` / `signature: null`）：
 *   snippet 默认会往 Google Fonts 插 `<link>` 取 Open Sans 与四款手写体。
 *   专业模式是同一份文档、同一个用户，没有理由比普通模式多向外发请求。
 * - 文档用 `initialDocuments` 的**字节**交接，而不是给它一个 URL 让它再去网络拉
 *   一遍：那样会出现「专业模式看到的是服务器上的版本，普通模式看到的是你刚改过
 *   的版本」这种没人能解释的分裂。
 *
 * 查看器本身再懒加载一层：它把 snippet 整包拖进来，而绝大多数会话根本不开专业模式。
 */
function ProViewer({
  bytes,
  name,
  wasmUrl,
  fontFallback,
  onFailure,
}: {
  bytes: Uint8Array;
  name: string;
  wasmUrl: string;
  fontFallback: ReturnType<typeof resolvePdfiumFontFallback>;
  onFailure: (reason: string) => void;
}) {
  const [Viewer, setViewer] = useState<React.ComponentType<
    Record<string, unknown>
  > | null>(null);

  useEffect(() => {
    let alive = true;
    import("@embedpdf/react-pdf-viewer")
      .then((module) => {
        if (!alive) return;
        setViewer(
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

  if (!Viewer) return <p className="p-4 text-xs">正在载入专业模式…</p>;
  return (
    <Viewer
      style={{ width: "100%", height: "100%" }}
      config={{
        wasmUrl,
        fontFallback: fontFallback ?? null,
        fonts: PDF_VIEWER_NO_EXTERNAL_FONTS,
        documentManager: {
          initialDocuments: [{ buffer: pdfArrayBuffer(bytes), name }],
        },
      }}
    />
  );
}

export function PdfNextStage({
  bytes,
  name,
  mode,
  onFailure,
  onDocumentReady,
}: PdfNextStageProps) {
  const plan = usePdfiumLoadPlan();
  // 地址不合规时不许把它递给 hook：`wasmUrl: undefined` 会让上游用它写死的
  // jsDelivr 兜底地址（`dist/react/index.js:7`），那正是判据 1 要拦的行为。
  const { engine, error } = usePdfiumEngine(
    plan.wasm.ok
      ? { wasmUrl: plan.wasm.wasmUrl, fontFallback: plan.fontFallback }
      : undefined,
  );
  const [pageCount, setPageCount] = useState(0);

  // 地址不合规就一句话说清并停下：**不许**回落到第三方 CDN。
  // 这一支不是错误处理的边角，它是判据 1 的一半——上游默认行为就是走 jsDelivr。
  useEffect(() => {
    if (!plan.wasm.ok) onFailure(plan.wasm.reason);
  }, [onFailure, plan.wasm]);

  useEffect(() => {
    if (error) onFailure(`PDF 内核没装起来：${error.message}`);
  }, [error, onFailure]);

  // 普通模式：用同一个引擎实例打开同一份字节，页数交回路由。
  // 专业模式不走这里——查看器自己管文档，两边同时开会有两份状态。
  useEffect(() => {
    if (mode === "pro" || !engine || !bytes) return;
    let alive = true;
    engine
      .openDocumentBuffer({
        id: name || "document.pdf",
        content: pdfArrayBuffer(bytes),
      })
      .toPromise()
      .then((doc) => {
        if (!alive) return;
        const count = doc.pageCount ?? 0;
        setPageCount(count);
        onDocumentReady?.(count);
      })
      .catch((caught: unknown) => {
        if (!alive) return;
        onFailure(
          caught instanceof Error
            ? `这份 PDF 打不开：${caught.message}`
            : "这份 PDF 打不开。",
        );
      });
    return () => {
      alive = false;
    };
  }, [bytes, engine, mode, name, onDocumentReady, onFailure]);

  if (!plan.wasm.ok) {
    return (
      <p role="alert" className="p-4 text-xs">
        {plan.wasm.reason}
      </p>
    );
  }
  if (!bytes) return <p className="p-4 text-xs">正在载入 PDF…</p>;
  if (mode === "pro") {
    return (
      <ProViewer
        bytes={bytes}
        name={name}
        wasmUrl={plan.wasm.wasmUrl}
        fontFallback={plan.fontFallback}
        onFailure={onFailure}
      />
    );
  }
  return (
    <div className="h-full w-full" data-pdf-next-stage data-pdf-pages={pageCount}>
      {pageCount > 0 ? null : <p className="p-4 text-xs">正在解析 PDF…</p>}
    </div>
  );
}

export default PdfNextStage;
