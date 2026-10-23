"use client";

/**
 * 多人同改在外壳里的两个挂点。这个文件刻意只依赖 react：真正的实现（yjs、消息客户端、弹窗、锁接线）
 * 都在懒加载的块里，没有协同绑定的编辑器、没登录的人、境内版都不会加载它们。
 *
 * - `CollabActionSlot`：编辑器动作栏（`AdvancedWorkspaceActionBar` 只挂这一个）里的头像串、锁提示，
 *   以及专业模式锁的接线；「邀请一起改」「生成回放」登记进第一行的 `···` 菜单（D1，2026-10-23），
 *   弹窗仍由懒加载块自己画。`adapter.collab` 没给 → 什么都不渲染、什么都不登记。
 * - `CollabTaskPresence`：AI 任务页头部「同时在看这个任务的人」，只用在线头像，不绑文档。
 */
import { lazy, Suspense } from "react";
import type { PluginThemeId } from "../plugin-theme";
import type { EditorCollabBinding } from "./index";

const ActionSlotInner = lazy(() =>
  import("./CollabActionSlotInner").then((m) => ({ default: m.CollabActionSlotInner })),
);
const TaskGate = lazy(() => import("./CollabTaskGate").then((m) => ({ default: m.CollabTaskGate })));

export function CollabActionSlot({
  collab,
  pluginThemeId,
}: {
  collab: EditorCollabBinding | undefined;
  pluginThemeId: PluginThemeId | null | undefined;
}) {
  if (!collab) return null;
  return (
    <Suspense fallback={null}>
      <div data-collab-icon-chrome>
        <ActionSlotInner collab={collab} pluginThemeId={pluginThemeId} />
      </div>
    </Suspense>
  );
}

export function CollabTaskPresence({ taskId }: { taskId: string | null | undefined }) {
  if (!taskId) return null;
  return (
    <Suspense fallback={null}>
      <TaskGate taskId={taskId} />
    </Suspense>
  );
}
