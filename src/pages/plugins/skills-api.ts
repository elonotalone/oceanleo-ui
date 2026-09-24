"use client";

// 「技能」= 用户自己的可复用提示模板，存在 Supabase `public.agent_knowledge`。
// 行级安全只放行 `auth.uid() = user_id` 的行；`user_id` 非空且没有默认值、也没有
// 触发器补，所以插入必须显式带上当前用户 id，否则每一次「添加技能」都会被库拒掉。
// 失败一律回一句可以直接给人看的原因（`SKILLS_NOT_CONFIGURED` 由页面翻译）。

import { browserClient } from "../../lib/auth/client";

export interface Skill {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  created_at: string;
}

export interface RecentTask {
  id: string;
  title: string;
}

/** 本站没接 Supabase（未配置登录服务）时的失败原因。 */
export const SKILLS_NOT_CONFIGURED = "未配置 Supabase";
/** 没登录时的失败原因。 */
export const SKILLS_SIGNED_OUT = "请先登录";

export const OFFICIAL_SKILLS: readonly { name: string; content: string }[] = [
  { name: "研究报告", content: "针对给定主题进行深入的网络研究，输出一份结构化报告，包含：执行摘要、关键发现（带数据与引用来源）、趋势分析、结论与建议。" },
  { name: "幻灯片演示", content: "为给定主题生成一套 10-12 页的专业演示幻灯片，含封面、目录、要点页、数据可视化建议、总结页与讲者备注。" },
  { name: "竞品分析", content: "对给定行业/产品做竞品分析：列出主要竞争者，从功能、定价、定位、优劣势维度对比，输出对比表与差异化机会建议。" },
  { name: "每周总结", content: "汇总过去一周的关键信息/数据，输出一份简洁的每周总结：本周要点、重要进展、待跟进事项、下周计划。" },
  { name: "数据清洗", content: "对提供的数据集进行清洗：识别并处理缺失值与异常值、统一格式、去重、生成数据质量报告，并输出清洗后的结果说明。" },
];

function messageOf(error: unknown): string {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return String(error || "");
}

export async function listSkills(): Promise<Skill[]> {
  const supabase = browserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("agent_knowledge")
    .select("id, name, content, enabled, created_at")
    .order("created_at", { ascending: false });
  return (data as Skill[] | null) || [];
}

/** 成功回 `null`，失败回原因。 */
export async function addSkill(name: string, content: string): Promise<string | null> {
  const supabase = browserClient();
  if (!supabase) return SKILLS_NOT_CONFIGURED;
  const { data: session } = await supabase.auth.getSession();
  const userId = session.session?.user?.id;
  if (!userId) return SKILLS_SIGNED_OUT;
  const { error } = await supabase
    .from("agent_knowledge")
    .insert([{ user_id: userId, name: name.trim(), content: content.trim(), enabled: true }]);
  return error ? messageOf(error) : null;
}

export async function setSkillEnabled(id: string, enabled: boolean): Promise<string | null> {
  const supabase = browserClient();
  if (!supabase) return SKILLS_NOT_CONFIGURED;
  const { error } = await supabase.from("agent_knowledge").update({ enabled }).eq("id", id);
  return error ? messageOf(error) : null;
}

export async function deleteSkill(id: string): Promise<string | null> {
  const supabase = browserClient();
  if (!supabase) return SKILLS_NOT_CONFIGURED;
  const { error } = await supabase.from("agent_knowledge").delete().eq("id", id);
  return error ? messageOf(error) : null;
}

/** 「从过往任务创建」的候选：最近 20 个任务。 */
export async function listRecentTasks(): Promise<RecentTask[]> {
  const supabase = browserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("agent_tasks")
    .select("id, title")
    .order("created_at", { ascending: false })
    .limit(20);
  return ((data as { id: string; title?: string | null }[] | null) || []).map((row) => ({
    id: row.id,
    title: row.title || "",
  }));
}

/** 这个任务里用户说的第一句话，存成技能的提示模板。 */
export async function firstUserPrompt(taskId: string): Promise<string> {
  const supabase = browserClient();
  if (!supabase) return "";
  const { data } = await supabase
    .from("agent_messages")
    .select("content")
    .eq("task_id", taskId)
    .eq("role", "user")
    .order("id", { ascending: true })
    .limit(1);
  const first = (data as { content?: unknown }[] | null)?.[0]?.content;
  return typeof first === "string" ? first : "";
}
