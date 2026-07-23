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
  workspaceRootRef?: RefObject<HTMLDivElement | null>;
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
  if (controller.mode === "docked") {
    if (!controller.dockRoot) return null;
    return createPortal(
      <div
        data-advanced-context-row
        data-workspace-docked-toolbar
        data-edit-bar-mode="docked"
        ref={controller.toolbarRef}
        className="flex w-full min-w-0 max-w-full items-center justify-center overflow-visible"
        style={advancedWorkbenchStyle(accent)}
      >
        {children}
      </div>,
      controller.dockRoot,
    );
  }
  if (!controller.portalRoot) return null;
  return createPortal(
    <div
      data-advanced-context-row
      data-workspace-floating-toolbar
      data-edit-bar-mode="floating"
      ref={controller.toolbarRef}
      className="absolute left-0 top-0 z-[2147483000] inline-flex w-fit max-w-[calc(100%-1rem)] overflow-visible will-change-transform"
      style={{
        ...advancedWorkbenchStyle(accent),
        transform: `translate3d(${controller.position.x}px, ${controller.position.y}px, 0)`,
      }}
    >
      {children}
    </div>,
    controller.portalRoot,
  );
}
