import { isFirstPartyMediaUrl } from "../lib/media-proxy";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "./library-data";
import type { VideoCanvasDependencyGrantOpenMetadata } from "./workbench-embed-types";

type JsonRecord = Record<string, unknown>;

interface StableArtifactIdentity {
  artifactId: string;
  revisionId: string;
}

function record(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function boundedText(value: unknown, maximum = 300): string {
  if (typeof value !== "string") return "";
  const candidate = value.trim();
  return candidate && candidate.length <= maximum ? candidate : "";
}

function textFrom(
  records: readonly (JsonRecord | null | undefined)[],
  ...keys: string[]
): string {
  for (const source of records) {
    if (!source) continue;
    for (const key of keys) {
      const value = boundedText(source[key]);
      if (value) return value;
    }
  }
  return "";
}

function stableArtifactIdentity(
  item: LibraryItem,
): StableArtifactIdentity | null {
  const projectedArtifactId = boundedText(item.artifact?.artifactId);
  const projectedRevisionId = boundedText(item.artifact?.revisionId);
  const directArtifactId = boundedText(item.artifactId);
  const directRevisionId = boundedText(item.revisionId);
  if (projectedArtifactId || projectedRevisionId) {
    if (
      !projectedArtifactId ||
      !projectedRevisionId ||
      (directArtifactId && directArtifactId !== projectedArtifactId) ||
      (directRevisionId && directRevisionId !== projectedRevisionId)
    ) {
      return null;
    }
    return {
      artifactId: projectedArtifactId,
      revisionId: projectedRevisionId,
    };
  }
  if (directArtifactId && directRevisionId) {
    return { artifactId: directArtifactId, revisionId: directRevisionId };
  }
  if (directArtifactId || directRevisionId) return null;
  const metaArtifactId = textFrom(
    [item.meta],
    "artifact_id",
    "artifactId",
  );
  const metaRevisionId = textFrom(
    [item.meta],
    "revision_id",
    "revisionId",
  );
  return metaArtifactId && metaRevisionId
    ? { artifactId: metaArtifactId, revisionId: metaRevisionId }
    : null;
}

function hasArtifactIdentitySignal(item: LibraryItem): boolean {
  return Boolean(
    item.artifact ||
      item.artifactId ||
      item.revisionId ||
      item.meta.artifact_id ||
      item.meta.revision_id,
  );
}

function websiteProjectId(item: LibraryItem): string {
  const artifact = record(item.artifact);
  const artifactMeta = record(artifact?.meta);
  return textFrom(
    [artifact, artifactMeta, item.meta],
    "website_id",
    "project_id",
    "websiteId",
    "projectId",
    "slug",
    "site_id",
  );
}

function isWebsiteEmbedItem(item: LibraryItem): boolean {
  if (item.kind === "website") return true;
  if (item.artifactType === "website") return true;
  if (item.artifact?.artifactType === "website") return true;
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
  const hasArtifactSignal = hasArtifactIdentitySignal(item);
  const hasWebsiteProjectIdentity =
    isWebsiteEmbedItem(item) &&
    Boolean(
      websiteProjectId(item) ||
        textFrom([item.meta], "starter_id", "github_repo", "commit_sha"),
    );
  const hasDurableOrProjectIdentity = Boolean(
    hasArtifactSignal ||
      stableArtifactIdentity(item) ||
      hasWebsiteProjectIdentity,
  );
  return (
    (item.meta.draft === true || item.meta.blank === true) &&
    !item.url &&
    !item.previewUrl &&
    !hasDurableOrProjectIdentity
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
  const projectId = websiteProjectId(item);
  const starterId = textFrom([item.meta], "starter_id");
  const githubRepo = textFrom([item.meta], "github_repo");
  const commitSha = textFrom([item.meta], "commit_sha");
  const identity = stableArtifactIdentity(item);
  const artifactSignal = hasArtifactIdentitySignal(item);
  if (artifactSignal && !identity) {
    // A partial or conflicting durable identity must fail closed. In
    // particular it must never reopen the card's starter as substitute source.
    return { sourceIdentity: "invalid" };
  }

  const params: Record<string, string> = { ...blank };
  if (projectId) {
    params.projectId = projectId;
    // Adapter still reads projectId || siteId; keep siteId as a project alias only.
    params.siteId = projectId;
  }
  if (identity) {
    params.artifactId = identity.artifactId;
    params.revisionId = identity.revisionId;
  } else {
    if (starterId) params.starterId = starterId;
    if (githubRepo) params.githubRepo = githubRepo;
    if (commitSha) params.commitSha = commitSha;
  }

  return Object.keys(params).length ? params : undefined;
}

function isVideoCanvasProject(item: LibraryItem): boolean {
  return (
    item.kind === "video_canvas" ||
    item.artifact?.editorCapability === "video-canvas" ||
    item.meta.editor === "video-canvas" ||
    item.meta.editor_capability === "video-canvas"
  );
}

function exactSha256Digest(value: unknown): string {
  const candidate = boundedText(value, 80);
  return /^(?:sha256:)?[0-9a-f]{64}$/i.test(candidate) ? candidate : "";
}

function trustedArtifactSourceUrl(value: unknown): string {
  const candidate = boundedText(value, 4_096);
  if (!candidate) return "";
  try {
    const parsed = new URL(candidate);
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      (parsed.port && parsed.port !== "443") ||
      !isFirstPartyMediaUrl(parsed.toString())
    ) {
      return "";
    }
    return candidate;
  } catch {
    return "";
  }
}

function verifiedVideoProjectSource(item: LibraryItem): {
  url: string;
  digest: string;
} | null {
  if (
    !isDurableLibraryItem(item) ||
    item.artifactType !== "workflow" ||
    item.artifact.artifactType !== "workflow" ||
    item.artifact.editorCapability !== "video-canvas" ||
    item.artifact.sourceFormat !== "oceanleo.video.project.v2" ||
    !item.artifact.integrity?.ok ||
    !item.artifact.access?.canRead ||
    (!item.artifact.access?.canEdit && !item.artifact.access?.canFork) ||
    item.artifact.editability === "view_only"
  ) {
    return null;
  }
  const source = item.artifact.renditions?.source;
  const url = trustedArtifactSourceUrl(source?.url);
  const digest = exactSha256Digest(source?.digest);
  if (
    !source ||
    source.purpose !== "source" ||
    source.revisionId !== item.revisionId ||
    !url ||
    !digest
  ) {
    return null;
  }
  return { url, digest };
}

function freshVideoCanvasGrants(
  item: LibraryItem,
  identity: StableArtifactIdentity | null,
  supplied?: VideoCanvasDependencyGrantOpenMetadata,
): VideoCanvasDependencyGrantOpenMetadata["video_canvas_dependency_grants"] | null {
  const canonicalId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (
    !supplied ||
    !identity ||
    !canonicalId.test(identity.artifactId) ||
    !canonicalId.test(identity.revisionId) ||
    !isDurableLibraryItem(item) ||
    !isVideoCanvasProject(item)
  ) {
    return null;
  }
  const grants = supplied.video_canvas_dependency_grants;
  if (!Array.isArray(grants) || grants.length > 4_999) return null;
  const seenAssetIds = new Set<string>();
  const seenPaths = new Set<string>();
  const valid = grants.every((grant) => {
    let url: URL;
    let gateway: URL;
    try {
      url = new URL(grant.accessUrl);
      gateway = new URL(grant.gatewayOrigin);
    } catch {
      return false;
    }
    const validGrant = (
      grant.artifactId === identity.artifactId &&
      grant.revisionId === identity.revisionId &&
      typeof grant.assetId === "string" && grant.assetId.length > 0 && grant.assetId.length <= 256 &&
      typeof grant.path === "string" && grant.path.length <= 1_024 &&
      grant.path.startsWith("assets/") && !/[?#%\\\0]/.test(grant.path) &&
      grant.path.split("/").every((part) => part && part !== "." && part !== "..") &&
      /^[a-f0-9]{64}$/i.test(grant.sha256) &&
      /^(?:image|video|audio)\/[a-z0-9.+-]+$/i.test(grant.mediaType) &&
      Number.isSafeInteger(grant.byteSize) && grant.byteSize > 0 && grant.byteSize <= 20_000_000 &&
      gateway.origin === grant.gatewayOrigin &&
      url.protocol === "https:" && url.origin === gateway.origin &&
      isFirstPartyMediaUrl(url.href) &&
      /^\/v1\/artifact-renditions\/access\/[^/?#]+$/.test(url.pathname) &&
      !url.search && !url.hash && !url.username && !url.password &&
      Number.isFinite(Date.parse(grant.expiresAt)) && Date.parse(grant.expiresAt) > Date.now() + 1_000
    );
    if (
      !validGrant ||
      seenAssetIds.has(grant.assetId) ||
      seenPaths.has(grant.path)
    ) {
      return false;
    }
    seenAssetIds.add(grant.assetId);
    seenPaths.add(grant.path);
    return true;
  });
  return valid ? grants : null;
}

export function buildOpenAssetPayload(
  item: LibraryItem,
  openAssetMeta?: VideoCanvasDependencyGrantOpenMetadata,
): {
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
  const identity = stableArtifactIdentity(item);
  const artifactType = boundedText(
    item.artifact?.artifactType || item.artifactType,
    80,
  );
  const meta: Record<string, unknown> = { ...item.meta };
  // This reserved capability is never replayed from Library metadata. Only a
  // freshly validated W04 host prop can cross the existing open-asset channel.
  delete meta.video_canvas_dependency_grants;
  const websiteArtifactSignal =
    isWebsiteEmbedItem(item) && hasArtifactIdentitySignal(item);
  if (websiteArtifactSignal) {
    for (const key of [
      "starter_id",
      "starterId",
      "github_repo",
      "githubRepo",
      "commit_sha",
      "commitSha",
      "source_snapshot_id",
      "sourceSnapshotId",
    ]) {
      delete meta[key];
    }
    if (!identity) {
      for (const key of [
        "artifact_id",
        "artifactId",
        "revision_id",
        "revisionId",
        "website_id",
        "websiteId",
        "project_id",
        "projectId",
        "site_id",
        "slug",
      ]) {
        delete meta[key];
      }
      meta.website_source_identity_invalid = true;
    }
  }
  const videoCanvasProject = isVideoCanvasProject(item);
  if (videoCanvasProject) {
    // Trust-bearing fields are host assertions, never reusable item metadata.
    delete meta.verified;
    delete meta.content_digest;
    delete meta.contentDigest;
    delete meta.sha256;
  }
  const verifiedSource = videoCanvasProject
    ? verifiedVideoProjectSource(item)
    : null;
  if (isDurableLibraryItem(item) && videoCanvasProject) {
    // Durable projects must reopen from their fixed source rendition rather
    // than a stale inline compatibility copy.
    delete meta.workflow_json;
    delete meta.project_json;
  }
  const freshGrants = verifiedSource
    ? freshVideoCanvasGrants(item, identity, openAssetMeta)
    : null;
  if (freshGrants?.length) {
    meta.video_canvas_dependency_grants = freshGrants;
  }
  if (verifiedSource) {
    meta.verified = true;
    meta.content_digest = verifiedSource.digest;
  }
  if (identity) {
    meta.artifact_id = identity.artifactId;
    meta.revision_id = identity.revisionId;
  }
  return {
    id: item.id,
    kind: item.kind,
    title: item.title,
    url: verifiedSource?.url || item.url,
    previewUrl: item.previewUrl,
    meta,
    writable: !(
      item.siteId === "asset" ||
      item.key.startsWith("asset:") ||
      item.meta.asset_id ||
      item.meta.platform_asset_id
    ),
    ...(identity
      ? {
          artifactId: identity.artifactId,
          revisionId: identity.revisionId,
        }
      : {}),
    ...(artifactType ? { artifactType } : {}),
  };
}
