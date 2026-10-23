/**
 * Site sections ⇄ Puck data (W14). Pure; the Puck config lives in
 * `website-site-puck.tsx`.
 */
import type { Data } from "@puckeditor/core";
import type { SiteDoc, SiteRow, SiteSection } from "./website-site-doc";

export const SITE_STYLE_PROP = "sectionStyle";
export const SITE_PUCK_RESERVED: ReadonlySet<string> = new Set(["id", SITE_STYLE_PROP, "puck", "editMode"]);
const RESERVED = SITE_PUCK_RESERVED;

function isRow(value: unknown): value is SiteRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string");
}

function allSections(doc: SiteDoc): SiteSection[] {
  return doc.pages.flatMap((page) => page.sections);
}

/** Section content → Puck props (string lists become `{ text }` rows: Puck lists hold objects). */
export function siteSectionToPuckProps(section: SiteSection): SiteRow {
  const props: SiteRow = { id: section.id };
  for (const [key, value] of Object.entries(section.content || {})) {
    if (RESERVED.has(key)) continue;
    props[key] = isStringList(value) ? value.map((text) => ({ text })) : value;
  }
  props[SITE_STYLE_PROP] = isRow(section.style) ? { ...section.style } : {};
  return props;
}

export function siteSectionsToPuck(sections: SiteSection[]): Data {
  return {
    root: { props: {} },
    content: sections.map((section) => ({
      type: section.type,
      props: siteSectionToPuckProps(section) as { id: string },
    })),
  } as Data;
}

/**
 * Puck data → page sections. Unknown section keys, list shapes and anything
 * Puck does not edit come back from the previous section with the same id.
 */
export function puckToSiteSections(data: Partial<Data>, base: SiteSection[], doc: SiteDoc): SiteSection[] {
  const byId = new Map(base.map((section) => [section.id, section]));
  const byType = new Map<string, SiteSection>();
  for (const section of allSections(doc)) if (!byType.has(section.type)) byType.set(section.type, section);
  return (data.content || []).map((item, index) => {
    const props = (item.props || {}) as SiteRow;
    const id = String(props.id || `${item.type}-${index + 1}`);
    const previous = byId.get(id);
    const template = previous || byType.get(String(item.type));
    const content: SiteRow = {};
    for (const [key, value] of Object.entries(props)) {
      if (RESERVED.has(key)) continue;
      const was = template?.content?.[key];
      content[key] =
        isStringList(was) && Array.isArray(value)
          ? value.map((row) => (isRow(row) ? String(row.text ?? "") : String(row ?? "")))
          : value;
    }
    const style = isRow(props[SITE_STYLE_PROP]) ? (props[SITE_STYLE_PROP] as SiteRow) : previous?.style;
    return {
      ...(previous || {}),
      id,
      type: String(item.type || previous?.type || "content"),
      content,
      ...(style ? { style } : {}),
    } as SiteSection;
  });
}
