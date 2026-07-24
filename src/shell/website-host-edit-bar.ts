import {
  SELECTION_CONTEXT_VERSION,
  type SelectionContext,
} from "./selection-context";

/**
 * Host-owned document selection for website embeds while no preview object is
 * selected. With hostOwnsChrome the iframe hides its local toolbar, so the
 * shared FloatingContextToolbar only mounts when the host has a SelectionContext.
 * Without this fallback, V5 edit-bar-adjacency never sees
 * [data-advanced-context-row]:visible after a real artifact opens in View mode.
 */
export const WEBSITE_HOST_DOCUMENT_SELECTION_ID = "host:website" as const;

export function websiteHostDocumentSelection(
  revision: SelectionContext["revision"] = 0,
): SelectionContext {
  return {
    version: SELECTION_CONTEXT_VERSION,
    kind: "website",
    id: WEBSITE_HOST_DOCUMENT_SELECTION_ID,
    label: "网站",
    revision,
    controls: [
      {
        id: "set-device",
        kind: "select",
        label: "预览设备",
        icon: "pages",
        value: "desktop",
        options: [
          { value: "desktop", label: "桌面" },
          { value: "tablet", label: "平板" },
          { value: "mobile", label: "手机" },
        ],
      },
    ],
  };
}

export function hostedWebsiteEditBarSelection(
  selection: SelectionContext | null | undefined,
): SelectionContext {
  return selection || websiteHostDocumentSelection();
}
