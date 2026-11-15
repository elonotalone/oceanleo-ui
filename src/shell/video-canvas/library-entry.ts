import { ensureArtifact, getCurrentArtifactItem } from "../artifact-client";
import { uploadFile } from "../../lib/database";
import type { LibraryItem } from "../library-data";
import { renderVideoProjectPreview } from "../workflow-carrier/video-project-preview";
import type { VideoProjectDoc } from "../workflow-carrier/video-project-doc";
import { createVideoProject, VIDEO_PROJECT_SCHEMA, type VideoProject } from "./engine/project-model";

export interface VideoCanvasEntryDependencies {
  current: typeof getCurrentArtifactItem;
  upload: typeof uploadFile;
  ensure: typeof ensureArtifact;
  preview: typeof renderVideoProjectPreview;
}
const dependencies: VideoCanvasEntryDependencies = { current: getCurrentArtifactItem, upload: uploadFile, ensure: ensureArtifact, preview: renderVideoProjectPreview };

/** A site entry always resolves a real Library root before it mounts the editor. */
export async function openLibraryVideoCanvas(artifactId: string, title: string, deps = dependencies, creation?: VideoProject): Promise<LibraryItem> {
  if (artifactId) {
    const existing = await deps.current(artifactId);
    if (!existing.ok || !existing.data) throw new Error(existing.error || "打开失败，请重试");
    if (existing.data.artifactType !== "workflow" || existing.data.artifact?.sourceFormat !== VIDEO_PROJECT_SCHEMA) {
      throw new Error("这个编辑器用不了这类素材");
    }
    return existing.data;
  }
  const project = creation || createVideoProject(title);
  const bytes = JSON.stringify(project);
  const file = new File([bytes], `${project.projectId}.json`, { type: "application/json" });
  const digest = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", await file.arrayBuffer())), byte => byte.toString(16).padStart(2, "0")).join("");
  const resultId = project.projectId;
  const idempotencyKey = `video-canvas:new:${resultId}`;
  const preview = await deps.preview(project as unknown as VideoProjectDoc);
  if (!preview) throw new Error("保存失败，请重试");
  const previewFile = new File([preview], `${project.projectId}.png`, { type: "image/png" });
  async function stage(input: File, role: string) {
    const uploaded = await deps.upload(input, { privateUpload: true, siteId: "video", registerAsset: false, title,
      idempotencyKey: `${idempotencyKey}:${role}` });
    const staged = uploaded.data?.file as unknown as { blob_id?: string; digest?: string } | undefined;
    if (!uploaded.ok || !staged?.blob_id?.startsWith("project-assets:")) throw new Error(uploaded.error || "保存失败，请重试");
    return staged.blob_id;
  }
  const [sourceLocator, previewLocator] = await Promise.all([stage(file, "source"), stage(previewFile, "preview")]);
  const saved = await deps.ensure({ schema: "oceanleo.transient-generation.v1", operation: "upload", resultId,
    idempotencyKey, payloadDigest: digest, artifactType: "workflow", title, renditionUrl: previewLocator, sourceUrl: sourceLocator,
    sourceFormat: VIDEO_PROJECT_SCHEMA, siteId: "video", appId: "canvas-flow", functionId: "canvas-flow",
    provenance: { source: "video-canvas", project_id: project.projectId } });
  if (!saved.ok || !saved.data?.artifactId || !saved.data.revisionId) throw new Error(saved.error || "服务器没有确认这次保存");
  return saved.data;
}
