import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, cookieOptions, configured } from "./config";

type CookieToSet = {
  name: string;
  value: string;
  options?: Record<string, unknown>;
};

// Refreshes the OceanLeo auth session on every request and re-writes the auth
// cookies (httponly, server-set) scoped to .oceanleo.com so the session stays
// fresh across all subdomains. Does NOT redirect — unauthenticated users may
// freely browse; login is prompted only when an AI action needs it.
//
// Same cookieOptions as the browser client (split-brain guard).
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

  // Touch the user to trigger a token refresh if needed; failures are non-fatal
  // (a logged-out visitor is a normal state, not an error).
  try {
    await supabase.auth.getUser();
  } catch {
    /* ignore — visitor may be signed out */
  }

  return response;
}
