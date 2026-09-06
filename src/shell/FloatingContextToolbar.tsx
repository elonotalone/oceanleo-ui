"use client";

import { type ReactNode, type RefObject } from "react";
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
  editBarCollapsedStyle,
  editBarPillStyle,
} from "./edit-bar-surface";
import type { WorkbenchIconName } from "./AdvancedEditorIcon";

export type FloatingContextToolbarController = EditBarDockController;

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

export function FloatingContextToolbar({
  controller,
  accent,
  theme = null,
  collapsedIcon,
  collapsedLabel,
  busy = false,
  dirty = false,
  children,
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
  children?: ReactNode;
}) {
  if (!children) return null;
  if (!controller.portalRoot) return null;
  const docked = controller.mode === "docked" && !controller.collapsed;
  return createPortal(
    <div
      data-workspace-floating-toolbar-overlay
      data-floating-toolbar-boundary="editor-shell"
      className="pointer-events-none absolute inset-0 overflow-hidden"
      style={{ contain: "layout paint", zIndex: 2_147_483_000 }}
    >
      <div
        data-workspace-docked-toolbar={docked || undefined}
        data-workspace-floating-toolbar={!docked || undefined}
        data-edit-bar-mode={controller.mode}
        data-edit-bar-presentation={controller.presentation}
          data-edit-bar-dragging={controller.dragging || undefined}
          data-edit-bar-move-mode={controller.moveMode || undefined}
          data-edit-bar-selected={controller.selected || undefined}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        <div
          ref={controller.toolbarRef}
          data-advanced-context-row
          data-workspace-edit-bar-toolbar
          data-plugin-theme={theme || undefined}
          data-edit-bar-mode={controller.mode}
          data-edit-bar-offset={`${controller.offset.x},${controller.offset.y}`}
          onPointerDownCapture={controller.rootProps.onPointerDownCapture}
          onPointerUpCapture={controller.rootProps.onPointerUpCapture}
          onClickCapture={controller.rootProps.onClickCapture}
          onDoubleClickCapture={controller.rootProps.onDoubleClickCapture}
          onKeyDown={controller.rootProps.onKeyDown}
          aria-keyshortcuts={controller.rootProps["aria-keyshortcuts"]}
          className="pointer-events-auto absolute left-0 top-0 inline-flex w-fit max-w-[calc(100%-1rem)] overflow-visible will-change-transform"
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
            className="inline-flex origin-top-left"
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
              children
            )}
          </div>
          {controller.selected && !controller.moveMode && (
            <div
              aria-hidden="true"
              data-edit-bar-selected-ring
              className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/45"
            />
          )}
          {controller.moveMode && (
            // 按住拖的这一段盖住控件：松手之前按钮不许被点到。
            <div
              aria-hidden="true"
              data-edit-bar-move-shield
              className="absolute inset-0 cursor-grabbing rounded-full ring-2 ring-[var(--pchrome-accent,var(--awb-accent,#7c3aed))]/60"
            />
          )}
        </div>
      </div>
    </div>,
    controller.portalRoot,
  );
}
