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
