"use client";

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useUI } from "../i18n/ui/useUI";
import { Button, IconButton } from "../ui/Button";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { actionGroup } from "./advanced-workbench-chrome";
import { AnchoredPopover } from "./anchored-popover";
import { CollabActionSlot } from "./collab/CollabActionSlot";
import { PluginThemeToggle, type PluginThemeId } from "./plugin-theme";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import {
  useRightPaneSlot,
  type WorkspaceLibraryPanelId,
} from "./SplitWorkspace";

function browserFullscreenAvailable(): boolean {
  if (typeof document === "undefined") return false;
  if (document.fullscreenEnabled === false) return false;
  return typeof document.documentElement?.requestFullscreen === "function";
}

const subscribeWithoutPane = () => () => {};

function toggleEditorBrowserFullscreen() {
  if (typeof document === "undefined") return;
  if (document.fullscreenElement) {
    void document.exitFullscreen?.();
    return;
  }
  const target = document.documentElement;
  void target.requestFullscreen?.();
}

export function AdvancedWorkspaceActionBar({
  adapter,
  autoSaveState: observedAutoSaveState,
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
  const confirmation = adapter.persistence?.confirmation;
  const autoSaveState = confirmation?.state ?? observedAutoSaveState;
  const rightPaneSlot = useRightPaneSlot();
  const rightMaximized = useSyncExternalStore(
    rightPaneSlot?.subscribeRightMaximized ?? subscribeWithoutPane,
    () => rightPaneSlot?.rightMaximized === true,
    () => false,
  );
  const [browserFullscreen, setBrowserFullscreen] = useState(false);
  useEffect(() => {
    if (rightPaneSlot) return;
    const sync = () => setBrowserFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    sync();
    return () => document.removeEventListener("fullscreenchange", sync);
  }, [rightPaneSlot]);
  const maximize = rightPaneSlot
    ? {
        pressed: rightMaximized,
        label: tt(
          rightMaximized ? "退出右侧全屏" : "右侧全屏",
        ),
        toggle: () => rightPaneSlot.toggleRightMaximized(),
      }
    : browserFullscreenAvailable()
      ? {
          pressed: browserFullscreen,
          label: tt(browserFullscreen ? "退出全屏" : "全屏"),
          toggle: toggleEditorBrowserFullscreen,
        }
      : null;
  const downloadButtonRef = useRef<HTMLButtonElement>(null);
  const downloadMenuRef = useRef<HTMLDivElement>(null);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  const [actionError, setActionError] = useState("");
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const actions = adapter.actions || [];
  const downloadActions = [
    ...(adapter.directDownload ? [adapter.directDownload] : []),
    ...actions.filter((action) => action.group === "download"),
  ];
  // 保存菜单只列真实 save 组。没有 save 组时云朵只报状态；失败可点重试。不再合成「立即保存」。
  const saveActions = actions.filter(
    (action) => actionGroup(action) === "save",
  );
  const idBase = useId().replace(/:/g, "");
  const downloadMenuId = `workspace-download-${idBase}`;
  const saveMenuId = `workspace-save-${idBase}`;
  const saveStateLabel = tt(
    autoSaveState === "unconfirmed"
      ? "尚未确认保存"
      : autoSaveState === "saving"
      ? "正在自动保存"
      : autoSaveState === "error"
        ? "保存遇到问题"
        : "已保存",
  );
  const saveErrorTitle =
    autoSaveState === "error"
      ? confirmation?.message || autoSaveError || tt("保存失败，点击重试")
      : confirmation?.message;
  const saveMenuAvailable = saveActions.length > 0 || autoSaveState === "error";

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
        <CollabActionSlot collab={adapter.collab} pluginThemeId={pluginThemeId} />
        {adapter.persistence?.recovery?.ready !== false ? (
        <div data-global-row-slot="save-state">
          {/* 保存菜单：按钮本体只说状态；点开才有动作。无任何可点动作时它只是状态，不弹菜单。 */}
          <Button
            ref={saveButtonRef}
            variant="ghost"
            data-workspace-save-launcher
            data-save-state={autoSaveState}
            onClick={() => {
              if (!saveMenuAvailable) return;
              setSaveOpen((value) => !value);
            }}
            aria-disabled={!saveMenuAvailable || undefined}
            aria-haspopup={saveMenuAvailable ? "menu" : undefined}
            aria-expanded={saveMenuAvailable ? saveOpen : undefined}
            aria-controls={saveMenuAvailable ? saveMenuId : undefined}
            aria-live="polite"
            title={saveErrorTitle || saveStateLabel}
            style={{
              color:
                autoSaveState === "error"
                  ? "var(--awb-danger,#dc2626)"
                  : autoSaveState === "saving"
                    ? "var(--awb-warn,#d97706)"
                    : autoSaveState === "unconfirmed"
                      ? "var(--awb-muted,#737373)"
                      : "var(--awb-ok,#059669)",
            }}
          >
            <CloudAutoSaveIcon
              state={autoSaveState}
              className={`h-4 w-4 shrink-0 ${
                autoSaveState === "saving" ? "animate-pulse" : ""
              }`}
            />
            <span className="max-w-[9rem] truncate text-[12px]">
              {saveStateLabel}
            </span>
            {saveMenuAvailable ? (
              <AdvancedEditorIcon
                name="chevron"
                className="h-3 w-3 shrink-0 opacity-70"
              />
            ) : null}
          </Button>
          {saveMenuAvailable ? (
            <AnchoredPopover
              open={saveOpen}
              anchorRef={saveButtonRef}
              panelRef={saveMenuRef}
              onClose={() => setSaveOpen(false)}
              id={saveMenuId}
              role="menu"
              ariaLabel={tt("保存")}
              align="end"
              maxHeight={384}
              attributes={{ "data-workspace-save-menu": true }}
              className="z-[2147483550] grid w-60 gap-1 overflow-y-auto rounded-xl border border-[var(--awb-border)] bg-[var(--awb-popover-bg)] p-1.5 text-[var(--awb-text)] shadow-2xl"
            >
              {autoSaveState === "error" ? (
                <Button
                  variant="ghost"
                  block
                  align="start"
                  role="menuitem"
                  tabIndex={-1}
                  data-workspace-save-action-id="retry"
                  title={saveErrorTitle}
                  onClick={() => {
                    setSaveOpen(false);
                    window.requestAnimationFrame(() =>
                      saveButtonRef.current?.focus(),
                    );
                    onRetrySave();
                  }}
                >
                  <CloudAutoSaveIcon state="error" className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">
                    {tt("保存失败，点击重试")}
                  </span>
                </Button>
              ) : null}
              {saveActions.map((action) => {
                const label =
                  action.busy && action.busyLabel
                    ? action.busyLabel
                    : action.label;
                return (
                  <Button
                    key={action.id}
                    variant={action.variant === "danger" ? "danger" : "ghost"}
                    block
                    align="start"
                    role="menuitem"
                    tabIndex={-1}
                    data-workspace-save-action-id={action.id}
                    disabled={action.disabled || action.busy}
                    aria-busy={action.busy || undefined}
                    onClick={() => {
                      setSaveOpen(false);
                      window.requestAnimationFrame(() =>
                        saveButtonRef.current?.focus(),
                      );
                      void triggerAction(action);
                    }}
                  >
                    <AdvancedEditorIcon
                      name={action.icon || "file"}
                      className="h-4 w-4 shrink-0"
                    />
                    <span className="min-w-0 flex-1 truncate">{tt(label)}</span>
                  </Button>
                );
              })}
            </AnchoredPopover>
          ) : null}
        </div>
        ) : null}
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
        <div data-global-row-slot="maximize">
          {maximize ? (
            <IconButton
              onClick={maximize.toggle}
              label={maximize.label}
              aria-pressed={maximize.pressed}
              icon={
                <AdvancedEditorIcon
                  name={maximize.pressed ? "fullscreen-exit" : "fullscreen"}
                  className="h-4 w-4"
                />
              }
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
  state: AdvancedAutoSaveState | "unconfirmed";
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
