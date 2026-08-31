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
          onClickCapture={controller.rootProps.onClickCapture}
          onKeyDown={controller.rootProps.onKeyDown}
          className="pointer-events-auto absolute left-0 top-0 inline-flex w-fit max-w-[calc(100%-1rem)] overflow-visible will-change-transform"
          style={{
            ...(theme
              ? pluginWorkbenchStyle(theme, accent)
              : advancedWorkbenchStyle(accent)),
            transform: `translate3d(${controller.position.x}px, ${controller.position.y}px, 0)`,
          }}
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
          {controller.moveMode && (
            // 移动模式下用一层透明罩盖住所有控件：任何一次点击都只用来落下，
            // 不会误触下面的按钮。同时给出「已拿起」的视觉与光标。
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
