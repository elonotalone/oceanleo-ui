/**
 * Code websites (any framework, backed by git) are stored in the Library as
 * a website-project manifest (`projectSchema: "oceanleo.website-project.v1"`,
 * a `files` list and the git-backed `projectId`), not as the visual
 * `website-source` document. They open on the runtime preview,
 * never on the visual editor's §3.1 validator.
 */

export const WEBSITE_PROJECT_SCHEMA = "oceanleo.website-project.v1";

const PROJECT_ID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface WebsiteCodeProject {
  projectId: string;
  fileCount: number;
  entryPath: string;
}

export function websiteCodeProjectFromValue(value: unknown): WebsiteCodeProject | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.projectSchema !== WEBSITE_PROJECT_SCHEMA) return null;
  if (!Array.isArray(record.files)) return null;
  const projectId = typeof record.projectId === "string" ? record.projectId.trim() : "";
  if (!PROJECT_ID_RE.test(projectId)) return null;
  const pages = Array.isArray(record.pages) ? record.pages : [];
  const first = pages[0] && typeof pages[0] === "object" ? (pages[0] as Record<string, unknown>) : null;
  return {
    projectId,
    fileCount: record.files.length,
    entryPath: typeof first?.sourcePath === "string" ? first.sourcePath : "",
  };
}

/** Entry text of a Library website → its code project, or null for visual sites. */
export function websiteCodeProjectFromText(text: string): WebsiteCodeProject | null {
  if (!text || !text.includes(WEBSITE_PROJECT_SCHEMA)) return null;
  try {
    return websiteCodeProjectFromValue(JSON.parse(text));
  } catch {
    return null;
  }
}
