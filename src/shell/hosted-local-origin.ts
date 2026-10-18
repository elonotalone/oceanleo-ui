/**
 * Optional local origin for hosted cores (PPTist / Umo / AudioMass / three-editor).
 *
 * Web default stays the family hosted origin. A client host can inject
 * `local-hosted:<label>` capabilities such as
 * `local-hosted:slides=http://127.0.0.1:4173`.
 *
 * Only loopback http(s) origins are accepted here. This helper does not add
 * origins to the production trust table; the iframe still has to pass
 * `isTrustedEmbedEditorBase` / `isTrustedEditorOrigin`.
 */

import { getClientHostConfig } from "../contracts/client-host-config";

export type LocalHostedLabel = "slides" | "docs" | "audio" | "3d";

const PREFIX = "local-hosted:";
const LOOPBACK = new Set(["localhost", "127.0.0.1", "::1"]);

function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK.has(hostname.toLowerCase().replace(/^\[|\]$/g, ""));
}

export function readLocalHostedOrigin(
  label: LocalHostedLabel,
  capabilities: readonly string[] = [],
): string {
  const needle = `${PREFIX}${label}=`;
  for (const capability of capabilities) {
    if (!capability.startsWith(needle)) continue;
    const origin = capability.slice(needle.length).trim();
    try {
      const parsed = new URL(origin);
      if (parsed.origin !== origin || parsed.username || parsed.password) continue;
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") continue;
      if (!isLoopbackHostname(parsed.hostname)) continue;
      return origin;
    } catch {
      continue;
    }
  }
  return "";
}

/**
 * `editor.html` does not wrap ClientHostProvider. Fall back to the slot
 * `host-config.js` / W02 writes (`__OCEANLEO_CLIENT_HOST_CONFIG__`).
 */
export function clientHostedEmbedContext(host?: {
  environment?: { platform?: string; capabilities?: readonly string[] };
} | null): { platform?: string; capabilities: readonly string[] } {
  const config = getClientHostConfig();
  const hostPlatform = host?.environment?.platform;
  const platform =
    (hostPlatform && hostPlatform !== "web" ? hostPlatform : "") ||
    config?.platform ||
    hostPlatform;
  return {
    platform,
    capabilities: [
      ...new Set([
        ...(config?.capabilities || []),
        ...(host?.environment?.capabilities || []),
      ]),
    ],
  };
}

/**
 * Web keeps the family origin (D9). Native/desktop never falls back to
 * `*.oceanleo.app` — missing `local-hosted:*` yields "" so editor.html stays
 * offline instead of requesting docs/slides.oceanleo.app.
 */
export function hostedEmbedBaseForPlatform(
  label: LocalHostedLabel,
  familyOrigin: string,
  options: { platform?: string; capabilities?: readonly string[] } = {},
): string {
  const platform = options.platform || "";
  const capabilities = options.capabilities || [];
  if (platform && platform !== "web") {
    return readLocalHostedOrigin(label, capabilities);
  }
  return familyOrigin;
}

/**
 * Website normal mode hides PPTist header/insert bar (host L1). editor.html
 * has no host L1, so native/desktop keeps kernel chrome in normal mode.
 * Pro mode always shows chrome. URL params stay embed=1&editor=1.
 */
export function hostedKernelChromeHidden(
  mode: string,
  platform?: string,
): boolean {
  if (mode !== "normal") return false;
  if (platform && platform !== "web") return false;
  return true;
}
