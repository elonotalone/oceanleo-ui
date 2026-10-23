/**
 * Unified edit bar for site documents (W14, D9). Canonical ids only; the shell
 * projects icons, labels and order. Every control maps to a field the bundled
 * site runtime (`assets/app.js`) really paints:
 *
 * - text   → `text-color` (section `style.textColor`), `align` (section
 *            `style.alignment`: left / center are the only two the runtime
 *            honours), `link` (the button's paired `…Href` / item `href`).
 * - image  → `replace` (new closure image), `alt`.
 * - section (shape bar) → `fill` (section `style.backgroundColor`).
 * - object group on every pick → `arrange` (page order), `duplicate`, `delete`.
 *
 * Not offered, because the runtime has no field for them and showing them would
 * be a fake success: font family/size, bold/italic/underline/strike, highlight,
 * lists, line height, crop/flip/rotate, radius, border, opacity, adjust, fit.
 */
import type { SelectionCommand, SelectionContext, SelectionControl } from "../selection-context";
import {
  canMoveSection,
  deleteSection,
  duplicateSection,
  findSection,
  moveSection,
  pageSections,
  readPath,
  safeSiteColor,
  setSectionContent,
  setSectionStyle,
  siteFieldPath,
  type SiteArrange,
  type SiteDoc,
  type SiteRow,
} from "./website-site-doc";
import type { SiteFieldPick } from "./website-site-render";

type Translate = (text: string, vars?: Record<string, string | number>) => string;

export interface SiteBarSelection {
  sectionId: string;
  field: string;
  kind: "text" | "image";
}

export type SiteBarEffect =
  | { type: "doc"; doc: SiteDoc; select?: SiteBarSelection | null }
  | { type: "replace-image"; sectionId: string; field: string }
  | { type: "none" };

const ARRANGE: readonly SiteArrange[] = ["front", "forward", "backward", "back"];

function isRow(value: unknown): value is SiteRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/** The `…Href` sibling a text field links through, as a content path. */
export function siteLinkPath(field: string, content: SiteRow): Array<string | number> | null {
  const path = siteFieldPath(field);
  const last = path[path.length - 1];
  if (typeof last !== "string") return null;
  const parent = path.slice(0, -1);
  const owner = parent.length ? readPath(content, parent) : content;
  if (!isRow(owner)) return null;
  const candidates = /Label$/.test(last)
    ? [last.replace(/Label$/, "Href")]
    : ["label", "title", "name"].includes(last)
      ? ["href"]
      : [];
  const key = candidates.find((candidate) => candidate in owner);
  return key ? [...parent, key] : null;
}

export function normalizePick(doc: SiteDoc, pageIndex: number, pick: SiteFieldPick | null): SiteBarSelection | null {
  if (!pick) return null;
  const section = findSection(doc, pageIndex, pick.sectionId);
  if (!section) return null;
  if (!pick.field) return { sectionId: section.id, field: "", kind: "text" };
  if (pick.kind === "image") {
    // `items.0.image` / `image`; also accept a pick on the image's own url.
    const field = pick.field.replace(/\.(?:url|alt)$/, "");
    const value = readPath(section.content, siteFieldPath(field));
    return isRow(value) ? { sectionId: section.id, field, kind: "image" } : null;
  }
  const value = readPath(section.content, siteFieldPath(pick.field));
  return typeof value === "string" ? { sectionId: section.id, field: pick.field, kind: "text" } : null;
}

export function siteSelectionContext(
  doc: SiteDoc,
  pageIndex: number,
  selection: SiteBarSelection | null,
  tt: Translate,
): SelectionContext | null {
  if (!selection) return null;
  const section = findSection(doc, pageIndex, selection.sectionId);
  if (!section) return null;
  const style = isRow(section.style) ? section.style : {};
  const controls: SelectionControl[] = [];
  const bar = !selection.field ? "shape" : selection.kind === "image" ? "image" : "text";
  if (bar === "text") {
    controls.push({
      id: "text-color",
      kind: "color",
      label: tt("文字色"),
      value: safeSiteColor(style.textColor) || "#0f172a",
    });
    controls.push({
      id: "align",
      kind: "select",
      label: tt("对齐"),
      value: style.alignment === "center" ? "center" : "left",
      options: [
        { value: "left", label: tt("左对齐") },
        { value: "center", label: tt("居中") },
      ],
    });
    const link = siteLinkPath(selection.field, section.content);
    if (link) {
      controls.push({
        id: "link",
        kind: "text",
        label: tt("超链接"),
        value: String(readPath(section.content, link) ?? ""),
      });
    }
  } else if (bar === "image") {
    const image = readPath(section.content, siteFieldPath(selection.field));
    controls.push({ id: "replace", kind: "action", label: tt("替换") });
    controls.push({
      id: "alt",
      kind: "text",
      label: tt("替代文字"),
      value: isRow(image) ? String(image.alt ?? "") : "",
    });
  } else {
    controls.push({
      id: "fill",
      kind: "color",
      label: tt("填充色"),
      value: safeSiteColor(style.backgroundColor) || safeSiteColor(doc.backgroundColor) || "#ffffff",
    });
  }
  const sections = pageSections(doc, pageIndex);
  const moves = ARRANGE.filter((arrange) => canMoveSection(doc, pageIndex, section.id, arrange));
  if (moves.length) {
    const labels: Record<SiteArrange, string> = {
      front: tt("移到页面最上"),
      forward: tt("上移一块"),
      backward: tt("下移一块"),
      back: tt("移到页面最下"),
    };
    controls.push({
      id: "arrange",
      kind: "select",
      label: tt("层级"),
      value: null,
      options: moves.map((arrange) => ({ value: arrange, label: labels[arrange] })),
    });
  }
  controls.push({ id: "duplicate", kind: "action", label: tt("复制一份") });
  if (sections.length > 1) {
    controls.push({ id: "delete", kind: "action", label: tt("删除"), danger: true });
  }
  const id = `${section.id}:${selection.field || "section"}`;
  return {
    version: 1,
    kind: bar === "shape" ? "website-section" : bar === "image" ? "website-image" : "website-text",
    bar,
    id,
    label:
      bar === "shape"
        ? tt("已选区块 {name}", { name: section.type })
        : bar === "image"
          ? tt("已选图片")
          : tt("已选文字"),
    controls,
  };
}

/** Apply one edit-bar command to the document. */
export function applySiteBarCommand(
  doc: SiteDoc,
  pageIndex: number,
  selection: SiteBarSelection,
  command: Pick<SelectionCommand, "controlId" | "value">,
): SiteBarEffect {
  const section = findSection(doc, pageIndex, selection.sectionId);
  if (!section) return { type: "none" };
  const value = command.value;
  switch (command.controlId) {
    case "text-color": {
      const color = safeSiteColor(value);
      return color ? { type: "doc", doc: setSectionStyle(doc, pageIndex, section.id, "textColor", color) } : { type: "none" };
    }
    case "fill": {
      const color = safeSiteColor(value);
      return color ? { type: "doc", doc: setSectionStyle(doc, pageIndex, section.id, "backgroundColor", color) } : { type: "none" };
    }
    case "align":
      return value === "left" || value === "center"
        ? { type: "doc", doc: setSectionStyle(doc, pageIndex, section.id, "alignment", value) }
        : { type: "none" };
    case "link": {
      const path = siteLinkPath(selection.field, section.content);
      return path
        ? { type: "doc", doc: setSectionContent(doc, pageIndex, section.id, path, String(value ?? "").trim().slice(0, 500)) }
        : { type: "none" };
    }
    case "alt": {
      if (selection.kind !== "image") return { type: "none" };
      const path = [...siteFieldPath(selection.field), "alt"];
      return { type: "doc", doc: setSectionContent(doc, pageIndex, section.id, path, String(value ?? "").slice(0, 300)) };
    }
    case "replace":
      return selection.kind === "image"
        ? { type: "replace-image", sectionId: section.id, field: selection.field }
        : { type: "none" };
    case "arrange":
      return ARRANGE.includes(value as SiteArrange)
        ? { type: "doc", doc: moveSection(doc, pageIndex, section.id, value as SiteArrange), select: selection }
        : { type: "none" };
    case "duplicate": {
      const result = duplicateSection(doc, pageIndex, section.id);
      return result.id
        ? { type: "doc", doc: result.doc, select: { sectionId: result.id, field: "", kind: "text" } }
        : { type: "none" };
    }
    case "delete": {
      const next = deleteSection(doc, pageIndex, section.id);
      return next === doc ? { type: "none" } : { type: "doc", doc: next, select: null };
    }
    default:
      return { type: "none" };
  }
}
