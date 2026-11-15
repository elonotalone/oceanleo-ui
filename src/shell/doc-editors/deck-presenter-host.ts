import type { AdvancedEditorHostValue } from "../advanced-editor-host-context";

/** Resolve at the gesture, so browser resizing/orientation cannot leave a dead popup control. */
export function canOpenDeckPresenterWindow(
  host: AdvancedEditorHostValue,
  view: Pick<Window, "innerWidth" | "document"> | undefined = typeof window === "undefined" ? undefined : window,
): boolean {
  if (view && view.innerWidth > 0 && view.innerWidth < 768) return false;
  if (host.canOpenSecondWindow !== undefined) return host.canOpenSecondWindow;
  // Both the website Library and the phone runtime embed editors. Only the
  // packaged phone runtime mounts this root marker (including in landscape).
  return !(host.embedded && view?.document.querySelector("[data-oceanleo-editor-root]"));
}
