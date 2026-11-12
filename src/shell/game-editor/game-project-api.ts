import { getCurrentArtifactItem } from "../artifact-client";
import type { LibraryItem } from "../library-data";
import { authed } from "../../lib/agent";
import type { ArtifactProjection } from "../artifact-contract";
import { loadGameProject, saveGameProject } from "./game-project-storage";
import { gamePlayUrl, type GameProject } from "./game-project";

export type GameJobPhase = "plan" | "art" | "audio" | "code" | "check" | "moderation" | "done" | "failed";
export interface GameProjectJob { phase: GameJobPhase; progress: number; artifactId?: string; message?: string }
export interface GameProjectApi {
  current(id: string, signal?: AbortSignal): Promise<LibraryItem>;
  load(id: string, signal?: AbortSignal): Promise<GameProject>;
  file(id: string, path: string, signal?: AbortSignal): Promise<string>;
  play(id: string, signal?: AbortSignal): Promise<{ url: string; orientation: string }>;
  save(id: string, revisionId: string, project: GameProject, edits: Record<string, string>, signal?: AbortSignal): Promise<ArtifactProjection>;
  iterate(id: string, revisionId: string, prompt: string, signal?: AbortSignal): Promise<string>;
  job(id: string, signal?: AbortSignal): Promise<GameProjectJob>;
}
async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const result = await authed<T>(`/v1/games${path}`, init);
  if (!result.ok || !result.data) throw new Error(result.error || "游戏请求失败。");
  return result.data;
}
const gamePath = (id: string) => `/${encodeURIComponent(id)}`;
export const gameProjectApi: GameProjectApi = {
  async current(id, signal) {
    const result = await getCurrentArtifactItem(id, signal);
    if (!result.ok || !result.data) throw new Error(result.error || "无法读取游戏新版本。");
    return result.data;
  },
  load: loadGameProject,
  async file(id, path, signal) {
    const project = await loadGameProject(id, signal);
    const content = project.files.find(file => file.path === path)?.content;
    if (content === undefined) throw new Error("无法读取游戏文本文件。");
    return content;
  },
  async play(id, signal) {
    const result = await request<{ url: string; orientation: string }>(`${gamePath(id)}/play`, { signal });
    return { ...result, url: gamePlayUrl(result.url) };
  },
  save: saveGameProject,
  async iterate(id, revisionId, prompt, signal) {
    const result = await request<{ jobId: string }>(`${gamePath(id)}/iterate`, { method: "POST", signal, body: JSON.stringify({ brief: prompt, expectedRevisionId: revisionId }) });
    if (!result.jobId) throw new Error("游戏任务没有创建成功。");
    return result.jobId;
  },
  async job(id, signal) {
    const result = await request<GameProjectJob>(`/jobs/${encodeURIComponent(id)}`, { signal });
    if (!["plan", "art", "audio", "code", "check", "moderation", "done", "failed"].includes(result.phase) ||
        !Number.isFinite(result.progress) || result.progress < 0 || result.progress > 100) throw new Error("游戏任务状态无效。");
    return result;
  },
};
