"use client";

import { useEffect, useState } from "react";
import {
  websitePlatformApi,
  type WebsitePlatformApi,
  type WebsiteProjectSummary,
} from "../../lib/website-platform-api";
import { useUI } from "../../i18n/ui/useUI";
import { WebsiteWorkbenchPanels } from "./WebsiteWorkbenchPanels";

/** Current git head + stack of a code website (project row, then git history). */
export function websiteCodeHead(
  project: WebsiteProjectSummary | null | undefined,
  historyHead?: string,
): { commit: string; stack: string } {
  const row = (project || {}) as Record<string, unknown>;
  const legacy =
    row.legacy_metadata && typeof row.legacy_metadata === "object"
      ? (row.legacy_metadata as Record<string, unknown>)
      : {};
  const commit = String(row.git_head || row.git_commit || historyHead || legacy.git_commit || "").trim();
  const stack = String(row.stack || row.stack_key || legacy.stack || "").trim();
  return { commit, stack };
}

/**
 * The code face of the one website editor: Source on the left, the live
 * preview on the right. Both are the shared workbench panels; a save in Source
 * moves the commit the preview shows.
 */
export function WebsiteCodeFace({
  projectId,
  api = websitePlatformApi,
}: {
  projectId: string;
  api?: WebsitePlatformApi;
}) {
  const tt = useUI();
  const [head, setHead] = useState<{ commit: string; stack: string } | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setHead(null);
    setError("");
    Promise.all([
      api.project(projectId, controller.signal),
      api.history(projectId, controller.signal).catch(() => ({ commits: [] })),
    ])
      .then(([project, history]) => {
        if (controller.signal.aborted) return;
        const first = history.commits?.[0];
        const historyHead = String(first?.sha || first?.commit || first?.id || "");
        setHead(websiteCodeHead(project, historyHead));
      })
      .catch((caught) => {
        if (!controller.signal.aborted) {
          setError(caught instanceof Error ? caught.message : tt("暂时无法读取网站平台数据。"));
        }
      });
    return () => controller.abort();
  }, [api, projectId, tt]);

  if (error) {
    return (
      <p role="alert" className="p-4 text-sm text-red-600" data-testid="website-code-face-error">
        {error}
      </p>
    );
  }
  if (!head) {
    return (
      <p role="status" className="p-4 text-sm" data-testid="website-code-face-loading">
        {tt("正在读取网站数据…")}
      </p>
    );
  }
  return (
    <div
      className="grid h-full min-h-0 grid-cols-1 gap-0 lg:grid-cols-2"
      data-testid="website-code-face"
      data-website-commit={head.commit}
    >
      <div className="min-h-0 overflow-auto border-r border-[var(--awb-border)]" data-testid="website-code-face-source">
        <WebsiteWorkbenchPanels
          projectId={projectId}
          stack={head.stack || undefined}
          commit={head.commit || undefined}
          api={api}
          panel="code"
          hideTabs
          onCommit={(commit) => setHead((current) => ({ stack: current?.stack || "", commit }))}
        />
      </div>
      <div className="min-h-0 overflow-auto" data-testid="website-code-face-preview">
        <WebsiteWorkbenchPanels
          projectId={projectId}
          stack={head.stack || undefined}
          commit={head.commit || undefined}
          api={api}
          panel="preview"
          hideTabs
        />
      </div>
    </div>
  );
}
