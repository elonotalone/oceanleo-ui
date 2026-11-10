"use client";

import { accessToken } from "../lib/auth/client";
import { gatewayBase } from "../lib/auth/config";
import { isDurableLibraryItem, type LibraryItem } from "./library-data";
import { linkWorkFromLibraryItem, linkWorkLibraryItem, normalizeLinkWork } from "./works/link-work-item";

export interface LibraryProject { id: string; name: string }
export interface LibraryProjectMembership { kind: "artifact" | "work"; id: string; projects: LibraryProject[] }
export function libraryReference(item: LibraryItem): { kind: "artifact" | "work"; id: string } | null {
  const work = linkWorkFromLibraryItem(item);
  if (work) return { kind: "work", id: work.id };
  return isDurableLibraryItem(item) ? { kind: "artifact", id: item.artifactId } : null;
}
export function projectNames(item: LibraryItem): string[] {
  const projects = item.meta.library_projects;
  return Array.isArray(projects) ? projects.flatMap(p => typeof p?.name === "string" ? [p.name] : []) : [];
}
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await accessToken();
  const response = await fetch(`${gatewayBase()}${path}`, {
    ...init, cache: "no-store", credentials: "include",
    headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error("项目更新失败，请重试。");
  return response.status === 204 ? {} as T : await response.json() as T;
}
export async function loadProjectMemberships(signal?: AbortSignal): Promise<LibraryProjectMembership[]> {
  const result = await request<{ items?: LibraryProjectMembership[] }>("/v1/library/project-memberships", { signal });
  return Array.isArray(result.items) ? result.items : [];
}
export async function loadEditableProjects(signal?: AbortSignal): Promise<LibraryProject[]> {
  const result = await request<{ items?: (LibraryProject & { role: string })[] }>("/v1/projects", { signal });
  return (Array.isArray(result.items) ? result.items : []).filter(p => ["owner", "edit", "editor"].includes(p.role));
}
export async function addProjectLibraryReference(projectId: string, kind: "artifact" | "work", id: string): Promise<void> {
  await request(`/v1/projects/${encodeURIComponent(projectId)}/library-items`, { method: "POST", body: JSON.stringify({ kind, id }) });
}
export async function removeProjectLibraryReference(projectId: string, kind: "artifact" | "work", id: string): Promise<void> {
  await request(`/v1/projects/${encodeURIComponent(projectId)}/library-items/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
}
export async function loadLinkWorkItem(id: string, signal?: AbortSignal): Promise<LibraryItem | null> {
  const result = await request<{ work?: unknown }>(`/v1/works/${encodeURIComponent(id)}`, { signal });
  const work = normalizeLinkWork(result.work);
  return work ? linkWorkLibraryItem(work) : null;
}
