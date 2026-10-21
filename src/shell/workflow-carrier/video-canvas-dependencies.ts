import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { fetchMediaBlob, isFirstPartyMediaUrl } from "../../lib/media-proxy";
import {
  extractVideoCanvasSourceDependencies,
  normalizeVideoCanvasIdentity,
  validateVideoCanvasDependencyGrant,
  videoCanvasDependencyGrantPath,
  type VideoCanvasDependencyGrant,
} from "./video-canvas-dependency-runtime.mjs";
import {
  isDurableLibraryItem,
  type LibraryItem,
} from "../library-data";

const MAX_PROJECT_SOURCE_BYTES = 20_000_000;

export type FreshVideoCanvasDependencyGrant = VideoCanvasDependencyGrant & {
  gatewayOrigin: string;
};

async function sha256(blob: Blob): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("此环境无法验证视频工程来源摘要。");
  const digest = await subtle.digest("SHA-256", await blob.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function sourceError(): Error {
  // Avoid reflecting access URLs, bearer values, or raw Library content into UI/logs.
  return new Error("视频工程素材闭包无法从当前版本安全解析；未开放编辑面。");
}

/**
 * Mint short-lived, exact-revision grants in the trusted host. Only the
 * selected editor instance receives these through the existing checked
 * open-asset postMessage; no user session token is sent to the iframe.
 */
export async function prepareVideoCanvasDependencyGrants(
  item: LibraryItem,
  signal?: AbortSignal,
): Promise<FreshVideoCanvasDependencyGrant[]> {
  if (!isDurableLibraryItem(item)) return [];
  const artifact = item.artifact;
  if (
    item.artifactType !== "workflow" ||
    artifact.artifactType !== "workflow" ||
    artifact.editorCapability !== "video-canvas" ||
    artifact.sourceFormat !== "oceanleo.video.project.v2" ||
    !artifact.integrity?.ok ||
    !artifact.access?.canRead ||
    (!artifact.access?.canEdit && !artifact.access?.canFork) ||
    artifact.editability === "view_only"
  ) {
    return [];
  }

  const identity = normalizeVideoCanvasIdentity({
    artifactId: item.artifactId,
    revisionId: item.revisionId,
  });
  const source = artifact.renditions.source;
  if (
    !identity ||
    !source ||
    source.purpose !== "source" ||
    source.revisionId !== identity.revisionId ||
    source.mediaType !== "application/json" ||
    !/^(?:sha256:)?[0-9a-f]{64}$/i.test(String(source.digest || "")) ||
    !source.url ||
    !isFirstPartyMediaUrl(source.url)
  ) {
    throw sourceError();
  }

  try {
    const sourceBlob = await fetchMediaBlob(source.url, {
      maxBytes: MAX_PROJECT_SOURCE_BYTES,
      cache: "no-store",
      signal,
    });
    const actualDigest = await sha256(sourceBlob);
    const expectedDigest = String(source.digest)
      .trim()
      .toLowerCase()
      .replace(/^sha256:/, "");
    if (actualDigest !== expectedDigest) throw sourceError();
    const sourceDocument: unknown = JSON.parse(await sourceBlob.text());
    const dependencies = extractVideoCanvasSourceDependencies(
      sourceDocument,
      identity,
    );
    if (dependencies.length === 0) return [];

    const token = await accessToken();
    if (!token) throw sourceError();
    const gateway = new URL(GATEWAY_BASE);
    const grants = await Promise.all(
      dependencies.map(async (dependency) => {
        const endpoint = new URL(
          videoCanvasDependencyGrantPath(identity, dependency.path),
          `${gateway.origin}/`,
        );
        if (endpoint.origin !== gateway.origin) throw sourceError();
        const response = await fetch(endpoint.href, {
          method: "GET",
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${token}`,
          },
          cache: "no-store",
          credentials: "include",
          signal,
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw sourceError();
        const body: unknown = await response.json();
        const grant = validateVideoCanvasDependencyGrant(
          body,
          dependency,
          GATEWAY_BASE,
        );
        return { ...grant, gatewayOrigin: gateway.origin };
      }),
    );
    return grants;
  } catch {
    throw sourceError();
  }
}
