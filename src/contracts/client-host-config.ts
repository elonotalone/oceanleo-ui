/**
 * Host-injected environment for non-Next / non-*.oceanleo.com runtimes.
 *
 * Runtime source is a single slot on globalThis, written before any
 * `@oceanleo/ui` module evaluates (or via configureClientHost, which writes
 * the same slot). Contracts read this module; they never import client-ui.
 *
 * Unconfigured: callers must keep today's web path (env, then window host,
 * then the frozen family table). Cookie Domain is not decided here.
 */

export const CLIENT_HOST_CONFIG_GLOBAL_KEY = "__OCEANLEO_CLIENT_HOST_CONFIG__";

export type ClientPlatform = "web" | "desktop" | "ios" | "android" | "harmony";

export type ClientHostFamily = "com" | "cn" | "ws";

export interface ClientHostAuthStorage {
  getItem(key: string): string | null | Promise<string | null>;
  setItem(key: string, value: string): void | Promise<void>;
  removeItem(key: string): void | Promise<void>;
}

export type ClientHostNavSection = "primary" | "footer";

export interface ClientHostOAuth {
  begin(): Promise<{ id: string; redirectTo: string }>;
  openAndWait(id: string, url: string, signal?: AbortSignal): Promise<string>;
  cancel(id: string): Promise<void>;
}

export interface ClientHostNavItem {
  href: string;
  label: string;
  section: ClientHostNavSection;
  icon?: string;
  ariaLabel?: string;
}

export interface ClientHostConfig {
  family: ClientHostFamily;
  portalOrigin: string;
  gatewayOrigin: string;
  identityOrigin: string;
  identityAnonKey: string;
  authStorage?: ClientHostAuthStorage;
  locale: string;
  platform: ClientPlatform;
  capabilities: readonly string[];
  openExternal?: (url: string) => void | Promise<void>;
  oauth?: ClientHostOAuth;
  /** Host-only sidebar rows. Omitted keeps the previous slot; `[]` clears. */
  navItems?: readonly ClientHostNavItem[];
  /** Optional host network (Rust/Tauri). Omitted keeps the previous slot. */
  fetch?: typeof fetch;
  /** Local desktop surfaces. Never provided by the website or mobile hosts. */
  localWorkspace?: ClientLocalWorkspace;
}

export interface ClientLocalTask {
  id: string;
  remoteTaskId?: string;
  title: string;
  stage: string;
  path: string;
  failure: string;
  summary: string;
  canCancel: boolean;
}

export interface ClientLocalWorkspace {
  listTasks(): Promise<ClientLocalTask[]>;
  cancelTask(id: string): Promise<unknown>;
  mountSettings(container: HTMLElement, options?: {
    onRequestClose?: () => void | Promise<void>;
  }): () => void;
}

type HostConfigSlot = {
  [CLIENT_HOST_CONFIG_GLOBAL_KEY]?: ClientHostConfig;
};

const UNTRUSTED_CONTENT_HOSTS = [
  "oceanleo.app",
  "leoapp.cn",
  "ws.oceanleo.app",
] as const;

const PLATFORMS: readonly ClientPlatform[] = [
  "web",
  "desktop",
  "ios",
  "android",
  "harmony",
];

let generation = 0;
const listeners = new Set<() => void>();
const EMPTY_NAV_ITEMS: readonly ClientHostNavItem[] = Object.freeze([]);
let navCacheGen = -1;
let navCache: readonly ClientHostNavItem[] = EMPTY_NAV_ITEMS;

function isFamily(value: unknown): value is ClientHostFamily {
  return value === "com" || value === "cn" || value === "ws";
}

function isPlatform(value: unknown): value is ClientPlatform {
  return PLATFORMS.includes(value as ClientPlatform);
}

function isUnderDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

function parseOrigin(raw: string, field: string): string {
  const trimmed = String(raw || "").trim();
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    throw new Error(`configureClientHost ${field} must be an absolute URL`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`configureClientHost ${field} must be http(s)`);
  }
  if (url.username || url.password) {
    throw new Error(`configureClientHost ${field} must not include credentials`);
  }
  const host = url.hostname.toLowerCase();
  if (UNTRUSTED_CONTENT_HOSTS.some((domain) => isUnderDomain(host, domain))) {
    throw new Error(`configureClientHost ${field} cannot be a user-content domain`);
  }
  return url.origin;
}

function parseNavHref(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const href = raw.trim();
  if (href.length < 2 || href.length > 512) return null;
  if (!href.startsWith("/") || href.startsWith("//")) return null;
  if (href.includes("\\") || href.includes("://")) return null;
  if (/^[a-z][a-z0-9+.-]*:/i.test(href.slice(1))) return null;
  return href;
}

function parseNavItems(raw: unknown): readonly ClientHostNavItem[] {
  if (!Array.isArray(raw) || raw.length === 0) return EMPTY_NAV_ITEMS;
  const seen = new Set<string>();
  const out: ClientHostNavItem[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const item = entry as {
      href?: unknown;
      label?: unknown;
      section?: unknown;
      icon?: unknown;
      ariaLabel?: unknown;
    };
    const href = parseNavHref(item.href);
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!href || !label || label.length > 80) continue;
    if (seen.has(href)) continue;
    seen.add(href);
    const section: ClientHostNavSection =
      item.section === "footer" ? "footer" : "primary";
    const icon =
      typeof item.icon === "string" &&
      /^[A-Za-z][A-Za-z0-9_-]{0,31}$/.test(item.icon)
        ? item.icon
        : undefined;
    const ariaLabel =
      typeof item.ariaLabel === "string" ? item.ariaLabel.trim() : "";
    const named = {
      href,
      label,
      section,
      ...(icon ? { icon } : {}),
      ...(ariaLabel && ariaLabel.length <= 80 ? { ariaLabel } : {}),
    };
    out.push(Object.freeze(named));
  }
  return out.length ? Object.freeze(out) : EMPTY_NAV_ITEMS;
}

function notify(): void {
  generation += 1;
  for (const listener of listeners) listener();
}

export function configureClientHost(config: ClientHostConfig): void {
  if (!isFamily(config.family)) {
    throw new Error("configureClientHost family must be com, cn, or ws");
  }
  if (!isPlatform(config.platform)) {
    throw new Error("configureClientHost platform is not a known client platform");
  }
  const identityAnonKey = String(config.identityAnonKey || "").trim();
  if (!identityAnonKey) {
    throw new Error("configureClientHost identityAnonKey is required");
  }
  const previous = getClientHostConfig();
  const navItems =
    config.navItems !== undefined
      ? parseNavItems(config.navItems)
      : parseNavItems(previous?.navItems);
  const hostFetch =
    config.fetch !== undefined ? config.fetch : previous?.fetch;
  const next: ClientHostConfig = Object.freeze({
    family: config.family,
    portalOrigin: parseOrigin(config.portalOrigin, "portalOrigin"),
    gatewayOrigin: parseOrigin(config.gatewayOrigin, "gatewayOrigin"),
    identityOrigin: parseOrigin(config.identityOrigin, "identityOrigin"),
    identityAnonKey,
    authStorage: config.authStorage,
    locale: String(config.locale || "").trim() || "en",
    platform: config.platform,
    capabilities: Object.freeze([...(config.capabilities || [])]),
    openExternal: config.openExternal,
    oauth: config.platform === "desktop" ? config.oauth ?? previous?.oauth : undefined,
    navItems,
    fetch: hostFetch,
    localWorkspace: config.platform === "desktop"
      ? config.localWorkspace ?? previous?.localWorkspace
      : undefined,
  });
  (globalThis as HostConfigSlot)[CLIENT_HOST_CONFIG_GLOBAL_KEY] = next;
  notify();
}

export function getClientHostConfig(): ClientHostConfig | null {
  const value = (globalThis as HostConfigSlot)[CLIENT_HOST_CONFIG_GLOBAL_KEY];
  if (!value || typeof value !== "object") return null;
  if (!isFamily(value.family)) return null;
  if (!value.portalOrigin || !value.gatewayOrigin || !value.identityOrigin) {
    return null;
  }
  return value;
}

/**
 * Host-only sidebar rows from the same slot. Empty when unconfigured.
 * clone-shell reads this; do not import W09 `getBootExtensions()`.
 */
export function getHostNavItems(): readonly ClientHostNavItem[] {
  if (navCacheGen === generation) return navCache;
  navCacheGen = generation;
  navCache = parseNavItems(getClientHostConfig()?.navItems);
  return navCache;
}

export function clientHostConfigGeneration(): number {
  return generation;
}

export function onClientHostConfigChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetClientHostConfigForTests(): void {
  delete (globalThis as HostConfigSlot)[CLIENT_HOST_CONFIG_GLOBAL_KEY];
  notify();
}

/**
 * Native-shell chrome for AppShell.
 * `null` = unconfigured, keep Capacitor / `__oceanleoNative`.
 * `true` / `false` = host decided; do not guess from the page hostname.
 */
export function nativeShellFromHostConfig(): boolean | null {
  const cfg = getClientHostConfig();
  if (!cfg) return null;
  if (
    cfg.platform === "ios" ||
    cfg.platform === "android" ||
    cfg.platform === "harmony"
  ) {
    return true;
  }
  return cfg.capabilities.includes("native-shell");
}

export function createMemoryAuthStorage(
  initial?: Iterable<readonly [string, string]>,
): ClientHostAuthStorage {
  const store = new Map<string, string>(initial);
  return {
    getItem(key) {
      return store.has(key) ? store.get(key)! : null;
    },
    setItem(key, value) {
      store.set(key, value);
    },
    removeItem(key) {
      store.delete(key);
    },
  };
}

export const CLIENT_WEB_BOOT_GLOBAL_KEY = "__OCEANLEO_CLIENT_WEB__";
export const HOST_LIBRARY_TIMEOUT_MS = 45_000;
export const WEB_LIBRARY_TIMEOUT_MS = 20_000;

/** 20s on the website; 45s when a host is configured (slow gateway / native hop). */
export function hostAwareLibraryTimeoutMs(): number {
  return getClientHostConfig() ? HOST_LIBRARY_TIMEOUT_MS : WEB_LIBRARY_TIMEOUT_MS;
}

type ClientWebBootSlot = {
  fetch?: typeof fetch;
};

/**
 * Host network for GoTrue / library. Prefers `configureClientHost({ fetch })`,
 * then the W09 boot object `__OCEANLEO_CLIENT_WEB__.fetch`. Unconfigured: none.
 */
export function hostInjectedFetch(): typeof fetch | undefined {
  if (!getClientHostConfig()) return undefined;
  const fromSlot = getClientHostConfig()?.fetch;
  if (typeof fromSlot === "function") return fromSlot;
  const web = (globalThis as { [CLIENT_WEB_BOOT_GLOBAL_KEY]?: ClientWebBootSlot })[
    CLIENT_WEB_BOOT_GLOBAL_KEY
  ];
  if (typeof web?.fetch === "function") return web.fetch;
  return undefined;
}
