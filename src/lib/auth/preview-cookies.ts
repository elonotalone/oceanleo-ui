export type CookieNameValue = { name: string; value: string };

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
 * but must never write `document.cookie`. `@supabase/ssr` storage `getItem`
 * re-reads via `getAll`; a no-op `setAll` alone would leave getItem on
 * the stale cookie. This jar overlays the refreshed chunks.
 */
export function createLeoDevPreviewCookieJar(readRawCookie: () => string) {
  let overlay: CookieNameValue[] | null = null;
  return {
    getAll(): CookieNameValue[] {
      return overlay ?? parseDocumentCookies(readRawCookie());
    },
    setAll(cookiesToSet: ReadonlyArray<{ name: string; value: string }>): void {
      const map = new Map(
        (overlay ?? parseDocumentCookies(readRawCookie())).map((entry) => [
          entry.name,
          entry.value,
        ]),
      );
      for (const cookie of cookiesToSet) {
        if (cookie.value) map.set(cookie.name, cookie.value);
        else map.delete(cookie.name);
      }
      overlay = [...map].map(([name, value]) => ({ name, value }));
    },
    peekOverlay(): CookieNameValue[] | null {
      return overlay;
    },
  };
}
