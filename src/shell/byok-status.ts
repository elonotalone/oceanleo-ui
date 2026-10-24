import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type ByokStatusLite = {
  enabled: boolean;
  count: number;
  providers: string[];
};

const CACHE_TTL_MS = 60_000;
export const BYOK_STATUS_CHANGED_EVENT = "oceanleo:byok-changed";

let cachedAt = 0;
let cachedValue: ByokStatusLite | null = null;
let cachedForToken: string | null = null;

export function invalidateByokStatus(): void {
  cachedAt = 0;
  cachedValue = null;
  cachedForToken = null;
}

export async function fetchByokStatusLite(): Promise<ByokStatusLite | null> {
  const token = await accessToken();
  if (!token) {
    invalidateByokStatus();
    return null;
  }
  if (cachedForToken === token && cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) return cachedValue;
  cachedForToken = token;
  cachedAt = 0;
  cachedValue = null;

  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/byok`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      if (cachedForToken !== token) return null;
      cachedAt = Date.now();
      cachedValue = null;
      return null;
    }
    const data = (await res.json()) as {
      enabled?: boolean;
      providers?: Array<{ display_name?: string; name?: string; provider?: string }>;
    };
    const providers = (Array.isArray(data.providers) ? data.providers : []).map(
      (entry) => entry.display_name || entry.name || entry.provider || "",
    );
    const value: ByokStatusLite = {
      enabled: Boolean(data.enabled),
      count: providers.length,
      providers,
    };
    if (cachedForToken === token) {
      cachedAt = Date.now();
      cachedValue = value;
    }
    return value;
  } catch {
    if (cachedForToken !== token) return null;
    cachedAt = Date.now();
    cachedValue = null;
    return null;
  }
}
