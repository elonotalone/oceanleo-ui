import { blankWebsiteSource } from "./blank-website-source";
import { parseWebsiteSource } from "../website-source-carrier/website-source-validate";
import type { WebsiteSource } from "../website-source-carrier/website-source-schema";
import {
  storedEditorProjectUrl,
  unwrapStoredEditorProject,
  type StoredProjectItem,
  type TextLoader,
} from "../advanced-routes/stored-editor-project";

export type WebsiteLocalSourcePlan =
  | { kind: "ready"; source: WebsiteSource }
  | { kind: "blank"; source: WebsiteSource }
  | { kind: "remote"; url: string }
  | { kind: "fail"; error: string };

function parseInlineWebsite(raw: unknown, fallback: string): WebsiteLocalSourcePlan {
  try {
    const source =
      typeof raw === "string"
        ? parseWebsiteSource(raw)
        : parseWebsiteSource(JSON.stringify(raw));
    return { kind: "ready", source };
  } catch (caught) {
    const detail =
      caught instanceof Error && caught.message.trim()
        ? caught.message.trim()
        : fallback;
    return {
      kind: "fail",
      error: `${detail}，未改用空白稿覆盖原件。`,
    };
  }
}

export function parseStoredWebsiteSource(text: string): WebsiteSource {
  const unwrapped = unwrapStoredEditorProject(text);
  if (typeof unwrapped === "string") return parseWebsiteSource(unwrapped);
  return parseWebsiteSource(JSON.stringify(unwrapped));
}

export function planWebsiteLocalSource(
  item: StoredProjectItem & { title?: string },
): WebsiteLocalSourcePlan {
  const raw =
    item.meta && typeof item.meta === "object"
      ? item.meta.websiteSource
      : undefined;
  if (raw && typeof raw === "object") {
    return parseInlineWebsite(raw, "网站工程源无法解析");
  }
  const content = typeof item.content === "string" ? item.content.trim() : "";
  if (content.startsWith("{")) {
    return parseInlineWebsite(content, "网站工程源无法解析");
  }
  const url = storedEditorProjectUrl(item);
  if (url) {
    return { kind: "remote", url };
  }
  if (item.artifactId) {
    return {
      kind: "fail",
      error:
        "这份网站没有可在本地打开的 website-source@1 工程，未改用空白稿覆盖原件。",
    };
  }
  return {
    kind: "blank",
    source: blankWebsiteSource(item.title || "本地可编辑的网站工程"),
  };
}

export async function hydrateWebsiteLocalSource(
  plan: WebsiteLocalSourcePlan,
  loadText: TextLoader,
): Promise<{ ok: true; source: WebsiteSource } | { ok: false; error: string }> {
  if (plan.kind === "ready" || plan.kind === "blank") {
    return { ok: true, source: plan.source };
  }
  if (plan.kind === "fail") {
    return { ok: false, error: plan.error };
  }
  try {
    const text = await loadText(plan.url);
    if (!text || !String(text).trim()) {
      return {
        ok: false,
        error: "远程网站工程为空，未改用空白稿覆盖原件。",
      };
    }
    return { ok: true, source: parseStoredWebsiteSource(text) };
  } catch (caught) {
    const detail =
      caught instanceof Error && caught.message.trim()
        ? caught.message.trim()
        : "远程网站工程无法读取";
    return {
      ok: false,
      error: `${detail}，未改用空白稿覆盖原件。`,
    };
  }
}
