"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ClientHost } from "./host-ports";

const ClientHostContext = createContext<ClientHost | null>(null);

export function ClientHostProvider({
  host,
  children,
}: {
  host: ClientHost;
  children: ReactNode;
}) {
  return <ClientHostContext.Provider value={host}>{children}</ClientHostContext.Provider>;
}

export function useOptionalClientHost(): ClientHost | null {
  return useContext(ClientHostContext);
}

export function useClientHost(): ClientHost {
  const host = useContext(ClientHostContext);
  if (!host) {
    throw new Error("useClientHost requires ClientHostProvider");
  }
  return host;
}

export { ClientHostContext };
