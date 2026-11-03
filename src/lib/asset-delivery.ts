import { currentDomainFamily, type DomainFamily } from "../contracts/domain-family";

/** Parent enables this only after the public mirror has been verified. */
export const ASSET_CDN_ENABLED: boolean = true; // 2026-11-03: enabled by the parent after W1-CDN verification (10,452 images mirrored; 200 image/webp from both host IPs and ws-host).
export const PUBLIC_ASSET_ORIGIN = "https://oceanleo-assets.oss-cn-guangzhou.aliyuncs.com";
const CDN_ORIGIN = "https://assets.oceanleo.com";

export interface PublicAssetMediaOptions {
  purpose: "thumb" | "preview" | "full";
  /** Pass the request's family during SSR; clients use the same family contract. */
  family?: DomainFamily;
}

const PRIVATE_SEGMENT = /^(?:project-assets|media-uploads|private|library|uploads|user-content|storage|v1)$/i;

function publicSegments(path: string): string[] | undefined {
  try {
    const segments = path.split("/").map(decodeURIComponent);
    if (segments.some((part) => !part || part === "." || part === ".." || /[\\/\u0000-\u001f\u007f]/.test(part))) return;
    return segments;
  } catch {
    return;
  }
}

/**
 * Public platform media only. Complete object paths/URLs keep their variant;
 * only extensionless catalog keys (category/slug) select a WebP rendition.
 * Private, signed and foreign URLs are never moved onto the public CDN.
 */
export function resolvePublicAssetMedia(
  keyOrUrl: string,
  { purpose, family = currentDomainFamily() }: PublicAssetMediaOptions,
): string {
  const raw = (keyOrUrl || "").trim();
  if (!raw) return "";
  const origin = ASSET_CDN_ENABLED && (family === "com" || family === "ws")
    ? CDN_ORIGIN : PUBLIC_ASSET_ORIGIN;

  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) || raw.startsWith("//")) {
    try {
      const url = new URL(raw);
      // Any query except the public image transform may carry a capability.
      if (url.origin !== PUBLIC_ASSET_ORIGIN || url.username || url.password ||
          [...url.searchParams.keys()].some((key) => key !== "x-oss-process")) return raw;
      const parts = raw.match(/^(https:\/\/[^/]+)(\/[^?#]*)(.*)$/i);
      if (!parts || ![PUBLIC_ASSET_ORIGIN, `${PUBLIC_ASSET_ORIGIN}:443`].includes(parts[1].toLowerCase())) return raw;
      const path = parts[2].slice(1);
      const segments = publicSegments(path);
      if (!path.startsWith("assets/") || !segments || segments.some((part) => PRIVATE_SEGMENT.test(part))) return raw;
      // Replace the origin only: escaping, transforms, fragments and variants survive.
      return origin + parts[2] + parts[3];
    } catch {
      return raw;
    }
  }

  // Relative application routes and capability-bearing keys are not media keys.
  if (/[?#]/.test(raw)) return raw;
  const path = raw.replace(/^\/+/, "");
  const segments = publicSegments(path);
  if (!segments) return "";
  if (segments.some((part) => PRIVATE_SEGMENT.test(part))) return raw;
  const encoded = segments.map(encodeURIComponent).join("/");
  const objectPath = segments[0] === "assets" ? encoded : `assets/image/${encoded}`;
  const hasExtension = /\.[^/.]+$/.test(segments[segments.length - 1]);
  const suffix = segments[0] === "assets" || hasExtension ? ""
    : purpose === "thumb" ? ".thumb.webp" : ".webp";
  return `${origin}/${objectPath}${suffix}`;
}
