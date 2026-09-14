import { accessToken } from "../lib/auth/client";
import { GATEWAY_BASE } from "../lib/auth/config";

export type ByokStatusLite = {
  enabled: boolean;
  count: number;
  providers: string[];
};

const CACHE_TTL_MS = 60_000;

let cachedAt = 0;
let cachedValue: ByokStatusLite | null = null;

export function invalidateByokStatus(): void {
  cachedAt = 0;
  cachedValue = null;
}

export async function fetchByokStatusLite(): Promise<ByokStatusLite | null> {
  if (cachedAt && Date.now() - cachedAt < CACHE_TTL_MS) return cachedValue;

  const token = await accessToken();
  if (!token) return null;

  try {
    const res = await fetch(`${GATEWAY_BASE}/v1/byok`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
      cache: "no-store",
    });
    if (!res.ok) {
      cachedAt = Date.now();
      cachedValue = null;
      return null;
    }
    const data = (await res.json()) as {
      enabled?: boolean;
      providers?: Array<{ name?: string; provider?: string }>;
    };
    const providers = (Array.isArray(data.providers) ? data.providers : []).map(
      (entry) => entry.name || entry.provider || "",
    );
    const value: ByokStatusLite = {
      enabled: Boolean(data.enabled),
      count: providers.length,
      providers,
    };
    cachedAt = Date.now();
    cachedValue = value;
    return value;
  } catch {
    cachedAt = Date.now();
    cachedValue = null;
    return null;
  }
}
