"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { ClientHostProvider } from "../host-context";
import {
  NOOP_SESSION,
  type ClientEnvironment,
  type ClientHost,
  type HostSessionPort,
} from "../host-ports";
import { createWebPersist } from "./web-persist";

/**
 * Next.js adapter. Navigation uses the App Router. The API endpoint must be
 * passed in; this file does not read location.hostname to choose a gateway.
 *
 * AppShell still calls `useRouteNavigation` itself so existing source contracts
 * (pending highlight, View Transitions) stay byte-stable for the main site.
 */
export function NextWebHostProvider({
  children,
  apiEndpoint = "",
  session,
  platform = "web",
  capabilities = ["navigation", "session"],
}: {
  children: ReactNode;
  apiEndpoint?: string;
  session?: HostSessionPort;
  platform?: ClientEnvironment["platform"];
  capabilities?: readonly string[];
}) {
  const pathname = usePathname() || "/";
  const searchParams = useSearchParams();
  const router = useRouter();
  const search = searchParams?.toString() ?? "";
  const resolvedSession = session ?? NOOP_SESSION;
  const persist = useMemo(() => createWebPersist(), []);

  const host = useMemo<ClientHost>(
    () => ({
      environment: {
        platform,
        apiEndpoint,
        capabilities,
      },
      navigation: {
        pathname,
        search,
        push: (href: string) => {
          router.push(href);
        },
        replace: (href: string) => {
          router.replace(href);
        },
      },
      session: resolvedSession,
      api: { endpoint: apiEndpoint },
      persist,
      Link: Link as ClientHost["Link"],
    }),
    [apiEndpoint, capabilities, pathname, persist, platform, resolvedSession, router, search],
  );

  return <ClientHostProvider host={host}>{children}</ClientHostProvider>;
}
