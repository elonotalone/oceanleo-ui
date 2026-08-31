"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { createPortal } from "react-dom";

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
      return (
        <div
          role="alert"
          data-workbench-route-error
          data-chunk-failure-kind="crash"
          className="grid h-full min-h-[18rem] w-full place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
        >
          <div className="w-full max-w-md text-center">
            <p className="text-[15px] font-semibold">这个编辑器出错了</p>
            <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
              素材本身没有被修改。可以重试，也可以直接在左侧切到别的素材继续工作。
            </p>
            <pre className="mx-auto mt-4 max-h-24 max-w-full overflow-auto rounded-xl bg-[var(--card,#fff)] p-3 text-left text-[11px] text-[var(--muted,#78716c)]">
              {error.message || "Unknown editor error"}
            </pre>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {url && (
                <a
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-[var(--border,#e7e5e4)] px-4 py-2 text-[12px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
                >
                  打开原内容
                </a>
              )}
              <button
                type="button"
                onClick={retry}
                data-chunk-action="retry"
                className="rounded-xl bg-[var(--fg,#292524)] px-4 py-2 text-[12px] font-semibold text-[var(--card,#fff)]"
              >
                重新载入
              </button>
            </div>
          </div>
        </div>
      );
    }

    const fallback = (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title} · 编辑器错误`}
        className={
          contained
            ? "absolute inset-0 z-10 grid place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
            : "fixed inset-0 z-[2147483000] grid min-h-[100dvh] place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
        }
      >
        <div className="w-full max-w-xl rounded-2xl border border-[var(--border,#e7e5e4)] bg-[var(--card,#fff)] p-6 shadow-xl">
          <p className="text-[15px] font-semibold">这个素材暂时无法载入编辑器</p>
          <p className="mt-2 text-[12px] leading-relaxed text-[var(--muted,#78716c)]">
            素材本身没有被修改。可以关闭后重试，或先打开原内容确认文件仍然可用。
          </p>
          <pre className="mt-4 max-h-28 overflow-auto rounded-xl bg-[var(--surface,#f5f5f4)] p-3 text-[11px] text-[var(--muted,#78716c)]">
            {error.message || "Unknown editor error"}
          </pre>
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="rounded-xl border border-[var(--border,#e7e5e4)] px-4 py-2 text-[12px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
              >
                打开原内容
              </a>
            )}
            <button
              type="button"
              onClick={retry}
              className="rounded-xl border border-[var(--border,#e7e5e4)] px-4 py-2 text-[12px] hover:bg-[var(--surface-hover,rgba(0,0,0,.04))]"
            >
              重新载入
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl bg-[var(--fg,#292524)] px-4 py-2 text-[12px] font-semibold text-[var(--card,#fff)]"
            >
              关闭
            </button>
          </div>
        </div>
      </div>
    );
    return contained ? fallback : createPortal(fallback, document.body);
  }
}
