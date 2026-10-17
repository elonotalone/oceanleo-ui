"use client";

import type { Config } from "@puckeditor/core";
import {
  WEBSITE_SECTION_KINDS,
  type WebsiteSectionKind,
} from "../website-source-carrier/website-source-schema";

export type WebsitePuckItemFields = {
  heading?: string;
  subheading?: string;
  body?: string;
  decorative?: string;
  background?: string;
  items?: Array<{
    title?: string;
    text?: string;
    icon?: string;
    assetId?: string;
    alt?: string;
    value?: string;
    href?: string;
  }>;
  actions?: Array<{
    label?: string;
    href?: string;
    variant?: string;
  }>;
};

type WebsitePuckComponents = Record<WebsiteSectionKind, WebsitePuckItemFields>;

const sectionFields = {
  heading: { type: "text" as const, label: "标题" },
  subheading: { type: "text" as const, label: "副标题" },
  body: { type: "textarea" as const, label: "正文" },
  background: {
    type: "select" as const,
    label: "区块底色",
    options: [
      { label: "默认", value: "default" },
      { label: "表面", value: "surface" },
      { label: "强调", value: "accent" },
    ],
  },
  decorative: {
    type: "radio" as const,
    label: "装饰区块",
    options: [
      { label: "内容", value: "no" },
      { label: "装饰", value: "yes" },
    ],
  },
  items: {
    type: "array" as const,
    label: "条目 / 图片 / 链接",
    arrayFields: {
      title: { type: "text" as const, label: "条目标题" },
      text: { type: "textarea" as const, label: "条目正文" },
      icon: { type: "text" as const, label: "图标" },
      assetId: { type: "text" as const, label: "图片资产 id" },
      alt: { type: "text" as const, label: "图片替代文字" },
      value: { type: "text" as const, label: "数值" },
      href: { type: "text" as const, label: "链接" },
    },
  },
  actions: {
    type: "array" as const,
    label: "按钮",
    max: 3,
    arrayFields: {
      label: { type: "text" as const, label: "按钮文字" },
      href: { type: "text" as const, label: "按钮链接" },
      variant: {
        type: "select" as const,
        options: [
          { label: "主按钮", value: "primary" },
          { label: "次按钮", value: "secondary" },
          { label: "幽灵", value: "ghost" },
        ],
      },
    },
  },
};

function WebsiteSectionPreview({
  kind,
  heading,
  subheading,
  body,
  background,
  items,
  actions,
}: WebsitePuckItemFields & { kind: WebsiteSectionKind }) {
  const surface =
    background === "accent"
      ? "var(--accent, #1F6FEB)"
      : background === "surface"
        ? "var(--surface, #F5F7FA)"
        : "transparent";
  return (
    <section
      className="px-6 py-8"
      data-testid={`website-section-${kind}`}
      data-kind={kind}
      style={{ background: surface }}
    >
      {heading ? <h2 className="text-xl font-semibold">{heading}</h2> : null}
      {subheading ? <p className="mt-1 text-sm opacity-80">{subheading}</p> : null}
      {body ? <p className="mt-3 text-sm leading-relaxed">{body}</p> : null}
      {items?.length ? (
        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {items.map((item, index) => (
            <li key={`${item.title || "item"}-${index}`} className="text-sm">
              {item.assetId ? (
                <figure className="mb-2 rounded border px-2 py-3 text-xs">
                  图片 {item.assetId}
                  {item.alt ? ` · ${item.alt}` : ""}
                </figure>
              ) : null}
              {item.title ? <strong>{item.title}</strong> : null}
              {item.value ? <span className="ml-2 opacity-70">{item.value}</span> : null}
              {item.text ? <p className="opacity-80">{item.text}</p> : null}
              {item.href ? (
                <a className="underline" href={item.href}>
                  {item.href}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {actions?.length ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {actions.map((action, index) => (
            <a
              key={`${action.label || "action"}-${index}`}
              className="rounded border px-3 py-1 text-sm"
              href={action.href || "#"}
            >
              {action.label || action.href}
            </a>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function buildComponents(): Config<WebsitePuckComponents>["components"] {
  const components = {} as Config<WebsitePuckComponents>["components"];
  for (const kind of WEBSITE_SECTION_KINDS) {
    components[kind] = {
      label: kind,
      fields: sectionFields,
      render: (props) => <WebsiteSectionPreview kind={kind} {...props} />,
    };
  }
  return components;
}

export const websitePuckConfig: Config<WebsitePuckComponents> = {
  components: buildComponents(),
};
