import {
  parseWebsiteSource,
  serializeWebsiteSource,
} from "../website-source-carrier/website-source-validate";
import type { WebsiteSource } from "../website-source-carrier/website-source-schema";
import { WEBSITE_SOURCE_FORMAT } from "../website-source-carrier/website-source-schema";

export const WEBSITE_BUILD_PREVIEW_OFFLINE_NOTICE =
  "网站预览构建需要联网。离线可以改页面和区块、保存并导出工程，但不能向云端要构建预览。";

export function cloneWebsiteSource(source: WebsiteSource): WebsiteSource {
  return parseWebsiteSource(serializeWebsiteSource(source));
}

export function createWebsiteSourceHistory(initial: WebsiteSource) {
  let history = [cloneWebsiteSource(initial)];
  let index = 0;
  return {
    current(): WebsiteSource {
      return cloneWebsiteSource(history[index]);
    },
    commit(next: WebsiteSource): WebsiteSource {
      const cloned = cloneWebsiteSource(next);
      history = history.slice(0, index + 1);
      history.push(cloned);
      index = history.length - 1;
      return cloned;
    },
    undo(): WebsiteSource {
      if (index > 0) index -= 1;
      return this.current();
    },
    redo(): WebsiteSource {
      if (index < history.length - 1) index += 1;
      return this.current();
    },
    canUndo(): boolean {
      return index > 0;
    },
    canRedo(): boolean {
      return index < history.length - 1;
    },
  };
}

export function setWebsiteTitle(source: WebsiteSource, title: string): WebsiteSource {
  return { ...source, title };
}

export function setWebsiteSectionHeading(
  source: WebsiteSource,
  sectionId: string,
  heading: string,
): WebsiteSource {
  return {
    ...source,
    sections: source.sections.map((section) =>
      section.id === sectionId ? { ...section, heading } : section,
    ),
  };
}

export function exportWebsiteSource(source: WebsiteSource): string {
  return serializeWebsiteSource(source);
}

export function websiteSourceSchema(): string {
  return WEBSITE_SOURCE_FORMAT;
}

export function cloudBuildPreviewAvailable(online: boolean): {
  available: boolean;
  notice: string;
} {
  if (online) {
    return { available: true, notice: "" };
  }
  return { available: false, notice: WEBSITE_BUILD_PREVIEW_OFFLINE_NOTICE };
}
