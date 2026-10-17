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
