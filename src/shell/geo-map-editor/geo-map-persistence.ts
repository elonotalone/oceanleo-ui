/**
 * `oceanleo.geo-map.v1` commit plane.
 *
 * §1.1 pins `source_integrity = complete_dependency_closure`, so a revision is
 * only ever published together with every byte its `sources[]` resolve through
 * (§3.3 `resolving`, §6 F3). Every failure returns a coded result instead of
 * throwing a bare string, and a `degraded` closure can never be saved (§3.3
 * illegal transition `degraded → saving`).
 */

import { createArtifactRevision, forkArtifact } from "../artifact-client";
import { isDurableLibraryItem, type LibraryItem } from "../library-data";
import { uploadFile } from "../../lib/database";
import {
  GEO_MAP_ARTIFACT_TYPE,
  GEO_MAP_CLOSURE_FLOORS,
  GEO_MAP_CONSTANTS,
  GEO_MAP_PROJECT_SCHEMA,
  canonicalGeoMapProject,
  evaluateGeoMapCompleteness,
  evaluateGeoMapSimilarity,
  repairGeoMapLabelContrast,
  type GeoMapDependency,
  type GeoMapDependencyMediaType,
  type GeoMapProject,
  type GeoMapValidationError,
} from "./geo-map-schema";
import {
  GEO_MAP_EDITOR_ADAPTER,
  GEO_MAP_EDITOR_ID,
  assertGeoMapRoundtrip,
  auditGeoMapNetworkReach,
  resolveGeoMapDependencyClosure,
  type GeoMapAvailableDependency,
} from "./geo-map-source";

export interface GeoMapUploadReceipt {
  ok: boolean;
  url?: string;
  digest?: string;
  error?: string;
}

export interface GeoMapPublishReceipt {
  ok: boolean;
  item?: LibraryItem;
  error?: string;
  code?: string;
}

export interface GeoMapRevisionCommit {
  expectedRevisionId: string;
  artifactType: string;
  source: { format: string; url: string; digest: string };
  renditions: Array<{
    purpose: "thumbnail" | "preview" | "full" | "editor_manifest";
    url: string;
    digest: string;
  }>;
  scene: {
    schema: string;
    closureDigest: string;
    dependencyRevisionIds: string[];
  };
  provenance: Record<string, unknown>;
}

export interface GeoMapPersistenceRuntime {
  upload: (
    blob: Blob,
    options: {
      filename: string;
      mediaType: string;
      siteId: string;
      title: string;
      idempotencyKey: string;
    },
  ) => Promise<GeoMapUploadReceipt>;
  publish: (
    artifactId: string,
    commit: GeoMapRevisionCommit,
  ) => Promise<GeoMapPublishReceipt>;
  fork?: (item: LibraryItem) => Promise<GeoMapPublishReceipt>;
  digest: (blob: Blob) => Promise<string>;
}

export interface GeoMapDependencyBlob {
  path: string;
  mediaType: GeoMapDependencyMediaType;
  blob: Blob;
}

export interface GeoMapCommitArgs {
  item: LibraryItem;
  title: string;
  editRevision: number;
  project: GeoMapProject;
  siteId?: string;
  /** PNG cover; C37 requires a ≥ 128 px short edge. */
  previewBlob?: Blob;
  /** Blobs for dependencies that are not durable yet. */
  dependencyBlobs?: readonly GeoMapDependencyBlob[];
  /** Dependencies already carried by the revision closure. */
  durableDependencies?: readonly GeoMapAvailableDependency[];
  /** §6 F6 / §7 A10-A11: same-family maps to score against before publishing. */
  cohort?: readonly GeoMapProject[];
  /** Contrast base beneath each symbol layer (§6 F8). */
  underlyingColorByLayerId?: Record<string, string>;
  runtime?: Partial<GeoMapPersistenceRuntime>;
}

export interface GeoMapCommitClosureEntry {
  path: string;
  sha256: string;
  mediaType: GeoMapDependencyMediaType;
  byteSize: number;
  url?: string;
}

export type GeoMapCommitResult =
  | {
      ok: true;
      artifactId: string;
      revisionId: string;
      previousRevisionId: string;
      projectUrl: string;
      projectSchema: typeof GEO_MAP_PROJECT_SCHEMA;
      json: string;
      project: GeoMapProject;
      closureDigest: string;
      closureBytes: number;
      closure: GeoMapCommitClosureEntry[];
      repairedLabelLayerIds: string[];
      item?: LibraryItem;
    }
  | { ok: false; errors: GeoMapValidationError[] };

function fail(
  code: GeoMapValidationError["code"],
  path: string,
  message: string,
): GeoMapValidationError {
  return { code, path, message };
}

async function sha256Hex(blob: Blob): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error(
      "当前环境缺少 Web Crypto，无法为 geo-map revision 生成 SHA-256",
    );
  }
  const digest = await globalThis.crypto.subtle.digest(
    "SHA-256",
    await blob.arrayBuffer(),
  );
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function normalizedDigest(value: unknown): string {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^sha256:/, "");
}

function safeFilename(value: string): string {
  const normalized = value
    .replace(/[\u0000-\u001f<>:"/\\|?*]+/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return normalized || "geo-map";
}

const defaultRuntime: GeoMapPersistenceRuntime = {
  upload: async (blob, options) => {
    const file = new File([blob], options.filename, { type: options.mediaType });
    const uploaded = await uploadFile(file, {
      siteId: options.siteId,
      title: options.title,
      registerAsset: false,
      idempotencyKey: options.idempotencyKey,
    });
    const row = uploaded.data?.file as
      | { url?: string; meta?: Record<string, unknown> }
      | undefined;
    return {
      ok: Boolean(uploaded.ok && row?.url),
      url: String(row?.url || "").trim() || undefined,
      digest: normalizedDigest(row?.meta?.content_digest || row?.meta?.sha256),
      error: uploaded.error,
    };
  },
  publish: async (artifactId, commit) => {
    const published = await createArtifactRevision(
      artifactId,
      commit as unknown as Parameters<typeof createArtifactRevision>[1],
    );
    return {
      ok: published.ok,
      item: published.data,
      error: published.error,
      code: published.code,
    };
  },
  fork: async (item) => {
    const forked = await forkArtifact(item);
    return { ok: forked.ok, item: forked.data, error: forked.error };
  },
  digest: sha256Hex,
};

/** C37: the cover must be a real PNG whose short edge is >= 128 px. */
async function pngCoverEdge(blob: Blob): Promise<number | null> {
  const header = new Uint8Array(await blob.slice(0, 33).arrayBuffer());
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (!signature.every((byte, index) => header[index] === byte)) return null;
  if (String.fromCharCode(...header.subarray(12, 16)) !== "IHDR") return null;
  const width =
    (header[16] << 24) | (header[17] << 16) | (header[18] << 8) | header[19];
  const height =
    (header[20] << 24) | (header[21] << 16) | (header[22] << 8) | header[23];
  return Math.min(width, height);
}

function closureDigestOf(entries: readonly GeoMapCommitClosureEntry[]): string {
  // Order-independent: sort by path so the same closure always digests the same.
  const canonical = [...entries]
    .sort((left, right) => (left.path < right.path ? -1 : 1))
    .map((entry) => `${entry.path}\u0000${entry.sha256}\u0000${entry.byteSize}`)
    .join("\n");
  let hash = 0x811c9dc5;
  for (let index = 0; index < canonical.length; index += 1) {
    hash ^= canonical.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return `${hash.toString(16).padStart(8, "0")}${canonical.length
    .toString(16)
    .padStart(8, "0")}`;
}

/**
 * The closure digest above is a stable local fingerprint of `dependencies[]`;
 * the authoritative per-file digests are the sha256 values in the same payload.
 */
export function geoMapClosureDigest(
  entries: readonly GeoMapCommitClosureEntry[],
): string {
  return closureDigestOf(entries);
}

export async function commitGeoMapProject(
  args: GeoMapCommitArgs,
): Promise<GeoMapCommitResult> {
  const runtime: GeoMapPersistenceRuntime = {
    ...defaultRuntime,
    ...(args.runtime ?? {}),
  };
  const errors: GeoMapValidationError[] = [];

  // §6 F8 first: a halo flip changes the bytes we are about to freeze.
  const contrast = repairGeoMapLabelContrast({
    project: canonicalGeoMapProject(args.project),
    underlyingColorByLayerId: args.underlyingColorByLayerId,
  });
  errors.push(...contrast.failures);
  const project = contrast.project;

  let json: string;
  try {
    json = assertGeoMapRoundtrip(project);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : String(caught);
    return {
      ok: false,
      errors: [...errors, fail("geo-map-schema-violation", "$", message)],
    };
  }
  errors.push(...auditGeoMapNetworkReach(project));

  const declared: GeoMapDependency[] = project.dependencies ?? [];
  const blobByPath = new Map(
    (args.dependencyBlobs ?? []).map((entry) => [entry.path, entry]),
  );
  const closure: GeoMapCommitClosureEntry[] = [];
  for (const dependency of declared) {
    const pending = blobByPath.get(dependency.path);
    if (pending) {
      const digest = await runtime.digest(pending.blob);
      if (digest !== dependency.sha256.toLowerCase()) {
        errors.push(
          fail(
            "geo-map-dependency-closure-incomplete",
            `dependencies.${dependency.path}`,
            `dependency ${dependency.path} hashes to ${digest}, not the declared ${dependency.sha256}`,
          ),
        );
        continue;
      }
      closure.push({
        path: dependency.path,
        sha256: digest,
        mediaType: pending.mediaType,
        byteSize: pending.blob.size,
      });
      continue;
    }
    const durable = (args.durableDependencies ?? []).find(
      (entry) => entry.path === dependency.path,
    );
    if (!durable) {
      errors.push(
        fail(
          "geo-map-dependency-closure-incomplete",
          `dependencies.${dependency.path}`,
          `dependency ${dependency.path} has neither a pending blob nor a durable closure entry`,
        ),
      );
      continue;
    }
    closure.push({
      path: dependency.path,
      sha256: durable.sha256.toLowerCase(),
      mediaType: dependency.mediaType,
      byteSize: durable.byteSize ?? dependency.byteSize ?? 0,
    });
  }
  const verdict = resolveGeoMapDependencyClosure(
    project,
    closure.map((entry) => ({
      path: entry.path,
      sha256: entry.sha256,
      byteSize: entry.byteSize,
    })),
  );
  if (!verdict.canSave) {
    errors.push(
      ...verdict.errors,
      fail(
        "geo-map-dependency-closure-incomplete",
        "dependencies",
        `closure verdict is ${verdict.verdict}; §3.3 forbids saving anything but a resolved closure`,
      ),
    );
  }
  const closureBytes = closure.reduce((total, entry) => total + entry.byteSize, 0);
  for (const entry of closure) {
    if (entry.byteSize > GEO_MAP_CONSTANTS.dependencyByteMax) {
      errors.push(
        fail(
          "geo-map-dependency-closure-incomplete",
          `dependencies.${entry.path}`,
          `dependency ${entry.path} is ${entry.byteSize} B, above the ${GEO_MAP_CONSTANTS.dependencyByteMax} B per-file ceiling (C13)`,
        ),
      );
    }
  }
  if (closure.length > GEO_MAP_CONSTANTS.dependencyCountMax) {
    errors.push(
      fail(
        "geo-map-dependency-closure-incomplete",
        "dependencies",
        `closure holds ${closure.length} files, above the ${GEO_MAP_CONSTANTS.dependencyCountMax} file ceiling (C14)`,
      ),
    );
  }
  if (
    closure.length > 0 &&
    closureBytes < GEO_MAP_CLOSURE_FLOORS.dependencyClosureBytesMin
  ) {
    errors.push(
      fail(
        "geo-map-hollow",
        "dependencies",
        `closure is ${closureBytes} B, below the ${GEO_MAP_CLOSURE_FLOORS.dependencyClosureBytesMin} B floor (§8.1)`,
      ),
    );
  }

  const completeness = evaluateGeoMapCompleteness({
    project,
    sourceBytes: new TextEncoder().encode(json).byteLength,
    dependencyClosureBytes: closure.length > 0 ? closureBytes : undefined,
  });
  errors.push(...completeness.failures);

  if (args.cohort?.length) {
    const similarity = evaluateGeoMapSimilarity(project, args.cohort);
    errors.push(...similarity.failures);
  }

  if (!isDurableLibraryItem(args.item)) {
    errors.push(
      fail(
        "geo-map-commit-rejected",
        "item",
        "geo_map revision 需要同一 artifact root 的 artifactId / revisionId / artifact projection",
      ),
    );
  } else if (
    String(args.item.artifactType) !== GEO_MAP_ARTIFACT_TYPE ||
    String(args.item.artifact.artifactType) !== GEO_MAP_ARTIFACT_TYPE ||
    !args.item.artifact.integrity.ok ||
    (!args.item.artifact.access.canEdit && !args.item.artifact.access.canFork)
  ) {
    errors.push(
      fail(
        "geo-map-commit-rejected",
        "item.artifact",
        "geo_map revision 的 artifact type、integrity 或 ACL 不满足 native 编辑条件",
      ),
    );
  }

  const coverEdge = args.previewBlob ? await pngCoverEdge(args.previewBlob) : null;
  if (coverEdge === null) {
    errors.push(
      fail(
        "geo-map-commit-rejected",
        "previewBlob",
        "geo_map revision 必须带同 revision 的 PNG 封面（C37 短边 ≥ 128 px）",
      ),
    );
  } else if (coverEdge < GEO_MAP_CONSTANTS.coverMinEdgePx) {
    errors.push(
      fail(
        "geo-map-commit-rejected",
        "previewBlob",
        `封面短边 ${coverEdge} px 低于 ${GEO_MAP_CONSTANTS.coverMinEdgePx} px（C37）`,
      ),
    );
  }

  if (errors.length > 0) return { ok: false, errors };
  if (!isDurableLibraryItem(args.item)) {
    return {
      ok: false,
      errors: [fail("geo-map-commit-rejected", "item", "item is not durable")],
    };
  }

  const originalItem = args.item;
  let item = originalItem;
  if (
    item.artifact.owner.visibility === "public" ||
    !item.artifact.access.canEdit
  ) {
    if (!item.artifact.access.canFork) {
      return {
        ok: false,
        errors: [
          fail(
            "geo-map-commit-rejected",
            "item.artifact.access",
            "当前 geo_map 不可编辑且不允许 fork",
          ),
        ],
      };
    }
    const forked = await runtime.fork?.(item);
    if (
      !forked?.ok ||
      !forked.item ||
      !isDurableLibraryItem(forked.item) ||
      forked.item.artifactId === item.artifactId
    ) {
      return {
        ok: false,
        errors: [
          fail(
            "geo-map-commit-rejected",
            "fork",
            forked?.error || "geo_map fork 未返回独立可编辑的 artifact root",
          ),
        ],
      };
    }
    item = forked.item;
  }

  const siteId = args.siteId || item.siteId || "geo-map";
  const sourceBlob = new Blob([json], {
    type: "application/vnd.oceanleo.geo-map+json",
  });
  const sourceDigest = await runtime.digest(sourceBlob);
  const previewDigest = await runtime.digest(args.previewBlob as Blob);
  const idempotencyKey = [
    "geo-map-revision-v1",
    item.artifactId,
    item.revisionId,
    args.editRevision,
    sourceDigest.slice(0, 24),
  ].join(":");

  const pending = closure.filter((entry) => blobByPath.has(entry.path));
  const uploads = await Promise.all([
    runtime.upload(sourceBlob, {
      filename: `${safeFilename(args.title)}.oceanleo.geo-map.json`,
      mediaType: "application/json",
      siteId,
      title: args.title,
      idempotencyKey,
    }),
    runtime.upload(args.previewBlob as Blob, {
      filename: `${safeFilename(args.title)}.preview.png`,
      mediaType: "image/png",
      siteId,
      title: `${args.title}预览`,
      idempotencyKey: `${idempotencyKey}:preview`.slice(0, 180),
    }),
    ...pending.map((entry) =>
      runtime.upload(blobByPath.get(entry.path)!.blob, {
        filename: entry.path.split("/").pop() || entry.path,
        mediaType: entry.mediaType,
        siteId,
        title: `${args.title}·${entry.path}`,
        idempotencyKey: `${idempotencyKey}:${entry.sha256.slice(0, 16)}`.slice(
          0,
          180,
        ),
      }),
    ),
  ]);
  const [sourceUpload, previewUpload, ...dependencyUploads] = uploads;
  const uploadErrors: GeoMapValidationError[] = [];
  if (!sourceUpload.ok || !sourceUpload.url) {
    uploadErrors.push(
      fail(
        "geo-map-commit-rejected",
        "source",
        sourceUpload.error || "geo-map source 上传失败",
      ),
    );
  }
  if (!previewUpload.ok || !previewUpload.url) {
    uploadErrors.push(
      fail(
        "geo-map-commit-rejected",
        "preview",
        previewUpload.error || "geo-map preview 上传失败",
      ),
    );
  }
  dependencyUploads.forEach((receipt, index) => {
    const entry = pending[index];
    if (!receipt.ok || !receipt.url) {
      uploadErrors.push(
        fail(
          "geo-map-dependency-closure-incomplete",
          `dependencies.${entry.path}`,
          receipt.error || `依赖件 ${entry.path} 上传失败`,
        ),
      );
      return;
    }
    if (receipt.digest && normalizedDigest(receipt.digest) !== entry.sha256) {
      uploadErrors.push(
        fail(
          "geo-map-dependency-closure-incomplete",
          `dependencies.${entry.path}`,
          `依赖件 ${entry.path} 的上传回执 digest 与本地字节不一致`,
        ),
      );
      return;
    }
    entry.url = receipt.url;
  });
  if (
    sourceUpload.digest &&
    normalizedDigest(sourceUpload.digest) !== sourceDigest
  ) {
    uploadErrors.push(
      fail(
        "geo-map-commit-rejected",
        "source",
        "geo-map source 上传回执 digest 与本地字节不一致",
      ),
    );
  }
  if (uploadErrors.length > 0) return { ok: false, errors: uploadErrors };

  const closureDigest = closureDigestOf(closure);
  const published = await runtime.publish(item.artifactId, {
    expectedRevisionId: item.revisionId,
    artifactType: GEO_MAP_ARTIFACT_TYPE,
    source: {
      format: GEO_MAP_PROJECT_SCHEMA,
      url: sourceUpload.url as string,
      digest: sourceDigest,
    },
    renditions: [
      {
        purpose: "preview",
        url: previewUpload.url as string,
        digest: previewDigest,
      },
      // §10.2 W1: `_SAVE_CONTRACT[GEO_MAP].full_media = "application/json"`, so
      // `full` carries the project bytes rather than the bitmap.
      {
        purpose: "full",
        url: sourceUpload.url as string,
        digest: sourceDigest,
      },
      {
        purpose: "editor_manifest",
        url: sourceUpload.url as string,
        digest: sourceDigest,
      },
    ],
    scene: {
      schema: GEO_MAP_PROJECT_SCHEMA,
      closureDigest,
      dependencyRevisionIds: closure.map((entry) => entry.sha256),
    },
    provenance: {
      editor: GEO_MAP_EDITOR_ADAPTER,
      editorCapability: GEO_MAP_EDITOR_ID,
      previousRevisionId: item.revisionId,
      editRevision: args.editRevision,
      preview_source_digest: sourceDigest,
      preview_digest: previewDigest,
      preview_static_frame: "final",
      geo_map_closure_digest: closureDigest,
      geo_map_closure_bytes: closureBytes,
      geo_map_dependency_paths: closure.map((entry) => entry.path),
      ...(item.artifactId !== originalItem.artifactId
        ? {
            forkedFromArtifactId: originalItem.artifactId,
            forkedFromRevisionId: originalItem.revisionId,
          }
        : {}),
    },
  });
  const next = published.item;
  if (
    published.code === "revision-conflict" ||
    published.code === "precondition-failed"
  ) {
    // §3.3 `saving → dirty`: keep the local bytes, never fall through to invalid.
    return {
      ok: false,
      errors: [
        fail(
          "geo-map-commit-conflict",
          "expectedRevisionId",
          published.error ||
            "geo_map revision 提交遇到 expected_revision_id 冲突；保留本地字节并回落 dirty",
        ),
      ],
    };
  }
  if (
    !published.ok ||
    !next ||
    !isDurableLibraryItem(next) ||
    next.artifactId !== item.artifactId ||
    next.revisionId === item.revisionId ||
    String(next.artifactType) !== GEO_MAP_ARTIFACT_TYPE ||
    next.artifact.sourceFormat !== GEO_MAP_PROJECT_SCHEMA ||
    !next.artifact.integrity.ok ||
    next.artifact.renditions.source?.revisionId !== next.revisionId ||
    normalizedDigest(next.artifact.renditions.source?.digest) !== sourceDigest
  ) {
    return {
      ok: false,
      errors: [
        fail(
          "geo-map-commit-rejected",
          "publish",
          published.error ||
            "geo_map revision publish 未返回同一 artifact root 的新、完整 revision",
        ),
      ],
    };
  }
  return {
    ok: true,
    artifactId: next.artifactId,
    revisionId: next.revisionId,
    previousRevisionId: item.revisionId,
    projectUrl: next.artifact.renditions.source.url,
    projectSchema: GEO_MAP_PROJECT_SCHEMA,
    json,
    project,
    closureDigest,
    closureBytes,
    closure,
    repairedLabelLayerIds: contrast.repairedLayerIds,
    item: next,
  };
}
