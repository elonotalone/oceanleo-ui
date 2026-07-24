"use client";

import { useId, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AnchoredPopover } from "./anchored-popover";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import type { WorkspaceLibraryPanelId } from "./SplitWorkspace";

export function AdvancedWorkspaceActionBar({
  adapter,
  autoSaveState,
  activeLibraryPanelId,
  onBack,
  onOpenLibrary,
  onRetrySave,
  onTriggerAction,
  onUploadFiles,
}: {
  adapter: AdvancedEditorAdapter;
  autoSaveState: AdvancedAutoSaveState;
  /** @deprecated The shared selection bar is now the only tools launcher. */
  activeDrawerId?: string;
  activeLibraryPanelId: WorkspaceLibraryPanelId | null;
  onBack: () => void;
  /** @deprecated The shared selection bar is now the only tools launcher. */
  onOpenTools?: () => void;
  onOpenLibrary: (id: WorkspaceLibraryPanelId) => void;
  onRetrySave: () => void;
  onTriggerAction: (
    action: NonNullable<AdvancedEditorAdapter["actions"]>[number],
  ) => void | Promise<void>;
  onUploadFiles: (files: File[]) => void;
}) {
  const tt = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [actionError, setActionError] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const actions = adapter.actions || [];
  const standaloneActions = actions.filter(
    (action) => action.group !== "download",
  );
  const downloadActions = [
    ...(adapter.directDownload ? [adapter.directDownload] : []),
    ...actions.filter((action) => action.group === "download"),
  ];
  const downloadMenuId = `workspace-download-${useId().replace(/:/g, "")}`;
  const iconButton =
    "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--awb-muted)] transition hover:bg-[var(--awb-hover)] hover:text-[var(--awb-text)] disabled:opacity-30";
  const libraryButton =
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[11px] font-semibold transition";

  const triggerAction = async (
    action: NonNullable<AdvancedEditorAdapter["actions"]>[number],
  ) => {
    setActionError("");
    try {
      await onTriggerAction(action);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : tt("操作失败，请重试"),
      );
    }
  };

  return (
    <div
      data-advanced-workspace-actions
      data-advanced-action-row
      role="toolbar"
      aria-label={tt("工作区操作")}
      className="flex h-8 w-full min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden bg-transparent"
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto">
        <button
          type="button"
          onClick={onBack}
          className={iconButton}
          aria-label={tt("返回库")}
          title={tt("返回库")}
        >
          ←
        </button>
        {adapter.history && (
          <>
            <button
              type="button"
              onClick={adapter.history.undo}
              disabled={!adapter.history.canUndo}
              className={iconButton}
              aria-label={tt("撤销")}
              title={tt("撤销")}
            >
              <AdvancedEditorIcon name="undo" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={adapter.history.redo}
              disabled={!adapter.history.canRedo}
              className={iconButton}
              aria-label={tt("重做")}
              title={tt("重做")}
            >
              <AdvancedEditorIcon name="redo" className="h-4 w-4" />
            </button>
          </>
        )}
        <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
        <button
          type="button"
          onClick={() => onOpenLibrary("materials")}
          className={`${libraryButton} ${
            activeLibraryPanelId === "materials"
              ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]"
              : "text-[var(--awb-text)] hover:bg-[var(--awb-hover)]"
          }`}
          aria-pressed={activeLibraryPanelId === "materials"}
        >
          <AdvancedEditorIcon name="materials" className="h-4 w-4" />
          {tt("素材库")}
        </button>
        <button
          type="button"
          onClick={() => onOpenLibrary("mine")}
          className={`${libraryButton} ${
            activeLibraryPanelId === "mine"
              ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]"
              : "text-[var(--awb-text)] hover:bg-[var(--awb-hover)]"
          }`}
          aria-pressed={activeLibraryPanelId === "mine"}
        >
          <AdvancedEditorIcon name="library" className="h-4 w-4" />
          {tt("我的库")}
        </button>
        <span className="min-w-4 flex-1" />
        {standaloneActions.map((action) => (
          <button
            key={action.id}
            type="button"
            data-workspace-action-id={action.id}
            disabled={action.disabled || action.busy}
            onClick={() => void triggerAction(action)}
            className={`${iconButton} ${
              action.variant === "primary"
                ? "bg-[var(--awb-accent-soft)] text-[var(--awb-accent)]"
                : action.variant === "danger"
                  ? "text-red-600 hover:bg-red-50"
                  : ""
            }`}
            aria-pressed={
              action.id.startsWith("project-view:")
                ? action.variant === "primary"
                : undefined
            }
            aria-label={tt(
              action.busy && action.busyLabel ? action.busyLabel : action.label,
            )}
            title={tt(
              action.busy && action.busyLabel ? action.busyLabel : action.label,
            )}
          >
            <AdvancedEditorIcon
              name={action.icon || "download"}
              className="h-4 w-4"
            />
          </button>
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {adapter.upload && (
          <>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={iconButton}
              aria-label={tt("从本地添加到画布")}
              title={tt("从本地添加到画布，也可以直接拖放文件")}
            >
              <AdvancedEditorIcon name="uploads" className="h-4 w-4" />
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={adapter.upload.accept}
              multiple={adapter.upload.multiple}
              className="hidden"
              onChange={(event) => {
                onUploadFiles(Array.from(event.currentTarget.files || []));
                event.currentTarget.value = "";
              }}
            />
          </>
        )}
        {actionError && (
          <button
            type="button"
            onClick={() => setActionError("")}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-red-600 transition hover:bg-red-50"
            aria-label={tt(`操作失败：${actionError}；点击关闭提示`)}
            title={actionError}
          >
            !
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            if (autoSaveState === "error") onRetrySave();
          }}
          aria-disabled={autoSaveState !== "error"}
          className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg transition hover:bg-[var(--awb-hover)] ${
            autoSaveState === "error"
              ? "text-red-600"
              : autoSaveState === "saving"
                ? "text-amber-600"
                : "text-emerald-600"
          }`}
          aria-live="polite"
          aria-label={tt(
            autoSaveState === "saving"
              ? "正在自动保存"
              : autoSaveState === "error"
                ? "保存遇到问题，点击重试"
                : "已保存",
          )}
          title={tt(
            autoSaveState === "saving"
              ? "正在自动保存"
              : autoSaveState === "error"
                ? "点击重试自动保存"
                : "已保存",
          )}
        >
          <CloudAutoSaveIcon
            state={autoSaveState}
            className={`h-4 w-4 ${
              autoSaveState === "saving" ? "animate-pulse" : ""
            }`}
          />
        </button>
        {downloadActions.length > 0 && (
          <>
            <button
              ref={downloadButtonRef}
              type="button"
              data-workspace-download-launcher
              onClick={() => setDownloadOpen((value) => !value)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] text-[var(--awb-text)] transition hover:bg-[var(--awb-hover)]"
              aria-label={tt("下载与导出")}
              title={tt("下载与导出")}
              aria-haspopup="menu"
              aria-expanded={downloadOpen}
              aria-controls={downloadMenuId}
            >
              <AdvancedEditorIcon name="download" className="h-4 w-4" />
            </button>
            <AnchoredPopover
              open={downloadOpen}
              anchorRef={downloadButtonRef}
              panelRef={downloadMenuRef}
              onClose={() => setDownloadOpen(false)}
              id={downloadMenuId}
              role="menu"
              ariaLabel={tt("下载与导出")}
              align="end"
              maxHeight={384}
              attributes={{
                "data-workspace-download-menu": true,
              }}
              className="z-[2147483550] grid w-60 gap-1 overflow-y-auto rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] p-1.5 text-[var(--awb-text)] shadow-2xl"
            >
              {downloadActions.map((action, index) => {
                const label =
                  action.busy && action.busyLabel
                    ? action.busyLabel
                    : action.label;
                return (
                  <button
                    key={action.id}
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    data-workspace-export-action-id={action.id}
                    data-workspace-export-action-kind={
                      index === 0 && adapter.directDownload === action
                        ? "default"
                        : "secondary"
                    }
                    disabled={action.disabled || action.busy}
                    aria-busy={action.busy || undefined}
                    onClick={() => {
                      setDownloadOpen(false);
                      window.requestAnimationFrame(() =>
                        downloadButtonRef.current?.focus(),
                      );
                      void triggerAction(action);
                    }}
                    className="flex min-h-10 w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-[11px] font-medium outline-none transition hover:bg-[var(--awb-hover)] focus-visible:ring-2 focus-visible:ring-[var(--awb-accent)]/35 disabled:pointer-events-none disabled:opacity-40"
                  >
                    <AdvancedEditorIcon
                      name={action.icon || "download"}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">
                      {tt(label)}
                    </span>
                    {index === 0 && adapter.directDownload === action && (
                      <span className="shrink-0 text-[9px] text-[var(--awb-muted)]">
                        {tt("默认")}
                      </span>
                    )}
                  </button>
                );
              })}
            </AnchoredPopover>
          </>
        )}
      </div>
    </div>
  );
}

function CloudAutoSaveIcon({
  state,
  className = "",
}: {
  state: AdvancedAutoSaveState;
  className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 8.5 4.5 4.5 0 0 0 7 18Z" />
      {state === "saved" && <path d="m9.5 13 1.7 1.7 3.5-3.7" />}
      {state === "error" && (
        <>
          <path d="m10 12 4 4" />
          <path d="m14 12-4 4" />
        </>
      )}
    </svg>
  );
}
