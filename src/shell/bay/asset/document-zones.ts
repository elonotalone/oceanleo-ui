// 八个文档分区。面板中文名与 platform_assets.category 的对应是这张表，
// 素材栏目录下拉、分区页头、置顶都读这里，不要在别处再抄一份。

export type DocumentZoneType = "document" | "ppt" | "image";

export type LicenseKind = "official-public-domain" | "oceanleo-owned";

export type DocumentZone = {
  /** 原 asset 站 URL 段 `/zones/<slug>`；Bay 里用作目录快捷键。 */
  slug: string;
  /** platform_assets.category */
  category: string;
  /** 导航和页标题用的中文直白名 */
  title: string;
  type: DocumentZoneType;
  licenseKind: LicenseKind;
  /** 给用户看的许可来源 */
  licenseLabel: string;
  /** 这一区预期的可下载格式（空分区也要写出来，不能等货到了才知道） */
  formats: string[];
  /**
   * 官方国家编号。合同区、尽职调查区必须有 —— 这是这批素材的卖点。
   * 诉讼文书区同属国家机关文件，标最高人民法院样式名。
   */
  officialNumbers: string[];
  officialSourceNote: string;
  /** 供货链约定的 source；置顶用，货还没入库时匹配不到就跳过。 */
  pinSource?: string;
  /** 标题前缀钉位，缺件跳过，不拿别的件顶上。 */
  pinTitlePrefixes?: string[];
};

export const DOCUMENT_ZONES: readonly DocumentZone[] = Object.freeze([
  {
    slug: "contract",
    // 合同区读 `legal-contract-model`，不是 `contract-agreement`。
    // 全国合同示范文本库那 1,188 件官方原文入库时用的就是这个 category；
    // `contract-agreement` 装的是 v2 那批洗白废品，已被清空到 0 行。
    category: "legal-contract-model",
    title: "合同区",
    type: "document",
    licenseKind: "official-public-domain",
    licenseLabel: "官方公有领域",
    formats: ["doc", "pdf"],
    officialNumbers: ["GF-2026-24"],
    officialSourceNote:
      "全国合同示范文本库原文。国家机关文件，依著作权法第五条第一项不适用著作权法。",
  },
  {
    slug: "diligence",
    category: "legal-diligence",
    title: "尽职调查区",
    type: "document",
    licenseKind: "official-public-domain",
    licenseLabel: "官方公有领域",
    formats: ["docx", "pdf", "md"],
    officialNumbers: ["证监会公告〔2022〕36号", "证监会公告〔2022〕35号"],
    officialSourceNote:
      "中国证监会公告原文。国家机关文件，依著作权法第五条第一项不适用著作权法。",
    pinSource: "csrc-announcement",
    pinTitlePrefixes: ["#证监会公告〔2022〕36号", "#证监会公告〔2022〕35号"],
  },
  {
    slug: "litigation",
    category: "legal-litigation-form",
    title: "诉讼文书区",
    type: "document",
    licenseKind: "official-public-domain",
    licenseLabel: "官方公有领域",
    formats: ["docx", "doc"],
    officialNumbers: ["最高人民法院民事诉讼文书样式"],
    officialSourceNote:
      "最高人民法院诉讼文书样式原文。国家机关文件，依著作权法第五条第一项不适用著作权法。",
  },
  {
    slug: "lawyer",
    category: "legal-lawyer-template",
    title: "律师文书区",
    type: "document",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["docx"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-legal-wash",
  },
  {
    slug: "resume",
    category: "resume-template",
    title: "简历区",
    type: "document",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["docx", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-resume-wash",
    pinTitlePrefixes: ["OLR-0001", "OLR-0002", "OLR-0003"],
  },
  {
    slug: "flowchart",
    category: "flowchart-diagram",
    title: "流程架构图区",
    type: "ppt",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["pptx", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-flowchart-wash",
  },
  {
    slug: "poster",
    category: "longform-poster",
    title: "长图海报区",
    type: "image",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["psd", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-poster-wash",
  },
  {
    slug: "ecommerce",
    category: "ecommerce-detail",
    title: "电商详情区",
    type: "image",
    licenseKind: "oceanleo-owned",
    licenseLabel: "OceanLeo 自有",
    formats: ["psd", "png"],
    officialNumbers: [],
    officialSourceNote: "",
    pinSource: "oceanleo-ecommerce-wash",
  },
]);

export const DOCUMENT_ZONE_SLUGS = DOCUMENT_ZONES.map((zone) => zone.slug);

export function documentZonesForType(type: string): readonly DocumentZone[] {
  return DOCUMENT_ZONES.filter((zone) => zone.type === type);
}

export function documentZoneBySlug(slug: string): DocumentZone | undefined {
  return DOCUMENT_ZONES.find((zone) => zone.slug === slug);
}

export function documentZoneByCategory(category: string): DocumentZone | undefined {
  return DOCUMENT_ZONES.find((zone) => zone.category === category);
}

/** 原 asset 站路由；Bay 用目录参数，测试仍锁这个地址形态。 */
export function documentZoneHref(slug: string): string {
  return `/zones/${slug}`;
}

/** 地址或站点类目里的 slug / category 都认成目录键。 */
export function documentZoneCategoryKey(raw: string | null | undefined): string {
  const value = typeof raw === "string" ? raw.trim() : "";
  if (!value) return "";
  const bySlug = documentZoneBySlug(value);
  if (bySlug) return bySlug.category;
  const byCategory = documentZoneByCategory(value);
  return byCategory ? byCategory.category : "";
}
