"use client";

// 把 useCanvasWorkflow() 的状态翻成统一外壳的槽位。
//
// 改造前视频画布自己搭了一条 absolute 浮动 header：左边身份、中间五个投影
// 切换、右边主题开关 + Add media + Save snapshot + Full screen + Back，
// 全部是 text-[9px]/[10px] 的自定义按钮。它跟其余 12 件插件既不同高、
// 也不同字号、图标还是 ☀/☾ 这类排版字符。现在一律填进契约槽位，
// 版式与图标由 PluginChromeFrame 统一出。

import { useMemo } from "react";
import { useUI } from "../../../i18n";
import type {
  PluginChromeAction,
  PluginChromeNotice,
  PluginChromeSaveState,
  PluginChromeView,
} from "../../plugin-chrome";
import type { useCanvasWorkflow } from "./use-canvas-workflow";

type CanvasWorkflow = ReturnType<typeof useCanvasWorkflow>;

/**
 * 五个投影共享同一个 head，只是看法不同，所以是 views 而不是 actions。
 *
 * 这些 label 非嵌入时进 PluginChromeFrame 的视图切换条；嵌入态改由
 * project-manifest.views 报给宿主（graph 带 role:artifact，director 不报）。
 * 从模块级常量改成 hook 就是为了拿到 tt——常量位置调不了 hook。
 * `保存中…` 这类 en.ts 里没有 key 的串保持中文原样并留在预算锁里：
 * 硬包 tt() 只会让闸门以为已办好，15 个非中文档看到的还是中文。
 */
export function useCanvasViews(): readonly PluginChromeView[] {
  const tt = useUI();
  return useMemo(
    () => [
      { id: "graph", label: tt("节点图"), icon: "layers" },
      { id: "storyboard", label: tt("分镜"), icon: "pages" },
      { id: "director", label: tt("导演台"), icon: "note" },
      { id: "timeline", label: tt("时间线"), icon: "timeline" },
      { id: "history", label: tt("历史"), icon: "history" },
    ],
    [tt],
  );
}

export function useCanvasChromeActions(
  workflow: CanvasWorkflow,
): readonly PluginChromeAction[] {
  const tt = useUI();
  return useMemo(
    () => [
      {
        id: "add-media",
        label: tt("添加媒体"),
        icon: "uploads",
        onTrigger: workflow.openCreateMenu,
      },
      {
        id: "save",
        label: tt("保存快照"),
        icon: "save",
        variant: "primary",
        disabled: workflow.saving,
        busy: workflow.saving,
        busyLabel: "保存中…",
        onTrigger: () =>
          void workflow.dispatchCommand("canvas.project.save", {}, "toolbar"),
      },
    ],
    [tt, workflow],
  );
}

export function useCanvasSaveState(
  workflow: CanvasWorkflow,
): PluginChromeSaveState {
  return useMemo(() => {
    if (workflow.saving) return { kind: "saving" };
    if (workflow.dirty) return { kind: "dirty" };
    // 没接执行通道时存的只是本地文档，不许显示成「已保存」——那会让用户
    // 以为快照进了 Durable Project，其实并没有。
    if (workflow.executionDegraded) {
      return {
        kind: "local-only",
        reason: "未注入执行通道，快照只写回陈列馆文档，不进 Durable Project。",
      };
    }
    return {
      kind: "clean",
      revisionLabel: `r${workflow.head.revision}`,
    };
  }, [
    workflow.saving,
    workflow.dirty,
    workflow.executionDegraded,
    workflow.head.revision,
  ]);
}

export function useCanvasNotices(
  workflow: CanvasWorkflow,
): readonly PluginChromeNotice[] {
  return useMemo(() => {
    const notices: PluginChromeNotice[] = [];
    if (workflow.executionDegraded) {
      notices.push({
        id: "execution-degraded",
        tone: "warn",
        message: "纯编辑：未注入执行通道",
        detail: "不执行 Durable Project/Run，也不走网关生成。编辑与保存照常。",
      });
    }
    const report = workflow.migrationReport;
    if (report) {
      notices.push({
        id: "migration-report",
        tone: report.issues.length ? "warn" : "info",
        message:
          `v1 迁移：${report.migratedNodeCount}/${report.inputNodeCount} 节点 · ` +
          `${report.migratedEdgeCount}/${report.inputEdgeCount} 边 · ` +
          `${report.inaccessibleMedia.length} 处媒体问题 · ` +
          `${report.externalTasksRequiringReview.length} 个外部任务待复核`,
        ...(report.issues.length
          ? {
              detail: `迁移保持关闭：${report.issues
                .slice(0, 2)
                .map((issue) => issue.code)
                .join("、")}`,
            }
          : {}),
      });
    }
    return notices;
  }, [workflow.executionDegraded, workflow.migrationReport]);
}
