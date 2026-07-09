"use client";

// ============================================================================
// @oceanleo/ui — useConsoleRun：把「一次操作台生成」落成历史记录（单一事实源）
// ----------------------------------------------------------------------------
// doctrine 2026-07-09（操作员截图 de0745ed 的核心修复）。成品站操作台里的生成动作
// （word 生成大纲/生成全文、image 出图、ppt 生成…）过去用前端流式 LLM 直出，**从不
// 落 agent_task**，于是：生成完退出就没了、历史记录里找不到、不能续编。这个 Hook 把
// 每一次这样的生成【持久化成一条 mode="console" 的历史记录】：user 消息记输入 + 操作台
// state 快照，assistant artifact 消息记产物。这样它就和普通 agent 会话一样进历史列表、
// 回看能在右栏库看到产物、站点可据 ops_state 把操作台恢复。
//
// 用法（站点，以 word「生成全文」为例）：
//   const run = useConsoleRun({ siteId: "word", agentId: "word.write" });
//   const genDoc = async () => {
//     const taskId = await run.begin({ prompt: topic, appId, opsState: snapshot() });
//     // …流式生成，边生成边 setState（保留定制 UX + 实时进度）…
//     await run.finish(taskId, {
//       opsState: snapshot(),
//       artifact: { type: "doc", title: topic, format: "markdown", content: fullDocText },
//     });
//   };
//
// 关键点：
//   - begin() 立刻建一条 status="running" 的历史（生成中在历史列表就能看到「进行中」点），
//     返回 task_id。生成失败 → fail(taskId)；成功 → finish(taskId, {artifact,...})。
//   - 未登录（无 token）→ begin() 返回 ""，后续 update/finish 静默 no-op（不阻断生成）。
//   - 产物默认【替换】（replaceArtifacts），使一条运行只保留最新一份大纲/成稿。
// ============================================================================

import { useCallback, useRef } from "react";
import {
  createConsoleRun,
  updateConsoleRun,
  type ConsoleArtifactInput,
} from "../lib/agent";

export interface UseConsoleRunArgs {
  siteId: string;
  /** 绑定的成品引擎 agent（如 word.write）。可空。 */
  agentId?: string;
  /** 关闭持久化（默认开启）。 */
  enabled?: boolean;
}

export interface ConsoleRunBeginArgs {
  /** 历史标题/输入（如文档主题）。 */
  prompt: string;
  /** 当前成品 app id（回看恢复到对的成品）。 */
  appId?: string;
  /** 操作台完整 state 快照（回看据此恢复操作台）。 */
  opsState?: Record<string, unknown>;
  /** 若已有产物可一并带上（否则 finish 时再给）。 */
  artifact?: ConsoleArtifactInput;
}

export interface ConsoleRunFinishArgs {
  opsState?: Record<string, unknown>;
  artifact?: ConsoleArtifactInput;
  /** 追加而非替换产物（默认替换：一条运行只留最新一份）。 */
  append?: boolean;
}

export interface UseConsoleRunReturn {
  /** 开始一次运行：建 status="running" 历史，返回 task_id（未登录返回 ""）。 */
  begin: (args: ConsoleRunBeginArgs) => Promise<string>;
  /** 生成过程中更新产物/快照（可多次，用于分步产出）。 */
  update: (
    taskId: string,
    args: { opsState?: Record<string, unknown>; artifact?: ConsoleArtifactInput; append?: boolean },
  ) => Promise<void>;
  /** 生成成功：写最终产物 + 快照，status="done"。 */
  finish: (taskId: string, args: ConsoleRunFinishArgs) => Promise<void>;
  /** 生成失败：status="failed"（历史里显示失败点）。 */
  fail: (taskId: string) => Promise<void>;
}

export function useConsoleRun({
  siteId,
  agentId,
  enabled = true,
}: UseConsoleRunArgs): UseConsoleRunReturn {
  // 记住已知失效的 taskId（begin 失败过就别再打 update/finish）。
  const deadRef = useRef<Set<string>>(new Set());

  const begin = useCallback(
    async (args: ConsoleRunBeginArgs): Promise<string> => {
      if (!enabled || !siteId) return "";
      const r = await createConsoleRun({
        prompt: args.prompt,
        siteId,
        agentId,
        appId: args.appId,
        opsState: args.opsState,
        artifact: args.artifact,
        status: "running",
      });
      if (r.ok && r.data?.task_id) return r.data.task_id;
      return "";
    },
    [enabled, siteId, agentId],
  );

  const update = useCallback(
    async (
      taskId: string,
      args: { opsState?: Record<string, unknown>; artifact?: ConsoleArtifactInput; append?: boolean },
    ): Promise<void> => {
      if (!enabled || !taskId || deadRef.current.has(taskId)) return;
      const r = await updateConsoleRun(taskId, {
        opsState: args.opsState,
        artifact: args.artifact,
        replaceArtifacts: args.artifact ? !args.append : false,
      });
      if (!r.ok) deadRef.current.add(taskId);
    },
    [enabled],
  );

  const finish = useCallback(
    async (taskId: string, args: ConsoleRunFinishArgs): Promise<void> => {
      if (!enabled || !taskId || deadRef.current.has(taskId)) return;
      await updateConsoleRun(taskId, {
        status: "done",
        opsState: args.opsState,
        artifact: args.artifact,
        replaceArtifacts: args.artifact ? !args.append : false,
      });
    },
    [enabled],
  );

  const fail = useCallback(
    async (taskId: string): Promise<void> => {
      if (!enabled || !taskId || deadRef.current.has(taskId)) return;
      await updateConsoleRun(taskId, { status: "failed" });
    },
    [enabled],
  );

  return { begin, update, finish, fail };
}
