"use client";

import { type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { advancedWorkbenchStyle } from "./advanced-workbench-chrome";
import {
  useEditBarDockController,
  type EditBarDockController,
} from "./edit-bar-dock-controller";
import { editBarDockStorageKey } from "./edit-bar-dock-state";

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
  children,
}: {
  controller: FloatingContextToolbarController;
  accent: string;
  children?: ReactNode;
}) {
  if (!children) return null;
  if (!controller.portalRoot) return null;
  const docked = controller.mode === "docked";
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
        data-edit-bar-dragging={controller.dragging || undefined}
        className="pointer-events-none absolute inset-0 overflow-visible"
      >
        <div
          ref={controller.toolbarRef}
          data-advanced-context-row
          data-workspace-edit-bar-toolbar
          className="pointer-events-auto absolute left-0 top-0 inline-flex w-fit max-w-[calc(100%-1rem)] overflow-visible will-change-transform"
          style={{
            ...advancedWorkbenchStyle(accent),
            transform: `translate3d(${controller.position.x}px, ${controller.position.y}px, 0)`,
          }}
        >
          {children}
        </div>
      </div>
    </div>,
    controller.portalRoot,
  );
}
