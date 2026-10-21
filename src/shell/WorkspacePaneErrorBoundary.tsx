"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportBoundaryError } from "../lib/telemetry/errors";

/** Right pane failures must never unmount the live conversation beside it. */
export class WorkspacePaneErrorBoundary extends Component<{
  children: ReactNode;
  recoveryKey: string;
  title: string;
  retryLabel: string;
  closeLabel: string;
  detailsLabel: string;
  onClose: () => void;
}, { error: Error | null }> {
  state: { error: Error | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[workspace-pane] right pane crashed", error, info.componentStack);
    reportBoundaryError({ boundary: "workspace:right", routeId: "workspace", error, recoverable: true });
  }
  componentDidUpdate(previous: Readonly<typeof this.props>) {
    if (this.state.error && previous.recoveryKey !== this.props.recoveryKey) {
      this.setState({ error: null });
    }
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-workspace-pane-error className="flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-auto p-6 text-center text-sm text-stone-600">
        <p>{this.props.title}</p>
        <div className="flex gap-3">
          <button type="button" className="rounded-lg border px-3 py-2" onClick={() => this.setState({ error: null })}>{this.props.retryLabel}</button>
          <button type="button" className="rounded-lg border px-3 py-2" onClick={this.props.onClose}>{this.props.closeLabel}</button>
        </div>
        <details className="max-w-full text-left text-xs">
          <summary>{this.props.detailsLabel}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words">{this.state.error.message}</pre>
        </details>
      </div>
    );
  }
}
