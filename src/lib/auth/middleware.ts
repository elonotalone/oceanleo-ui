import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, cookieOptions, configured } from "./config";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

// Keeps the OceanLeo auth session valid on every request and re-writes the auth
// cookies (httponly, server-set) scoped to .oceanleo.com so the session stays
// shared across all subdomains. Does NOT redirect — unauthenticated users may
// freely browse; login is prompted only when an AI action needs it.
//
// Same cookieOptions as the browser client (split-brain guard).
//
// PERFORMANCE (2026-06-16): this runs on EVERY navigation (Next.js routes every
// page request AND every <Link> RSC prefetch through middleware). The previous
// implementation called `supabase.auth.getUser()`, which makes a network
// round-trip to the Supabase Auth server on every single invocation — that is
// the well-known cause of slow page transitions across the *.oceanleo.com sites
// (supabase/supabase#20901, #30241). We switch to `getClaims()`, which verifies
// the JWT LOCALLY against the cached JWKS public key (no network round-trip) —
// our oceanleo Supabase signs tokens with ES256 (asymmetric), so local
// verification is fully supported. The browser-side @supabase/ssr client still
// auto-refreshes the token before it expires, so we don't lose session freshness
// by removing the per-request `getUser()` refresh here.
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  let response = NextResponse.next({ request });
  if (!configured()) return response;

  const host = request.headers.get("host");
  const opts = cookieOptions(host);

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookieOptions: opts,
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, { ...options, ...opts });
        });
      },
    },
  });

  // Validate the session locally (cached JWKS, no network) instead of the old
  // getUser() network call. failures are non-fatal — a logged-out visitor is a
  // normal state, not an error.
  try {
    await supabase.auth.getClaims();
  } catch {
    /* ignore — visitor may be signed out */
  }

  return response;
}
