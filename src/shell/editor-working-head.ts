export interface WorkingHeadItem {
  url?: string;
  previewUrl?: string;
  thumbUrl?: string;
}

function durableHttpUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? value.trim()
      : "";
  } catch {
    return "";
  }
}

export function editorWorkingHeadUrl(
  item: WorkingHeadItem,
  preferredUrl = "",
  projectUrl = "",
): string {
  return (
    durableHttpUrl(preferredUrl) ||
    durableHttpUrl(item.url) ||
    durableHttpUrl(item.previewUrl) ||
    durableHttpUrl(projectUrl)
  );
}

export function savedItemVisualUrls(
  item: WorkingHeadItem,
  input: Pick<WorkingHeadItem, "previewUrl" | "thumbUrl">,
): { previewUrl: string; thumbUrl: string } {
  return {
    previewUrl:
      input.previewUrl || item.previewUrl || item.thumbUrl || "",
    thumbUrl:
      input.thumbUrl ||
      item.thumbUrl ||
      item.previewUrl ||
      input.previewUrl ||
      "",
  };
}
