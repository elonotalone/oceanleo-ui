"use client";

import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { getArtifactItem } from "../artifact-client";
import type { LibraryItem } from "../library-data";

export interface CreatedWebsite {
  projectId: string;
  artifactId: string;
  artifactRevisionId: string;
  gitCommit: string;
  item: LibraryItem;
}

/** Create a website from the one description the Library asks the user for. */
export async function createWebsiteFromDescription(
  description: string,
  signal?: AbortSignal,
): Promise<CreatedWebsite> {
  const request = String(description || "").trim();
  if (!request) throw new Error("先描述你想做的网站，再开始创建。");
  const token = await accessToken().catch(() => null);
  const response = await fetch(`${GATEWAY_BASE}/v1/website-projects/create-flow`, {
    method: "POST",
    credentials: "include",
    cache: "no-store",
    signal,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ request }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = body && typeof body.detail === "object" ? body.detail : null;
    const message =
      (detail && typeof detail.message === "string" && detail.message) ||
      (typeof body.detail === "string" && body.detail) ||
      "网站创建失败，请稍后重试。";
    throw new Error(message);
  }
  const project = body && typeof body.project === "object" ? body.project : {};
  const artifact = body && typeof body.artifact === "object" ? body.artifact : {};
  const projectId = String(body.project_id || project.project_id || "").trim();
  const artifactId = String(
    body.artifact_id || artifact.artifact_id || artifact.artifactId || "",
  ).trim();
  const artifactRevisionId = String(
    body.artifact_revision_id ||
      artifact.artifact_revision_id ||
      artifact.artifactRevisionId ||
      "",
  ).trim();
  if (!projectId || !artifactId || !artifactRevisionId) {
    throw new Error("网站已创建，但 Library 没收到完整的素材身份，请重试。 ");
  }
  const item = await getArtifactItem(artifactId, artifactRevisionId, signal);
  if (!item.ok || !item.data) {
    throw new Error(item.error || "网站已创建，但打开 Library 素材失败，请重试。");
  }
  return {
    projectId,
    artifactId,
    artifactRevisionId,
    gitCommit: String(body.git_commit || body.initial_commit || "").trim(),
    item: item.data,
  };
}

