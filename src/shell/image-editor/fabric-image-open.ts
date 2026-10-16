import { uploadFile } from "../../lib/database";
import {
  canvasSafeUrl,
  fetchMediaBlob,
  importMediaUrl,
  isFirstPartyMediaUrl,
} from "../../lib/media-proxy";
import {
  isLikelyExpiringUrl,
  sha256Blob,
  type ImageSceneDependency,
} from "./image-scene-source";
import {
  PsdCompositeError,
  assertFabricImageOpenUrl,
  isPsdSource,
  resolvePsdCanvasSource,
} from "./psd-composite";

export type ImageDependencySeed = Omit<ImageSceneDependency, "id">;

export type PersistPngFile = (file: File) => Promise<string>;

const MEDIA_FETCH_MAX_BYTES = 80 * 1024 * 1024;

function pngFileName(title: string): string {
  const stem =
    String(title || "image")
      .replace(/\.[a-z0-9]+$/i, "")
      .replace(/[\\/:*?"<>|]+/g, "-")
      .trim()
      .slice(0, 80) || "image";
  return `${stem}-合成图.png`;
}

export async function pngFileFromOpenUrl(
  openUrl: string,
  title: string,
): Promise<File> {
  const blob =
    openUrl.startsWith("data:") || openUrl.startsWith("blob:")
      ? await (await fetch(openUrl)).blob()
      : await fetchMediaBlob(openUrl, { maxBytes: MEDIA_FETCH_MAX_BYTES });
  return new File([blob], pngFileName(title), { type: "image/png" });
}

export async function persistPngViaUpload(
  file: File,
  siteId: string,
  title: string,
): Promise<string> {
  const uploaded = await uploadFile(file, {
    siteId: siteId || "image",
    title: title || file.name,
  });
  const url = uploaded.data?.file?.url || "";
  if (!uploaded.ok || !url) {
    throw new Error(uploaded.error || "图片上传失败");
  }
  return url;
}

async function persistPngDependency(
  openUrl: string,
  title: string,
  persistPng: PersistPngFile,
): Promise<{ canvasUrl: string; dependency: ImageDependencySeed }> {
  const file = await pngFileFromOpenUrl(openUrl, title);
  const url = await persistPng(file);
  assertFabricImageOpenUrl(url);
  const digest = await sha256Blob(file);
  return {
    canvasUrl: canvasSafeUrl(url),
    dependency: {
      kind: "image",
      required: true,
      url,
      digest,
    },
  };
}

export async function canvasImageSource(
  source: string,
  siteId: string,
  title: string,
  evidence?: ImageDependencySeed | null,
): Promise<{ canvasUrl: string; dependency: ImageDependencySeed | null }> {
  if (source.startsWith("data:") || source.startsWith("blob:")) {
    return { canvasUrl: source, dependency: null };
  }
  const shouldImport =
    !isFirstPartyMediaUrl(source) ||
    (isLikelyExpiringUrl(source) && !evidence?.artifactId);
  const durable = !shouldImport
    ? source
    : await importMediaUrl(source, {
        kind: "image",
        siteId: siteId || "image",
        title,
        registerAsset: false,
      });
  const digest =
    evidence?.digest ||
    (await sha256Blob(
      await fetchMediaBlob(durable, { maxBytes: MEDIA_FETCH_MAX_BYTES }),
    ));
  const dependency: ImageDependencySeed = {
    kind: "image",
    required: true,
    url: durable,
    digest,
    ...(evidence?.artifactId && evidence.revisionId
      ? {
          artifactId: evidence.artifactId,
          revisionId: evidence.revisionId,
        }
      : {}),
    ...(evidence?.renditionPurpose
      ? { renditionPurpose: evidence.renditionPurpose }
      : {}),
    ...(evidence?.expiresAt !== undefined
      ? { expiresAt: evidence.expiresAt }
      : {}),
  };
  return { canvasUrl: canvasSafeUrl(durable), dependency };
}

export async function openFabricImagePixels(input: {
  source: string;
  siteId: string;
  title: string;
  evidence?: ImageDependencySeed | null;
  hints?: {
    format?: string;
    mime?: string;
    name?: string;
    previewUrl?: string;
    thumbUrl?: string;
    bytes?: ArrayBuffer;
    signal?: AbortSignal;
    fetchBytes?: (url: string) => Promise<ArrayBuffer>;
  };
  persistPng?: PersistPngFile;
}): Promise<{ canvasUrl: string; dependency: ImageDependencySeed | null }> {
  const persist =
    input.persistPng ||
    ((file: File) => persistPngViaUpload(file, input.siteId, input.title));
  if (
    isPsdSource({
      url: input.source,
      format: input.hints?.format,
      mime: input.hints?.mime,
      name: input.hints?.name,
    })
  ) {
    const resolved = await resolvePsdCanvasSource({
      url: input.source,
      format: input.hints?.format,
      mime: input.hints?.mime,
      name: input.hints?.name,
      previewUrl: input.hints?.previewUrl,
      thumbUrl: input.hints?.thumbUrl,
      bytes: input.hints?.bytes,
      fetchBytes:
        input.hints?.fetchBytes ||
        (async (url) => {
          const blob = await fetchMediaBlob(url, {
            maxBytes: MEDIA_FETCH_MAX_BYTES,
            signal: input.hints?.signal,
          });
          return blob.arrayBuffer();
        }),
    });
    if (!resolved.ok) throw new PsdCompositeError(resolved.error);
    if (
      resolved.canvasUrl.startsWith("data:") ||
      resolved.canvasUrl.startsWith("blob:")
    ) {
      return persistPngDependency(resolved.canvasUrl, input.title, persist);
    }
    const loaded = await canvasImageSource(
      resolved.canvasUrl,
      input.siteId,
      input.title,
      null,
    );
    assertFabricImageOpenUrl(loaded.canvasUrl);
    if (loaded.dependency) assertFabricImageOpenUrl(loaded.dependency.url);
    return loaded;
  }
  const loaded = await canvasImageSource(
    input.source,
    input.siteId,
    input.title,
    input.evidence,
  );
  assertFabricImageOpenUrl(loaded.canvasUrl);
  return loaded;
}
