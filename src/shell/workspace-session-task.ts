import type { AppSession } from "../lib/app-session";
import { listTasks } from "../lib/agent";

/** undefined 表示查询失败；null 表示查询成功但会话没有持续 Agent thread。 */
export async function findLinkedAgentTaskId(
  session: AppSession,
): Promise<string | null | undefined> {
  if (session.task_id) return session.task_id;
  const result = await listTasks(100, session.site_id);
  if (!result.ok || !result.data) return undefined;
  const task = result.data.items.find(
    (item) => item.session_id === session.id && item.mode !== "console",
  );
  return task?.id ?? null;
}
