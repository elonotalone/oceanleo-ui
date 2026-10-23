"use client";

/**
 * Editor preview of a site-document section (W14). Paints with the site's own
 * colours (D6: a website preview keeps its colours in both host themes) and
 * real closure images. Every editable piece carries `data-w14-field` (a path
 * inside `content`, dots for nesting) so a click can tell the edit bar what was
 * picked; `data-w14-section` marks the section.
 *
 * Values may be Puck inline-text elements (contentEditable fields), so this
 * module only checks presence on the raw document and renders the Puck value.
 */
import {
  createContext,
  useContext,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import {
  readPath,
  safeSiteColor,
  safeSiteHref,
  type SiteDoc,
  type SiteRow,
  type SiteSection,
} from "./website-site-doc";
import type { SiteImageResolver } from "./website-site-load";

export interface SiteFieldPick {
  sectionId: string;
  /** Path inside `content`, e.g. `title`, `features.0.title`, `image`. */
  field: string;
  kind: "text" | "image";
}

export interface SiteEditorContextValue {
  doc: SiteDoc;
  pageIndex: number;
  images: SiteImageResolver;
  onPick: (pick: SiteFieldPick | null) => void;
}

export const SiteEditorContext = createContext<SiteEditorContextValue | null>(null);

const WIDTHS: Record<string, number> = { narrow: 760, normal: 1120, wide: 1320, full: 100000 };
const FONTS: Record<string, string> = {
  sans: "system-ui,-apple-system,'PingFang SC',sans-serif",
  serif: "Georgia,'Noto Serif SC',serif",
  mono: "ui-monospace,monospace",
};
const TITLE_KEYS = ["title", "name", "label", "question", "caption", "heading"];
const TEXT_KEYS = ["description", "text", "answer", "quote", "body", "role", "summary", "detail"];
const VALUE_KEYS = ["value", "price", "number", "stat"];
const CTA_PAIRS: Array<[string, string, "primary" | "secondary"]> = [
  ["primaryCtaLabel", "primaryCtaHref", "primary"],
  ["secondaryCtaLabel", "secondaryCtaHref", "secondary"],
  ["primaryLabel", "primaryHref", "primary"],
  ["secondaryLabel", "secondaryHref", "secondary"],
  ["ctaLabel", "ctaHref", "primary"],
];
/** content keys painted by the generic header/CTA/image code, never as a list. */
const HANDLED = new Set([
  "eyebrow", "title", "subtitle", "description", "body", "note", "image",
  ...CTA_PAIRS.flatMap(([label, href]) => [label, href]),
]);

function isRow(value: unknown): value is SiteRow {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasText(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

const NO_SUBSCRIBE = () => () => {};

/** Re-render when any image address of this resolver resolves or expires. */
function useImages(images: SiteImageResolver | null | undefined) {
  useSyncExternalStore(
    images ? (listener) => images.subscribe(listener) : NO_SUBSCRIBE,
    () => (images ? images.snapshot() : 0),
    () => 0,
  );
}

function SiteImage({
  url,
  alt,
  field,
  style,
}: {
  url: unknown;
  alt: unknown;
  field: string;
  style?: CSSProperties;
}) {
  const context = useContext(SiteEditorContext);
  useImages(context?.images);
  const path = typeof url === "string" ? url.trim() : "";
  const src = context && path ? context.images.url(path) : "";
  const frame: CSSProperties = {
    width: "100%",
    aspectRatio: "4 / 3",
    objectFit: "cover",
    borderRadius: 16,
    display: "block",
    background: "rgba(127,127,127,0.12)",
    ...style,
  };
  if (!src) {
    return (
      <div
        data-w14-field={field}
        data-w14-kind="image"
        data-w14-image-state={path ? (context?.images.isFailed(path) ? "failed" : "loading") : "empty"}
        style={frame}
        aria-label={typeof alt === "string" ? alt : undefined}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- closure image behind a signed grant
    <img
      data-w14-field={field}
      data-w14-kind="image"
      src={src}
      alt={typeof alt === "string" ? alt : ""}
      style={frame}
      onError={() => context?.images.refresh(path)}
      draggable={false}
    />
  );
}

function Field({
  as: Tag = "p",
  raw,
  value,
  field,
  style,
}: {
  as?: "p" | "h1" | "h2" | "h3" | "span" | "strong" | "small";
  raw: unknown;
  value: unknown;
  field: string;
  style?: CSSProperties;
}) {
  if (!hasText(raw)) return null;
  return (
    <Tag data-w14-field={field} data-w14-kind="text" style={{ margin: 0, ...style }}>
      {(value ?? raw) as ReactNode}
    </Tag>
  );
}

function Button({
  label,
  rawLabel,
  href,
  field,
  variant,
}: {
  label: unknown;
  rawLabel: unknown;
  href: unknown;
  field: string;
  variant: "primary" | "secondary";
}) {
  if (!hasText(rawLabel)) return null;
  const primary = variant === "primary";
  return (
    <a
      data-w14-field={field}
      data-w14-kind="text"
      href={safeSiteHref(href)}
      onClick={(event) => event.preventDefault()}
      style={{
        display: "inline-block",
        padding: "10px 22px",
        borderRadius: 999,
        fontWeight: 700,
        textDecoration: "none",
        background: primary ? "var(--w14-site-primary)" : "transparent",
        color: primary ? "#ffffff" : "inherit",
        border: primary ? "1px solid transparent" : "1px solid currentColor",
      }}
    >
      {(label ?? rawLabel) as ReactNode}
    </a>
  );
}

function IconPath({ d }: { d: unknown }) {
  if (typeof d !== "string" || !/^[MmLlHhVvCcSsQqTtAaZz0-9.,\s-]{2,600}$/.test(d)) return null;
  return (
    <svg viewBox="0 0 24 24" width={28} height={28} aria-hidden="true" style={{ color: "var(--w14-site-primary)" }}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ListCard({
  rawItem,
  item,
  field,
}: {
  rawItem: unknown;
  item: unknown;
  field: string;
}) {
  if (typeof rawItem === "string") {
    return (
      <li style={{ listStyle: "none" }}>
        <Field as="span" raw={rawItem} value={isRow(item) ? item.text : item} field={field} />
      </li>
    );
  }
  if (!isRow(rawItem)) return null;
  const view = isRow(item) ? item : rawItem;
  const image = isRow(rawItem.image) ? rawItem.image : null;
  const titleKey = TITLE_KEYS.find((key) => hasText(rawItem[key]));
  const valueKey = VALUE_KEYS.find((key) => hasText(rawItem[key]));
  const textKeys = TEXT_KEYS.filter((key) => hasText(rawItem[key]));
  return (
    <li style={{ listStyle: "none", display: "grid", gap: 8, alignContent: "start" }}>
      {image?.url ? (
        <SiteImage url={image.url} alt={image.alt} field={`${field}.image`} />
      ) : null}
      <IconPath d={rawItem.icon} />
      {valueKey ? (
        <Field as="strong" raw={rawItem[valueKey]} value={view[valueKey]} field={`${field}.${valueKey}`} style={{ fontSize: 28 }} />
      ) : null}
      {titleKey ? (
        <Field as="h3" raw={rawItem[titleKey]} value={view[titleKey]} field={`${field}.${titleKey}`} style={{ fontSize: 17 }} />
      ) : null}
      {textKeys.map((key) => (
        <Field key={key} raw={rawItem[key]} value={view[key]} field={`${field}.${key}`} style={{ opacity: 0.8, fontSize: 14 }} />
      ))}
    </li>
  );
}

/** One section; `props` are the Puck-transformed content props, `raw` the document section. */
export function SiteSectionView({
  raw,
  props,
}: {
  raw: SiteSection;
  props: SiteRow;
}) {
  const content = raw.content || {};
  const style = isRow(raw.style) ? raw.style : {};
  const pad = (value: unknown, fallback: number) =>
    Math.min(140, Math.max(16, Number.isFinite(Number(value)) ? Number(value) : fallback));
  const frame: CSSProperties = {
    background: safeSiteColor(style.backgroundColor) || "transparent",
    color: safeSiteColor(style.textColor) || "inherit",
    paddingTop: pad(style.paddingTop, 72),
    paddingBottom: pad(style.paddingBottom, 72),
    textAlign: style.alignment === "center" ? "center" : "left",
  };
  const width = WIDTHS[String(style.contentWidth || "wide")] || WIDTHS.wide;
  const image = isRow(content.image) && hasText(content.image.url) ? content.image : null;
  const body = content.body;
  const ctas = CTA_PAIRS.filter(([label]) => hasText(content[label]));
  const lists = Object.entries(content).filter(
    ([key, value]) => !HANDLED.has(key) && Array.isArray(value) && value.length > 0,
  );
  const side = Boolean(image) && ["hero", "about", "split", "intro"].includes(raw.type);
  const reverse = style.layout === "reverse";
  const text = (
    <div style={{ display: "grid", gap: 14, alignContent: "center" }}>
      <Field raw={content.eyebrow} value={props.eyebrow} field="eyebrow" style={{ color: "var(--w14-site-primary)", fontSize: 13, fontWeight: 600, letterSpacing: "0.08em" }} />
      <Field
        as={raw.type === "hero" ? "h1" : "h2"}
        raw={content.title}
        value={props.title}
        field="title"
        style={{ fontFamily: "var(--w14-site-heading-font)", fontWeight: 800, fontSize: raw.type === "hero" ? 48 : 32, lineHeight: 1.15 }}
      />
      <Field raw={content.subtitle} value={props.subtitle} field="subtitle" style={{ fontSize: 17, opacity: 0.85 }} />
      <Field raw={content.description} value={props.description} field="description" style={{ opacity: 0.85 }} />
      {typeof body === "string" ? (
        <Field raw={body} value={props.body} field="body" />
      ) : Array.isArray(body) ? (
        body.map((paragraph, index) => (
          <Field
            key={index}
            raw={paragraph}
            value={Array.isArray(props.body) && isRow(props.body[index]) ? (props.body[index] as SiteRow).text : paragraph}
            field={`body.${index}`}
          />
        ))
      ) : null}
      {ctas.length ? (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: frame.textAlign === "center" ? "center" : "flex-start" }}>
          {ctas.map(([label, href, variant]) => (
            <Button key={label} label={props[label]} rawLabel={content[label]} href={content[href]} field={label} variant={variant} />
          ))}
        </div>
      ) : null}
      <Field as="small" raw={content.note} value={props.note} field="note" style={{ opacity: 0.7 }} />
    </div>
  );
  return (
    <section data-w14-section={raw.id} data-w14-type={raw.type} style={frame}>
      <div style={{ maxWidth: width, margin: "0 auto", padding: "0 28px", display: "grid", gap: 28 }}>
        {side ? (
          <div style={{ display: "grid", gap: 36, alignItems: "center", gridTemplateColumns: "repeat(auto-fit,minmax(260px,1fr))" }}>
            {reverse ? <SiteImage url={image!.url} alt={image!.alt} field="image" /> : null}
            {text}
            {reverse ? null : <SiteImage url={image!.url} alt={image!.alt} field="image" />}
          </div>
        ) : (
          <>
            {text}
            {image ? <SiteImage url={image.url} alt={image.alt} field="image" style={{ aspectRatio: "16 / 7" }} /> : null}
          </>
        )}
        {lists.map(([key, value]) => (
          <ul
            key={key}
            data-w14-list={key}
            style={{
              margin: 0,
              padding: 0,
              display: "grid",
              gap: 20,
              textAlign: "left",
              gridTemplateColumns: `repeat(auto-fit,minmax(${key === "links" || key === "bullets" ? 120 : 220}px,1fr))`,
            }}
          >
            {(value as unknown[]).slice(0, 24).map((entry, index) => (
              <ListCard
                key={index}
                rawItem={entry}
                item={Array.isArray(props[key]) ? (props[key] as unknown[])[index] : entry}
                field={`${key}.${index}`}
              />
            ))}
          </ul>
        ))}
      </div>
    </section>
  );
}

/** Site frame (Puck root): the site's background, fonts, accent and header. */
export function SiteFrame({ children }: { children: ReactNode }) {
  const context = useContext(SiteEditorContext);
  const doc = context?.doc;
  const typography = isRow(doc?.typography) ? doc!.typography : {};
  const page = doc?.pages[context?.pageIndex || 0];
  const pick = (target: EventTarget | null) => {
    if (!context || !(target instanceof Element)) return;
    const section = target.closest("[data-w14-section]");
    const field = target.closest("[data-w14-field]");
    if (!section) {
      context.onPick(null);
      return;
    }
    const sectionId = section.getAttribute("data-w14-section") || "";
    context.onPick(
      field && section.contains(field)
        ? {
            sectionId,
            field: field.getAttribute("data-w14-field") || "",
            kind: field.getAttribute("data-w14-kind") === "image" ? "image" : "text",
          }
        : { sectionId, field: "", kind: "text" },
    );
  };
  const siteStyle = {
    background: safeSiteColor(doc?.backgroundColor) || "#ffffff",
    color: "#0f172a",
    fontFamily: FONTS[String(typography.bodyFont || "sans")] || FONTS.sans,
    lineHeight: Number(typography.lineHeight) > 0 ? Math.min(Number(typography.lineHeight), 3) : 1.65,
    minHeight: "100%",
    colorScheme: "light",
    "--w14-site-primary": safeSiteColor(doc?.themeColor) || "#2563eb",
    "--w14-site-heading-font": FONTS[String(typography.headingFont || "sans")] || FONTS.sans,
  } as CSSProperties;
  return (
    <div
      data-testid="website-site-frame"
      style={siteStyle}
      onPointerDownCapture={(event) => pick(event.target)}
    >
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, padding: "14px 28px", borderBottom: "1px solid rgba(15,23,42,0.08)" }}>
        <strong style={{ fontWeight: 800 }}>{String(doc?.siteName || "")}</strong>
        <nav style={{ display: "flex", gap: 18, fontSize: 14 }}>
          {(doc?.pages || []).map((entry, index) => (
            <span key={index} style={{ color: entry === page ? "var(--w14-site-primary)" : "inherit", fontWeight: entry === page ? 700 : 400 }}>
              {String(entry.name || entry.title || "")}
            </span>
          ))}
        </nav>
      </header>
      {children}
    </div>
  );
}

/** Field path → value inside `content` (dots for nesting, numbers for indexes). */
export function siteFieldPath(field: string): Array<string | number> {
  return field
    .split(".")
    .filter(Boolean)
    .map((part) => (/^\d+$/.test(part) ? Number(part) : part));
}

export function siteFieldValue(section: SiteSection, field: string): unknown {
  return readPath(section.content, siteFieldPath(field));
}
