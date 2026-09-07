// 建档意图与「算不算干活」的判定。刻意零依赖：useConsoleRun 等被测模块直接引它，
// 不必把 app-session/agent 网关一起拖进测试替身。

/**
 * 建档意图。`app_sessions` 一行就是用户在「我的任务」里看到的一条任务，因此建行的
 * 权力只交给「已经产生了一份重做要付出代价的产物」的调用方。
 *
 * - `"output"`：本次调用伴随真实产物（AI 产出、用户手工保存的文档、登记的素材）。
 *   允许创建会话。
 * - `"thread"`：用户刚把第一句话发给 agent。允许创建会话，让 task 在服务端一出生就
 *   绑在这条会话上；这一行在服务端记下第一条 AI 回答（`first_output_at`）之前仍是
 *   草稿，「我的任务」看不见它。发出去没回答，就永远只是草稿。
 *   为什么不等第一条回答再建：客户端事后 `bindTask` 只改内存，服务端不会把已建的
 *   task 回绑到后来的会话，结果是会话永远不被盖章、对话也挂不回任务。
 * - `"attach"`（默认）：只想拿到当前会话。没有就返回空，绝不创建。右栏页签、备注、
 *   操作台输入这类「还没产出」的状态走这条路，落到 `agent_console_drafts` 草稿里；
 *   已有会话时只回写快照、不推进 `last_activity_at`。
 */
export type SessionCreateIntent = "output" | "thread" | "attach";

/** 未传视为 `"attach"`：只有明确伴随产物的调用才有权建档。 */
export function isOutputCreateIntent(
  intent?: SessionCreateIntent,
): boolean {
  return intent === "output";
}

/** 哪些意图有权新建 `app_sessions` 行：产物落地，或 agent 线程刚开始。 */
export function canCreateSessionWithIntent(
  intent?: SessionCreateIntent,
): boolean {
  return intent === "output" || intent === "thread";
}

/**
 * 这次保存算不算「在这条任务上干活」。只有伴随产物的保存推进 `last_activity_at`；
 * 切右栏页签、改备注、敲还没发出去的输入都只是回写界面状态，「我的任务」的排序
 * 和时间不得因此变化。
 */
export function snapshotSaveCountsAsActivity(
  intent?: SessionCreateIntent,
): boolean {
  return intent === "output";
}
