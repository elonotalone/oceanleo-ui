// LeoBay「我的库」挑作品的数据源（W04）：列出我自己的任务。附带作品存的就是 agent 任务 id，
// 任务所在站与标题以服务端核对补全的为准，这里给的只用于列表展示。

import { listTasks } from "../agent";
import { BayApiError } from "./http";
import type { BayWorkRef } from "./types";

export interface BayLibraryWork {
  kind: "task";
  id: string;
  site_key: string;
  title: string;
  status: string;
  created_at: string | null;
}

export async function listLibraryWorks(options: { limit?: number } = {}): Promise<BayLibraryWork[]> {
  const limit = Math.min(Math.max(Math.trunc(options.limit ?? 60), 1), 100);
  // 只列调用者自己的任务（网关按 user_id 过滤）；放进项目里的也算。
  const result = await listTasks(limit, undefined, false, "all", "all");
  if (!result.ok) {
    throw new BayApiError(result.error || "没能读到你的作品，请稍后再试。", result.status ?? 0);
  }
  const works: BayLibraryWork[] = [];
  for (const task of result.data?.items || []) {
    const id = typeof task?.id === "string" ? task.id.trim() : "";
    if (!id) continue;
    works.push({
      kind: "task",
      id,
      site_key: (task.site_id || "").trim().toLowerCase() || "oceanleo",
      title: (task.title || "").trim(),
      status: String(task.status || ""),
      created_at: task.updated_at || task.created_at || null,
    });
  }
  return works;
}

export function filterLibraryWorks(works: readonly BayLibraryWork[], query: string): BayLibraryWork[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return [...works];
  return works.filter((work) => work.title.toLowerCase().includes(needle) || work.site_key.includes(needle));
}

export function libraryWorkRef(work: BayLibraryWork): BayWorkRef {
  return { kind: "task", id: work.id, site_key: work.site_key, title: work.title };
}
