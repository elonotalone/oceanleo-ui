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
  activeLibraryPanelId,
  pluginThemeId = null,
  showLibrary = true,
  showBack = true,
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
  /** 插件内主题 id；null = 非 10 件插件，不渲染主题切换器。 */
  pluginThemeId?: PluginThemeId | null;
  /** Plugin-gallery host has no OceanLeo library chrome. */
  showLibrary?: boolean;
  showBack?: boolean;
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

  // 条高 32 → 44（W04）：里面的键从 `h-8`(32) 提到 44，容器就得刚好装得下它们。
  // 这里不套 `AdvancedStageControls` 的 56（44 + 2×6）——那条是有底色的浮动胶囊，
  // 要留内缘白；这条 `bg-transparent`，贴着按钮走就行。
  // 撑得下：`SplitWorkspace.tsx` 的 `[data-pane-header]` 是 `min-h-[2.5rem]`，
  // 是**最小**高度不是固定高度（实测），所以 44 不会被裁。
  return (
    <div
      data-advanced-workspace-actions
      data-advanced-action-row
      role="toolbar"
      aria-label={tt("工作区操作")}
      className="flex h-11 w-full min-w-0 flex-nowrap items-center gap-0.5 overflow-hidden bg-transparent"
    >
      <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-0.5 overflow-x-auto">
        {showBack ? (
          <IconButton
            onClick={onBack}
            label={tt("返回库")}
            icon={<span className="text-base leading-none">←</span>}
          />
        ) : null}
        {/*
          撤销/重做**不在这里**。它们改的是「这次改动」，归编辑栏管
          （EditBarHistoryControls）；顶栏只留「这份文档」级别的动作：
          返回、素材库、保存导出、全屏。这条分工是 13 件插件顶栏长得一样的前提，
          由 tests/advanced-editor-v8-shared-edit-bar.test.mjs 锁住。
        */}
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
        <span className="min-w-4 flex-1" />
        {standaloneActions.map((action) => (
          <IconButton
            key={action.id}
            data-workspace-action-id={action.id}
            disabled={action.disabled || action.busy}
            aria-busy={action.busy || undefined}
            onClick={() => void triggerAction(action)}
            variant={action.variant === "danger" ? "danger" : "ghost"}
            selected={action.variant === "primary"}
            aria-pressed={
              action.id.startsWith("project-view:")
                ? action.variant === "primary"
                : undefined
            }
            label={tt(
              action.busy && action.busyLabel ? action.busyLabel : action.label,
            )}
            icon={
              <AdvancedEditorIcon
                name={action.icon || "download"}
                className="h-4 w-4"
              />
            }
          />
        ))}
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        {pluginThemeId ? <PluginThemeToggle pluginId={pluginThemeId} /> : null}
        {adapter.upload && (
          <>
            <IconButton
              onClick={() => fileInputRef.current?.click()}
              label={tt("从本地添加到画布")}
              title={tt("从本地添加到画布，也可以直接拖放文件")}
              icon={<AdvancedEditorIcon name="uploads" className="h-4 w-4" />}
            />
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
          <IconButton
            variant="danger"
            onClick={() => setActionError("")}
            label={tt(`操作失败：${actionError}；点击关闭提示`)}
            title={actionError}
            icon={<span className="text-base leading-none">!</span>}
          />
        )}
        {/*
          三档状态色走**内联 style**，不走 className。原语的变体已经带了自己的
          `text-*`，再叠一个同类工具类，谁赢由样式表顺序决定而不是由这里的写法决定；
          内联值没有这个歧义。（同一个理由让 `pill`/`selected`/`align` 成了 prop。）
        */}
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
          title={tt(
            autoSaveState === "saving"
              ? "正在自动保存"
              : autoSaveState === "error"
                ? "点击重试自动保存"
                : "已保存",
          )}
          icon={
            <CloudAutoSaveIcon
              state={autoSaveState}
              className={`h-4 w-4 ${
                autoSaveState === "saving" ? "animate-pulse" : ""
              }`}
            />
          }
        />
        {downloadActions.length > 0 && (
          <>
            <IconButton
              ref={downloadButtonRef}
              variant="secondary"
              data-workspace-download-launcher
              onClick={() => setDownloadOpen((value) => !value)}
              label={tt("下载与导出")}
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
