"use client";

// ============================================================================
// 编辑器第一行（编辑器整改波 2026-10-23，操作员裁定 D1：顶栏只剩一行）
// ----------------------------------------------------------------------------
//   左：←  ｜ 素材库 我的库 ｜ 模式页签（只有两页以上才有）
//   右：↶ ↷ ｜ 多人同改头像串与锁 ｜ 保存状态 ｜ ··· ｜ 全屏 ｜ ×
// `···` 里：邀请一起改、生成回放、分享、收藏、下载 ▸（plugin-chrome/PluginMoreMenu）。
// 主题键删除：编辑器明暗永远跟着网站（D7，plugin-theme.tsx）。
// 保存状态槽：有 persistence 就恒在，不再因 recovery.ready === false 藏起来——
// PDF 处理中把 ready 置 false，用户就看不到云朵，不知道存没存。
// 可点的东西全部落在 GLOBAL_ROW_SLOTS 的槽位里（plugin-pages.ts）。
// ============================================================================

import { useEffect, useId, useRef, useState, useSyncExternalStore } from "react";
import { useUI } from "../i18n/ui/useUI";
import { Button, IconButton } from "../ui/Button";
import type { AdvancedEditorAdapter } from "./advanced-editor-adapter";
import { AdvancedEditorIcon } from "./AdvancedEditorIcon";
import { GlobalRowHistoryControls } from "./EditBarDockControls";
import { actionGroup } from "./advanced-workbench-chrome";
import { AnchoredPopover } from "./anchored-popover";
import { CollabActionSlot } from "./collab/CollabActionSlot";
import type { LibraryItem } from "./library-data";
import { downloadIconButtonProps } from "./workspace-download-icon-button";
import type { PluginThemeId } from "./plugin-theme";
import type { AdvancedAutoSaveState } from "./use-advanced-autosave";
import {
  useRightPaneSlot,
  type WorkspaceLibraryPanelId,
} from "./SplitWorkspace";
import { PluginMoreMenu } from "./plugin-chrome/PluginMoreMenu";
import {
  PluginMoreMenuRegistryContext,
  usePluginMoreMenuHost,
} from "./plugin-chrome/more-menu-registry";
import { PluginPageTabs } from "./plugin-chrome/PluginPageTabs";
import type { PluginPage } from "./plugin-chrome/plugin-pages";

export { downloadIconButtonProps };

type WorkspaceAction = NonNullable<AdvancedEditorAdapter["actions"]>[number];

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

const NO_PAGES: readonly PluginPage[] = [];

export function AdvancedWorkspaceActionBar({
  adapter,
  item = null,
  autoSaveState: observedAutoSaveState,
  autoSaveError,
  activeLibraryPanelId,
  pluginThemeId = null,
  pages = NO_PAGES,
  activePageId = "",
  showLibrary = true,
  showBack = true,
  showClose = false,
  onBack,
  onOpenLibrary,
  onSelectPage,
  onRetrySave,
  onClose,
  onTriggerAction,
}: {
  adapter: AdvancedEditorAdapter;
  item?: LibraryItem | null;
  autoSaveState: AdvancedAutoSaveState;
  autoSaveError?: string;
  /** @deprecated The shared selection bar is now the only tools launcher. */
  activeDrawerId?: string;
  activeLibraryPanelId: WorkspaceLibraryPanelId | null;
  pluginThemeId?: PluginThemeId | null;
  /** 模式页签（`buildPluginPages` 的结果）；少于两页时不画。 */
  pages?: readonly PluginPage[];
  activePageId?: string;
  showLibrary?: boolean;
  showBack?: boolean;
  showClose?: boolean;
  onBack: () => void;
  /** @deprecated The shared selection bar is now the only tools launcher. */
  onOpenTools?: () => void;
  onOpenLibrary: (id: WorkspaceLibraryPanelId) => void;
  onSelectPage?: (pageId: string) => void;
  onRetrySave: () => void;
  onClose?: () => void;
  onTriggerAction: (action: WorkspaceAction) => void | Promise<void>;
  /** Kept so callers can still pass it; upload is no longer on the first row. */
  onUploadFiles?: (files: File[]) => void;
}) {
  const tt = useUI();
  const confirmation = adapter.persistence?.confirmation;
  const reportedSaveState = confirmation?.state ?? observedAutoSaveState;
  // 草稿回执到达之前（recovery.ready === false，PDF 处理中也会这样）槽照样在，
  // 但绝不说「已保存」：服务器没确认就如实显示「尚未确认保存」。
  const autoSaveState: AdvancedAutoSaveState | "unconfirmed" =
    adapter.persistence?.recovery?.ready === false && reportedSaveState === "saved"
      ? "unconfirmed"
      : reportedSaveState;
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
        label: tt(rightMaximized ? "退出右侧全屏" : "右侧全屏"),
        toggle: () => rightPaneSlot.toggleRightMaximized(),
      }
    : browserFullscreenAvailable()
      ? {
          pressed: browserFullscreen,
          label: tt(browserFullscreen ? "退出全屏" : "全屏"),
          toggle: toggleEditorBrowserFullscreen,
        }
      : null;
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const saveMenuRef = useRef<HTMLDivElement>(null);
  const [actionError, setActionError] = useState("");
  const [saveOpen, setSaveOpen] = useState(false);
  const moreMenu = usePluginMoreMenuHost();
  const actions = adapter.actions || [];
  const downloadActions = [
    ...(adapter.directDownload ? [adapter.directDownload] : []),
    ...actions.filter((action) => action.group === "download"),
  ];
  // 保存菜单只列真实 save 组。没有 save 组时云朵只报状态；失败可点重试。不再合成「立即保存」。
  const saveActions = actions.filter(
    (action) => actionGroup(action) === "save",
  );
  // 没有持久化、也没有 save 组的件根本不会把东西存到服务器上：
  // 这时画一朵绿云写「已保存」就是假成功，整个槽不出。
  const showSaveState = Boolean(adapter.persistence) || saveActions.length > 0;
  const idBase = useId().replace(/:/g, "");
  const saveMenuId = `workspace-save-${idBase}`;
  // Typed by the editor, never guessed from the platform: only an editor whose
  // flush lands on this device (not the library) says so and drops the cloud.
  const saveDestination: "cloud" | "local-device" =
    adapter.persistence?.destination === "local-device" ? "local-device" : "cloud";
  const saveStateLabel = tt(
    autoSaveState === "unconfirmed"
      ? "尚未确认保存"
      : autoSaveState === "saving"
      ? saveDestination === "local-device"
        ? "正在保存到本机"
        : "正在自动保存"
      : autoSaveState === "error"
        ? "保存遇到问题"
        : saveDestination === "local-device"
          ? "已保存到本机（未同步到云端）"
          : "已保存",
  );
  const saveErrorTitle =
    autoSaveState === "error"
      ? tt(confirmation?.message || autoSaveError || "保存失败，点击重试")
      : confirmation?.message
        ? tt(confirmation.message)
        : undefined;
  const saveMenuAvailable = saveActions.length > 0 || autoSaveState === "error";

  const triggerAction = async (action: WorkspaceAction) => {
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
    <PluginMoreMenuRegistryContext.Provider value={moreMenu.registry}>
    <div
      data-advanced-workspace-actions
      data-advanced-action-row
      role="toolbar"
      aria-label={tt("工作区操作")}
      className="flex h-11 w-full min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden bg-transparent"
    >
      <div className="flex h-full min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div data-global-row-slot="back">
          {showBack ? (
            <IconButton
              onClick={onBack}
              label={tt("返回库")}
              icon={<AdvancedEditorIcon name="back" className="h-4 w-4" />}
            />
          ) : null}
        </div>
        <div data-global-row-slot="library" className="flex items-center gap-0.5">
          {showLibrary ? (
            <>
              <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
              <IconButton
                variant="ghost"
                selected={activeLibraryPanelId === "materials"}
                onClick={() => onOpenLibrary("materials")}
                aria-pressed={activeLibraryPanelId === "materials"}
                data-workspace-library-panel="materials"
                label={tt("素材库")}
                icon={<AdvancedEditorIcon name="materials" className="h-4 w-4" />}
              />
              <IconButton
                variant="ghost"
                selected={activeLibraryPanelId === "mine"}
                onClick={() => onOpenLibrary("mine")}
                aria-pressed={activeLibraryPanelId === "mine"}
                data-workspace-library-panel="mine"
                label={tt("我的库")}
                icon={<AdvancedEditorIcon name="library" className="h-4 w-4" />}
              />
            </>
          ) : null}
        </div>
        {pages.length > 1 && onSelectPage ? (
          <div data-global-row-slot="pages" className="flex h-full items-center">
            <span className="mx-1 h-6 w-px shrink-0 bg-[var(--divider,#e7e5e4)]" />
            <PluginPageTabs
              pages={pages}
              activePageId={activePageId}
              onSelectPage={onSelectPage}
            />
          </div>
        ) : null}
        <span className="min-w-4 flex-1" />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {adapter.history ? (
          <GlobalRowHistoryControls
            canUndo={adapter.history.canUndo}
            canRedo={adapter.history.canRedo}
            onUndo={adapter.history.undo}
            onRedo={adapter.history.redo}
          />
        ) : null}
        <CollabActionSlot collab={adapter.collab} pluginThemeId={pluginThemeId} />
        {showSaveState ? (
        <div data-global-row-slot="save-state">
          {/* 保存菜单：按钮本体只说状态；点开才有动作。无任何可点动作时它只是状态，不弹菜单。 */}
          <Button
            ref={saveButtonRef}
            variant="ghost"
            data-workspace-save-launcher
            data-save-state={autoSaveState}
            data-save-destination={saveDestination}
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
            style={{ color: cloudSaveColor(autoSaveState) }}
          >
            <CloudAutoSaveIcon
              state={autoSaveState}
              destination={saveDestination}
              className="h-4 w-4 shrink-0"
            />
            <span className="sr-only">{saveStateLabel}</span>
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
                  <CloudAutoSaveIcon
                    state="error"
                    destination={saveDestination}
                    className="h-4 w-4 shrink-0"
                  />
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
        <div data-global-row-slot="more" className="flex items-center">
          <PluginMoreMenu
            anchorRef={moreMenu.registry.anchorRef}
            item={item}
            entries={moreMenu.entries}
            downloads={downloadActions}
            defaultDownloadId={adapter.directDownload?.id ?? null}
            onDownload={(action) => triggerAction(action)}
            errorMessage={actionError}
          />
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
        {showClose && onClose && (
          <div data-global-row-slot="close">
            <IconButton onClick={onClose} label={tt("关闭右侧面板")}
              icon={<span aria-hidden="true" className="text-xl leading-none">×</span>} />
          </div>
        )}
      </div>
    </div>
    </PluginMoreMenuRegistryContext.Provider>
  );
}

function cloudSaveColor(state: AdvancedAutoSaveState | "unconfirmed"): string {
  if (state === "error") return "#dc2626";
  if (state === "saving") return "#d97706";
  if (state === "unconfirmed") return "#737373";
  return "#059669";
}

function CloudAutoSaveIcon({
  state,
  destination = "cloud",
  className = "",
}: {
  state: AdvancedAutoSaveState | "unconfirmed";
  destination?: "cloud" | "local-device";
  className?: string;
}) {
  const local = destination === "local-device";
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
      style={{ color: cloudSaveColor(state) }}
    >
      {local ? (
        <>
          <rect x="4" y="5" width="16" height="11" rx="1.5" />
          <path d="M2 19h20" />
        </>
      ) : (
        <path d="M7 18h10a4 4 0 0 0 .7-7.94A6 6 0 0 0 6.2 8.5 4.5 4.5 0 0 0 7 18Z" />
      )}
      {state === "saved" && (
        <path d={local ? "m9 10.5 2 2 4-4.2" : "m9.5 13 1.7 1.7 3.5-3.7"} />
      )}
      {state === "error" && (
        <>
          <path d="m10 12 4 4" />
          <path d="m14 12-4 4" />
        </>
      )}
    </svg>
  );
}
