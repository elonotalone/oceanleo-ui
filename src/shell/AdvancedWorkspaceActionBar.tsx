"use client";

import { useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { EditorToolsIcon } from "./EditorToolsIcon";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import type { WorkspaceLibraryPanelId } from "./SplitWorkspace";

export function AdvancedWorkspaceActionBar({
  adapter,
  autoSaveState,
  activeDrawerId,
  activeLibraryPanelId,
  onBack,
  onOpenTools,
  onOpenLibrary,
  onRetrySave,
  onTriggerAction,
  onUploadFiles,
}: {
  adapter: AdvancedEditorAdapter;
  autoSaveState: AdvancedAutoSaveState;
  activeDrawerId: string;
  activeLibraryPanelId: WorkspaceLibraryPanelId | null;
  onBack: () => void;
  onOpenTools: () => void;
  onOpenLibrary: (id: WorkspaceLibraryPanelId) => void;
  onRetrySave: () => void;
  onTriggerAction: (action: NonNullable<AdvancedEditorAdapter["actions"]>[number]) => void;
  onUploadFiles: (files: File[]) => void;
}) {
  const tt = useUI();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const actions = adapter.actions || [];
  const hasTools = Boolean(adapter.drawers?.length || adapter.toolbox?.content);
  const iconButton =
    "grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--awb-muted)] transition hover:bg-[var(--awb-hover)] hover:text-[var(--awb-text)] disabled:opacity-30";
  const libraryButton =
    "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-semibold transition";

  const triggerAction = (action: (typeof actions)[number]) => {
    setActionsOpen(false);
    onTriggerAction(action);
  };

  return (
    <div
      data-advanced-workspace-actions
      role="toolbar"
      aria-label={tt("工作区操作")}
      className="flex h-12 w-full flex-nowrap items-center gap-1 overflow-x-auto rounded-2xl border border-[var(--awb-border)] bg-[var(--awb-chrome-bg)]/96 p-1.5 shadow-[var(--awb-shadow-floating)] backdrop-blur-xl"
    >
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
      {hasTools && (
        <button
          type="button"
          onClick={onOpenTools}
          className={`${iconButton} ${
            activeDrawerId === "workspace-tools"
              ? "bg-emerald-50 text-emerald-700"
              : "text-emerald-600"
          }`}
          aria-label={tt("编辑工具")}
          title={tt("编辑工具")}
        >
          <EditorToolsIcon />
        </button>
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
      <button
        type="button"
        onClick={autoSaveState === "error" ? onRetrySave : undefined}
        disabled={autoSaveState !== "error"}
        className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-1.5 text-[10px] text-[var(--awb-muted)] transition enabled:hover:bg-[var(--awb-hover)]"
        aria-live="polite"
        title={autoSaveState === "error" ? tt("点击重试自动保存") : undefined}
      >
        <CloudAutoSaveIcon
          className={`h-3.5 w-3.5 ${
            autoSaveState === "saving" ? "animate-pulse" : ""
          }`}
        />
        {autoSaveState === "saving"
          ? tt("正在自动保存")
          : autoSaveState === "error"
            ? tt("保存遇到问题")
            : tt("已保存")}
      </button>
      {actions.length > 0 && (
        <div className="relative shrink-0">
          <button
            type="button"
            disabled={
              actions.length === 1 &&
              (actions[0].disabled || actions[0].busy)
            }
            onClick={() => {
              if (actions.length === 1) triggerAction(actions[0]);
              else setActionsOpen((value) => !value);
            }}
            className="grid h-9 w-9 place-items-center rounded-lg border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] text-[var(--awb-text)] transition hover:bg-[var(--awb-hover)] disabled:opacity-40"
            aria-label={tt(
              actions.length === 1 ? actions[0].label : "交付与导出",
            )}
            title={tt(
              actions.length === 1 ? actions[0].label : "交付与导出",
            )}
            aria-expanded={actions.length > 1 ? actionsOpen : undefined}
          >
            <AdvancedEditorIcon
              name={
                actions.length > 1
                  ? "more"
                  : actions[0].icon || "download"
              }
              className="h-4 w-4"
            />
          </button>
          {actions.length > 1 && actionsOpen && (
            <div className="absolute right-0 top-full z-[110] mt-2 min-w-44 rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] p-1.5 shadow-2xl">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  disabled={action.disabled || action.busy}
                  onClick={() => triggerAction(action)}
                  className="flex h-9 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[11px] font-medium text-[var(--awb-text)] transition hover:bg-[var(--awb-hover)] disabled:opacity-40"
                >
                  <AdvancedEditorIcon
                    name={action.icon || "download"}
                    className="h-4 w-4"
                  />
                  {tt(
                    action.busy && action.busyLabel
                      ? action.busyLabel
                      : action.label,
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
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
    </div>
  );
}

function CloudAutoSaveIcon({ className = "" }: { className?: string }) {
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
      <path d="m9.5 13 1.7 1.7 3.5-3.7" />
    </svg>
  );
}
