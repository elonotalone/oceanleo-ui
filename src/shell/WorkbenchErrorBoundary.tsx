"use client";

import { Component, useMemo, type ErrorInfo, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { useUiMessages } from "../i18n/ui/messages/context";
import type { UITranslate } from "../i18n/ui/useUI";
import { reportBoundaryError } from "../lib/telemetry/errors";
import type { LibraryItem } from "./library-data";

/**
 * 边界的作用域。**两级是刻意的，不是冗余。**
 *
 * W09 之前只有一个边界包着整棵编辑器树，而它的失败态是
 * `createPortal(fallback, document.body)` + `fixed inset-0 z-[2147483000]`
 * —— 一条路由崩溃就是一张 max-z 全视口遮罩，把外壳、编辑栏、素材库全盖掉。
 * 于是「一个编辑器有问题」被呈现成「整个工作台没了」。
 *
 * 现在分两级：
 *
 * - `"route"`：**每条路由各一个**，永远留在编辑器窗格内（不 portal、不 fixed）。
 *   一条编辑器崩了，外壳与编辑栏还在 DOM 里，用户能直接切到别的素材。
 * - `"workbench"`：外面那一层，接的是**外壳自己**的崩溃（会话 provider、
 *   上下文这类）。这时候窗格内已经没有可信的东西可显示了，所以保留原来的
 *   整页接管行为 —— `contained` 仍然决定要不要 portal（plugin-gallery 宿主里
 *   同文档还有别的编辑器，portal 会把它们一起盖住）。
 *
 * 路由级的先接到，外层就不会看见路由的错误；反之外层是路由边界看不见的那部分的兜底。
 */
export type WorkbenchErrorScope = "workbench" | "route";

interface WorkbenchErrorBoundaryProps {
  children: ReactNode;
  item: LibraryItem;
  onClose: () => void;
  /** Keep the fallback inside the editor pane. A body portal covers every
   *  sibling editor that shares the document (plugin-gallery host). */
  contained?: boolean;
  /** 默认 `"workbench"`，保持既有调用方的行为不变。 */
  scope?: WorkbenchErrorScope;
  /** `scope === "route"` 时崩的是哪条路由。只传路由类型，不带素材 id。 */
  routeId?: string;
}

interface WorkbenchErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps one malformed asset or optional browser API from taking down the whole
 * library page. The fallback deliberately has no editor dependencies.
 */
export class WorkbenchErrorBoundary extends Component<
  WorkbenchErrorBoundaryProps,
  WorkbenchErrorBoundaryState
> {
  state: WorkbenchErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): WorkbenchErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[advanced-workbench] editor crashed", error, info);
    // W09：在此之前 `componentDidCatch` 只有上面那句 `console.error`，
    // 也就是生产上这类崩溃**没有任何信号**，只能等用户截图。
    // 事件里不带 `error.message`（编辑器的错误消息经常直接嵌着素材文件名），
    // 只带 errorName + 指纹，见 `lib/telemetry/errors.ts`。
    const scope = this.props.scope ?? "workbench";
    reportBoundaryError({
      boundary: `workbench:${scope}`,
      routeId: this.props.routeId || scope,
      error,
      // 路由级边界崩了外壳还在，用户有下一步可走；外壳级崩了就没有了。
      recoverable: scope === "route",
    });
  }

  componentDidUpdate(previous: WorkbenchErrorBoundaryProps) {
    if (
      this.state.error &&
      previous.item.id !== this.props.item.id
    ) {
      this.setState({ error: null });
    }
  }

  render() {
    const { children, item, onClose, contained, scope } = this.props;
    const { error } = this.state;
    if (!error) return children;
    if (typeof document === "undefined") return null;

    const url = item.url || item.previewUrl || "";
    const retry = () => this.setState({ error: null });

    // 路由级：留在窗格内，措辞也不同 —— 坏掉的是这一件素材的编辑器，不是整个工作台。
    //
    // 这里是**就地占位**（`grid h-full`），不是 `absolute inset-0` 覆盖层：
    // 边界一旦接到错误，children 整棵已经不渲染了，没有东西需要盖住。
    // 于是既不需要「有定位的祖先」这个前提，也不必为此往 31 个站的 DOM 里
    // 多插一层 wrapper。
    if (scope === "route") {
      return <RouteCrashFallback error={error} url={url} onRetry={retry} />;
    }

    const fallback = (
      <WorkbenchCrashFallback
        error={error}
        title={item.title}
        url={url}
        contained={Boolean(contained)}
        onRetry={retry}
        onClose={onClose}
      />
    );
    return contained ? fallback : createPortal(fallback, document.body);
  }
}

// ---------------------------------------------------------------------------
// 失败态本体（X4，2026-09-06）：**人话**。
//
// 之前正文是「这个编辑器出错了」+ 一块 `<pre>` 直接印 `error.message`，用户看到的是
// 「Minified React error #185; visit https://react.dev/errors/185 …」。
// 现在先说三件事：发生了什么、你的东西有没有事、下一步点哪里；原始错误消息收进
// 「技术细节」折叠里——**不吞错误**（`componentDidCatch` 的 console + telemetry 照旧，
// 消息也仍在 DOM 里可展开），只是不再当正文。
//
// 类组件拿不到 hook，所以两块失败态各自是函数组件，在这里过 `tt()`；
// 16 语译文在 `src/i18n/ui/messages/advanced-route-copy.ts`。
//
// 这里的 `tt` **不走 `useUI()`**：它内部的 `useLocale()` 在没有 intl provider 时
// 会直接抛。崩溃边界的失败态是最后一道兜底，自己再抛一次就是双重故障——
// 于是只读词典 context（缺 provider 时是空表，回退中文原文），不碰 locale。
// 词典查找与插值口径同 `useUI()`；这几句里没有「灵感 / 我的库」那类改名逻辑要跑。
// ---------------------------------------------------------------------------

function useCrashCopy(): UITranslate {
  const dict = useUiMessages();
  return useMemo(
    () => (zh: string, vars?: Record<string, string | number>) => {
      const hit = dict[zh];
      const text = hit != null && hit !== "" ? hit : zh;
      if (!vars) return text;
      return text.replace(/\{(\w+)\}/g, (match, key) =>
        key in vars ? String(vars[key]) : match,
      );
    },
    [dict],
  );
}

function CrashTechnicalDetails({
  error,
  className = "",
}: {
  error: Error;
  className?: string;
}) {
  const tt = useCrashCopy();
  return (
    <details
      data-workbench-error-details
      className={`text-left text-[11px] text-[var(--muted,#78716c)] ${className}`}
    >
      <summary className="cursor-pointer select-none">
        {tt("技术细节（给开发者看）")}
      </summary>
      <pre className="mt-2 max-h-24 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-xl bg-[var(--card,#fff)] p-3">
        {error.message || error.name || "Unknown editor error"}
      </pre>
    </details>
  );
}

function RouteCrashFallback({
  error,
  url,
  onRetry,
}: {
  error: Error;
  url: string;
  onRetry: () => void;
}) {
  const tt = useCrashCopy();
  return (
    <div
      role="alert"
      data-workbench-route-error
      data-chunk-failure-kind="crash"
      className="grid h-full min-h-[18rem] w-full place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
    >
      <div className="w-full max-w-md text-center">
        <p className="text-[15px] font-semibold">
          {tt("编辑器刚才出了问题，已经停下")}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("你的素材没有被改动。点「重新载入」再试一次；也可以在左侧切到别的素材继续。")}
        </p>
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-[var(--border,#e7e5e4)] px-4 py-2 text-[12px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
            >
              {tt("打开原内容")}
            </a>
          )}
          <button
            type="button"
            onClick={onRetry}
            data-chunk-action="retry"
            className="rounded-xl bg-[var(--fg,#292524)] px-4 py-2 text-[12px] font-semibold text-[var(--card,#fff)]"
          >
            {tt("重新载入")}
          </button>
        </div>
        <CrashTechnicalDetails error={error} className="mx-auto mt-4" />
      </div>
    </div>
  );
}

function WorkbenchCrashFallback({
  error,
  title,
  url,
  contained,
  onRetry,
  onClose,
}: {
  error: Error;
  title: string;
  url: string;
  contained: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  const tt = useCrashCopy();
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={tt("{title} · 编辑器错误", { title })}
      className={
        contained
          ? "absolute inset-0 z-10 grid place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
          : "fixed inset-0 z-[2147483000] grid min-h-[100dvh] place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
      }
    >
      <div className="w-full max-w-xl rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-6 shadow-xl">
        <p className="text-[15px] font-semibold">
          {tt("这件素材暂时打不开编辑器")}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
          {tt("素材本身没有被改动。可以点「重新载入」再试，或先打开原内容确认文件还能用。")}
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          {url && (
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-[var(--border,#e7e5e4)] px-4 py-2 text-[12px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
            >
              {tt("打开原内容")}
            </a>
          )}
          <button
            type="button"
            onClick={onRetry}
            className="rounded-xl border border-[var(--border,#e7e5e4)] px-4 py-2 text-[12px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
          >
            {tt("重新载入")}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[var(--fg,#292524)] px-4 py-2 text-[12px] font-semibold text-[var(--card,#fff)]"
          >
            {tt("关闭")}
          </button>
        </div>
        <CrashTechnicalDetails error={error} className="mt-4" />
      </div>
    </div>
  );
}
