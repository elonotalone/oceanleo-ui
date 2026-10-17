import {
  WEBSITE_SECTION_KINDS,
  WEBSITE_SOURCE_FORMAT,
  type WebsiteSectionKind,
  type WebsiteSource,
  type WebsiteSourceSection,
} from "../website-source-carrier/website-source-schema";

const LONG_BODY =
  "本地网站工程按 website-source@1 保存页面、区块、主题、依赖闭包和署名。离线可以改任意区块的文字、图片引用、链接和底色，增删排序区块，增删页面，保存为新 revision 后再打开仍一致。云端构建预览需要联网；断网只保证这份结构化工程可编辑、可导出。这一段补足正文长度，避免空壳网站通过结构校验却没有可读内容。";

export function blankWebsiteSource(title = "本地可编辑的网站工程"): WebsiteSource {
  return {
    schema: WEBSITE_SOURCE_FORMAT,
    version: 1,
    title: title.length >= 8 ? title : "本地可编辑的网站工程",
    theme: {
      accent: "#1F6FEB",
      background: "#FFFFFF",
      text: "#1F2328",
      muted: "#57606A",
      surface: "#F5F7FA",
      border: "#D0D7DE",
    },
    pages: [
      {
        id: "home",
        path: "/",
        title: "首页栏目",
        sectionIds: ["hero", "features", "story", "foot"],
      },
    ],
    sections: [
      {
        id: "hero",
        kind: "hero",
        heading: "本地可编辑的网站首页",
        subheading: "website-source@1 全种类区块",
        body: "这一段是本地结构化工程，不加载远程 website 站。",
        background: "accent",
        actions: [{ label: "开始", href: "/about", variant: "primary" }],
      },
      {
        id: "features",
        kind: "feature-grid",
        heading: "本地能做的事",
        body: "改区块、保存、重开、导出工程。",
        items: [
          { title: "页面", text: "pages 与 sections 仍是同一份载体。" },
          { title: "区块", text: "十三种 kind 都可以加入画布。" },
        ],
      },
      {
        id: "story",
        kind: "content",
        heading: "离线说明",
        body: LONG_BODY,
      },
      {
        id: "foot",
        kind: "footer",
        heading: "页脚",
        body: "OceanLeo local website source",
      },
    ],
    navigation: {
      brand: "本地网站",
      links: [
        { label: "首页", href: "/" },
        { label: "关于", href: "/about" },
      ],
    },
    assets: [
      {
        id: "cover",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        mediaType: "image/png",
        byteSize: 1024,
      },
    ],
    attribution: {
      entries: [
        {
          text: "OceanLeo local website fixture",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
    dependencies: [
      {
        path: "assets/cover.png",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        mediaType: "image/png",
        byteSize: 1024,
      },
    ],
  };
}

const KIND_COPY: Record<
  WebsiteSectionKind,
  Pick<WebsiteSourceSection, "heading" | "subheading" | "body">
> = {
  hero: {
    heading: "现有网站的首屏",
    subheading: "打开后仍是 website-source@1",
    body: "改标题、按钮链接和底色都会写回同一份工程。",
  },
  "feature-grid": {
    heading: "能力网格",
    body: "每个卡片可以改文字、图片资产和链接。",
  },
  content: {
    heading: "正文栏目",
    body: LONG_BODY,
  },
  gallery: {
    heading: "图片画廊",
    body: "图片走 assets[].id 与 items[].assetId，替代文字不少于四字。",
  },
  pricing: {
    heading: "价格方案",
    body: "方案卡片带链接，只能填相对路径或 https。",
  },
  faq: {
    heading: "常见问题",
    body: "问答条目可以增删。",
  },
  testimonial: {
    heading: "客户评价",
    body: "引用条目带头像资产。",
  },
  cta: {
    heading: "行动号召",
    body: "按钮链接写回 actions[].href。",
  },
  stats: {
    heading: "数据指标",
    body: "数字写在 items[].value。",
  },
  timeline: {
    heading: "历程时间线",
    body: "按条目排列的时间节点。",
  },
  team: {
    heading: "团队介绍",
    body: "成员卡片可挂头像和主页链接。",
  },
  contact: {
    heading: "联系方式",
    body: "联系区块的链接必须是安全 href。",
  },
  footer: {
    heading: "页脚信息",
    body: "页脚仍是 website-source@1 的一种 kind。",
  },
};

/** Existing-project shaped fixture: all 13 section kinds, two pages, image + link + theme. */
export function existingWebsiteSource(title = "操作员已有的网站工程"): WebsiteSource {
  const homeIds = [
    "hero",
    "features",
    "story",
    "gallery",
    "pricing",
    "faq",
    "cta",
  ];
  const aboutIds = ["quotes", "stats", "timeline", "team", "contact", "foot"];
  const byId: Record<string, WebsiteSourceSection> = {
    hero: {
      id: "hero",
      kind: "hero",
      ...KIND_COPY.hero,
      background: "accent",
      actions: [{ label: "了解更多", href: "/about", variant: "primary" }],
    },
    features: {
      id: "features",
      kind: "feature-grid",
      ...KIND_COPY["feature-grid"],
      items: [
        { title: "页面", text: "可以增删页面。", href: "/about" },
        { title: "区块", text: "可以增删排序区块。" },
      ],
    },
    story: {
      id: "story",
      kind: "content",
      ...KIND_COPY.content,
      background: "surface",
    },
    gallery: {
      id: "gallery",
      kind: "gallery",
      ...KIND_COPY.gallery,
      items: [
        {
          title: "封面",
          assetId: "cover",
          alt: "封面示意图片",
          href: "/about",
        },
      ],
    },
    pricing: {
      id: "pricing",
      kind: "pricing",
      ...KIND_COPY.pricing,
      items: [
        { title: "基础", text: "本地编辑", value: "0", href: "/contact" },
      ],
      actions: [{ label: "选方案", href: "/contact", variant: "secondary" }],
    },
    faq: {
      id: "faq",
      kind: "faq",
      ...KIND_COPY.faq,
      items: [{ title: "能否离线？", text: "工程编辑可以，云端预览不行。" }],
    },
    cta: {
      id: "cta",
      kind: "cta",
      ...KIND_COPY.cta,
      actions: [{ label: "去关于页", href: "/about", variant: "primary" }],
    },
    quotes: {
      id: "quotes",
      kind: "testimonial",
      ...KIND_COPY.testimonial,
      items: [
        {
          title: "编辑",
          text: "打开已有工程就能改。",
          assetId: "cover",
          alt: "评价配图说明",
        },
      ],
    },
    stats: {
      id: "stats",
      kind: "stats",
      ...KIND_COPY.stats,
      items: [{ title: "区块种类", value: "13", text: "kind 枚举全覆盖" }],
    },
    timeline: {
      id: "timeline",
      kind: "timeline",
      ...KIND_COPY.timeline,
      items: [{ title: "本地化", text: "从远程 iframe 改为 website-source@1。" }],
    },
    team: {
      id: "team",
      kind: "team",
      ...KIND_COPY.team,
      items: [
        {
          title: "站点编辑",
          text: "改文字和结构。",
          assetId: "cover",
          alt: "成员头像说明",
          href: "https://oceanleo.com",
        },
      ],
    },
    contact: {
      id: "contact",
      kind: "contact",
      ...KIND_COPY.contact,
      actions: [{ label: "写信", href: "/contact", variant: "ghost" }],
    },
    foot: {
      id: "foot",
      kind: "footer",
      ...KIND_COPY.footer,
    },
  };
  const used = new Set<WebsiteSectionKind>(
    [...homeIds, ...aboutIds].map((id) => byId[id].kind),
  );
  if (used.size !== WEBSITE_SECTION_KINDS.length) {
    throw new Error("existingWebsiteSource must include every section kind");
  }
  return {
    schema: WEBSITE_SOURCE_FORMAT,
    version: 1,
    title: title.length >= 8 ? title : "操作员已有的网站工程",
    theme: {
      accent: "#1F6FEB",
      background: "#FFFFFF",
      text: "#1F2328",
      muted: "#57606A",
      surface: "#F5F7FA",
      border: "#D0D7DE",
      radiusPx: 12,
      fontFamily: "system-ui",
      maxWidthPx: 1120,
    },
    pages: [
      { id: "home", path: "/", title: "首页栏目", sectionIds: homeIds },
      {
        id: "about",
        path: "/about",
        title: "关于栏目",
        sectionIds: aboutIds,
      },
    ],
    sections: [...homeIds, ...aboutIds].map((id) => byId[id]),
    navigation: {
      brand: "已有网站",
      links: [
        { label: "首页", href: "/" },
        { label: "关于", href: "/about" },
      ],
    },
    assets: [
      {
        id: "cover",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        mediaType: "image/png",
        byteSize: 2048,
      },
    ],
    seo: {
      description:
        "打开已有 website-source@1 工程并在本地做同等深度编辑，覆盖全部区块种类。",
      keywords: ["website-source", "local-editor"],
      ogImageAssetId: "cover",
    },
    attribution: {
      entries: [
        {
          text: "OceanLeo existing website fixture",
          licenseCode: "CC0",
          licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        },
      ],
    },
    dependencies: [
      {
        path: "assets/cover.png",
        sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        mediaType: "image/png",
        byteSize: 2048,
      },
    ],
  };
}
