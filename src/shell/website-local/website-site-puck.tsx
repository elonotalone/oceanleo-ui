"use client";

/**
 * Puck configuration for site documents (W14). One Puck component per section
 * type present in the site; fields are derived from the site's own content
 * (text → inline-editable text, href → link field, `image` → alt/url object,
 * lists → array fields). Puck props = content keys + `id` + `sectionStyle`,
 * so both faces (Edit / Pro edit) edit the same section objects.
 */
import { useContext, type ReactNode } from "react";
import type { Config, Data, Field, Fields } from "@puckeditor/core";
import {
  type SiteDoc,
  type SiteRow,
  type SiteSection,
} from "./website-site-doc";
import { SiteEditorContext, SiteFrame, SiteSectionView } from "./website-site-render";

export const SITE_STYLE_PROP = "sectionStyle";
const RESERVED = new Set(["id", SITE_STYLE_PROP, "puck", "editMode"]);

type Translate = (text: string) => string;

/** Human field labels (Chinese source; the caller translates). */
const LABELS: Record<string, string> = {
  eyebrow: "眉题",
  title: "标题",
  subtitle: "副标题",
  description: "说明",
  body: "正文",
  note: "备注",
  image: "图片",
  alt: "替代文字",
  url: "图片地址",
  caption: "图片说明",
  label: "文字",
  href: "链接",
  name: "名称",
  role: "职位",
  quote: "引言",
  question: "问题",
  answer: "回答",
  value: "数值",
  price: "价格",
  text: "文字",
  primaryCtaLabel: "主按钮文字",
  primaryCtaHref: "主按钮链接",
  secondaryCtaLabel: "次按钮文字",
  secondaryCtaHref: "次按钮链接",
  primaryLabel: "主按钮文字",
  primaryHref: "主按钮链接",
  secondaryLabel: "次按钮文字",
  secondaryHref: "次按钮链接",
  ctaLabel: "按钮文字",
  ctaHref: "按钮链接",
  features: "特色条目",
  items: "条目",
  links: "链接",
  bullets: "要点",
  plans: "价格方案",
  [SITE_STYLE_PROP]: "区块样式",
  backgroundColor: "区块底色",
  textColor: "文字颜色",
  alignment: "对齐",
  paddingTop: "上边距",
  paddingBottom: "下边距",
  contentWidth: "内容宽度",
};

function isRow(value: unknown): value is SiteRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isStringList(value: unknown): value is string[] {
  return Array.isArray(value) && value.length > 0 && value.every((entry) => typeof entry === "string");
}

function isHrefKey(key: string): boolean {
  return /href$/i.test(key) || key === "url" || key === "src";
}

function label(key: string, tt: Translate): string {
  return LABELS[key] ? tt(LABELS[key]) : key;
}

function textField(key: string, sample: unknown, tt: Translate): Field {
  if (isHrefKey(key)) return { type: "text", label: label(key, tt) };
  const long = typeof sample === "string" && sample.length > 60;
  return long || key === "body" || key === "description"
    ? { type: "textarea", label: label(key, tt), contentEditable: true }
    : { type: "text", label: label(key, tt), contentEditable: true };
}

function imageField(tt: Translate): Field {
  return {
    type: "object",
    label: label("image", tt),
    objectFields: {
      alt: { type: "text", label: label("alt", tt) },
      url: { type: "text", label: label("url", tt) },
    },
  };
}

function fieldFor(key: string, samples: unknown[], tt: Translate): Field | null {
  const sample = samples.find((value) => value !== undefined && value !== null && value !== "");
  if (key === "icon" || key === "keyword") return null;
  if (typeof sample === "string" || (sample === undefined && samples.some((v) => v === ""))) {
    return textField(key, sample, tt);
  }
  if (typeof sample === "number") return { type: "number", label: label(key, tt) };
  if (isRow(sample) && ("url" in sample || "alt" in sample)) return imageField(tt);
  if (isStringList(sample)) {
    return {
      type: "array",
      label: label(key, tt),
      arrayFields: { text: { type: "textarea", label: label("text", tt), contentEditable: true } },
      getItemSummary: (item: { text?: string }) => String(item?.text || "").slice(0, 40),
    };
  }
  if (Array.isArray(sample) && sample.some(isRow)) {
    const itemSamples = new Map<string, unknown[]>();
    for (const list of samples) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (!isRow(item)) continue;
        for (const [itemKey, value] of Object.entries(item)) {
          itemSamples.set(itemKey, [...(itemSamples.get(itemKey) || []), value]);
        }
      }
    }
    const arrayFields: Fields = {};
    for (const [itemKey, values] of itemSamples) {
      const field = fieldFor(itemKey, values, tt);
      if (field && field.type !== "array") arrayFields[itemKey] = field;
    }
    if (!Object.keys(arrayFields).length) return null;
    return {
      type: "array",
      label: label(key, tt),
      arrayFields,
      getItemSummary: (item: SiteRow) =>
        String(item?.title || item?.label || item?.name || item?.caption || item?.question || "").slice(0, 40),
    };
  }
  return null;
}

function styleField(tt: Translate): Field {
  return {
    type: "object",
    label: label(SITE_STYLE_PROP, tt),
    objectFields: {
      backgroundColor: { type: "text", label: label("backgroundColor", tt) },
      textColor: { type: "text", label: label("textColor", tt) },
      alignment: {
        type: "select",
        label: label("alignment", tt),
        options: [
          { label: tt("左对齐"), value: "left" },
          { label: tt("居中"), value: "center" },
        ],
      },
      paddingTop: { type: "number", label: label("paddingTop", tt), min: 0, max: 240 },
      paddingBottom: { type: "number", label: label("paddingBottom", tt), min: 0, max: 240 },
    },
  };
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

function SectionRender(props: SiteRow) {
  const context = useContext(SiteEditorContext);
  const id = String(props.id || "");
  const raw =
    context?.doc.pages[context.pageIndex]?.sections.find((section) => section.id === id) || null;
  if (!raw) return <section data-w14-section={id} style={{ minHeight: 48 }} />;
  return <SiteSectionView raw={raw} props={props} />;
}

/** Build the Puck config for this site (types and fields come from the document). */
export function siteDocPuckConfig(doc: SiteDoc, tt: Translate): Config {
  const samples = new Map<string, SiteSection[]>();
  for (const section of allSections(doc)) {
    samples.set(section.type, [...(samples.get(section.type) || []), section]);
  }
  const components: Config["components"] = {};
  for (const [type, sections] of samples) {
    const keys = new Map<string, unknown[]>();
    for (const section of sections) {
      for (const [key, value] of Object.entries(section.content || {})) {
        if (RESERVED.has(key)) continue;
        keys.set(key, [...(keys.get(key) || []), value]);
      }
    }
    const fields: Fields = {};
    for (const [key, values] of keys) {
      const field = fieldFor(key, values, tt);
      if (field) fields[key] = field;
    }
    fields[SITE_STYLE_PROP] = styleField(tt);
    const first = sections[0];
    const defaults = siteSectionToPuckProps({ ...first, id: "" });
    delete defaults.id;
    components[type] = {
      label: type,
      fields,
      defaultProps: defaults,
      render: (props: SiteRow) => <SectionRender {...props} />,
    };
  }
  return {
    components,
    root: {
      render: ({ children }: { children?: ReactNode }) => <SiteFrame>{children}</SiteFrame>,
    },
  } as Config;
}
