import type { OcEditorBridge } from "../PromptHighlightArea";

/** The caller supplies its own workbench root; never select another task's composer. */
export function insertInspirationPrompt(prompt: string, root: ParentNode): boolean {
  if (!prompt.trim()) return false;
  const composers = Array.from(root.querySelectorAll<HTMLElement>("[data-oceanleo-leo-entry-root]"));
  for (const composer of composers) {
    const pane = composer.closest("[data-workspace-pane]");
    if (pane && pane.getAttribute("data-workspace-pane") !== "left") continue;
    const input = composer.querySelector<HTMLElement & OcEditorBridge>("[data-oc-slot-editor]");
    if (composer.closest("[hidden], [inert], [aria-hidden='true']") || !composer.getClientRects().length ||
        input?.getAttribute("contenteditable") === "false" || !input?.__ocSetText || !input.__ocGetText) continue;
    input.__ocSetText(prompt);
    input.focus();
    return true;
  }
  return false;
}

export type InspirationFillResult = "inserted" | "timeout" | "unavailable" | "cancelled";
export async function fillInspirationWhenReady(prompt: string, options: {
  root: () => ParentNode | null;
  openConversation: () => boolean;
  conversationHidden?: boolean;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<InspirationFillResult> {
  const { signal } = options;
  const insert = () => { const root = options.root(); return !!root && insertInspirationPrompt(prompt, root); };
  if (signal.aborted) return "cancelled";
  if (!options.conversationHidden && insert()) return "inserted";
  if (!options.openConversation()) return "unavailable";
  const deadline = Date.now() + (options.timeoutMs ?? 8000);
  while (!signal.aborted) {
    await new Promise<void>(resolve => {
      const finish = () => { clearTimeout(timer); signal.removeEventListener("abort", finish); resolve(); };
      const timer = setTimeout(finish, Math.min(50, Math.max(0, deadline - Date.now())));
      signal.addEventListener("abort", finish, { once: true });
    });
    if (signal.aborted) return "cancelled";
    if (insert()) return "inserted";
    if (Date.now() >= deadline) return "timeout";
  }
  return "cancelled";
}
