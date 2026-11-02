import type { OcEditorBridge } from "../PromptHighlightArea";
export interface PreviewReference {
  projectId: string; url: string; x: number; y: number; width: number; height: number;
  text?: string; tag?: string; className?: string; selector?: string; screenshot?: File;
}
export function previewReferenceText(ref: PreviewReference): string {
  return "[Website preview reference]\n" + JSON.stringify({
    project_id: ref.projectId, url: ref.url,
    point: { x: Math.round(ref.x), y: Math.round(ref.y) },
    viewport: { width: Math.round(ref.width), height: Math.round(ref.height) },
    ...(ref.tag ? { tag: ref.tag, text: ref.text?.slice(0, 500), class: ref.className?.slice(0, 300), selector: ref.selector?.slice(0, 300) } : { dom: "unavailable_cross_origin" }),
  }, null, 2);
}
/** Uses the composer's existing paste intake and input handler; never sends a message. */
export function insertPreviewReference(ref: PreviewReference, root: ParentNode = document): boolean {
  const composers = Array.from(root.querySelectorAll<HTMLElement>("[data-oceanleo-leo-entry-root]"));
  const composer = composers.find(node => {
    const input = node.querySelector<HTMLElement & OcEditorBridge>("[data-oc-slot-editor]");
    return !node.closest("[hidden], [inert], [aria-hidden='true']") && node.getClientRects().length > 0
      && input?.__ocSetText && input.__ocGetText && input.getAttribute("contenteditable") !== "false";
  });
  const input = composer?.querySelector<HTMLElement & OcEditorBridge>("[data-oc-slot-editor]");
  if (!composer || !input?.__ocSetText || !input.__ocGetText) return false;
  let paste: ClipboardEvent | undefined;
  if (ref.screenshot) {
    const transfer = new DataTransfer();
    transfer.items.add(ref.screenshot);
    paste = new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer });
  }
  input.__ocSetText(input.__ocGetText() + "\n" + previewReferenceText(ref));
  if (paste) composer.dispatchEvent(paste);
  return true;
}

export const PREVIEW_REFERENCE_TIMEOUT_MS = 8000;
export type PreviewReferenceResult = "inserted" | "timeout" | "unavailable" | "cancelled";

/** Reveal this workbench's conversation, then wait for its editor transaction bridge.
 * Polling also detects bridge installation, which does not mutate the DOM.
 */
export async function insertPreviewReferenceWhenReady(ref: PreviewReference, options: {
  root: () => ParentNode | null;
  openConversation: () => boolean;
  conversationHidden?: boolean;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<PreviewReferenceResult> {
  const { signal } = options;
  const insert = () => {
    const root = options.root();
    return !!root && insertPreviewReference(ref, root);
  };
  if (signal.aborted) return "cancelled";
  if (!options.conversationHidden && insert()) return "inserted";
  if (!options.openConversation()) return "unavailable";
  const deadline = Date.now() + (options.timeoutMs ?? PREVIEW_REFERENCE_TIMEOUT_MS);
  while (!signal.aborted) {
    // Let React reveal/mount the conversation before looking for its input.
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
