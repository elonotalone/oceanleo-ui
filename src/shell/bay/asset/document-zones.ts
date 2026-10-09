export type DocumentZoneType = "document" | "ppt" | "image";

export type DocumentZone = {
  slug: string;
  category: string;
  title: string;
  type: DocumentZoneType;
  licenseLabel: string;
  formats: string[];
};

export const DOCUMENT_ZONES: readonly DocumentZone[] = Object.freeze([
  {
    slug: "contract",
    category: "legal-contract-model",
    title: "合同区",
    type: "document",
    licenseLabel: "官方公有领域",
    formats: ["doc", "pdf"],
  },
  {
    slug: "diligence",
    category: "legal-diligence",
    title: "尽职调查区",
    type: "document",
    licenseLabel: "官方公有领域",
    formats: ["docx", "pdf", "md"],
  },
  {
    slug: "litigation",
    category: "legal-litigation-form",
    title: "诉讼文书区",
    type: "document",
    licenseLabel: "官方公有领域",
    formats: ["docx", "doc"],
  },
  {
    slug: "lawyer",
    category: "legal-lawyer-template",
    title: "律师文书区",
    type: "document",
    licenseLabel: "OceanLeo 自有",
    formats: ["docx"],
  },
  {
    slug: "resume",
    category: "resume-template",
    title: "简历区",
    type: "document",
    licenseLabel: "OceanLeo 自有",
    formats: ["docx", "png"],
  },
  {
    slug: "flowchart",
    category: "flowchart-diagram",
    title: "流程架构图区",
    type: "ppt",
    licenseLabel: "OceanLeo 自有",
    formats: ["pptx", "png"],
  },
  {
    slug: "poster",
    category: "longform-poster",
    title: "长图海报区",
    type: "image",
    licenseLabel: "OceanLeo 自有",
    formats: ["psd", "png"],
  },
  {
    slug: "ecommerce",
    category: "ecommerce-detail",
    title: "电商详情区",
    type: "image",
    licenseLabel: "OceanLeo 自有",
    formats: ["psd", "png"],
  },
]);

export function documentZonesForType(type: string): readonly DocumentZone[] {
  return DOCUMENT_ZONES.filter((zone) => zone.type === type);
}

export function documentZoneBySlug(slug: string): DocumentZone | undefined {
  return DOCUMENT_ZONES.find((zone) => zone.slug === slug);
}
