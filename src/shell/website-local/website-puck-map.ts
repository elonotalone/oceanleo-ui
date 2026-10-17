import {
  WEBSITE_SECTION_KINDS,
  type WebsiteSectionKind,
  type WebsiteSource,
  type WebsiteSourceAction,
  type WebsiteSourceSection,
  type WebsiteSourceSectionItem,
} from "../website-source-carrier/website-source-schema";

const KIND_SET = new Set<string>(WEBSITE_SECTION_KINDS);

export interface WebsitePuckItem {
  type: WebsiteSectionKind;
  props: {
    id: string;
    heading: string;
    subheading: string;
    body: string;
    decorative: string;
    background: string;
    items: WebsiteSourceSectionItem[];
    actions: Array<{ label: string; href: string; variant?: string }>;
  };
}

export interface WebsitePuckData {
  root: { props: { title: string } };
  content: WebsitePuckItem[];
}

export type PuckLikeData = {
  root?: { props?: { title?: string } };
  content?: Array<{
    type?: string;
    props?: {
      id?: string;
      heading?: string;
      subheading?: string;
      body?: string;
      decorative?: string | boolean;
      background?: string;
      items?: WebsiteSourceSectionItem[];
      actions?: Array<{ label?: string; href?: string; variant?: string }>;
    };
  }>;
};

function isSectionKind(value: string): value is WebsiteSectionKind {
  return KIND_SET.has(value);
}

export function websiteId(raw: string, fallback: string): string {
  const cleaned = String(raw || "")
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "")
    .replace(/^[^a-z]+/, "")
    .slice(0, 48);
  if (/^[a-z][a-z0-9_-]{0,47}$/.test(cleaned)) return cleaned;
  return fallback;
}

function pageOf(source: WebsiteSource, pageId?: string) {
  return source.pages.find((page) => page.id === pageId) || source.pages[0];
}

export function websiteSourceToPuck(
  source: WebsiteSource,
  pageId?: string,
): WebsitePuckData {
  const byId = new Map(source.sections.map((section) => [section.id, section]));
  const page = pageOf(source, pageId);
  const ordered = (page?.sectionIds || source.sections.map((section) => section.id))
    .map((id) => byId.get(id))
    .filter((section): section is WebsiteSourceSection => Boolean(section));
  return {
    root: { props: { title: source.title } },
    content: ordered.map((section) => ({
      type: section.kind,
      props: {
        id: section.id,
        heading: section.heading || "",
        subheading: section.subheading || "",
        body: section.body || "",
        decorative: section.decorative ? "yes" : "no",
        background: section.background || "default",
        items: (section.items || []).map((item) => ({ ...item })),
        actions: (section.actions || []).map((action) => ({ ...action })),
      },
    })),
  };
}

function asBackground(value: unknown): WebsiteSourceSection["background"] {
  if (value === "surface" || value === "accent" || value === "default") return value;
  return "default";
}

function asActions(value: unknown): WebsiteSourceAction[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const actions = value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as { label?: string; href?: string; variant?: string };
      const label = String(record.label || "").trim();
      const href = String(record.href || "").trim();
      if (!label || !href) return null;
      const variant =
        record.variant === "secondary" || record.variant === "ghost"
          ? record.variant
          : record.variant === "primary"
            ? "primary"
            : undefined;
      return {
        label: label.slice(0, 40),
        href: href.slice(0, 500),
        ...(variant ? { variant } : {}),
      };
    })
    .filter((entry): entry is WebsiteSourceAction => Boolean(entry));
  return actions.length ? actions.slice(0, 3) : undefined;
}

function asItems(value: unknown): WebsiteSourceSectionItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items: WebsiteSourceSectionItem[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as WebsiteSourceSectionItem;
    const item: WebsiteSourceSectionItem = {
      ...(record.title ? { title: String(record.title).slice(0, 160) } : {}),
      ...(record.text ? { text: String(record.text).slice(0, 800) } : {}),
      ...(record.icon ? { icon: String(record.icon).slice(0, 64) } : {}),
      ...(record.assetId ? { assetId: String(record.assetId).slice(0, 64) } : {}),
      ...(record.alt ? { alt: String(record.alt).slice(0, 300) } : {}),
      ...(record.value ? { value: String(record.value).slice(0, 40) } : {}),
      ...(record.href ? { href: String(record.href).slice(0, 500) } : {}),
    };
    if (Object.keys(item).length > 0) items.push(item);
  }
  return items.length ? items.slice(0, 24) : undefined;
}

export function puckToWebsiteSource(
  data: PuckLikeData,
  base: WebsiteSource,
  pageId?: string,
): WebsiteSource {
  const page = pageOf(base, pageId);
  if (!page) return base;
  const byId = new Map(base.sections.map((section) => [section.id, section]));
  const used = new Set(base.sections.map((section) => section.id));
  const content = data.content || [];
  if (!content.length) {
    return {
      ...base,
      title: data.root?.props?.title || base.title,
    };
  }
  const nextForPage: WebsiteSourceSection[] = content.map((item, index) => {
    const rawId = item.props?.id || "";
    const fallback = websiteId(`${page.id}s${index + 1}`, `s${index + 1}`);
    let id = websiteId(rawId, fallback);
    if (used.has(id) && byId.get(id) && id !== rawId) {
      id = fallback;
    }
    while (used.has(id) && id !== rawId) {
      id = websiteId(`${id}x`, `s${index + 1}x`);
    }
    used.add(id);
    const previous = byId.get(rawId) || byId.get(id);
    const kind = isSectionKind(String(item.type || ""))
      ? (item.type as WebsiteSectionKind)
      : previous?.kind || "content";
    const decorative =
      item.props?.decorative === "yes" || item.props?.decorative === true;
    return {
      ...(previous || { id, kind }),
      id,
      kind,
      heading: item.props?.heading,
      subheading: item.props?.subheading,
      body: item.props?.body,
      decorative,
      background: asBackground(item.props?.background),
      items: asItems(item.props?.items),
      actions: asActions(item.props?.actions),
    };
  });
  const pageSectionIds = nextForPage.map((section) => section.id);
  const referenced = new Set(
    base.pages.flatMap((entry) =>
      entry.id === page.id ? pageSectionIds : entry.sectionIds,
    ),
  );
  const kept = base.sections.filter(
    (section) => referenced.has(section.id) && !pageSectionIds.includes(section.id),
  );
  return {
    ...base,
    title: data.root?.props?.title || base.title,
    sections: [...kept, ...nextForPage],
    pages: base.pages.map((entry) =>
      entry.id === page.id ? { ...entry, sectionIds: pageSectionIds } : entry,
    ),
  };
}
