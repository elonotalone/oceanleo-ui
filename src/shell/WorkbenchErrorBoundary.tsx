"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { createPortal } from "react-dom";

import type { LibraryItem } from "./library-data";

interface WorkbenchErrorBoundaryProps {
  children: ReactNode;
  item: LibraryItem;
  onClose: () => void;
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
    const { children, item, onClose } = this.props;
    const { error } = this.state;
    if (!error) return children;
    if (typeof document === "undefined") return null;

    const url = item.url || item.previewUrl || "";
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${item.title} · 编辑器错误`}
        className="fixed inset-0 z-[2147483000] grid min-h-[100dvh] place-items-center bg-[var(--surface,#f5f5f4)] p-6 text-[var(--fg,#292524)]"
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
              onClick={() => this.setState({ error: null })}
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
      </div>,
      document.body,
    );
  }
}
