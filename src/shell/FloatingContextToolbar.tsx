"use client";

import {
  useRef,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import { pluginWorkbenchStyle, type PluginThemeMode } from "./plugin-theme";
import {
  useEditBarDockController,
  type EditBarDockController,
} from "./edit-bar-dock-controller";
import { EditBarCollapsedPill } from "./EditBarDockControls";
import { editBarDockStorageKey } from "./edit-bar-dock-state";
import {
  EDIT_BAR_BUTTON_CLASS,
  editBarCollapsedStyle,
  editBarPillStyle,
} from "./edit-bar-surface";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";
import { EditBarAgentIcon } from "./EditBarAgentIcon";
import { useAdvancedLayout } from "./advanced-layout-context";
import { PLUGIN_AGENT_DRAWER_ID } from "./plugin-chrome/agent-drawer";
import { useUI } from "../i18n/ui/useUI";
import { EditBarRowContext } from "./edit-bar-row-context";
import { preserveEditBarSelection } from "./edit-bar-selection-preserve";

export { useInsideEditBarRow } from "./edit-bar-row-context";

export type FloatingContextToolbarController = EditBarDockController;

/**
 * 页签必须永远能点。两行 chrome（`data-advanced-workbench-header` /
 * `data-plugin-chrome-rows` / `data-pane-header` / `data-plugin-page-row`）
 * 各自在 className 里静态带 `relative z-40`，压在本 overlay
 * （`z-[35]`）之上。这里不再在运行时改任何元素的 style ——
 * 手势点只许写 transform / opacity（tests/motion-compositor-only.test.mjs）。
 */
export function useFloatingContextToolbar({
  workspaceRootRef,
  stageRef,
  dockRootRef,
  resetKey,
  storageKey,
}: {
  workspaceRootRef?: RefObject<HTMLElement | null>;
  stageRef: RefObject<HTMLDivElement | null>;
  dockRootRef?: RefObject<HTMLDivElement | null>;
  resetKey: string;
  storageKey?: string;
}): FloatingContextToolbarController {
  return useEditBarDockController({
    workspaceRootRef,
    stageRef,
    dockRootRef,
    resetKey,
    storageKey: storageKey || editBarDockStorageKey(resetKey),
  });
}

/**
 * 单行编辑栏本体（规范 v2 §4，2026-10-21：撤销重做已离开编辑栏）：
 * `[选区属性与创建工具…] | [trailing] [AI 助手]`
 * 全部内联在一个 `inline-flex flex-nowrap` 里，永不换行；宽度不足先由
 * SelectionToolbar 统一量宽并将创建工具与选区控件收进同一个 More。
 */
export function EditBarRow({
  controller,
  children,
  documentSegment,
  trailing,
  assistant,
  emptyHint,
}: {
  controller: FloatingContextToolbarController;
  children?: ReactNode;
  documentSegment?: ReactNode;
  trailing?: ReactNode;
  assistant?: ReactNode | null;
  emptyHint?: string;
}) {
  const tt = useUI();
  const layout = useAdvancedLayout();
  const rowRef = useRef<HTMLDivElement | null>(null);
  const hostTrailing = layout?.contextBarTrailing ?? null;
  const hasSelection = Boolean(children);
  const hasDocument = Boolean(documentSegment);
  // AI 固定在右段，13 个插件同一个位置。点它把左侧操控台换成 agent 对话。
  // `assistant === null`：宿主已在 children 里画了自己的 AI 键（PluginChromeFrame，
  // 被 tests/plugin-chrome-agent-drawer 钉死），这里不再画第二个。
  const agentActive = layout?.activeDrawerId === PLUGIN_AGENT_DRAWER_ID;
  const agentButton =
    assistant !== undefined ? assistant : layout ? (
    <button
      type="button"
      data-edit-bar-agent
      data-edit-bar-interactive
      aria-pressed={agentActive}
      onPointerDown={preserveEditBarSelection}
      onClick={() =>
        agentActive
          ? layout.closeDrawer()
          : layout.openDrawer(PLUGIN_AGENT_DRAWER_ID)
      }
      className={`${EDIT_BAR_BUTTON_CLASS} ${
        agentActive
          ? "bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))] text-[var(--pchrome-on-accent,#fff)] hover:bg-[var(--pchrome-accent,var(--awb-accent,#7c3aed))] hover:text-[var(--pchrome-on-accent,#fff)]"
          : ""
      }`}
      aria-label={tt("AI 助手")}
      title={tt("AI 助手：在左侧和 agent 对话，同时继续改右边")}
    >
      <EditBarAgentIcon className="h-[18px] w-[18px]" />
    </button>
  ) : null;
  const trailingVisible = Boolean(
    trailing || hostTrailing || agentButton,
  );
  const body = hasSelection || hasDocument;
  return (
    <div
      ref={rowRef}
      data-workspace-edit-bar
      data-empty={body ? undefined : true}
      role="toolbar"
      aria-label={tt("编辑栏")}
      className="pointer-events-auto relative inline-flex max-w-full flex-nowrap items-center gap-1 overflow-hidden whitespace-nowrap"
      style={editBarPillStyle(Boolean(controller.lifted || controller.moveMode || controller.dragging))}
    >
      {!body && emptyHint && (
        <span
          data-edit-bar-empty-hint
          className="shrink-0 px-2 text-[12px] text-[var(--pchrome-ink-mid,var(--awb-muted,#57534e))]"
        >
          {tt(emptyHint)}
        </span>
      )}
      {hasSelection && (
        <div
          data-edit-bar-selection-slot
          // 插件控件里偶有偏矮的小按钮：统一到 28px 命中区，
          // 整行按钮同一条 y 带，规范 v2 §4「所有可见按钮 y 同带」才成立。
          className="flex min-w-0 shrink items-center [&_button]:min-h-7"
        >
          <EditBarRowContext.Provider value={true}>
            {children}
          </EditBarRowContext.Provider>
        </div>
      )}
      {hasDocument && (
        <div data-edit-bar-document-slot className="flex min-w-0 items-center gap-0.5">
          {documentSegment}
        </div>
      )}
      {trailingVisible && (
        <div
          data-edit-bar-trailing-slot
          className={`flex shrink-0 items-center gap-1 ${
            body || emptyHint
              ? "ml-1 border-l border-[var(--pchrome-line,var(--divider,#e7e5e4))]/60 pl-2"
              : ""
          }`}
        >
          {trailing}
          {hostTrailing}
          {agentButton}
        </div>
      )}
    </div>
  );
}

export function FloatingContextToolbar({
  controller,
  accent,
  theme = null,
  collapsedIcon,
  collapsedLabel,
  busy = false,
  dirty = false,
  children,
  documentSegment,
  trailing,
  assistant,
  emptyHint,
}: {
  controller: FloatingContextToolbarController;
  accent: string;
  /** 插件内主题档；null = 非 10 件插件，沿用站点主题别名。 */
  theme?: PluginThemeMode | null;
  /** 收起圆上显示的上下文图标与文案，让用户收起后仍知道选中了什么。 */
  collapsedIcon?: WorkbenchIconName;
  collapsedLabel?: string;
  busy?: boolean;
  dirty?: boolean;
  /** 选中对象工具（宿主唯一的 SelectionToolbar）；没选中时传 null，栏照样在。 */
  children?: ReactNode;
  /** 编辑类文档动作（`group === "edit"`），与选中工具同一行。 */
  documentSegment?: ReactNode;
  /** 可选附加节点，排在 AI 助手之前。 */
  trailing?: ReactNode;
  /**
   * AI 助手键。缺省（undefined）由行自己画（需要 AdvancedLayout）；传 `null`
   * 表示宿主已在 children 里画了一份（PluginChromeFrame），行不再画第二个。
   */
  assistant?: ReactNode | null;
  /** 没选中也没有文档动作时（`data-empty`）栏里显示的一句提示。 */
  emptyHint?: string;
}) {
  const tt = useUI();
  if (!controller.portalRoot) return null;
  const docked = controller.mode === "docked" && !controller.collapsed;
  return createPortal(
    <div
      data-workspace-floating-toolbar-overlay
      data-floating-toolbar-boundary="editor-shell"
      className="pointer-events-none absolute inset-0 z-[35] overflow-hidden"
      style={{ contain: "layout paint" }}
    >
      <div
        data-workspace-docked-toolbar={docked || undefined}
        data-workspace-floating-toolbar={!docked || undefined}
        data-edit-bar-mode={controller.mode}
        data-edit-bar-presentation={controller.presentation}
          data-edit-bar-dragging={controller.dragging || undefined}
          data-edit-bar-move-mode={controller.moveMode || undefined}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        <div
          ref={controller.toolbarRef}
          data-advanced-context-row
          data-workspace-edit-bar-toolbar
          data-plugin-theme={theme || undefined}
          data-edit-bar-mode={controller.mode}
          data-edit-bar-offset={`${controller.offset.x},${controller.offset.y}`}
          onPointerDown={controller.rootProps.onPointerDown}
          onClickCapture={controller.rootProps.onClickCapture}
          onKeyDown={controller.rootProps.onKeyDown}
          aria-keyshortcuts={controller.rootProps["aria-keyshortcuts"]}
          data-edit-bar-lifted={controller.lifted || undefined}
          className="pointer-events-auto absolute left-0 top-0 inline-flex w-fit max-w-[calc(100%-1rem)] overflow-visible will-change-transform touch-none"
          // transform 刻意不在这里写：位置由控制器的 paintMotion() 一处写入，
          // 否则每次重渲染都会把弹簧算出来的中间帧盖回去。
          style={
            theme
              ? pluginWorkbenchStyle(theme, accent)
              : advancedWorkbenchStyle(accent)
          }
        >
          {controller.morphGhost && (
            // 正在离开的那一形态，**永远只是一层画着它的惰性表面**，不是真内容：
            // 点圆展开时真圆必须当场卸载（既有断言要求 `[data-edit-bar-collapsed-pill]`
            // 立刻为 null），能留下来淡出的只能是这个 ghost。
            <div
              ref={controller.morphGhostRef}
              aria-hidden="true"
              data-edit-bar-morph-ghost
              className="pointer-events-none absolute left-0 top-0 origin-top-left"
              style={{
                ...(controller.morphGhostKind === "collapsed"
                  ? editBarCollapsedStyle()
                  : editBarPillStyle()),
                width: controller.morphGhost.width,
                height: controller.morphGhost.height,
              }}
            />
          )}
          <div
            ref={controller.morphLiveRef}
            data-edit-bar-morph-live
            className="inline-flex max-w-full origin-top-left"
          >
            {controller.collapsed ? (
              <EditBarCollapsedPill
                icon={collapsedIcon}
                contextLabel={collapsedLabel}
                busy={busy}
                dirty={dirty}
                dragging={controller.dragging}
                {...controller.collapsedProps}
              />
            ) : (
              <EditBarRow
                controller={controller}
                documentSegment={documentSegment}
                trailing={trailing}
                assistant={assistant}
                emptyHint={emptyHint}
              >
                {children}
              </EditBarRow>
            )}
          </div>
          {controller.moveMode && (
            // 按住拖的这一段只提供视觉反馈；控制器在阈值后吞掉 click。
            <div
              aria-hidden="true"
              data-edit-bar-move-shield
              className="pointer-events-none absolute inset-0 cursor-grabbing rounded-full ring-2 ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/60"
            />
          )}
        </div>
      </div>
    </div>,
    controller.portalRoot,
  );
}
