/** Wire contract owned by TAXB; labels and navigation order are server data. */
export type MaterialLabels = { zh: string; en: string } & Record<string, string>;
export interface MaterialTerm { id: string; labels: MaterialLabels }
export interface MaterialCategory extends MaterialTerm { contentTypes: MaterialTerm[] }
export interface MaterialShelf extends MaterialTerm { artifactTypes: string[]; categories: MaterialCategory[] }
export interface MaterialTaxonomy { version: number; shelves: MaterialShelf[]; tagVocabularies: Record<string, MaterialTerm[]> }
export interface MaterialFilters { category: string; contentType: string; tags: Record<string, string[]>; format: string }
export const emptyMaterialFilters = (): MaterialFilters => ({ category: "", contentType: "", tags: {}, format: "" });

export function materialLabel(term: MaterialTerm, locale: string): string {
  return term.labels[locale] || (locale.startsWith("zh") ? term.labels.zh : term.labels.en) || term.labels.en || term.id;
}

export function parseMaterialTaxonomy(raw: unknown): MaterialTaxonomy {
  const body = raw as MaterialTaxonomy | null;
  const term = (value: MaterialTerm) => Boolean(value && typeof value.id === "string" && value.id &&
    value.labels && typeof value.labels.zh === "string" && typeof value.labels.en === "string");
  if (!body || body.version !== 1 || !Array.isArray(body.shelves) || !body.shelves.length ||
    !body.shelves.every((shelf) => term(shelf) && Array.isArray(shelf.artifactTypes) && shelf.artifactTypes.every((type) => typeof type === "string") && Array.isArray(shelf.categories) &&
      shelf.categories.every((category) => term(category) && Array.isArray(category.contentTypes) && category.contentTypes.every(term))) ||
    !body.tagVocabularies || typeof body.tagVocabularies !== "object" ||
    !Object.values(body.tagVocabularies).every((values) => Array.isArray(values) && values.every(term)) ||
    new Set(body.shelves.map((shelf) => shelf.id)).size !== body.shelves.length) {
    throw new Error("素材分类未能加载，请重试。");
  }
  return body;
}

export function readMaterialFilters(search: string, shelf?: MaterialShelf, taxonomy?: MaterialTaxonomy): MaterialFilters {
  const params = new URLSearchParams(search);
  const category = shelf?.categories.find((row) => row.id === params.get("cat"));
  const filters = emptyMaterialFilters();
  filters.category = category?.id || "";
  filters.contentType = category?.contentTypes.find((row) => row.id === params.get("contentType"))?.id || "";
  filters.format = shelf?.artifactTypes.includes(params.get("format") || "") ? params.get("format")! : "";
  for (const [key, values] of Object.entries(taxonomy?.tagVocabularies || {})) {
    const selected = params.getAll(`tag.${key}`).filter((id) => values.some((row) => row.id === id));
    if (selected.length) filters.tags[key] = selected;
  }
  return filters;
}

export function materialSearch(search: string, shelf: string | null, filters: MaterialFilters): string {
  const params = new URLSearchParams(search);
  for (const key of [...params.keys()]) {
    if (["type", "cat", "contentType", "format", "view", "zone", "industry", "series", "subtab", "sellerSite"].includes(key) || key.startsWith("tag.")) params.delete(key);
  }
  if (shelf) params.set("type", shelf);
  if (filters.category) params.set("cat", filters.category);
  if (filters.contentType) params.set("contentType", filters.contentType);
  if (filters.format) params.set("format", filters.format);
  for (const [key, values] of Object.entries(filters.tags)) for (const value of values) params.append(`tag.${key}`, value);
  return params.toString();
}

export const MATERIAL_TAG_LABELS: Readonly<Record<string, string>> = {
  industry: "行业", occasion: "场合", style: "风格", colour: "颜色", platform: "平台", size: "尺寸", orientation: "方向",
};
