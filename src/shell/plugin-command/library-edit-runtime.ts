"use client";
import { createTask, getTask, stopTask } from "../../lib/agent";
import { localAgentFailure, taskLocalAgentState, localAgentRunLive } from "../../lib/local-agent-task";
import { createArtifactRevision, getArtifactItem, getCurrentArtifactItem } from "../artifact-client";
import type { LibraryItem } from "../library-data";
import { currentEditorContext } from "./registry";
import { LibraryEditFlow, type EditBinding, type EditPorts } from "./library-edit-flow";

const flows = new Map<string, LibraryEditFlow>();
const bindings = new Map<string, { owner: symbol; binding: EditBinding }>();
const keyFor = (scopeId: string, artifactId: string) => `${scopeId}\u0000${artifactId}`;
function requireData<T>(result: { ok: boolean; data?: T; error?: string; code?: string }): T {
  if (!result.ok || !result.data) throw new Error(result.code === "revision-conflict" ? "revision_conflict" : result.error || "无法载入文件的新版本。");
  return result.data;
}
export function createLibraryEditPorts(siteId = "", sessionId?: string): EditPorts {
  return {
    create: async (prompt, hiddenContext, request) => {
      const result = await createTask({ prompt, hiddenContext, mode: "agent", siteId, sessionId, executionTarget: { kind: "cloud" }, ...request });
      if (!result.ok) {
        const failure = localAgentFailure(result, result.executionTarget?.kind === "device");
        if (failure?.kind === "unconfirmed") return failure.taskId;
        if (failure) throw new Error(failure.text);
      }
      return requireData(result).task_id;
    },
    status: async taskId => {
      const data = requireData(await getTask(taskId));
      const text = data.messages.filter(message => message.role === "assistant" && message.kind === "text").at(-1)?.content || "";
      const conflict = data.messages.some(message => /revision[_-]conflict/.test(message.content));
      const error = data.messages.filter(message => message.kind === "error").at(-1)?.content;
      const local = taskLocalAgentState(data.task);
      const running = localAgentRunLive(local.run) || data.task.open_turn === true || Boolean(data.task.computer_run_status);
      return { status: running ? "running" : data.task.status, note: text.slice(0, 1600), conflict, error };
    },
    stop: async taskId => { requireData(await stopTask(taskId)); },
    head: async artifactId => requireData(await getCurrentArtifactItem(artifactId)),
    restore: async (previous, expectedRevisionId) => {
      // Resolve the previous immutable revision again for fresh owner-authorized locators.
      const item = requireData(await getArtifactItem(previous.artifactId!, previous.revisionId!));
      const artifact = item.artifact;
      const source = artifact?.renditions.source;
      if (!artifact || !source?.digest) throw new Error("无法载入文件的新版本。");
      const renditions = Object.values(artifact.renditions).filter(r => r && ["thumbnail", "preview", "full", "editor_manifest"].includes(r.purpose) && r.digest).map(r => ({ purpose: r!.purpose as "thumbnail" | "preview" | "full" | "editor_manifest", url: r!.url, digest: r!.digest! }));
      return requireData(await createArtifactRevision(previous.artifactId!, {
        expectedRevisionId, artifactType: artifact.artifactType,
        source: { format: artifact.sourceFormat, url: source.url, digest: source.digest }, renditions,
        ...(artifact.scene?.closureDigest ? { scene: { schema: artifact.scene.schema, closureDigest: artifact.scene.closureDigest, dependencyRevisionIds: artifact.scene.dependencyRevisionIds } } : {}),
        provenance: { ...artifact.provenance, restored_revision_id: previous.revisionId, revision_note: "Restored version before AI edit" },
      }));
    },
    schedule: fn => setTimeout(fn, 1800),
  };
}
export function libraryEditFlow(scopeId: string, item: LibraryItem, siteId = "", sessionId?: string): LibraryEditFlow {
  const key = keyFor(scopeId, item.artifactId || item.id);
  let flow = flows.get(key);
  if (!flow) { flow = new LibraryEditFlow(item, createLibraryEditPorts(siteId, sessionId)); flows.set(key, flow); }
  return flow;
}
export function bindLibraryEditor(scopeId: string, artifactId: string, binding: EditBinding): () => void {
  const key = keyFor(scopeId, artifactId), owner = Symbol(key);
  bindings.set(key, { owner, binding });
  flows.get(key)?.bind(binding);
  return () => { if (bindings.get(key)?.owner === owner) bindings.delete(key); };
}
export function currentLibraryEdit(scopeId?: string | null): { flow: LibraryEditFlow; binding: EditBinding } | null {
  const surface = currentEditorContext();
  const target = surface?.target?.();
  if (!surface || !target || (scopeId && target.workspaceScopeId !== scopeId)) return null;
  const registered = bindings.get(keyFor(target.workspaceScopeId, target.artifactId));
  if (!registered) return null;
  return { flow: libraryEditFlow(target.workspaceScopeId, registered.binding.item()), binding: registered.binding };
}
