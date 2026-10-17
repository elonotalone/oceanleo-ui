import type { WebsiteSource, WebsiteSourceSection } from "../website-source-carrier/website-source-schema";

export interface WebsitePuckItem {
  type: string;
  props: {
    id: string;
    kind: WebsiteSourceSection["kind"];
    heading: string;
    subheading: string;
    body: string;
  };
}

export interface WebsitePuckData {
  root: { props: { title: string } };
  content: WebsitePuckItem[];
}

export function websiteSourceToPuck(source: WebsiteSource): WebsitePuckData {
  const byId = new Map(source.sections.map((section) => [section.id, section]));
  const page = source.pages[0];
  const ordered = (page?.sectionIds || source.sections.map((section) => section.id))
    .map((id) => byId.get(id))
    .filter((section): section is WebsiteSourceSection => Boolean(section));
  return {
    root: { props: { title: source.title } },
    content: ordered.map((section) => ({
      type: puckTypeForKind(section.kind),
      props: {
        id: section.id,
        kind: section.kind,
        heading: section.heading || "",
        subheading: section.subheading || "",
        body: section.body || "",
      },
    })),
  };
}

export function puckToWebsiteSource(
  data: WebsitePuckData,
  base: WebsiteSource,
): WebsiteSource {
  const byId = new Map(base.sections.map((section) => [section.id, section]));
  const sections = data.content.map((item) => {
    const previous = byId.get(item.props.id);
    return {
      ...(previous || {
        id: item.props.id,
        kind: item.props.kind,
      }),
      heading: item.props.heading,
      subheading: item.props.subheading,
      body: item.props.body,
    };
  });
  const sectionIds = sections.map((section) => section.id);
  const pages = base.pages.map((page, index) =>
    index === 0 ? { ...page, sectionIds } : page,
  );
  return {
    ...base,
    title: data.root.props.title || base.title,
    sections,
    pages,
  };
}

export function puckTypeForKind(kind: WebsiteSourceSection["kind"]): string {
  if (kind === "hero") return "Hero";
  if (kind === "feature-grid") return "FeatureGrid";
  if (kind === "footer") return "Footer";
  return "Section";
}
