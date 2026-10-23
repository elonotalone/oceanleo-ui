/**
 * Read a site document and its images out of a website revision closure (W14).
 *
 * Bundle sites keep their content in the closure file `site.json`; images are
 * closure files `images/*.webp`. Both are read through the gateway's
 * `GET /v1/artifacts/{id}/revisions/{rev}/source-dependencies/{path}` grant
 * (owner/visibility checked server-side), never by guessing storage URLs.
 */
import { accessToken } from "../../lib/auth/client";
import { GATEWAY_BASE } from "../../lib/auth/config";
import { fetchMediaBlob } from "../../lib/media-proxy";
import {
  parseSiteDoc,
  type SiteDoc,
  type SiteEnvelope,
} from "./website-site-doc";

export interface SiteRevisionIdentity {
  artifactId: string;
  revisionId: string;
}

const GRANT_PATH = /^[A-Za-z0-9._/-]{1,240}$/;

function gatewayUrl(path: string): string {
  return `${GATEWAY_BASE.replace(/\/+$/, "")}${path}`;
}

/** Signed, short-lived address for one closure file. Throws with a human sentence. */
export async function siteDependencyUrl(
  identity: SiteRevisionIdentity,
  path: string,
  signal?: AbortSignal,
): Promise<string> {
  if (!GRANT_PATH.test(path) || path.includes("..")) {
    throw new Error(`网站文件路径不合法：${path}`);
  }
  const token = await accessToken().catch(() => null);
  const encoded = path.split("/").map(encodeURIComponent).join("/");
  const response = await fetch(
    gatewayUrl(
      `/v1/artifacts/${encodeURIComponent(identity.artifactId)}/revisions/${encodeURIComponent(
        identity.revisionId,
      )}/source-dependencies/${encoded}`,
    ),
    {
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      cache: "no-store",
      credentials: "include",
      signal,
    },
  );
  if (!response.ok) {
    throw new Error(`读取网站文件 ${path} 失败（HTTP ${response.status}）`);
  }
  const body = (await response.json().catch(() => null)) as
    | { accessUrl?: string; access_url?: string }
    | null;
  const raw = String(body?.accessUrl || body?.access_url || "").trim();
  if (raw.startsWith("/v1/")) return gatewayUrl(raw);
  try {
    const parsed = new URL(raw);
    if (parsed.origin === new URL(GATEWAY_BASE).origin) return parsed.href;
  } catch {
    // fall through
  }
  throw new Error(`网关没有给出 ${path} 的可读地址。`);
}

/** The editable document for this revision, plus nothing else. */
export async function loadSiteDoc(
  identity: SiteRevisionIdentity,
  envelope: SiteEnvelope,
  signal?: AbortSignal,
): Promise<SiteDoc> {
  if (envelope.kind === "structured") return envelope.entry as SiteDoc;
  const url = await siteDependencyUrl(identity, envelope.sitePath, signal);
  const blob = await fetchMediaBlob(url, { cache: "no-store", maxBytes: 4_000_000, signal });
  return parseSiteDoc(await blob.text());
}

type Listener = () => void;

/**
 * Lazily resolves `images/…` paths to signed URLs for one revision. A URL that
 * fails to load (expired grant) is re-minted once per failure via `refresh`.
 * Locally replaced images (not saved yet) are registered as object URLs.
 */
export class SiteImageResolver {
  private readonly urls = new Map<string, string>();
  private readonly pending = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly listeners = new Set<Listener>();
  private version = 0;

  constructor(private readonly identity: SiteRevisionIdentity | null) {}

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): number {
    return this.version;
  }

  private emit() {
    this.version += 1;
    for (const listener of this.listeners) listener();
  }

  /** Local bytes chosen by the user; wins over the closure copy. */
  setLocal(path: string, objectUrl: string) {
    this.urls.set(path, objectUrl);
    this.failed.delete(path);
    this.emit();
  }

  url(path: string): string {
    if (/^https:\/\//i.test(path) || path.startsWith("blob:")) return path;
    const known = this.urls.get(path);
    if (known) return known;
    if (this.identity && !this.pending.has(path) && !this.failed.has(path)) {
      this.pending.add(path);
      void siteDependencyUrl(this.identity, path)
        .then((url) => {
          this.urls.set(path, url);
        })
        .catch(() => {
          this.failed.add(path);
        })
        .finally(() => {
          this.pending.delete(path);
          this.emit();
        });
    }
    return "";
  }

  isFailed(path: string): boolean {
    return this.failed.has(path);
  }

  /** `<img onError>`: the grant probably expired; mint a fresh one. */
  refresh(path: string) {
    const known = this.urls.get(path);
    if (!known || known.startsWith("blob:")) return;
    const tries = (this.refreshes.get(path) || 0) + 1;
    this.refreshes.set(path, tries);
    this.urls.delete(path);
    if (tries > 2) this.failed.add(path);
    this.emit();
  }

  private readonly refreshes = new Map<string, number>();
}
