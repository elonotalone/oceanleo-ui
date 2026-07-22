import type { LibraryItem } from "./library-data";

function textMeta(item: LibraryItem, ...keys: string[]): string {
  for (const key of keys) {
    const value = item.meta[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function isWebsiteEmbedItem(item: LibraryItem): boolean {
  if (item.kind === "website") return true;
  if (item.artifactType === "website") return true;
  const contentType = String(
    item.descriptor?.contentType ||
      item.meta.content_type ||
      item.meta.asset_type ||
      "",
  )
    .trim()
    .toLowerCase();
  return contentType === "website";
}

export function isWebsiteBlankDraft(item: LibraryItem): boolean {
  return (
    (item.meta.draft === true || item.meta.blank === true) &&
    !item.url &&
    !item.previewUrl
  );
}

/**
 * Query extras for website.oceanleo.com/embed/site-editor.
 * Host workbench site keys must never be treated as website project ids.
 */
export function websiteEmbedExtraParams(
  item: LibraryItem,
): Record<string, string> | undefined {
  const blank: Record<string, string> = isWebsiteBlankDraft(item)
    ? { blank: "1" }
    : {};
  if (!isWebsiteEmbedItem(item)) {
    return Object.keys(blank).length ? blank : undefined;
  }

  // Prefer website/project identity from the artifact card — never the host site key.
  const projectId = textMeta(
    item,
    "website_id",
    "project_id",
    "slug",
    "site_id",
  );
  const starterId = textMeta(item, "starter_id");
  const githubRepo = textMeta(item, "github_repo");
  const commitSha = textMeta(item, "commit_sha");
  const artifactId = String(
    item.artifactId || item.artifact?.artifactId || "",
  ).trim();
  const revisionId = String(
    item.revisionId || item.artifact?.revisionId || "",
  ).trim();

  const params: Record<string, string> = { ...blank };
  if (projectId) {
    params.projectId = projectId;
    // Adapter still reads projectId || siteId; keep siteId as a project alias only.
    params.siteId = projectId;
  }
  if (starterId) params.starterId = starterId;
  if (githubRepo) params.githubRepo = githubRepo;
  if (commitSha) params.commitSha = commitSha;
  if (artifactId) params.artifactId = artifactId;
  if (revisionId) params.revisionId = revisionId;

  return Object.keys(params).length ? params : undefined;
}

export function buildOpenAssetPayload(item: LibraryItem): {
  id: string;
  kind: string;
  title: string;
  url?: string;
  previewUrl?: string;
  meta: Record<string, unknown>;
  writable: boolean;
  artifactId?: string;
  revisionId?: string;
  artifactType?: string;
} {
  const artifactId = String(
    item.artifactId || item.artifact?.artifactId || "",
  ).trim();
  const revisionId = String(
    item.revisionId || item.artifact?.revisionId || "",
  ).trim();
  const artifactType = String(
    item.artifactType || item.artifact?.artifactType || "",
  ).trim();
  const meta: Record<string, unknown> = { ...item.meta };
  if (artifactId) meta.artifact_id = artifactId;
  if (revisionId) meta.revision_id = revisionId;
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: item.url,
    previewUrl: item.previewUrl,
    meta,
    writable: !(
      item.siteId === "asset" ||
      item.key.startsWith("asset:") ||
      item.meta.asset_id ||
      item.meta.platform_asset_id
    ),
    ...(artifactId ? { artifactId } : {}),
    ...(revisionId ? { revisionId } : {}),
    ...(artifactType ? { artifactType } : {}),
  };
}
