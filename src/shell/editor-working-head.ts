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

/** Save-side locator: backend `_validate_public_wire_url` only accepts this. */
export function publicWireUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const parsed = new URL(value.trim());
    if (parsed.protocol !== "https:") return "";
    if (parsed.username || parsed.password) return "";
    if (parsed.port && parsed.port !== "443") return "";
    return parsed.hostname ? value.trim() : "";
  } catch {
    return "";
  }
}

export function publicWireUrlRefusal(value: unknown): string {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw || raw.startsWith("u/") || publicWireUrl(raw)) return "";
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === "http:") {
      return "上传地址必须是 https，http 地址不能提交新版本。";
    }
    if (parsed.port && parsed.port !== "443") {
      return "上传地址不能带非默认端口。";
    }
    if (parsed.username || parsed.password) {
      return "上传地址不能带账号密码。";
    }
    return "上传地址不是可提交的 https 地址。";
  } catch {
    return "上传地址不是合法网址。";
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
