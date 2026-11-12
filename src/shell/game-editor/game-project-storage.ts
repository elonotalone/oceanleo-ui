import { createArtifactRevision, getCurrentArtifactItem, stageArtifactBlob } from "../artifact-client";
import { fetchMediaBlob } from "../../lib/media-proxy";
import { gameProjectEdits, readGameProject, type GameProject } from "./game-project";

export async function loadGameProject(id: string, signal?: AbortSignal): Promise<GameProject> {
  const result = await getCurrentArtifactItem(id, signal);
  if (!result.ok || !result.data) throw new Error(result.error || "无法读取游戏工程。");
  const artifact = result.data.artifact;
  if (!artifact) throw new Error("这个游戏没有可读取的作品版本。");
  const source = artifact.renditions.source || artifact.renditions.full;
  if (!source?.url) throw new Error("这个游戏没有可读取的工程文件。");
  const blob = await fetchMediaBlob(source.url, { signal, cache: "no-store", maxBytes: 85 * 1024 * 1024 });
  return { ...readGameProject(JSON.parse(await blob.text())), loadedRevisionId: artifact.revisionId };
}

/** Rehash edited files and keep every unchanged binary asset in the closure. */
export async function serializeGameProject(project: GameProject, edits: Record<string, string>): Promise<string> {
  const changed = new Map(gameProjectEdits(project, edits).map(file => [file.path, file.content]));
  const blobs: Record<string, string> = {};
  const files = [];
  for (const file of project.files) {
    const content = changed.get(file.path) ?? file.content;
    let sha256 = file.sha256;
    let byteSize = file.byteSize;
    let encoded = project.blobs?.[sha256];
    if (content !== undefined) {
      const bytes = new TextEncoder().encode(content);
      byteSize = bytes.length;
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      sha256 = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
      let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      encoded = btoa(binary);
    }
    if (encoded === undefined) throw new Error(`游戏素材缺失：${file.path}`);
    blobs[sha256] = encoded;
    files.push({ path: file.path, sha256, byteSize, mediaType: file.mediaType });
  }
  return JSON.stringify({ schema: project.schema, title: project.title, entrypoint: project.entrypoint,
    orientation: project.orientation, controls: project.controls, files, blobs });
}

export async function saveGameProject(id: string, revisionId: string, project: GameProject,
  edits: Record<string, string>, signal?: AbortSignal) {
  const result = await getCurrentArtifactItem(id, signal);
  if (!result.ok || !result.data?.artifact) throw new Error(result.error || "无法读取游戏版本。");
  const artifact = result.data.artifact;
  if (artifact.revisionId !== revisionId) throw new Error("游戏已有新版本，请先保留修改并重新打开。");
  if (!artifact.access.canEdit) throw new Error("当前游戏不能修改。");
  const cover = artifact.renditions.preview;
  if (!cover?.url || !cover.digest) throw new Error("这个游戏缺少封面，暂时无法保存。");
  const json = await serializeGameProject(project, edits);
  signal?.throwIfAborted();
  const staged = await stageArtifactBlob(id, new File([json], "game-project.json", { type: "application/json" }));
  if (!staged.ok || !staged.data) throw new Error(staged.error || "游戏文件暂存失败。");
  signal?.throwIfAborted();
  const manifest = JSON.stringify({ schema: "game-project@1", title: project.title, entrypoint: project.entrypoint,
    orientation: project.orientation, controls: project.controls, editor: "game-editor", coverStale: true });
  const stagedManifest = await stageArtifactBlob(id, new File([manifest], "game-editor.json", { type: "application/json" }));
  if (!stagedManifest.ok || !stagedManifest.data) throw new Error(stagedManifest.error || "游戏清单暂存失败。");
  signal?.throwIfAborted();
  const saved = await createArtifactRevision(id, {
    expectedRevisionId: revisionId, artifactType: "game",
    source: { format: "game-project@1", blobId: staged.data.blobId, digest: staged.data.digest },
    renditions: [
      { purpose: "full", blobId: staged.data.blobId, digest: staged.data.digest },
      { purpose: "preview", url: cover.url, digest: cover.digest },
      { purpose: "editor_manifest", blobId: stagedManifest.data.blobId, digest: stagedManifest.data.digest },
    ],
    provenance: { origin: "remix", editor: "game-editor", editorProjectSchema: "game-project@1", previousRevisionId: revisionId },
    metadata: { cover_stale: true },
  });
  if (!saved.ok || !saved.data?.artifact) throw new Error(saved.error || "游戏保存没有返回新版本。");
  return saved.data.artifact;
}
