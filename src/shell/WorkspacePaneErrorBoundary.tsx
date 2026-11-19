"use client";

import { AutoRecovery } from "./AutoRecovery";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { reportBoundaryError } from "../lib/telemetry/errors";

/** Right pane failures must never unmount the live conversation beside it. */
export class WorkspacePaneErrorBoundary extends Component<{
  children: ReactNode;
  recoveryKey: string;
  closeLabel: string;
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
      <div role="status" data-workspace-pane-error className="flex h-full min-h-0 flex-col items-center justify-center gap-4 overflow-auto p-6 text-center text-sm text-stone-600">
        <AutoRecovery identity={this.props.recoveryKey} recover={() => this.setState({ error: null })} />
        <button type="button" className="rounded-lg border px-3 py-2" onClick={this.props.onClose}>{this.props.closeLabel}</button>
      </div>
    );
  }
}
