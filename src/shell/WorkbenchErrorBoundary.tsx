"use client";

import { AutoRecovery } from "./AutoRecovery";

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
    const componentStack = info.componentStack || "";
    console.error(
      "[advanced-workbench] editor crashed",
      error,
      componentStack,
    );
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
    const { children, item, contained, scope } = this.props;
    const { error } = this.state;
    if (!error) return children;
    if (typeof document === "undefined") return null;

    const fallback = <div data-workbench-route-error={scope === "route" || undefined}
      className="grid h-full min-h-[18rem] w-full place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]">
      <AutoRecovery identity={`workbench:${item.id}:${scope || "workbench"}`} recover={() => this.setState({ error: null })} />
    </div>;
    return contained || scope === "route" ? fallback : createPortal(fallback, document.body);
  }
}
