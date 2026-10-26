export type CookieNameValue = { name: string; value: string };

/** Host-only on `p-<32hex>.dev.oceanleo.com`. Never `Domain=.oceanleo.com`. */
export const PREVIEW_GUEST_COOKIE = "oceanleo-dev-guest";
const PREVIEW_GUEST_MAX_AGE = 400 * 24 * 60 * 60;

export function isFamilyAuthCookieName(name: string): boolean {
  return /^sb-.+-auth-token(\.\d+)?$/.test(String(name || ""));
}

export function previewGuestLatchSetCookie(): string {
  return `${PREVIEW_GUEST_COOKIE}=1; Path=/; Secure; SameSite=Lax; Max-Age=${PREVIEW_GUEST_MAX_AGE}`;
}

/** Device-local overlay. Survives reload and new tabs on this LeoDev origin; never Domain=.oceanleo.com. */
export const PREVIEW_OVERLAY_STORAGE_KEY = "oceanleo-leodev-auth-overlay";
export const PREVIEW_OAUTH_STORAGE_KEY = "oceanleo-leodev-oauth-proof";

type OverlayStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function defaultOverlayStorage(): OverlayStorage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function defaultOauthStorage(): OverlayStorage | null {
  try {
    return typeof sessionStorage === "undefined" ? null : sessionStorage;
  } catch {
    return null;
  }
}

function isOauthProofCookie(name: string): boolean {
  return /^sb-.+-auth-token-code-verifier(\.\d+)?$/.test(name);
}

function readStoredOverlay(storage: OverlayStorage | null, key = PREVIEW_OVERLAY_STORAGE_KEY): CookieNameValue[] | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter(
      (entry): entry is CookieNameValue =>
        Boolean(entry) &&
        typeof (entry as CookieNameValue).name === "string" &&
        typeof (entry as CookieNameValue).value === "string",
    );
  } catch {
    return null;
  }
}

function writeStoredOverlay(
  storage: OverlayStorage | null,
  overlay: CookieNameValue[] | null,
  key = PREVIEW_OVERLAY_STORAGE_KEY,
): void {
  if (!storage) return;
  try {
    if (!overlay) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(overlay));
  } catch {
    /* quota / private mode */
  }
}

export function clearPreviewAuthOverlay(
  storage: OverlayStorage | null = defaultOverlayStorage(),
): void {
  writeStoredOverlay(storage, null);
  writeStoredOverlay(defaultOauthStorage(), null, PREVIEW_OAUTH_STORAGE_KEY);
}

export function writePreviewGuestLatch(
  storage: OverlayStorage | null = defaultOverlayStorage(),
): void {
  if (typeof document !== "undefined") {
    document.cookie = previewGuestLatchSetCookie();
  }
  clearPreviewAuthOverlay(storage);
}

/** Parse `document.cookie` (or a test double) into name/value pairs. */
export function parseDocumentCookies(raw: string): CookieNameValue[] {
  return String(raw || "")
    .split(";")
    .map((part) => {
      const cut = part.indexOf("=");
      if (cut < 0) return { name: part.trim(), value: "" };
      const name = part.slice(0, cut).trim();
      const encoded = part.slice(cut + 1).trim();
      let value = encoded;
      try {
        value = decodeURIComponent(encoded);
      } catch {
        /* keep raw */
      }
      return { name, value };
    })
    .filter((entry) => entry.name);
}

/**
 * Preview capability hosts may refresh the family SSO session in memory
 * but must never write family SSO onto `document.cookie`. `@supabase/ssr`
 * storage `getItem` re-reads via `getAll`; a no-op `setAll` alone would
 * leave getItem on the stale cookie. This jar overlays the refreshed chunks.
 *
 * Cookie names are opaque. `@supabase/ssr` derives `sb-<ref>-auth-token` from
 * the identity URL first label, so a cn slot (`id-cn.dev.oceanleo.com`) is
 * `sb-id-cn-auth-token`. The jar reads whatever is already on the host.
 * Inherited family SSO is never a preview login: without an overlay the jar
 * hides `sb-*-auth-token` even if the guest latch is missing. Overlay lives
 * in localStorage so a new tab on this device keeps the account that signed
 * in here, without writing Domain=.oceanleo.com.
 */
export function createLeoDevPreviewCookieJar(
  readRawCookie: () => string,
  storage: OverlayStorage | null = defaultOverlayStorage(),
  oauthStorage: OverlayStorage | null = defaultOauthStorage(),
) {
  let overlay: CookieNameValue[] | null = readStoredOverlay(storage);
  let oauthProof = readStoredOverlay(oauthStorage, PREVIEW_OAUTH_STORAGE_KEY)
    ?.filter((entry) => isOauthProofCookie(entry.name)) ?? null;
  function getAll(): CookieNameValue[] {
    const stored = readStoredOverlay(storage);
    if (stored) overlay = stored;
    const fromDoc = parseDocumentCookies(readRawCookie());
    const base = overlay ?? fromDoc.filter((entry) => !isFamilyAuthCookieName(entry.name));
    const map = new Map(base.filter((entry) => entry.name !== PREVIEW_GUEST_COOKIE)
      .map((entry) => [entry.name, entry.value]));
    // A separate tab can replace the shared session overlay during Google
    // navigation. Only this tab's in-flight proof overrides that overlay.
    oauthProof?.forEach((entry) => map.set(entry.name, entry.value));
    return [...map].map(([name, value]) => ({ name, value }));
  }
  return {
    getAll,
    setAll(cookiesToSet: ReadonlyArray<{ name: string; value: string }>): void {
      const map = new Map(getAll().map((entry) => [entry.name, entry.value]));
      for (const cookie of cookiesToSet) {
        if (cookie.value) map.set(cookie.name, cookie.value);
        else map.delete(cookie.name);
      }
      overlay = [...map].map(([name, value]) => ({ name, value }));
      if (cookiesToSet.some((entry) => isOauthProofCookie(entry.name))) {
        const proof = overlay.filter((entry) => isOauthProofCookie(entry.name));
        oauthProof = proof.length ? proof : null;
        writeStoredOverlay(oauthStorage, oauthProof, PREVIEW_OAUTH_STORAGE_KEY);
      }
      writeStoredOverlay(storage, overlay);
    },
    hasPersistedOauthProof(): boolean {
      const expected = getAll().filter((entry) => isOauthProofCookie(entry.name));
      const saved = [...(readStoredOverlay(storage) ?? []),
        ...(readStoredOverlay(oauthStorage, PREVIEW_OAUTH_STORAGE_KEY) ?? [])];
      return expected.length > 0 && expected.every((entry) => saved.some(
        (stored) => stored.name === entry.name && stored.value === entry.value,
      ));
    },
    peekOverlay(): CookieNameValue[] | null {
      return overlay;
    },
    clear(): void {
      overlay = null;
      oauthProof = null;
      writeStoredOverlay(storage, null);
      writeStoredOverlay(oauthStorage, null, PREVIEW_OAUTH_STORAGE_KEY);
    },
  };
}
