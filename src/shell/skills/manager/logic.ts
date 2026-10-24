// Skills overhaul 2026-10-24 — W09B pure logic (no React, no network).
// Contract: oceanleo/docs/work-logs/2026-10-24-skills-overhaul/00-contract.md §3.2 / §3.4.
// Everything here works on the structural shapes of §3.2 so the unit tests can
// exercise it without the gateway client.

export type FolderSource = "official" | "upload" | "github" | "created" | "copy";

export const FOLDER_SOURCES: readonly FolderSource[] = [
  "official",
  "upload",
  "github",
  "created",
  "copy",
] as const;

/** §4 category ids, in display order. */
export const SKILL_CATEGORY_IDS = [
  "research",
  "data",
  "marketing",
  "cn-platforms",
  "business",
  "media",
  "create",
  "docs",
  "build",
  "meta",
] as const;
export type SkillCategoryId = (typeof SKILL_CATEGORY_IDS)[number];

/** Chinese labels (= tt() keys) for the ten §4 categories. */
export const SKILL_CATEGORY_LABEL_ZH: Readonly<Record<SkillCategoryId, string>> = {
  research: "研究与情报",
  data: "数据与金融",
  marketing: "营销与增长",
  "cn-platforms": "中文内容平台",
  business: "商业与电商",
  media: "音视频",
  create: "创作与设计",
  docs: "文档与办公",
  build: "开发与自动化",
  meta: "技能与工具",
};

/** Chinese labels (= tt() keys) for folder sources. */
export const FOLDER_SOURCE_LABEL_ZH: Readonly<Record<FolderSource, string>> = {
  official: "官方",
  upload: "上传",
  github: "GitHub",
  created: "自建",
  copy: "复制",
};

/** Minimal structural view of §3.2 `Folder` that the logic needs. */
export interface FolderLike {
  id: string;
  title: string;
  source: FolderSource | string;
  origin?: Record<string, unknown> | null;
  project_id?: string | null;
  skill: null | { name: string; description: string; enabled: boolean };
  updated_at?: string;
  can_edit?: boolean;
  official?: null | {
    name: string;
    title?: string;
    title_zh?: string;
    description?: string;
    summary_zh?: string;
    category?: string;
  };
}

/** Minimal structural view of §3.2 `OfficialSkill`. */
export interface OfficialLike {
  name: string;
  title: string;
  title_zh?: string;
  description: string;
  summary_zh?: string;
  category: string;
}

export interface ManagerFilter {
  query: string;
  sources: readonly string[];
  categories: readonly string[];
  enabledOnly: boolean;
}

export const EMPTY_FILTER: ManagerFilter = {
  query: "",
  sources: [],
  categories: [],
  enabledOnly: false,
};

export function filterIsActive(filter: ManagerFilter): boolean {
  return filter.sources.length > 0 || filter.categories.length > 0 || filter.enabledOnly;
}

/** D7: imported content (zip / .skill / GitHub) is unreviewed; a copy keeps its origin's verdict. */
export function isUnreviewedSource(folder: Pick<FolderLike, "source" | "origin">): boolean {
  if (folder.source === "upload" || folder.source === "github") return true;
  if (folder.source === "copy") {
    const originSource = folder.origin && typeof folder.origin === "object" ? folder.origin.source : undefined;
    return originSource === "upload" || originSource === "github";
  }
  return false;
}

/**
 * D7 + §3.2: the gateway decides the stored default; the UI mirrors it so an
 * optimistic placeholder shows the same state. Imported → off; official / created → on;
 * copies inherit the origin rule.
 */
export function defaultEnabledFor(folder: Pick<FolderLike, "source" | "origin">): boolean {
  return !isUnreviewedSource(folder);
}

/** Category of a folder: official reference → its category; anything else → null. */
export function folderCategory(folder: FolderLike): string | null {
  const category = folder.official?.category;
  if (typeof category === "string" && category) return category;
  const originCategory = folder.origin && typeof folder.origin === "object" ? folder.origin.category : undefined;
  return typeof originCategory === "string" && originCategory ? originCategory : null;
}

/** Name the agent knows the skill by (`/name`). Plain folders have none. */
export function folderSkillName(folder: FolderLike): string {
  return folder.skill?.name || folder.official?.name || "";
}

export function folderDescription(folder: FolderLike, locale: string): string {
  if (folder.official) {
    if (isChineseLocale(locale) && folder.official.summary_zh) return folder.official.summary_zh;
    if (folder.official.description) return folder.official.description;
  }
  return folder.skill?.description || "";
}

export function folderDisplayTitle(folder: FolderLike, locale: string): string {
  if (folder.official) {
    if (isChineseLocale(locale) && folder.official.title_zh) return folder.official.title_zh;
    if (folder.official.title) return folder.official.title;
  }
  return folder.title || folder.skill?.name || "";
}

export function isChineseLocale(locale: string): boolean {
  return locale === "zh" || locale.toLowerCase().startsWith("zh");
}

export function officialDisplayTitle(skill: OfficialLike, locale: string): string {
  if (isChineseLocale(locale) && skill.title_zh) return skill.title_zh;
  return skill.title || skill.name;
}

export function officialDescription(skill: OfficialLike, locale: string): string {
  if (isChineseLocale(locale) && skill.summary_zh) return skill.summary_zh;
  return skill.description;
}

function norm(value: string): string {
  return value.normalize("NFKC").toLowerCase().trim();
}

/** Search = name + title + description (both languages when present). */
export function folderMatchesQuery(folder: FolderLike, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const haystack = [
    folder.title,
    folder.skill?.name,
    folder.skill?.description,
    folder.official?.name,
    folder.official?.title,
    folder.official?.title_zh,
    folder.official?.description,
    folder.official?.summary_zh,
  ]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map(norm)
    .join("\n");
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

export function officialMatchesQuery(skill: OfficialLike, query: string): boolean {
  const q = norm(query);
  if (!q) return true;
  const haystack = [skill.name, skill.title, skill.title_zh, skill.description, skill.summary_zh]
    .filter((part): part is string => typeof part === "string" && part.length > 0)
    .map(norm)
    .join("\n");
  return q
    .split(/\s+/)
    .filter(Boolean)
    .every((term) => haystack.includes(term));
}

function enabledOf(folder: FolderLike): boolean {
  return Boolean(folder.skill?.enabled);
}

export function filterFolders<T extends FolderLike>(items: readonly T[], filter: ManagerFilter): T[] {
  return items.filter((folder) => {
    if (filter.sources.length > 0 && !filter.sources.includes(String(folder.source))) return false;
    if (filter.categories.length > 0) {
      const category = folderCategory(folder);
      if (!category || !filter.categories.includes(category)) return false;
    }
    if (filter.enabledOnly && !enabledOf(folder)) return false;
    return folderMatchesQuery(folder, filter.query);
  });
}

function time(value: string | undefined): number {
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** Newest first; ties by title so the grid never reshuffles between renders. */
export function sortFolders<T extends FolderLike>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => {
    const delta = time(b.updated_at) - time(a.updated_at);
    if (delta !== 0) return delta;
    return (a.title || "").localeCompare(b.title || "");
  });
}

export function filterOfficial<T extends OfficialLike>(
  items: readonly T[],
  category: string,
  query: string,
): T[] {
  return items.filter(
    (skill) => (category === "all" || skill.category === category) && officialMatchesQuery(skill, query),
  );
}

/** Contract §3.4 P3: "added" = the scope's folder list has a skill with the same name. */
export function isOfficialAdded(folders: readonly FolderLike[], name: string): boolean {
  return folders.some((folder) => folderSkillName(folder) === name);
}

/** Folder that already holds the official skill (for "✓ Added" → open). */
export function findAddedFolder<T extends FolderLike>(folders: readonly T[], name: string): T | null {
  return folders.find((folder) => folderSkillName(folder) === name) ?? null;
}

/** Category ids that actually appear in a folder list, in §4 order (+ unknown ids last). */
export function presentCategories(folders: readonly FolderLike[]): string[] {
  const seen = new Set<string>();
  for (const folder of folders) {
    const category = folderCategory(folder);
    if (category) seen.add(category);
  }
  const known = SKILL_CATEGORY_IDS.filter((id) => seen.has(id));
  const unknown = [...seen].filter((id) => !(SKILL_CATEGORY_IDS as readonly string[]).includes(id)).sort();
  return [...known, ...unknown];
}

export function presentSources(folders: readonly FolderLike[]): string[] {
  const seen = new Set(folders.map((folder) => String(folder.source)));
  return FOLDER_SOURCES.filter((source) => seen.has(source));
}

export function toggleValue(list: readonly string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/** Apply an optimistic patch to one folder; returns a new array. */
export function patchFolder<T extends FolderLike>(items: readonly T[], id: string, patch: (folder: T) => T): T[] {
  return items.map((folder) => (folder.id === id ? patch(folder) : folder));
}

export function withEnabled<T extends FolderLike>(folder: T, enabled: boolean): T {
  if (!folder.skill) return folder;
  return { ...folder, skill: { ...folder.skill, enabled } };
}

/** Insert or replace by id (server returned the canonical row); newest first. */
export function upsertFolder<T extends FolderLike>(items: readonly T[], folder: T): T[] {
  const rest = items.filter((item) => item.id !== folder.id);
  return [folder, ...rest];
}

// ── `/` picker ───────────────────────────────────────────────────────────────

export type SkillScope = "personal" | "project";

export interface AvailableSkill {
  name: string;
  title: string;
  description: string;
  scope: SkillScope;
}

/**
 * Merge personal + project skills. Runtime (§3.3) looks up a name in the
 * project first, then personal; the picker shows one row per name with the
 * same precedence. Plain folders (no skill) are dropped.
 */
export function mergeAvailableSkills(
  personal: readonly FolderLike[],
  project: readonly FolderLike[],
  locale: string,
): AvailableSkill[] {
  const byName = new Map<string, AvailableSkill>();
  const take = (folder: FolderLike, scope: SkillScope) => {
    const name = folderSkillName(folder);
    if (!name || byName.has(name)) return;
    byName.set(name, {
      name,
      title: folderDisplayTitle(folder, locale) || name,
      description: folderDescription(folder, locale),
      scope,
    });
  };
  for (const folder of project) take(folder, "project");
  for (const folder of personal) take(folder, "personal");
  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * `/` filter: names starting with the query first, then names / titles
 * containing it. Empty query → everything (alphabetical).
 */
export function filterPickerSkills(skills: readonly AvailableSkill[], query: string): AvailableSkill[] {
  const q = norm(query.replace(/^\//, ""));
  if (!q) return [...skills];
  const prefix: AvailableSkill[] = [];
  const contains: AvailableSkill[] = [];
  for (const skill of skills) {
    const name = norm(skill.name);
    if (name.startsWith(q)) prefix.push(skill);
    else if (name.includes(q) || norm(skill.title).includes(q)) contains.push(skill);
  }
  return [...prefix, ...contains];
}

/** Clamp a keyboard index into the list (wraps both ways). */
export function wrapIndex(index: number, length: number): number {
  if (length <= 0) return -1;
  return ((index % length) + length) % length;
}

// ── create-skill form ────────────────────────────────────────────────────────

export const SKILL_NAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/;

/** Turn any title into a kebab-case skill name candidate (ASCII only). */
export function slugifySkillName(input: string): string {
  return input
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64)
    .replace(/-+$/g, "");
}

export type CreateSkillProblem = "name" | "description" | "body" | null;

export function validateCreateSkill(input: { name: string; description: string; body: string }): CreateSkillProblem {
  if (!SKILL_NAME_PATTERN.test(input.name.trim())) return "name";
  const description = input.description.trim();
  if (!description || description.length > 1024) return "description";
  if (!input.body.trim()) return "body";
  return null;
}

/** §3.2 only accepts public github.com URLs; validate before the round trip. */
export function isSupportedGithubUrl(input: string): boolean {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.hostname !== "github.com" && url.hostname !== "www.github.com") return false;
  const parts = url.pathname.split("/").filter(Boolean);
  return parts.length >= 2;
}

/** Accept only the two archive types the gateway imports. */
export function isImportableArchive(fileName: string): boolean {
  return /\.(zip|skill)$/i.test(fileName.trim());
}

/** Short date for card footers: "10月24日 10:34" / "Oct 24, 10:34 AM". */
export function formatUpdatedAt(value: string | undefined, locale: string): string {
  const ms = time(value);
  if (!ms) return "";
  try {
    return new Intl.DateTimeFormat(locale, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
  }
}

/** Long date for the detail header: "2026年10月24日" / "Oct 24, 2026". */
export function formatLongDate(value: string | undefined, locale: string): string {
  const ms = time(value);
  if (!ms) return "";
  try {
    return new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" }).format(new Date(ms));
  } catch {
    return new Date(ms).toISOString().slice(0, 10);
  }
}
