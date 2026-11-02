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
  const composer = composers.find(node => !node.closest("[hidden], [inert], [aria-hidden='true']") && node.getClientRects().length > 0);
  const input = composer?.querySelector<HTMLElement & OcEditorBridge>("[data-oc-slot-editor]");
  if (!composer || !input?.__ocSetText || !input.__ocGetText) return false;
  input.__ocSetText(input.__ocGetText() + "\n" + previewReferenceText(ref));
  if (ref.screenshot) {
    const transfer = new DataTransfer();
    transfer.items.add(ref.screenshot);
    composer.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: transfer }));
  }
  return true;
}
