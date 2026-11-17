"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { useUI } from "../../i18n/ui/useUI";
import { useOptionalWorkspaceSession } from "../workspace-session-context";
import type { LibraryItem } from "../library-data";
import { currentEditorContext, subscribeEditorContext } from "./registry";
import { currentLibraryEdit, libraryDetailBinding, libraryEditFlow } from "./library-edit-runtime";
import { editIsLocked, type LibraryEditFlow, type EditBinding } from "./library-edit-flow";
import { LibraryEditStatus, useLibraryEditReload } from "./use-library-edit";

function EditStatus({ flow }: { flow: LibraryEditFlow }) {
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  return <LibraryEditStatus flow={flow} state={state} />;
}
export function ActiveLibraryEditStatus() {
  const workspace = useOptionalWorkspaceSession();
  useSyncExternalStore(subscribeEditorContext, currentEditorContext, () => null);
  const active = currentLibraryEdit(workspace?.activeFileScopeId);
  return active ? <EditStatus flow={active.flow} /> : null;
}
function EditForm({ flow, binding, onTask }: { flow: LibraryEditFlow; binding: EditBinding; onTask?: (taskId: string) => void }) {
  const tt = useUI();
  const [prompt, setPrompt] = useState("");
  useEffect(() => { flow.bind(binding); }, [flow, binding]);
  const state = useSyncExternalStore(flow.subscribe, flow.getSnapshot, flow.getSnapshot);
  return <div data-library-ai-entry className="flex min-h-0 flex-1 flex-col gap-3 p-3">
    <LibraryEditStatus flow={flow} state={state} />
    <form className="mt-auto flex flex-col gap-2" onSubmit={event => { event.preventDefault(); void flow.start(prompt, binding).then(taskId => { if (taskId) { setPrompt(""); onTask?.(taskId); } }); }}>
      <label className="text-sm">{tt("描述你希望 AI 修改的内容")}
        <textarea className="mt-2 min-h-24 w-full rounded border border-[var(--border)] bg-transparent p-2" value={prompt} onChange={event => setPrompt(event.target.value)} disabled={editIsLocked(state.phase)} />
      </label>
      <button type="submit" className="rounded border border-[var(--border)] px-3 py-2 text-sm" disabled={!prompt.trim() || editIsLocked(state.phase)}>{tt("让 AI 修改")}</button>
    </form>
  </div>;
}
export function EditorLibraryEditEntry({ editorId, onTask }: { editorId: string; onTask?: (taskId: string) => void }) {
  const tt = useUI();
  const workspace = useOptionalWorkspaceSession();
  useSyncExternalStore(subscribeEditorContext, currentEditorContext, () => null);
  const active = currentLibraryEdit(workspace?.activeFileScopeId);
  if (!active || currentEditorContext()?.editorId !== editorId) return <p role="status" className="p-3 text-sm">{tt("请先打开我的库中的文件。")}</p>;
  return <EditForm flow={active.flow} binding={active.binding} onTask={onTask} />;
}
/** Library detail uses the very same flow without mounting a native editor. */
export function LibraryDetailEditEntry({ item, onRevision }: { item: LibraryItem; onRevision?: (item: LibraryItem) => void }) {
  const tt = useUI();
  const workspace = useOptionalWorkspaceSession();
  const [open, setOpen] = useState(false);
  useLibraryEditReload(item, next => onRevision?.(next));
  const active = currentLibraryEdit(workspace?.activeFileScopeId);
  const matching = active && active.binding.item().artifactId === item.artifactId ? active : null;
  const binding = matching?.binding || libraryDetailBinding(item);
  const flow = matching?.flow || libraryEditFlow(workspace?.activeFileScopeId || "standalone", item, item.siteId || "", workspace?.sessionId || undefined);
  return <div className="shrink-0 border-b border-[var(--border)] p-2">
    <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>{tt("让 AI 修改")}</button>
    {open && <EditForm flow={flow} binding={binding} />}
  </div>;
}
