import {
  parseWebsiteSource,
  serializeWebsiteSource,
} from "../website-source-carrier/website-source-validate";
import {
  WEBSITE_SECTION_KINDS,
  WEBSITE_SOURCE_CONSTANTS,
  WEBSITE_SOURCE_FORMAT,
  type WebsiteSectionKind,
  type WebsiteSource,
  type WebsiteSourcePage,
  type WebsiteSourceSection,
  type WebsiteSourceTheme,
} from "../website-source-carrier/website-source-schema";
import { websiteId } from "./website-puck-map";

export const WEBSITE_BUILD_PREVIEW_OFFLINE_NOTICE =
  "网站预览构建需要联网。离线可以改页面和区块、保存并导出工程，但不能向云端要构建预览。";

export const CLIENT_ACCEPTANCE_TITLE_PREFIX = "[客户端验收]";

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
  const next = title.trim().slice(0, 300);
  return {
    ...source,
    title: next.length >= WEBSITE_SOURCE_CONSTANTS.TITLE_MIN_LENGTH ? next : source.title,
  };
}

export function setWebsiteSectionHeading(
  source: WebsiteSource,
  sectionId: string,
  heading: string,
): WebsiteSource {
  return patchWebsiteSection(source, sectionId, { heading });
}

export function patchWebsiteSection(
  source: WebsiteSource,
  sectionId: string,
  patch: Partial<WebsiteSourceSection>,
): WebsiteSource {
  return {
    ...source,
    sections: source.sections.map((section) =>
      section.id === sectionId ? { ...section, ...patch, id: section.id } : section,
    ),
  };
}

export function setWebsiteTheme(
  source: WebsiteSource,
  patch: Partial<WebsiteSourceTheme>,
): WebsiteSource {
  return { ...source, theme: { ...source.theme, ...patch } };
}

export function copyWebsiteSourceForClientAcceptance(
  source: WebsiteSource,
  label = "网站工程副本",
): WebsiteSource {
  const title = `${CLIENT_ACCEPTANCE_TITLE_PREFIX} ${label}`.slice(0, 300);
  return {
    ...cloneWebsiteSource(source),
    title:
      title.length >= WEBSITE_SOURCE_CONSTANTS.TITLE_MIN_LENGTH
        ? title
        : `${CLIENT_ACCEPTANCE_TITLE_PREFIX} 网站副本`,
  };
}

function usedIds(source: WebsiteSource): Set<string> {
  return new Set([
    ...source.pages.map((page) => page.id),
    ...source.sections.map((section) => section.id),
  ]);
}

function allocateId(prefix: string, used: Set<string>): string {
  const base = websiteId(prefix, "item");
  if (!used.has(base)) {
    used.add(base);
    return base;
  }
  let n = 2;
  while (used.has(`${base}${n}`)) n += 1;
  const id = `${base}${n}`.slice(0, 48);
  used.add(id);
  return id;
}

function defaultSection(
  kind: WebsiteSectionKind,
  id: string,
): WebsiteSourceSection {
  return {
    id,
    kind,
    heading: `${kind} 区块`,
    body: "本地新增的 website-source@1 区块。",
    background: "default",
  };
}

export function addWebsitePage(
  source: WebsiteSource,
  title = "新页面栏目",
): WebsiteSource {
  if (source.pages.length >= WEBSITE_SOURCE_CONSTANTS.C2_PAGE_COUNT_MAX) return source;
  const used = usedIds(source);
  const pageId = allocateId("page", used);
  const kinds: WebsiteSectionKind[] = ["content", "cta", "faq", "footer"];
  const sections = kinds.map((kind) => defaultSection(kind, allocateId(kind.replace(/-/g, ""), used)));
  const page: WebsiteSourcePage = {
    id: pageId,
    path: `/${pageId}`,
    title: title.trim().length >= 4 ? title.trim().slice(0, 160) : "新页面栏目",
    sectionIds: sections.map((section) => section.id),
  };
  return {
    ...source,
    pages: [...source.pages, page],
    sections: [...source.sections, ...sections],
  };
}

export function removeWebsitePage(source: WebsiteSource, pageId: string): WebsiteSource {
  if (source.pages.length <= WEBSITE_SOURCE_CONSTANTS.C1_PAGE_COUNT_MIN) return source;
  const page = source.pages.find((entry) => entry.id === pageId);
  if (!page) return source;
  const remainingPages = source.pages.filter((entry) => entry.id !== pageId);
  const referenced = new Set(remainingPages.flatMap((entry) => entry.sectionIds));
  return {
    ...source,
    pages: remainingPages,
    sections: source.sections.filter((section) => referenced.has(section.id)),
  };
}

export function addWebsiteSection(
  source: WebsiteSource,
  pageId: string,
  kind: WebsiteSectionKind = "content",
): WebsiteSource {
  const page = source.pages.find((entry) => entry.id === pageId);
  if (!page) return source;
  if (page.sectionIds.length >= WEBSITE_SOURCE_CONSTANTS.C6_PAGE_SECTION_IDS_MAX) {
    return source;
  }
  if (source.sections.length >= WEBSITE_SOURCE_CONSTANTS.C4_SECTION_COUNT_MAX) {
    return source;
  }
  const used = usedIds(source);
  const section = defaultSection(kind, allocateId(kind.replace(/-/g, ""), used));
  return {
    ...source,
    sections: [...source.sections, section],
    pages: source.pages.map((entry) =>
      entry.id === pageId
        ? { ...entry, sectionIds: [...entry.sectionIds, section.id] }
        : entry,
    ),
  };
}

export function removeWebsiteSection(
  source: WebsiteSource,
  pageId: string,
  sectionId: string,
): WebsiteSource {
  const page = source.pages.find((entry) => entry.id === pageId);
  if (!page) return source;
  if (page.sectionIds.length <= WEBSITE_SOURCE_CONSTANTS.C5_PAGE_SECTION_IDS_MIN) {
    return source;
  }
  const pageSectionIds = page.sectionIds.filter((id) => id !== sectionId);
  const pages = source.pages.map((entry) =>
    entry.id === pageId ? { ...entry, sectionIds: pageSectionIds } : entry,
  );
  const referenced = new Set(pages.flatMap((entry) => entry.sectionIds));
  return {
    ...source,
    pages,
    sections: source.sections.filter((section) => referenced.has(section.id)),
  };
}

export function reorderWebsiteSections(
  source: WebsiteSource,
  pageId: string,
  sectionIds: string[],
): WebsiteSource {
  const page = source.pages.find((entry) => entry.id === pageId);
  if (!page) return source;
  const allowed = new Set(page.sectionIds);
  const nextIds = sectionIds.filter((id) => allowed.has(id));
  if (nextIds.length !== page.sectionIds.length) return source;
  return {
    ...source,
    pages: source.pages.map((entry) =>
      entry.id === pageId ? { ...entry, sectionIds: nextIds } : entry,
    ),
  };
}

export function exportWebsiteSource(source: WebsiteSource): string {
  return serializeWebsiteSource(source);
}

export function websiteSourceSchema(): string {
  return WEBSITE_SOURCE_FORMAT;
}

export function websitePuckKinds(): readonly WebsiteSectionKind[] {
  return WEBSITE_SECTION_KINDS;
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
