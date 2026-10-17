"use client";

import { useMemo, useState, type MouseEvent, type ReactNode } from "react";
import { ClientHostProvider } from "../host-context";
import {
  DEVELOPMENT_API_ENDPOINT,
  NOOP_SESSION,
  createMemoryPersist,
  type ClientEnvironment,
  type ClientHost,
  type HostLinkProps,
  type HostSessionPort,
} from "../host-ports";

function MemoryLink({ href, children, onClick, ...rest }: HostLinkProps) {
  return (
    <a
      href={href}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => onClick?.(event)}
      {...rest}
    >
      {children}
    </a>
  );
}

export function MemoryHostProvider({
  children,
  initialPath = "/",
  apiEndpoint = DEVELOPMENT_API_ENDPOINT,
  session,
  platform = "desktop",
  capabilities = ["navigation", "session", "offline"],
}: {
  children: ReactNode;
  initialPath?: string;
  apiEndpoint?: string;
  session?: HostSessionPort;
  platform?: ClientEnvironment["platform"];
  capabilities?: readonly string[];
}) {
  const [pathname, setPathname] = useState(initialPath);
  const persist = useMemo(() => createMemoryPersist(), []);
  const resolvedSession = session ?? NOOP_SESSION;

  const host = useMemo<ClientHost>(
    () => ({
      environment: {
        platform,
        apiEndpoint,
        capabilities,
      },
      navigation: {
        pathname,
        search: "",
        push: setPathname,
        replace: setPathname,
      },
      session: resolvedSession,
      api: { endpoint: apiEndpoint },
      persist,
      Link: MemoryLink,
    }),
    [apiEndpoint, capabilities, pathname, persist, platform, resolvedSession],
  );

  return <ClientHostProvider host={host}>{children}</ClientHostProvider>;
}
