"use client";

import { useId, useRef, useState } from "react";
import { useUI } from "../i18n/ui/useUI";
import { Button, IconButton } from "../ui/Button";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { AnchoredPopover } from "./anchored-popover";
import { PluginThemeToggle, type PluginThemeId } from "./plugin-theme";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import type { WorkspaceLibraryPanelId } from "./SplitWorkspace";

export function AdvancedWorkspaceActionBar({
  adapter,
  autoSaveState,
  autoSaveError,
  activeLibraryPanelId,
  pluginThemeId = null,
  showLibrary = true,
  showBack = true,
  showClose = false,
  onBack,
  onOpenLibrary,
  onRetrySave,
  onClose,
  onTriggerAction,
}: {
  adapter: AdvancedEditorAdapter;
  autoSaveState: AdvancedAutoSaveState;
  autoSaveError?: string;
  /** @deprecated The shared selection bar is now the only tools launcher. */
  activeDrawerId?: string;
  activeLibraryPanelId: WorkspaceLibraryPanelId | null;
  pluginThemeId?: PluginThemeId | null;
  showLibrary?: boolean;
  showBack?: boolean;
  showClose?: boolean;
  onBack: () => void;
  /** @deprecated The shared selection bar is now the only tools launcher. */
  onOpenTools?: () => void;
  onOpenLibrary: (id: WorkspaceLibraryPanelId) => void;
  onRetrySave: () => void;
  onClose?: () => void;
  onTriggerAction: (
    action: NonNullable<AdvancedEditorAdapter["actions"]>[number],
  ) => void | Promise<void>;
  /** Kept so callers can still pass it; upload is no longer on the first row. */
  onUploadFiles?: (files: File[]) => void;
}) {
  const tt = useUI();
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const [actionError, setActionError] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const actions = adapter.actions || [];
  const downloadActions = [
    ...(adapter.directDownload ? [adapter.directDownload] : []),
    ...actions.filter((action) => action.group === "download"),
  ];
  const downloadMenuId = `workspace-download-${useId().replace(/:/g, "")}`;
  const saveErrorTitle =
    autoSaveState === "error"
      ? autoSaveError || tt("保存失败，点击重试")
      : undefined;

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
      className="flex h-11 w-full min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden bg-transparent"
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto">
        <div data-global-row-slot="back">
          {showBack ? (
            <IconButton
              onClick={onBack}
              label={tt("返回库")}
              icon={<span className="text-base leading-none">←</span>}
            />
          ) : null}
        </div>
        <div data-global-row-slot="library" className="flex items-center gap-0.5">
          {showLibrary ? (
            <>
              <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
              <Button
                variant="ghost"
                selected={activeLibraryPanelId === "materials"}
                onClick={() => onOpenLibrary("materials")}
                aria-pressed={activeLibraryPanelId === "materials"}
              >
                <AdvancedEditorIcon name="materials" className="h-4 w-4" />
                {tt("素材库")}
              </Button>
              <Button
                variant="ghost"
                selected={activeLibraryPanelId === "mine"}
                onClick={() => onOpenLibrary("mine")}
                aria-pressed={activeLibraryPanelId === "mine"}
              >
                <AdvancedEditorIcon name="library" className="h-4 w-4" />
                {tt("我的库")}
              </Button>
            </>
          ) : null}
        </div>
        <span className="min-w-4 flex-1" />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <div data-global-row-slot="save-state">
          <IconButton
            onClick={() => {
              if (autoSaveState === "error") onRetrySave();
            }}
            aria-disabled={autoSaveState !== "error"}
            aria-live="polite"
            style={{
              color:
                autoSaveState === "error"
                  ? "var(--awb-danger,#dc2626)"
                  : autoSaveState === "saving"
                    ? "var(--awb-warn,#d97706)"
                    : "var(--awb-ok,#059669)",
            }}
            label={tt(
              autoSaveState === "saving"
                ? "正在自动保存"
                : autoSaveState === "error"
                  ? "保存遇到问题，点击重试"
                  : "已保存",
            )}
            title={
              saveErrorTitle ||
              tt(
                autoSaveState === "saving"
                  ? "正在自动保存"
                  : autoSaveState === "error"
                    ? "保存失败，点击重试"
                    : "已保存",
              )
            }
            icon={
              <CloudAutoSaveIcon
                state={autoSaveState}
                className={`h-4 w-4 ${
                  autoSaveState === "saving" ? "animate-pulse" : ""
                }`}
              />
            }
          />
        </div>
        <div data-global-row-slot="download">
          {downloadActions.length > 0 ? (
            <>
              <IconButton
                ref={downloadButtonRef}
                variant="secondary"
                data-workspace-download-launcher
                onClick={() => setDownloadOpen((value) => !value)}
                label={tt("下载与导出")}
                title={actionError || tt("下载与导出")}
                aria-haspopup="menu"
                aria-expanded={downloadOpen}
                aria-controls={downloadMenuId}
                icon={<AdvancedEditorIcon name="download" className="h-4 w-4" />}
              />
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
                    <Button
                      key={action.id}
                      variant="ghost"
                      block
                      align="start"
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
                    </Button>
                  );
                })}
              </AnchoredPopover>
            </>
          ) : null}
        </div>
        <div data-global-row-slot="theme">
          {pluginThemeId ? <PluginThemeToggle pluginId={pluginThemeId} /> : null}
        </div>
        <div data-global-row-slot="close">
          {showClose && onClose ? (
            <IconButton
              onClick={onClose}
              label={tt("关闭")}
              icon={<AdvancedEditorIcon name="close" className="h-4 w-4" />}
            />
          ) : null}
        </div>
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
