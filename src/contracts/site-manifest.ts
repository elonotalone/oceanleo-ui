export const OCEANLEO_SITE_MANIFEST_SCHEMA =
  "oceanleo.site-manifest.v1" as const;

declare const siteKeyBrand: unique symbol;
export type OceanLeoSiteKey = string & {
  readonly [siteKeyBrand]: "OceanLeoSiteKey";
};

export interface OceanLeoBrandContract {
  name: string;
  shortName: string;
  accent: string;
  logoUrl?: string;
}

export interface OceanLeoShellContract {
  mode: "standard" | "utility" | "embedded";
  accountRoute: string;
  settingsRoute: string;
  showGlobalNavigation: boolean;
}

export interface OceanLeoAuthContract {
  strategy: "oceanleo-sso" | "anonymous";
  required: boolean;
  gatewayOrigin: string;
}

export interface OceanLeoCreditsContract {
  scope: "shared-account" | "disabled";
  enabled: boolean;
  route: string;
}

export interface OceanLeoCatalogContract<TEntry = unknown> {
  entries: readonly TEntry[];
  aliases: Readonly<Record<string, string>>;
}

export interface OceanLeoWorkspaceRouteContract {
  canonicalBasePath: string;
  historyBasePath: string;
  legacyQueryKeys: readonly string[];
}

/**
 * A declaration says how a host integrates an implementation. It deliberately
 * has no capability/permission field: platform capability routing is owned by
 * the trusted workbench registry, never by a site manifest.
 */
export interface OceanLeoHostAdapterDeclaration {
  id: string;
  role:
    | "workspace"
    | "artifact"
    | "library"
    | "session"
    | "workbench"
    | "browser";
  route?: string;
  version?: number;
}

export type OceanLeoAppContext = Readonly<
  Record<string, unknown> & { siteKey: OceanLeoSiteKey }
>;

export interface OceanLeoSiteManifest<TEntry = unknown> {
  schema: typeof OCEANLEO_SITE_MANIFEST_SCHEMA;
  siteKey: OceanLeoSiteKey;
  aliases: readonly string[];
  brand: Readonly<OceanLeoBrandContract>;
  shell: Readonly<OceanLeoShellContract>;
  auth: Readonly<OceanLeoAuthContract>;
  credits: Readonly<OceanLeoCreditsContract>;
  catalog: OceanLeoCatalogContract<TEntry>;
  workspace: Readonly<OceanLeoWorkspaceRouteContract>;
  adapters: readonly Readonly<OceanLeoHostAdapterDeclaration>[];
  appContext: OceanLeoAppContext;
}

export interface OceanLeoSiteManifestInput<TEntry = unknown> {
  siteKey: string;
  aliases?: readonly string[];
  brand: {
    name: string;
    shortName?: string;
    accent?: string;
    logoUrl?: string;
  };
  shell?: Partial<OceanLeoShellContract>;
  auth?: Partial<OceanLeoAuthContract>;
  credits?: Partial<OceanLeoCreditsContract>;
  catalog?: {
    entries?: readonly TEntry[];
    aliases?: Readonly<Record<string, string>>;
  };
  workspace?: Partial<OceanLeoWorkspaceRouteContract>;
  adapters?: readonly OceanLeoHostAdapterDeclaration[];
  appContext?: Readonly<Record<string, unknown>>;
}

function canonicalToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function routePath(value: unknown, fallback: string): string {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  const clean = raw.replace(/\/+/g, "/").replace(/\/$/, "");
  return clean || "/";
}

function httpOrigin(value: unknown): string {
  try {
    const parsed = new URL(String(value ?? ""));
    return parsed.protocol === "https:" || parsed.protocol === "http:"
      ? parsed.origin
      : "https://api.oceanleo.com";
  } catch {
    return "https://api.oceanleo.com";
  }
}

export function canonicalOceanLeoSiteKey(value: unknown): OceanLeoSiteKey {
  const key = canonicalToken(value);
  if (!key) {
    throw new Error("OceanLeo siteKey must contain an ASCII letter or digit.");
  }
  return key as OceanLeoSiteKey;
}

export function defineOceanLeoSiteManifest<TEntry>(
  input: OceanLeoSiteManifestInput<TEntry>,
): OceanLeoSiteManifest<TEntry> {
  const siteKey = canonicalOceanLeoSiteKey(input.siteKey);
  const aliases = [
    ...new Set(
      (input.aliases || [])
        .map(canonicalToken)
        .filter((alias) => alias && alias !== siteKey),
    ),
  ];
  const catalogAliases = Object.fromEntries(
    Object.entries(input.catalog?.aliases || {})
      .map(([alias, target]) => [
        canonicalToken(alias),
        String(target || "").trim(),
      ])
      .filter(([alias, target]) => alias && target),
  );
  const adapters = (input.adapters || []).map((adapter) => ({
    id: canonicalToken(adapter.id),
    role: adapter.role,
    ...(adapter.route
      ? { route: routePath(adapter.route, "/workspace") }
      : {}),
    ...(Number.isInteger(adapter.version) && Number(adapter.version) > 0
      ? { version: Number(adapter.version) }
      : {}),
  }));
  const legacyQueryKeys = [
    ...new Set(
      (input.workspace?.legacyQueryKeys || ["fn", "mode"])
        .map(canonicalToken)
        .filter(Boolean),
    ),
  ];
  const manifest: OceanLeoSiteManifest<TEntry> = {
    schema: OCEANLEO_SITE_MANIFEST_SCHEMA,
    siteKey,
    aliases,
    brand: Object.freeze({
      name: String(input.brand.name || siteKey).trim(),
      shortName: String(
        input.brand.shortName || input.brand.name || siteKey,
      ).trim(),
      accent: String(input.brand.accent || "#4f46e5").trim(),
      ...(input.brand.logoUrl
        ? { logoUrl: String(input.brand.logoUrl).trim() }
        : {}),
    }),
    shell: Object.freeze({
      mode: input.shell?.mode || "standard",
      accountRoute: routePath(input.shell?.accountRoute, "/account"),
      settingsRoute: routePath(input.shell?.settingsRoute, "/settings"),
      showGlobalNavigation: input.shell?.showGlobalNavigation !== false,
    }),
    auth: Object.freeze({
      strategy: input.auth?.strategy || "oceanleo-sso",
      required: input.auth?.required === true,
      gatewayOrigin: httpOrigin(
        input.auth?.gatewayOrigin || "https://api.oceanleo.com",
      ),
    }),
    credits: Object.freeze({
      scope: input.credits?.scope || "shared-account",
      enabled:
        input.credits?.enabled ??
        (input.credits?.scope || "shared-account") !== "disabled",
      route: routePath(input.credits?.route, "/cost"),
    }),
    catalog: Object.freeze({
      entries: Object.freeze([...(input.catalog?.entries || [])]),
      aliases: Object.freeze(catalogAliases),
    }),
    workspace: Object.freeze({
      canonicalBasePath: routePath(
        input.workspace?.canonicalBasePath,
        "/workspace",
      ),
      historyBasePath: routePath(
        input.workspace?.historyBasePath,
        "/history",
      ),
      legacyQueryKeys: Object.freeze(legacyQueryKeys),
    }),
    adapters: Object.freeze(adapters.filter((adapter) => adapter.id)),
    appContext: Object.freeze({
      ...(input.appContext || {}),
      siteKey,
    }),
  };
  return Object.freeze(manifest);
}

export function siteManifestMatches(
  manifest: OceanLeoSiteManifest,
  value: unknown,
): boolean {
  const key = canonicalToken(value);
  return key === manifest.siteKey || manifest.aliases.includes(key);
}

export function resolveCatalogAlias(
  manifest: OceanLeoSiteManifest,
  value: unknown,
): string {
  const raw = String(value ?? "").trim();
  return manifest.catalog.aliases[canonicalToken(raw)] || raw;
}

export function createOceanLeoAppContext(
  manifest: OceanLeoSiteManifest,
  local: Readonly<Record<string, unknown>> = {},
): OceanLeoAppContext {
  return Object.freeze({
    ...manifest.appContext,
    ...local,
    siteKey: manifest.siteKey,
  });
}
