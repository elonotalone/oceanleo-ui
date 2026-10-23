/**
 * Site document model for the website editor (W14, 2026-10-23 editor overhaul).
 *
 * Almost every stored website (1,828 revisions on 10-23) is a `website-source@1`
 * **site bundle**: the entry JSON is a file manifest
 * `{ schema, entrypoint: "index.html", files: [{ path, sha256, byteSize, mediaType }] }`
 * and the content lives in the closure file `site.json`, which the bundled
 * `assets/app.js` renders (`pages[i].sections[]`, each `{ id, type, content, style }`).
 * The backend materializer also accepts that same site document directly as the
 * entry JSON ("structured" source, rendered by its generated site).
 *
 * This module is pure data: detect the two shapes, read/write fields, and apply
 * the section operations the unified edit bar exposes. Nothing here touches the
 * network or React.
 */

export type SiteRow = Record<string, unknown>;

export interface SiteSection extends SiteRow {
  id: string;
  type: string;
  content: SiteRow;
  style?: SiteRow;
}

export interface SitePage extends SiteRow {
  sections: SiteSection[];
}

export interface SiteDoc extends SiteRow {
  pages: SitePage[];
}

export interface SiteBundleFile extends SiteRow {
  path: string;
  sha256?: string;
  byteSize?: number;
  mediaType?: string;
}

export interface SiteBundleManifest extends SiteRow {
  schema?: string;
  entrypoint: string;
  files: SiteBundleFile[];
}

/** Where the editable site document lives in this revision. */
export type SiteEnvelope =
  | { kind: "bundle"; manifest: SiteBundleManifest; sitePath: string }
  | { kind: "structured"; entry: SiteRow };

export const SITE_DOC_PATH = "site.json";
export const SITE_SECTION_ALIGNMENTS = ["left", "center"] as const;
export type SiteSectionPathPart = string | number;
export type SiteArrange = "front" | "forward" | "backward" | "back";

function isRow(value: unknown): value is SiteRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSection(value: unknown): value is SiteSection {
  return (
    isRow(value) &&
    typeof value.id === "string" &&
    typeof value.type === "string" &&
    isRow(value.content)
  );
}

/** Entry JSON that is a site bundle manifest naming a `site.json`. */
export function isSiteBundleManifest(value: unknown): value is SiteBundleManifest {
  if (!isRow(value) || !Array.isArray(value.files)) return false;
  if (typeof value.entrypoint !== "string" || !value.entrypoint.trim()) return false;
  return value.files.some(
    (file) => isRow(file) && file.path === SITE_DOC_PATH,
  );
}

/**
 * A site document: `pages[]` each carrying `sections[]` of `{id,type,content}`.
 * The strict carrier (`pages[].sectionIds` + `theme`) is a different model and
 * is NOT a site document.
 */
export function isSiteDoc(value: unknown): value is SiteDoc {
  if (!isRow(value) || !Array.isArray(value.pages) || !value.pages.length) return false;
  return value.pages.every(
    (page) =>
      isRow(page) &&
      Array.isArray(page.sections) &&
      page.sections.every(isSection),
  );
}

export function parseSiteDoc(text: string): SiteDoc {
  const value = JSON.parse(text) as unknown;
  if (!isSiteDoc(value)) {
    throw new Error("site.json 不是可编辑的网站内容（缺少 pages[].sections）。");
  }
  return value;
}

/** Classify an entry JSON text. `null` = neither shape (caller keeps its own path). */
export function siteEnvelopeOf(entryText: string): SiteEnvelope | null {
  let value: unknown;
  try {
    value = JSON.parse(entryText);
  } catch {
    return null;
  }
  if (isSiteBundleManifest(value)) {
    return { kind: "bundle", manifest: value, sitePath: SITE_DOC_PATH };
  }
  if (isSiteDoc(value)) return { kind: "structured", entry: value };
  return null;
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

export function pageSections(doc: SiteDoc, pageIndex: number): SiteSection[] {
  return doc.pages[pageIndex]?.sections || [];
}

export function findSection(
  doc: SiteDoc,
  pageIndex: number,
  sectionId: string,
): SiteSection | null {
  return pageSections(doc, pageIndex).find((section) => section.id === sectionId) || null;
}

/**
 * Write the page's section list. Top-level `sections` (a mirror of the first
 * page in generated templates) follows when it mirrored this page before the
 * edit; otherwise only matching ids get the new content.
 */
export function replacePageSections(
  doc: SiteDoc,
  pageIndex: number,
  sections: SiteSection[],
): SiteDoc {
  const page = doc.pages[pageIndex];
  if (!page) return doc;
  const previousIds = page.sections.map((section) => section.id).join("\u0000");
  const pages = doc.pages.map((entry, index) =>
    index === pageIndex ? { ...entry, sections } : entry,
  );
  const next: SiteDoc = { ...doc, pages };
  if (Array.isArray(doc.sections)) {
    const top = doc.sections as SiteSection[];
    const mirrored =
      top.length > 0 &&
      top.map((section) => (isRow(section) ? section.id : "")).join("\u0000") === previousIds;
    if (mirrored) {
      next.sections = clone(sections);
    } else {
      const byId = new Map(sections.map((section) => [section.id, section]));
      next.sections = top.map((section) =>
        isRow(section) && byId.has(section.id as string)
          ? clone(byId.get(section.id as string)!)
          : section,
      );
    }
  }
  return next;
}

function updateSection(
  doc: SiteDoc,
  pageIndex: number,
  sectionId: string,
  update: (section: SiteSection) => SiteSection,
): SiteDoc {
  const sections = pageSections(doc, pageIndex);
  if (!sections.some((section) => section.id === sectionId)) return doc;
  return replacePageSections(
    doc,
    pageIndex,
    sections.map((section) => (section.id === sectionId ? update(section) : section)),
  );
}

export function readPath(root: unknown, path: readonly SiteSectionPathPart[]): unknown {
  let cursor: unknown = root;
  for (const part of path) {
    if (Array.isArray(cursor) && typeof part === "number") cursor = cursor[part];
    else if (isRow(cursor) && typeof part === "string") cursor = cursor[part];
    else return undefined;
  }
  return cursor;
}

function writePath(root: unknown, path: readonly SiteSectionPathPart[], value: unknown): unknown {
  if (!path.length) return value;
  const [head, ...rest] = path;
  if (typeof head === "number") {
    const list = Array.isArray(root) ? [...root] : [];
    if (head < 0 || head > list.length) return root;
    list[head] = writePath(list[head], rest, value);
    return list;
  }
  const row = isRow(root) ? { ...root } : {};
  row[head] = writePath(row[head], rest, value);
  return row;
}

/** `path` is inside `content`, e.g. `["title"]`, `["features", 0, "title"]`, `["image", "url"]`. */
export function setSectionContent(
  doc: SiteDoc,
  pageIndex: number,
  sectionId: string,
  path: readonly SiteSectionPathPart[],
  value: unknown,
): SiteDoc {
  if (!path.length) return doc;
  return updateSection(doc, pageIndex, sectionId, (section) => ({
    ...section,
    content: writePath(section.content, path, value) as SiteRow,
  }));
}

export function setSectionStyle(
  doc: SiteDoc,
  pageIndex: number,
  sectionId: string,
  key: string,
  value: unknown,
): SiteDoc {
  return updateSection(doc, pageIndex, sectionId, (section) => ({
    ...section,
    style: { ...(isRow(section.style) ? section.style : {}), [key]: value },
  }));
}

export function moveSection(
  doc: SiteDoc,
  pageIndex: number,
  sectionId: string,
  arrange: SiteArrange,
): SiteDoc {
  const sections = [...pageSections(doc, pageIndex)];
  const from = sections.findIndex((section) => section.id === sectionId);
  if (from < 0) return doc;
  const to =
    arrange === "front"
      ? 0
      : arrange === "back"
        ? sections.length - 1
        : arrange === "forward"
          ? Math.max(0, from - 1)
          : Math.min(sections.length - 1, from + 1);
  if (to === from) return doc;
  const [moved] = sections.splice(from, 1);
  sections.splice(to, 0, moved);
  return replacePageSections(doc, pageIndex, sections);
}

/** Can this section move in that direction? (front/forward = towards the page top.) */
export function canMoveSection(
  doc: SiteDoc,
  pageIndex: number,
  sectionId: string,
  arrange: SiteArrange,
): boolean {
  const sections = pageSections(doc, pageIndex);
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return false;
  return arrange === "front" || arrange === "forward"
    ? index > 0
    : index < sections.length - 1;
}

function usedIds(doc: SiteDoc): Set<string> {
  const ids = new Set<string>();
  for (const page of doc.pages) for (const section of page.sections) ids.add(section.id);
  if (Array.isArray(doc.sections)) {
    for (const section of doc.sections) if (isRow(section)) ids.add(String(section.id));
  }
  return ids;
}

export function uniqueSectionId(doc: SiteDoc, base: string): string {
  const ids = usedIds(doc);
  const stem = (base.replace(/-copy(?:-\d+)?$/, "") || "section").slice(0, 60);
  for (let n = 1; n < 1000; n += 1) {
    const candidate = n === 1 ? `${stem}-copy` : `${stem}-copy-${n}`;
    if (!ids.has(candidate)) return candidate;
  }
  return `${stem}-${Date.now().toString(36)}`;
}

export function duplicateSection(
  doc: SiteDoc,
  pageIndex: number,
  sectionId: string,
): { doc: SiteDoc; id: string } {
  const sections = [...pageSections(doc, pageIndex)];
  const index = sections.findIndex((section) => section.id === sectionId);
  if (index < 0) return { doc, id: "" };
  const id = uniqueSectionId(doc, sectionId);
  sections.splice(index + 1, 0, { ...clone(sections[index]), id });
  return { doc: replacePageSections(doc, pageIndex, sections), id };
}

export function deleteSection(doc: SiteDoc, pageIndex: number, sectionId: string): SiteDoc {
  const sections = pageSections(doc, pageIndex);
  if (sections.length <= 1) return doc;
  return replacePageSections(
    doc,
    pageIndex,
    sections.filter((section) => section.id !== sectionId),
  );
}

/** Every relative image path the document names (`images/x.webp`). */
export function siteImagePaths(doc: SiteDoc): string[] {
  const paths = new Set<string>();
  const visit = (value: unknown, key = "") => {
    if (typeof value === "string") {
      if ((key === "url" || key === "src") && /^images\/[A-Za-z0-9._-]{1,200}$/.test(value)) {
        paths.add(value);
      }
      return;
    }
    if (Array.isArray(value)) value.forEach((entry) => visit(entry));
    else if (isRow(value)) for (const [k, v] of Object.entries(value)) visit(v, k);
  };
  visit(doc.pages);
  return [...paths];
}

export function siteDocTitle(doc: SiteDoc, fallback: string): string {
  const name = typeof doc.siteName === "string" ? doc.siteName.trim() : "";
  return name || fallback;
}

/** Hex/rgb colour accepted by both renderers (app.js `cssColor`, the editor preview). */
export function safeSiteColor(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (/^#(?:[0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(text)) return text;
  if (/^(?:rgb|hsl)a?\([0-9.,%\s]+\)$/i.test(text)) return text;
  return "";
}

/** Same allowlist as the bundled runtime's `safeUrl`. */
export function safeSiteHref(value: unknown): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) return "#";
  if (/^(?:#|\/|\.\/|\.\.\/)/.test(text)) return text;
  if (/^(?:https?:|mailto:|tel:)/i.test(text)) return text;
  return "#";
}
