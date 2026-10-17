import {
  WEBSITE_SOURCE_FORMAT,
  type WebsiteSource,
} from "../website-source-carrier/website-source-schema";

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
        subheading: "Puck 映射 website-source@1",
        body: "这一段是本地结构化工程，不加载远程 website 站。",
      },
      {
        id: "features",
        kind: "feature-grid",
        heading: "本地能做的事",
        body: "改区块、保存、重开、导出工程。",
        items: [
          { title: "页面", text: "pages 与 sections 仍是同一份载体。" },
          { title: "区块", text: "hero / feature-grid / content / footer。" },
        ],
      },
      {
        id: "story",
        kind: "content",
        heading: "离线说明",
        body: "云端构建预览需要网络；离线只保证工程编辑。",
      },
      {
        id: "foot",
        kind: "footer",
        heading: "页脚",
        body: "OceanLeo local website source",
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
